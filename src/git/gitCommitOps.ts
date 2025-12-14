import * as vscode from 'vscode';
import { GitBase } from './gitBase';

/**
 * Git 提交相关操作（回退、删除、恢复）
 */
export class GitCommitOps extends GitBase {
    // 回退本地记录（选择某个提交回退）
    async resetLocalCommits(): Promise<void> {
        try {
            if (!await this.selectWorkspace()) return;

            const log = await this.runGitCommand('git log --oneline -20');
            if (!log) {
                vscode.window.showWarningMessage('没有提交记录');
                return;
            }

            const commits = log.split('\n').map(line => {
                const [hash, ...msg] = line.split(' ');
                return { label: msg.join(' '), description: hash, hash };
            });

            const selected = await vscode.window.showQuickPick(commits, {
                placeHolder: '选择要回退到的提交'
            });

            if (!selected) return;

            const mode = await vscode.window.showQuickPick([
                { label: '软回退 (--soft)', description: '保留修改在暂存区', value: '--soft' },
                { label: '混合回退 (--mixed)', description: '保留修改但不暂存', value: '--mixed' },
                { label: '硬回退 (--hard)', description: '丢弃所有修改（危险）', value: '--hard' }
            ], { placeHolder: '选择回退模式' });

            if (!mode) return;

            const confirm = await vscode.window.showWarningMessage(
                `确定要回退到 "${selected.label}" 吗？${mode.value === '--hard' ? '\n⚠️ 所有未提交的修改将丢失！' : ''}`,
                { modal: true },
                '确定回退'
            );

            if (confirm !== '确定回退') return;

            await this.runGitCommand(`git reset ${mode.value} ${selected.hash}`);
            vscode.window.showInformationMessage(`✅ 已回退到: ${selected.label}`);
        } catch (error: unknown) {
            vscode.window.showErrorMessage(`操作失败: ${(error as Error).message}`);
        }
    }

    // 回退远程记录（选择某个提交，本地和远程都回退）
    async resetRemoteCommits(): Promise<void> {
        try {
            if (!await this.selectWorkspace()) return;

            try {
                await this.runGitCommand('git remote get-url origin');
            } catch {
                vscode.window.showErrorMessage('没有配置远程仓库');
                return;
            }

            const log = await this.runGitCommand('git log --oneline -20');
            if (!log) {
                vscode.window.showWarningMessage('没有提交记录');
                return;
            }

            const commits = log.split('\n').map(line => {
                const [hash, ...msg] = line.split(' ');
                return { label: msg.join(' '), description: hash, hash };
            });

            const selected = await vscode.window.showQuickPick(commits, {
                placeHolder: '选择要回退到的提交（本地和远程都会回退）'
            });

            if (!selected) return;

            const confirm = await vscode.window.showWarningMessage(
                `⚠️ 危险操作！\n\n将回退本地和远程到 "${selected.label}"。\n\n确定要继续吗？`,
                { modal: true },
                '我了解风险，确定回退'
            );

            if (confirm !== '我了解风险，确定回退') return;

            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: '正在回退...' },
                async () => {
                    await this.runGitCommand(`git reset --hard ${selected.hash}`);
                    await this.runGitCommandWithRetry('git push --force');
                }
            );

            vscode.window.showInformationMessage(`✅ 本地和远程已回退到: ${selected.label}`);
        } catch (error: unknown) {
            vscode.window.showErrorMessage(`操作失败: ${(error as Error).message}`);
        }
    }

    // 删除本地记录（选择删除几个）
    async deleteLocalCommits(): Promise<void> {
        try {
            if (!await this.selectWorkspace()) return;

            const count = await this.runGitCommand('git rev-list --count HEAD');
            const totalCommits = parseInt(count);

            if (totalCommits === 0) {
                vscode.window.showWarningMessage('没有提交记录');
                return;
            }

            const options = [];
            for (let i = 1; i <= Math.min(totalCommits, 10); i++) {
                options.push({ label: `删除最近 ${i} 个提交`, value: i });
            }

            const selected = await vscode.window.showQuickPick(options, {
                placeHolder: `当前共 ${totalCommits} 个提交`
            });

            if (!selected) return;

            const mode = await vscode.window.showQuickPick([
                { label: '软删除 (--soft)', description: '保留修改在暂存区', value: '--soft' },
                { label: '混合删除 (--mixed)', description: '保留修改但不暂存', value: '--mixed' },
                { label: '硬删除 (--hard)', description: '丢弃所有修改（危险）', value: '--hard' }
            ], { placeHolder: '选择删除模式' });

            if (!mode) return;

            const confirm = await vscode.window.showWarningMessage(
                `确定要删除最近 ${selected.value} 个本地提交吗？${mode.value === '--hard' ? '\n⚠️ 所有修改将丢失！' : ''}`,
                { modal: true },
                '确定删除'
            );

            if (confirm !== '确定删除') return;

            await this.runGitCommand(`git reset ${mode.value} HEAD~${selected.value}`);
            vscode.window.showInformationMessage(`✅ 已删除 ${selected.value} 个本地提交`);
        } catch (error: unknown) {
            vscode.window.showErrorMessage(`操作失败: ${(error as Error).message}`);
        }
    }

    // 删除远程记录（选择删除几个）
    async deleteRemoteCommits(): Promise<void> {
        try {
            if (!await this.selectWorkspace()) return;

            try {
                await this.runGitCommand('git remote get-url origin');
            } catch {
                vscode.window.showErrorMessage('没有配置远程仓库');
                return;
            }

            const count = await this.runGitCommand('git rev-list --count HEAD');
            const totalCommits = parseInt(count);

            if (totalCommits === 0) {
                vscode.window.showWarningMessage('没有提交记录');
                return;
            }

            const options = [];
            for (let i = 1; i <= Math.min(totalCommits, 10); i++) {
                options.push({ label: `删除最近 ${i} 个提交`, value: i });
            }

            const selected = await vscode.window.showQuickPick(options, {
                placeHolder: `当前共 ${totalCommits} 个提交`
            });

            if (!selected) return;

            const keepLocal = await vscode.window.showQuickPick([
                { label: '保留本地修改', description: '删除远程记录，但本地文件修改保留在暂存区', value: 'soft' },
                { label: '同时删除本地', description: '本地和远程都删除，文件也恢复', value: 'hard' }
            ], { placeHolder: '选择本地处理方式' });

            if (!keepLocal) return;

            const confirm = await vscode.window.showWarningMessage(
                `⚠️ 危险操作！\n\n将删除远程的最近 ${selected.value} 个提交。\n${keepLocal.value === 'soft' ? '本地修改会保留在暂存区。' : '本地也会同步删除。'}\n\n确定要继续吗？`,
                { modal: true },
                '我了解风险，确定删除'
            );

            if (confirm !== '我了解风险，确定删除') return;

            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: '正在删除...' },
                async () => {
                    const mode = keepLocal.value === 'soft' ? '--soft' : '--hard';
                    await this.runGitCommand(`git reset ${mode} HEAD~${selected.value}`);
                    await this.runGitCommandWithRetry('git push --force');
                }
            );

            const msg = keepLocal.value === 'soft' 
                ? `✅ 已删除远程 ${selected.value} 个提交，本地修改已保留在暂存区`
                : `✅ 已删除本地和远程的 ${selected.value} 个提交`;
            vscode.window.showInformationMessage(msg);
        } catch (error: unknown) {
            vscode.window.showErrorMessage(`操作失败: ${(error as Error).message}`);
        }
    }

    // 恢复记录（从 reflog 恢复）
    async recoverCommits(): Promise<void> {
        try {
            if (!await this.selectWorkspace()) return;

            const reflog = await this.runGitCommand('git reflog -20 --format="%h %gd %gs"');
            if (!reflog) {
                vscode.window.showWarningMessage('没有可恢复的记录');
                return;
            }

            const entries = reflog.split('\n').map(line => {
                const parts = line.split(' ');
                const hash = parts[0];
                const ref = parts[1];
                const action = parts.slice(2).join(' ');
                return { 
                    label: action, 
                    description: `${hash} (${ref})`,
                    hash 
                };
            });

            const selected = await vscode.window.showQuickPick(entries, {
                placeHolder: '选择要恢复到的状态'
            });

            if (!selected) return;

            const confirm = await vscode.window.showWarningMessage(
                `确定要恢复到 "${selected.label}" 吗？`,
                { modal: true },
                '确定恢复'
            );

            if (confirm !== '确定恢复') return;

            await this.runGitCommand(`git reset --hard ${selected.hash}`);
            vscode.window.showInformationMessage(`✅ 已恢复到: ${selected.label}`);
        } catch (error: unknown) {
            vscode.window.showErrorMessage(`操作失败: ${(error as Error).message}`);
        }
    }
}
