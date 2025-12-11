import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class GitOperations {
    private getWorkspaceFolder(): vscode.WorkspaceFolder {
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (!folder) {
            throw new Error('请先打开一个工作区');
        }
        return folder;
    }

    private async runGitCommand(command: string): Promise<string> {
        const workspaceFolder = this.getWorkspaceFolder();

        try {
            const { stdout } = await execAsync(command, { cwd: workspaceFolder.uri.fsPath });
            return stdout.trim();
        } catch (error: unknown) {
            const err = error as { stderr?: string; message?: string };
            throw new Error(err.stderr || err.message || 'Unknown error');
        }
    }

    async isGitRepo(): Promise<boolean> {
        try {
            await this.runGitCommand('git rev-parse --git-dir');
            return true;
        } catch {
            return false;
        }
    }

    async initRepo(): Promise<void> {
        try {
            const isRepo = await this.isGitRepo();
            if (isRepo) {
                vscode.window.showInformationMessage('当前目录已经是 Git 仓库');
                return;
            }

            const defaultBranch = await vscode.window.showQuickPick(['main', 'master'], {
                placeHolder: '选择默认分支名称'
            });
            if (!defaultBranch) return;

            await this.runGitCommand(`git init -b ${defaultBranch}`);
            
            // 询问是否创建 .gitignore
            const createGitignore = await vscode.window.showQuickPick(
                ['是，创建 .gitignore', '否，跳过'],
                { placeHolder: '是否创建 .gitignore？' }
            );

            if (createGitignore?.startsWith('是')) {
                const templates = ['Visual Studio', 'Node', 'Python', '自定义'];
                const template = await vscode.window.showQuickPick(templates, {
                    placeHolder: '选择 .gitignore 模板'
                });

                if (template && template !== '自定义') {
                    await this.createGitignore(template);
                }
            }

            vscode.window.showInformationMessage('Git 仓库初始化完成');
        } catch (error: unknown) {
            vscode.window.showErrorMessage(`初始化失败: ${(error as Error).message}`);
        }
    }

    private async createGitignore(template: string): Promise<void> {
        const fs = await import('fs');
        const path = await import('path');
        const workspaceFolder = this.getWorkspaceFolder();

        const templates: Record<string, string> = {
            'Visual Studio': `# Visual Studio
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
`,
            'Node': `# Node
node_modules/
dist/
.env
*.log
.DS_Store
`,
            'Python': `# Python
__pycache__/
*.py[cod]
.env
venv/
.venv/
dist/
*.egg-info/
`
        };

        const content = templates[template] || '';
        const gitignorePath = path.join(workspaceFolder.uri.fsPath, '.gitignore');
        fs.writeFileSync(gitignorePath, content);
    }

    async addRemoteAndPush(): Promise<void> {
        try {
            const isRepo = await this.isGitRepo();
            if (!isRepo) {
                const init = await vscode.window.showWarningMessage(
                    '当前目录不是 Git 仓库，是否初始化？',
                    '初始化', '取消'
                );
                if (init === '初始化') {
                    await this.initRepo();
                } else {
                    return;
                }
            }

            // 检查是否有远程仓库
            let hasRemote = false;
            try {
                const remotes = await this.runGitCommand('git remote');
                hasRemote = remotes.includes('origin');
            } catch {
                hasRemote = false;
            }

            if (!hasRemote) {
                const remoteUrl = await vscode.window.showInputBox({
                    prompt: '输入远程仓库地址',
                    placeHolder: 'https://github.com/username/repo.git 或 git@github.com:username/repo.git'
                });

                if (!remoteUrl) return;

                await this.runGitCommand(`git remote add origin ${remoteUrl}`);
                vscode.window.showInformationMessage('远程仓库已添加');
            }

            // 检查是否有提交
            let hasCommits = false;
            try {
                await this.runGitCommand('git rev-parse HEAD');
                hasCommits = true;
            } catch {
                hasCommits = false;
            }

            if (!hasCommits) {
                const commitMsg = await vscode.window.showInputBox({
                    prompt: '输入首次提交信息',
                    value: 'Initial commit'
                });

                if (!commitMsg) return;

                await this.runGitCommand('git add -A');
                await this.runGitCommand(`git commit -m "${commitMsg}"`);
            }

            // 推送
            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: '推送到远程仓库...' },
                async () => {
                    try {
                        await this.runGitCommand('git push -u origin HEAD');
                    } catch {
                        // 如果失败，尝试强制推送（新仓库）
                        await this.runGitCommand('git push -u origin HEAD --force');
                    }
                }
            );

            vscode.window.showInformationMessage('推送成功！');
        } catch (error: unknown) {
            vscode.window.showErrorMessage(`操作失败: ${(error as Error).message}`);
        }
    }

    async deleteLatestTag(): Promise<void> {
        try {
            const latestTag = await this.runGitCommand('git describe --tags --abbrev=0');
            if (!latestTag) {
                vscode.window.showWarningMessage('没有找到任何 Tag');
                return;
            }

            const confirm = await vscode.window.showWarningMessage(
                `确定要删除最新的 Tag "${latestTag}" 吗？`,
                { modal: true },
                '删除本地', '删除本地和远程'
            );

            if (confirm === '删除本地') {
                await this.runGitCommand(`git tag -d ${latestTag}`);
                vscode.window.showInformationMessage(`已删除本地 Tag: ${latestTag}`);
            } else if (confirm === '删除本地和远程') {
                await this.runGitCommand(`git tag -d ${latestTag}`);
                await this.runGitCommand(`git push origin :refs/tags/${latestTag}`);
                vscode.window.showInformationMessage(`已删除本地和远程 Tag: ${latestTag}`);
            }
        } catch (error: unknown) {
            vscode.window.showErrorMessage(`操作失败: ${(error as Error).message}`);
        }
    }

    async pull(): Promise<void> {
        try {
            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: 'Git Pull...' },
                async () => {
                    const result = await this.runGitCommand('git pull');
                    vscode.window.showInformationMessage(result || 'Pull 完成');
                }
            );
        } catch (error: unknown) {
            vscode.window.showErrorMessage(`Pull 失败: ${(error as Error).message}`);
        }
    }

    async push(): Promise<void> {
        try {
            const pushTags = await vscode.window.showQuickPick(
                ['仅推送代码', '推送代码和 Tags'],
                { placeHolder: '选择推送方式' }
            );

            if (!pushTags) return;

            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: 'Git Push...' },
                async () => {
                    if (pushTags === '推送代码和 Tags') {
                        await this.runGitCommand('git push --follow-tags');
                    } else {
                        await this.runGitCommand('git push');
                    }
                    vscode.window.showInformationMessage('Push 完成');
                }
            );
        } catch (error: unknown) {
            vscode.window.showErrorMessage(`Push 失败: ${(error as Error).message}`);
        }
    }

    async deleteLocalTag(): Promise<void> {
        try {
            const tags = await this.runGitCommand('git tag -l');
            if (!tags) {
                vscode.window.showWarningMessage('没有本地 Tag');
                return;
            }

            const tagList = tags.split('\n').filter(t => t);
            const selected = await vscode.window.showQuickPick(tagList, {
                canPickMany: true,
                placeHolder: '选择要删除的本地 Tag'
            });

            if (!selected || selected.length === 0) return;

            for (const tag of selected) {
                await this.runGitCommand(`git tag -d ${tag}`);
            }
            vscode.window.showInformationMessage(`已删除 ${selected.length} 个本地 Tag`);
        } catch (error: unknown) {
            vscode.window.showErrorMessage(`操作失败: ${(error as Error).message}`);
        }
    }

    async deleteRemoteTag(): Promise<void> {
        try {
            const tags = await this.runGitCommand('git ls-remote --tags origin');
            if (!tags) {
                vscode.window.showWarningMessage('没有远程 Tag');
                return;
            }

            const tagList = tags.split('\n')
                .filter(t => t && !t.includes('^{}'))
                .map(t => t.split('refs/tags/')[1])
                .filter(t => t);

            const selected = await vscode.window.showQuickPick(tagList, {
                canPickMany: true,
                placeHolder: '选择要删除的远程 Tag'
            });

            if (!selected || selected.length === 0) return;

            const confirm = await vscode.window.showWarningMessage(
                `确定要删除 ${selected.length} 个远程 Tag 吗？此操作不可撤销！`,
                { modal: true },
                '确定删除'
            );

            if (confirm !== '确定删除') return;

            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: '删除远程 Tags...' },
                async () => {
                    for (const tag of selected) {
                        await this.runGitCommand(`git push origin :refs/tags/${tag}`);
                    }
                }
            );
            vscode.window.showInformationMessage(`已删除 ${selected.length} 个远程 Tag`);
        } catch (error: unknown) {
            vscode.window.showErrorMessage(`操作失败: ${(error as Error).message}`);
        }
    }

    async cleanMergedBranches(): Promise<void> {
        try {
            const branches = await this.runGitCommand('git branch --merged');
            const branchList = branches.split('\n')
                .map(b => b.trim())
                .filter(b => b && !b.startsWith('*') && b !== 'main' && b !== 'master');

            if (branchList.length === 0) {
                vscode.window.showInformationMessage('没有可清理的已合并分支');
                return;
            }

            const selected = await vscode.window.showQuickPick(branchList, {
                canPickMany: true,
                placeHolder: '选择要删除的已合并分支'
            });

            if (!selected || selected.length === 0) return;

            for (const branch of selected) {
                await this.runGitCommand(`git branch -d ${branch}`);
            }
            vscode.window.showInformationMessage(`已删除 ${selected.length} 个本地分支`);
        } catch (error: unknown) {
            vscode.window.showErrorMessage(`操作失败: ${(error as Error).message}`);
        }
    }
}
