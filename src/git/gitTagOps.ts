import * as vscode from 'vscode';
import { GitBase } from './gitBase';

/**
 * Git Tag 相关操作
 */
export class GitTagOps extends GitBase {
    async createTag(): Promise<void> {
        try {
            if (!await this.selectWorkspace()) return;

            // 检查是否有提交
            try {
                await this.runGitCommand('git rev-parse HEAD');
            } catch {
                vscode.window.showErrorMessage('没有提交记录，无法创建 Tag');
                return;
            }

            const tagName = await vscode.window.showInputBox({
                prompt: '输入 Tag 名称',
                placeHolder: '例如: v1.0.0',
                validateInput: (value) => {
                    if (!value.trim()) return 'Tag 名称不能为空';
                    if (value.includes(' ')) return 'Tag 名称不能包含空格';
                    return null;
                }
            });

            if (!tagName) return;

            const message = await vscode.window.showInputBox({
                prompt: '输入 Tag 说明（可选，留空创建轻量 Tag）',
                placeHolder: '例如: Release version 1.0.0'
            });

            if (message === undefined) return;

            if (message) {
                await this.runGitCommand(`git tag -a "${tagName}" -m "${message}"`);
            } else {
                await this.runGitCommand(`git tag "${tagName}"`);
            }

            const pushToRemote = await vscode.window.showQuickPick(
                ['是，推送到远程', '否，仅创建本地 Tag'],
                { placeHolder: '是否推送到远程仓库？' }
            );

            if (pushToRemote?.startsWith('是')) {
                try {
                    await this.runGitCommandWithRetry(`git push origin "${tagName}"`);
                    vscode.window.showInformationMessage(`✅ 已创建并推送 Tag: ${tagName}`);
                } catch (error: unknown) {
                    vscode.window.showWarningMessage(`Tag 已创建，但推送失败: ${(error as Error).message}`);
                }
            } else {
                vscode.window.showInformationMessage(`✅ 已创建本地 Tag: ${tagName}`);
            }
        } catch (error: unknown) {
            vscode.window.showErrorMessage(`创建 Tag 失败: ${(error as Error).message}`);
        }
    }

    async deleteLatestTag(): Promise<void> {
        try {
            if (!await this.selectWorkspace()) return;

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
                await this.runGitCommandWithRetry(`git push origin :refs/tags/${latestTag}`);
                vscode.window.showInformationMessage(`✅ 已删除本地和远程 Tag: ${latestTag}`);
            }
        } catch (error: unknown) {
            vscode.window.showErrorMessage(`操作失败: ${(error as Error).message}`);
        }
    }

    async deleteLocalTag(): Promise<void> {
        try {
            if (!await this.selectWorkspace()) return;

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
            if (!await this.selectWorkspace()) return;

            const tags = await this.runGitCommandWithRetry('git ls-remote --tags origin');
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
                async (progress) => {
                    let deleted = 0;
                    for (const tag of selected) {
                        progress.report({ message: `${tag} (${deleted + 1}/${selected.length})` });
                        await this.runGitCommandWithRetry(`git push origin :refs/tags/${tag}`);
                        deleted++;
                    }
                }
            );
            vscode.window.showInformationMessage(`✅ 已删除 ${selected.length} 个远程 Tag`);
        } catch (error: unknown) {
            vscode.window.showErrorMessage(`操作失败: ${(error as Error).message}`);
        }
    }
}
