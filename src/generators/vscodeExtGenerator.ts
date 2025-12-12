import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class VSCodeExtGenerator {
    async generate(): Promise<void> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('请先打开一个工作区');
            return;
        }

        // 检查是否是 VS Code 扩展项目
        const packageJsonPath = path.join(workspaceFolder.uri.fsPath, 'package.json');
        if (!fs.existsSync(packageJsonPath)) {
            vscode.window.showErrorMessage('未找到 package.json');
            return;
        }

        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        if (!packageJson.engines?.vscode) {
            vscode.window.showWarningMessage('这不是一个 VS Code 扩展项目（package.json 中没有 engines.vscode）');
            return;
        }

        // 选择发布方式
        const publishChoice = await vscode.window.showQuickPick([
            { label: '发布到 VS Code Marketplace', description: '需要 Personal Access Token', value: 'marketplace' },
            { label: '仅打包 .vsix 文件', description: '生成安装包但不发布', value: 'package' },
            { label: '两者都要', description: '打包并发布', value: 'both' }
        ], { placeHolder: '选择发布方式' });

        if (!publishChoice) return;

        const publishToMarketplace = publishChoice.value === 'marketplace' || publishChoice.value === 'both';
        const createVsix = publishChoice.value === 'package' || publishChoice.value === 'both';

        await this.createWorkflow(workspaceFolder.uri.fsPath, {
            publishToMarketplace,
            createVsix
        });
    }

    private async createWorkflow(rootPath: string, config: {
        publishToMarketplace: boolean;
        createVsix: boolean;
    }): Promise<void> {
        const githubDir = path.join(rootPath, '.github', 'workflows');
        if (!fs.existsSync(githubDir)) {
            fs.mkdirSync(githubDir, { recursive: true });
        }

        let publishSteps = '';

        if (config.createVsix) {
            publishSteps += `
      - name: Package Extension
        run: npx vsce package

      - name: Upload VSIX artifact
        uses: actions/upload-artifact@v4
        with:
          name: vsix-package
          path: "*.vsix"
`;
        }

        if (config.publishToMarketplace) {
            publishSteps += `
      - name: Publish to VS Code Marketplace
        if: startsWith(github.ref, 'refs/tags/')
        run: npx vsce publish -p \${{ secrets.VSCE_PAT }}
`;
        }

        // 只有发布到 Marketplace 时才需要 dry-run 选项
        const workflowDispatch = config.publishToMarketplace 
            ? `  workflow_dispatch:
    inputs:
      dry_run:
        description: '测试模式（只构建不发布）'
        type: boolean
        default: false`
            : `  workflow_dispatch:`;

        const releaseCondition = config.publishToMarketplace
            ? `if: startsWith(github.ref, 'refs/tags/') && !inputs.dry_run`
            : `if: startsWith(github.ref, 'refs/tags/')`;

        const ymlContent = `name: Release VS Code Extension

on:
  push:
    tags:
      - 'v*'
${workflowDispatch}

permissions:
  contents: write

jobs:
  build-and-publish:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Compile
        run: npm run compile
${publishSteps}
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        ${releaseCondition}
        with:
          files: "*.vsix"
          generate_release_notes: true
`;

        const filePath = path.join(githubDir, 'release.yml');
        fs.writeFileSync(filePath, ymlContent);

        vscode.window.showInformationMessage(`✅ 已生成 VS Code 扩展发布工作流`);

        // 提示配置 VSCE_PAT
        if (config.publishToMarketplace) {
            const action = await vscode.window.showInformationMessage(
                '发布到 Marketplace 需要配置 VSCE_PAT Secret',
                '查看如何获取 Token',
                '稍后配置'
            );

            if (action === '查看如何获取 Token') {
                vscode.env.openExternal(vscode.Uri.parse('https://code.visualstudio.com/api/working-with-extensions/publishing-extension#get-a-personal-access-token'));
            }
        }

        const doc = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(doc);
    }
}
