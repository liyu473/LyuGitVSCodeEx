import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { WorkspaceManager } from '../git/workspaceManager';

type ReleaseType = 'nuget' | 'zip' | 'both';

interface ReleaseConfig {
    projects: string[];
    releaseType: ReleaseType;
    nugetApiKeySecret?: string;
    nugetSource: string;
    dotnetVersions: string[];
    runtimes: string[];
}

export class ReleaseYmlGenerator {
    private workspaceManager = WorkspaceManager.getInstance();

    async generate(): Promise<void> {
        // 选择工作区
        const workspaceFolder = await this.workspaceManager.selectWorkspaceFolderSmart({
            gitRepoOnly: false,
            placeHolder: '选择要生成 Release 工作流的项目'
        });
        if (!workspaceFolder) return;

        const projects = await this.findCsprojFiles(workspaceFolder.uri.fsPath);
        if (projects.length === 0) {
            vscode.window.showWarningMessage('未找到 .csproj 文件');
            return;
        }

        // 选择发布类型
        const releaseTypeChoice = await vscode.window.showQuickPick([
            { label: 'NuGet 包', description: '适合类库项目', value: 'nuget' as ReleaseType },
            { label: 'ZIP 压缩包', description: '适合 WPF/控制台等应用程序', value: 'zip' as ReleaseType },
            { label: '两者都要', description: 'NuGet + ZIP', value: 'both' as ReleaseType }
        ], { placeHolder: '选择发布类型' });

        if (!releaseTypeChoice) return;
        const releaseType = releaseTypeChoice.value;

        // 选择项目
        const selectedProjects = await vscode.window.showQuickPick(
            projects.map(p => ({ label: path.basename(p, '.csproj'), description: p, picked: false })),
            { canPickMany: true, placeHolder: '选择要发布的项目' }
        );

        if (!selectedProjects || selectedProjects.length === 0) return;

        // NuGet 配置
        let nugetApiKeySecret: string | undefined;
        if (releaseType === 'nuget' || releaseType === 'both') {
            nugetApiKeySecret = await vscode.window.showInputBox({
                prompt: 'GitHub Secrets 中的 NuGet API Key 名称',
                value: 'NUGET_API_KEY'
            });
            if (!nugetApiKeySecret) return;
        }

        // ZIP 运行时选择
        let runtimes: string[] = [];
        if (releaseType === 'zip' || releaseType === 'both') {
            const runtimeChoices = await vscode.window.showQuickPick([
                { label: 'win-x64', picked: true },
                { label: 'win-x86' },
                { label: 'win-arm64' },
                { label: 'linux-x64' },
                { label: 'linux-arm64' },
                { label: 'osx-x64' },
                { label: 'osx-arm64' }
            ], { canPickMany: true, placeHolder: '选择目标平台' });
            
            runtimes = runtimeChoices?.map(r => r.label) || ['win-x64'];
        }

        // 检测 .NET 版本
        const allVersions = new Set<string>();
        for (const proj of selectedProjects) {
            const versions = await this.detectDotnetVersions(workspaceFolder.uri.fsPath, proj.description!);
            versions.forEach(v => allVersions.add(v));
        }

        const config: ReleaseConfig = {
            projects: selectedProjects.map(p => p.description!),
            releaseType,
            nugetApiKeySecret,
            nugetSource: 'https://api.nuget.org/v3/index.json',
            dotnetVersions: allVersions.size > 0 ? [...allVersions] : ['8.0.x'],
            runtimes
        };

        await this.createReleaseYml(workspaceFolder.uri.fsPath, config);
    }

    private async findCsprojFiles(rootPath: string): Promise<string[]> {
        const pattern = new vscode.RelativePattern(rootPath, '**/*.csproj');
        const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**');
        return files.map(f => vscode.workspace.asRelativePath(f));
    }

    private async detectDotnetVersions(rootPath: string, projectPath: string): Promise<string[]> {
        try {
            const fullPath = path.join(rootPath, projectPath);
            const content = fs.readFileSync(fullPath, 'utf-8');
            const match = content.match(/<TargetFrameworks?>(.*?)<\/TargetFrameworks?>/);
            if (match) {
                const frameworks = match[1].split(';');
                const versions = frameworks
                    .map(f => f.match(/net(\d+)\.(\d+)/))
                    .filter((m): m is RegExpMatchArray => m !== null)
                    .map(m => `${m[1]}.${m[2]}.x`);
                return [...new Set(versions)];
            }
        } catch {
            // 忽略
        }
        return ['8.0.x'];
    }


    private async createReleaseYml(rootPath: string, config: ReleaseConfig): Promise<void> {
        const githubDir = path.join(rootPath, '.github', 'workflows');
        if (!fs.existsSync(githubDir)) {
            fs.mkdirSync(githubDir, { recursive: true });
        }

        let buildSteps = '';

        // NuGet 步骤
        if (config.releaseType === 'nuget' || config.releaseType === 'both') {
            buildSteps += config.projects.map(proj => {
                const projName = path.basename(proj, '.csproj');
                return `
      - name: Pack ${projName}
        run: dotnet pack ${proj} -c Release -o ./nupkgs

      - name: Push ${projName} to NuGet
        if: \${{ !inputs.dry_run }}
        run: dotnet nuget push ./nupkgs/${projName}.*.nupkg --api-key \${{ secrets.${config.nugetApiKeySecret} }} --source ${config.nugetSource} --skip-duplicate`;
            }).join('\n');
        }

        // ZIP 步骤
        if (config.releaseType === 'zip' || config.releaseType === 'both') {
            for (const proj of config.projects) {
                const projName = path.basename(proj, '.csproj');
                for (const runtime of config.runtimes) {
                    buildSteps += `

      - name: Publish ${projName} (${runtime})
        run: dotnet publish ${proj} -c Release -r ${runtime} --self-contained -p:PublishSingleFile=true -o ./publish/${projName}-${runtime}

      - name: Zip ${projName} (${runtime})
        shell: pwsh
        run: Compress-Archive -Path ./publish/${projName}-${runtime}/* -DestinationPath ./publish/${projName}-${runtime}.zip`;
                }
            }
        }

        // 收集产物
        let releaseFiles = '';
        if (config.releaseType === 'nuget' || config.releaseType === 'both') {
            releaseFiles += './nupkgs/*.nupkg\n';
        }
        if (config.releaseType === 'zip' || config.releaseType === 'both') {
            releaseFiles += '            ./publish/*.zip';
        }

        const ymlContent = `name: Release

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:
    inputs:
      dry_run:
        description: '测试模式（只构建不发布）'
        type: boolean
        default: false

permissions:
  contents: write

jobs:
  build-and-publish:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup .NET
        uses: actions/setup-dotnet@v4
        with:
          dotnet-version: |
${config.dotnetVersions.map(v => `            ${v}`).join('\n')}

      - name: Restore
        run: dotnet restore

      - name: Build
        run: dotnet build -c Release --no-restore
${buildSteps}

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        if: startsWith(github.ref, 'refs/tags/') && !inputs.dry_run
        with:
          files: |
            ${releaseFiles.trim()}
          generate_release_notes: true
`;

        const filePath = path.join(githubDir, 'release.yml');
        fs.writeFileSync(filePath, ymlContent);
        
        vscode.window.showInformationMessage(`已生成 ${filePath}`);
        const doc = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(doc);
    }
}
