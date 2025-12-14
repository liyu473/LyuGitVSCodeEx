import * as vscode from 'vscode';
import { GitBase } from './gitBase';

/**
 * .gitignore 相关操作
 */
export class GitignoreOps extends GitBase {
    private getGitignoreTemplates(): Record<string, string> {
        return {
            'Visual Studio / C#': `# Visual Studio
.vs/
bin/
obj/
*.user
*.suo
*.cache
*.dll
*.pdb
*.exe
packages/
*.nupkg
TestResults/
`,
            'Node.js': `# Node
node_modules/
dist/
build/
.env
.env.local
*.log
.DS_Store
coverage/
`,
            'Python': `# Python
__pycache__/
*.py[cod]
.env
venv/
.venv/
dist/
*.egg-info/
.pytest_cache/
`,
            'Unity': `# Unity
[Ll]ibrary/
[Tt]emp/
[Oo]bj/
[Bb]uild/
[Bb]uilds/
[Ll]ogs/
*.csproj
*.unityproj
*.sln
*.suo
*.user
`,
            'JetBrains': `# JetBrains IDE
.idea/
*.iml
*.iws
out/
`,
            'macOS': `# macOS
.DS_Store
.AppleDouble
.LSOverride
._*
`,
            'Windows': `# Windows
Thumbs.db
ehthumbs.db
Desktop.ini
$RECYCLE.BIN/
`
        };
    }

    async createGitignore(template: string): Promise<void> {
        const fs = await import('fs');
        const path = await import('path');
        const workspaceFolder = this.getWorkspaceFolder();

        const templates = this.getGitignoreTemplates();
        const content = templates[template] || '';
        const gitignorePath = path.join(workspaceFolder.uri.fsPath, '.gitignore');
        fs.writeFileSync(gitignorePath, content);
    }

    async addGitignore(): Promise<void> {
        try {
            const folder = await this.workspaceManager.selectWorkspaceFolderSmart({
                gitRepoOnly: false,
                placeHolder: '选择要添加 .gitignore 的项目'
            });
            if (!folder) return;
            this.currentFolder = folder;

            const fs = await import('fs');
            const path = await import('path');
            const workspaceFolder = folder;
            const gitignorePath = path.join(workspaceFolder.uri.fsPath, '.gitignore');

            const exists = fs.existsSync(gitignorePath);
            
            const templates = this.getGitignoreTemplates();
            const templateNames = Object.keys(templates);

            const selected = await vscode.window.showQuickPick(templateNames, {
                canPickMany: true,
                placeHolder: exists ? '选择要添加的模板（会追加到现有 .gitignore）' : '选择 .gitignore 模板'
            });

            if (!selected || selected.length === 0) return;

            let content = selected.map(name => templates[name]).join('\n');

            if (exists) {
                const existingContent = fs.readFileSync(gitignorePath, 'utf-8');
                content = existingContent + '\n' + content;
            }

            fs.writeFileSync(gitignorePath, content);

            const doc = await vscode.workspace.openTextDocument(gitignorePath);
            await vscode.window.showTextDocument(doc);

            const isRepo = await this.isGitRepo();
            if (isRepo) {
                const cleanUp = await vscode.window.showQuickPick(
                    ['是，清理已跟踪的忽略文件', '否，仅添加 .gitignore'],
                    { placeHolder: '是否从 Git 中移除已跟踪的忽略文件？（文件不会被删除）' }
                );

                if (cleanUp?.startsWith('是')) {
                    await this.cleanIgnoredFiles();
                }
            }

            vscode.window.showInformationMessage(exists ? '✅ 已追加到 .gitignore' : '✅ 已创建 .gitignore');
        } catch (error: unknown) {
            vscode.window.showErrorMessage(`操作失败: ${(error as Error).message}`);
        }
    }

    private async cleanIgnoredFiles(): Promise<void> {
        try {
            const trackedIgnored = await this.runGitCommand(
                'git ls-files -ci --exclude-standard'
            );

            if (!trackedIgnored.trim()) {
                vscode.window.showInformationMessage('没有需要清理的文件');
                return;
            }

            const files = trackedIgnored.split('\n').filter(f => f.trim());
            
            const confirm = await vscode.window.showWarningMessage(
                `发现 ${files.length} 个已跟踪的忽略文件，是否从 Git 中移除？\n\n${files.slice(0, 5).join('\n')}${files.length > 5 ? '\n...' : ''}`,
                { modal: true },
                '移除并提交'
            );

            if (confirm !== '移除并提交') return;

            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: '正在清理...' },
                async () => {
                    for (const file of files) {
                        try {
                            await this.runGitCommand(`git rm --cached "${file}"`);
                        } catch {
                            // 忽略单个文件的错误
                        }
                    }
                    await this.runGitCommand('git commit -m "Remove ignored files from tracking"');
                }
            );

            vscode.window.showInformationMessage(`✅ 已从 Git 中移除 ${files.length} 个文件`);
        } catch (error: unknown) {
            vscode.window.showErrorMessage(`清理失败: ${(error as Error).message}`);
        }
    }
}
