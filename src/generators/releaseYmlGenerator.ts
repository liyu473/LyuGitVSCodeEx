import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface ReleaseConfig {
    projects: string[];
    nugetApiKeySecret: string;
    nugetSource: string;
    dotnetVersion: string;
}

export class ReleaseYmlGenerator {
    async generate(): Promise<void> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('请先打开一个工作区');
            return;
        }

        // 扫描解决方案中的项目
        const projects = await this.findCsprojFiles(workspaceFolder.uri.fsPath);
        if (projects.length === 0) {
            vscode.window.showWarningMessage('未找到 .csproj 文件');
            return;
        }

        // 让用户选择要发布的项目
        const selectedProjects = await vscode.window.showQuickPick(
            projects.map(p => ({ label: path.basename(p, '.csproj'), description: p, picked: false })),
            { canPickMany: true, placeHolder: '选择要发布到 NuGet 的项目' }
        );

        if (!selectedProjects || selectedProjects.length === 0) {
            return;
        }

        // 配置 NuGet 源
        const nugetSource = await vscode.window.showInputBox({
            prompt: 'NuGet 源地址',
            value: 'https://api.nuget.org/v3/index.json',
            placeHolder: 'https://api.nuget.org/v3/index.json'
        });

        // 配置密钥名称
        const apiKeySecret = await vscode.window.showInputBox({
            prompt: 'GitHub Secrets 中的 NuGet API Key 名称',
            value: 'NUGET_API_KEY',
            placeHolder: 'NUGET_API_KEY'
        });

        // .NET 版本
        const dotnetVersion = await vscode.window.showInputBox({
            prompt: '.NET SDK 版本',
            value: '8.0.x',
            placeHolder: '8.0.x'
        });

        if (!nugetSource || !apiKeySecret || !dotnetVersion) {
            return;
        }

        const config: ReleaseConfig = {
            projects: selectedProjects.map(p => p.description!),
            nugetApiKeySecret: apiKeySecret,
            nugetSource: nugetSource,
            dotnetVersion: dotnetVersion
        };

        await this.createReleaseYml(workspaceFolder.uri.fsPath, config);
    }

    private async findCsprojFiles(rootPath: string): Promise<string[]> {
        const pattern = new vscode.RelativePattern(rootPath, '**/*.csproj');
        const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**');
        return files.map(f => vscode.workspace.asRelativePath(f));
    }

    private async createReleaseYml(rootPath: string, config: ReleaseConfig): Promise<void> {
        const githubDir = path.join(rootPath, '.github', 'workflows');
        
        if (!fs.existsSync(githubDir)) {
            fs.mkdirSync(githubDir, { recursive: true });
        }

        const buildSteps = config.projects.map(proj => {
            const projName = path.basename(proj, '.csproj');
            return `
      - name: Pack ${projName}
        run: dotnet pack ${proj} -c Release -o ./nupkgs

      - name: Push ${projName} to NuGet
        run: dotnet nuget push ./nupkgs/${projName}.*.nupkg --api-key \${{ secrets.${config.nugetApiKeySecret} }} --source ${config.nugetSource} --skip-duplicate`;
        }).join('\n');

        const ymlContent = `name: Release to NuGet

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:
    inputs:
      version:
        description: '版本号 (如 1.0.0)'
        required: false

jobs:
  build-and-publish:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup .NET
        uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '${config.dotnetVersion}'

      - name: Restore dependencies
        run: dotnet restore

      - name: Build
        run: dotnet build -c Release --no-restore
${buildSteps}

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        if: startsWith(github.ref, 'refs/tags/')
        with:
          files: ./nupkgs/*.nupkg
          generate_release_notes: true
`;

        const filePath = path.join(githubDir, 'release.yml');
        fs.writeFileSync(filePath, ymlContent);
        
        vscode.window.showInformationMessage(`已生成 ${filePath}`);
        
        // 打开生成的文件
        const doc = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(doc);
    }
}
