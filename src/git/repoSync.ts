import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class RepoSync {
    private getWorkspaceFolder(): vscode.WorkspaceFolder {
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (!folder) {
            throw new Error('请先打开一个工作区');
        }
        return folder;
    }

    private getConfig() {
        const gitConfig = vscode.workspace.getConfiguration('workflowGenerator.git');
        const networkConfig = vscode.workspace.getConfiguration('workflowGenerator.network');
        return {
            timeout: gitConfig.get('commandTimeout', 30000) as number,
            retryCount: networkConfig.get('retryCount', 3) as number,
            retryDelay: networkConfig.get('retryDelay', 1500) as number
        };
    }

    private async runGitCommand(command: string): Promise<string> {
        const workspaceFolder = this.getWorkspaceFolder();
        const config = this.getConfig();

        try {
            const { stdout } = await execAsync(command, {
                cwd: workspaceFolder.uri.fsPath,
                timeout: config.timeout
            });
            return stdout.trim();
        } catch (error: unknown) {
            const err = error as { stderr?: string; message?: string; killed?: boolean };
            if (err.killed) {
                throw new Error('操作超时，请检查网络连接');
            }
            throw new Error(err.stderr || err.message || 'Unknown error');
        }
    }

    private async runGitCommandWithRetry(command: string): Promise<string> {
        const config = this.getConfig();
        let lastError: Error | null = null;

        for (let i = 0; i < config.retryCount; i++) {
            try {
                return await this.runGitCommand(command);
            } catch (error) {
                lastError = error as Error;
                const msg = lastError.message.toLowerCase();
                if (msg.includes('timeout') || msg.includes('ssl') || msg.includes('network') || msg.includes('unable to access')) {
                    if (i < config.retryCount - 1) {
                        await new Promise(resolve => setTimeout(resolve, config.retryDelay));
                        continue;
                    }
                }
                throw lastError;
            }
        }
        throw lastError;
    }

    // 获取所有远程仓库
    async getRemotes(): Promise<{ name: string; url: string }[]> {
        try {
            const output = await this.runGitCommand('git remote -v');
            if (!output) return [];

            const remotes = new Map<string, string>();
            output.split('\n').forEach(line => {
                const match = line.match(/^(\S+)\s+(\S+)\s+\(push\)$/);
                if (match) {
                    remotes.set(match[1], match[2]);
                }
            });

            return Array.from(remotes.entries()).map(([name, url]) => ({ name, url }));
        } catch {
            return [];
        }
    }

    // 添加远程仓库
    async addRemote(): Promise<void> {
        try {
            const name = await vscode.window.showInputBox({
                prompt: '输入远程仓库名称',
                placeHolder: '例如: gitee, gitlab, backup',
                validateInput: (v) => {
                    if (!v.trim()) return '名称不能为空';
                    if (v.includes(' ')) return '名称不能包含空格';
                    if (v === 'origin') return 'origin 已被使用，请用其他名称';
                    return null;
                }
            });
            if (!name) return;

            const url = await vscode.window.showInputBox({
                prompt: '输入远程仓库地址',
                placeHolder: '例如: https://gitee.com/username/repo.git 或 git@gitee.com:username/repo.git'
            });
            if (!url) return;

            await this.runGitCommand(`git remote add ${name} ${url}`);
            vscode.window.showInformationMessage(`✅ 已添加远程仓库: ${name}`);
        } catch (error: unknown) {
            vscode.window.showErrorMessage(`添加失败: ${(error as Error).message}`);
        }
    }

    // 管理远程仓库
    async manageRemotes(): Promise<void> {
        try {
            const remotes = await this.getRemotes();

            const action = await vscode.window.showQuickPick([
                { label: '➕ 添加远程仓库', value: 'add' },
                { label: '📋 查看所有远程仓库', value: 'list' },
                { label: '✏️ 修改远程仓库地址', value: 'edit' },
                { label: '🗑️ 删除远程仓库', value: 'delete' }
            ], { placeHolder: '选择操作' });

            if (!action) return;

            switch (action.value) {
                case 'add':
                    await this.addRemote();
                    break;
                case 'list':
                    if (remotes.length === 0) {
                        vscode.window.showInformationMessage('没有配置远程仓库');
                    } else {
                        const items = remotes.map(r => `${r.name}: ${r.url}`);
                        vscode.window.showQuickPick(items, { placeHolder: '当前远程仓库列表（只读）' });
                    }
                    break;
                case 'edit':
                    await this.editRemote(remotes);
                    break;
                case 'delete':
                    await this.deleteRemote(remotes);
                    break;
            }
        } catch (error: unknown) {
            vscode.window.showErrorMessage(`操作失败: ${(error as Error).message}`);
        }
    }

    private async editRemote(remotes: { name: string; url: string }[]): Promise<void> {
        if (remotes.length === 0) {
            vscode.window.showWarningMessage('没有远程仓库可编辑');
            return;
        }

        const selected = await vscode.window.showQuickPick(
            remotes.map(r => ({ label: r.name, description: r.url })),
            { placeHolder: '选择要修改的远程仓库' }
        );
        if (!selected) return;

        const newUrl = await vscode.window.showInputBox({
            prompt: `输入 ${selected.label} 的新地址`,
            value: selected.description
        });
        if (!newUrl) return;

        await this.runGitCommand(`git remote set-url ${selected.label} ${newUrl}`);
        vscode.window.showInformationMessage(`✅ 已更新 ${selected.label} 的地址`);
    }

    private async deleteRemote(remotes: { name: string; url: string }[]): Promise<void> {
        const filtered = remotes.filter(r => r.name !== 'origin');
        if (filtered.length === 0) {
            vscode.window.showWarningMessage('没有可删除的远程仓库（origin 不能删除）');
            return;
        }

        const selected = await vscode.window.showQuickPick(
            filtered.map(r => ({ label: r.name, description: r.url })),
            { placeHolder: '选择要删除的远程仓库' }
        );
        if (!selected) return;

        const confirm = await vscode.window.showWarningMessage(
            `确定删除远程仓库 "${selected.label}"？`,
            { modal: true },
            '确定删除'
        );
        if (confirm !== '确定删除') return;

        await this.runGitCommand(`git remote remove ${selected.label}`);
        vscode.window.showInformationMessage(`✅ 已删除远程仓库: ${selected.label}`);
    }

    // 同步到所有远程仓库
    async syncToAll(): Promise<void> {
        try {
            const remotes = await this.getRemotes();
            if (remotes.length === 0) {
                vscode.window.showWarningMessage('没有配置远程仓库');
                return;
            }

            if (remotes.length === 1) {
                // 只有一个远程，直接推送
                await this.syncToRemote(remotes[0].name);
                return;
            }

            // 多个远程，让用户选择
            const choices = [
                { label: '🔄 同步到所有远程仓库', value: 'all' },
                ...remotes.map(r => ({ label: `📤 ${r.name}`, description: r.url, value: r.name }))
            ];

            const selected = await vscode.window.showQuickPick(choices, {
                placeHolder: '选择同步目标'
            });
            if (!selected) return;

            if (selected.value === 'all') {
                await this.syncToAllRemotes(remotes);
            } else {
                await this.syncToRemote(selected.value);
            }
        } catch (error: unknown) {
            vscode.window.showErrorMessage(`同步失败: ${(error as Error).message}`);
        }
    }

    private async syncToRemote(remoteName: string): Promise<void> {
        await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: `同步到 ${remoteName}...` },
            async () => {
                // 推送所有分支
                await this.runGitCommandWithRetry(`git push ${remoteName} --all`);
                // 推送所有 tags
                await this.runGitCommandWithRetry(`git push ${remoteName} --tags`);
            }
        );
        vscode.window.showInformationMessage(`✅ 已同步到 ${remoteName}`);
    }

    private async syncToAllRemotes(remotes: { name: string; url: string }[]): Promise<void> {
        await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: '同步到所有远程仓库...' },
            async (progress) => {
                let success = 0;
                let failed = 0;

                for (const remote of remotes) {
                    progress.report({ message: `${remote.name} (${success + failed + 1}/${remotes.length})` });
                    try {
                        await this.runGitCommandWithRetry(`git push ${remote.name} --all`);
                        await this.runGitCommandWithRetry(`git push ${remote.name} --tags`);
                        success++;
                    } catch {
                        failed++;
                    }
                }

                if (failed === 0) {
                    vscode.window.showInformationMessage(`✅ 已同步到所有 ${success} 个远程仓库`);
                } else {
                    vscode.window.showWarningMessage(`同步完成: ${success} 成功, ${failed} 失败`);
                }
            }
        );
    }
}
