import * as vscode from 'vscode';
import { GitBase } from './gitBase';
import { GitTagOps } from './gitTagOps';
import { GitCommitOps } from './gitCommitOps';
import { GitignoreOps } from './gitignoreOps';

/**
 * Git 操作主类，整合所有 Git 相关操作
 */
export class GitOperations extends GitBase {
    private tagOps = new GitTagOps();
    private commitOps = new GitCommitOps();
    private gitignoreOps = new GitignoreOps();

    // ========== 仓库初始化 ==========

    async initRepo(): Promise<void> {
        try {
            const folder = await this.workspaceManager.selectWorkspaceFolderSmart({
                gitRepoOnly: false,
                placeHolder: '选择要初始化 Git 的项目'
            });
            if (!folder) return;
            this.currentFolder = folder;

            const isRepo = await this.isGitRepo(folder);
            if (isRepo) {
                vscode.window.showInformationMessage(`${folder.name} 已经是 Git 仓库`);
                return;
            }

            const defaultBranch = await vscode.window.showQuickPick(['main', 'master'], {
                placeHolder: '选择默认分支名称'
            });
            if (!defaultBranch) return;

            await this.runGitCommand(`git init -b ${defaultBranch}`);
            
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
                    await this.gitignoreOps.createGitignore(template);
                }
            }

            vscode.window.showInformationMessage('Git 仓库初始化完成');
        } catch (error: unknown) {
            vscode.window.showErrorMessage(`初始化失败: ${(error as Error).message}`);
        }
    }

    async addRemoteAndPush(): Promise<void> {
        try {
            const folder = await this.workspaceManager.selectWorkspaceFolderSmart({
                gitRepoOnly: false,
                placeHolder: '选择要推送的项目'
            });
            if (!folder) return;
            this.currentFolder = folder;

            const isRepo = await this.isGitRepo(folder);
            if (!isRepo) {
                const init = await vscode.window.showWarningMessage(
                    `${folder.name} 不是 Git 仓库，是否初始化？`,
                    '初始化', '取消'
                );
                if (init === '初始化') {
                    await this.initRepo();
                } else {
                    return;
                }
            }

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

            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: '推送到远程仓库...' },
                async () => {
                    try {
                        await this.runGitCommandWithRetry('git push -u origin HEAD');
                    } catch {
                        await this.runGitCommandWithRetry('git push -u origin HEAD --force');
                    }
                }
            );

            vscode.window.showInformationMessage('推送成功！');
        } catch (error: unknown) {
            vscode.window.showErrorMessage(`操作失败: ${(error as Error).message}`);
        }
    }

    // ========== Pull / Push ==========

    async pull(): Promise<void> {
        try {
            if (!await this.selectWorkspace()) return;

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
            if (!await this.selectWorkspace()) return;

            const pushTags = await vscode.window.showQuickPick(
                ['仅推送代码', '推送代码和 Tags'],
                { placeHolder: '选择推送方式' }
            );

            if (!pushTags) return;

            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: 'Git Push...' },
                async () => {
                    if (pushTags === '推送代码和 Tags') {
                        await this.runGitCommandWithRetry('git push --follow-tags');
                    } else {
                        await this.runGitCommandWithRetry('git push');
                    }
                    vscode.window.showInformationMessage('✅ Push 完成');
                }
            );
        } catch (error: unknown) {
            vscode.window.showErrorMessage(`Push 失败: ${(error as Error).message}`);
        }
    }

    // ========== 分支操作 ==========

    async cleanMergedBranches(): Promise<void> {
        try {
            if (!await this.selectWorkspace()) return;

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

    // ========== 委托给子模块 ==========

    // Tag 操作
    createTag = () => this.tagOps.createTag();
    deleteLatestTag = () => this.tagOps.deleteLatestTag();
    deleteLocalTag = () => this.tagOps.deleteLocalTag();
    deleteRemoteTag = () => this.tagOps.deleteRemoteTag();

    // Commit 操作
    resetLocalCommits = () => this.commitOps.resetLocalCommits();
    resetRemoteCommits = () => this.commitOps.resetRemoteCommits();
    deleteLocalCommits = () => this.commitOps.deleteLocalCommits();
    deleteRemoteCommits = () => this.commitOps.deleteRemoteCommits();
    recoverCommits = () => this.commitOps.recoverCommits();

    // Gitignore 操作
    addGitignore = () => this.gitignoreOps.addGitignore();
}
