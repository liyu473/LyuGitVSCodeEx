import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import { WorkspaceManager } from './workspaceManager';

const execAsync = promisify(exec);

/**
 * Git 操作基类，提供通用的 Git 命令执行方法
 */
export class GitBase {
    protected workspaceManager = WorkspaceManager.getInstance();
    protected currentFolder: vscode.WorkspaceFolder | undefined;

    protected getGitTimeout(): number {
        return vscode.workspace.getConfiguration('workflowGenerator.git').get('commandTimeout', 30000);
    }

    protected getNetworkConfig() {
        const config = vscode.workspace.getConfiguration('workflowGenerator.network');
        return {
            retryCount: config.get('retryCount', 3) as number,
            retryDelay: config.get('retryDelay', 1500) as number
        };
    }

    /**
     * 选择工作区（多项目时让用户选择）
     */
    protected async selectWorkspace(gitRepoOnly = true): Promise<vscode.WorkspaceFolder | undefined> {
        this.currentFolder = await this.workspaceManager.selectWorkspaceFolderSmart({
            gitRepoOnly,
            placeHolder: '选择要操作的 Git 仓库'
        });
        return this.currentFolder;
    }

    /**
     * 获取当前工作区（必须先调用 selectWorkspace）
     */
    protected getWorkspaceFolder(): vscode.WorkspaceFolder {
        if (!this.currentFolder) {
            throw new Error('请先选择工作区');
        }
        return this.currentFolder;
    }

    protected async runGitCommand(command: string, timeout?: number): Promise<string> {
        const workspaceFolder = this.getWorkspaceFolder();
        const actualTimeout = timeout ?? this.getGitTimeout();

        try {
            const { stdout } = await execAsync(command, { 
                cwd: workspaceFolder.uri.fsPath,
                timeout: actualTimeout 
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

    /**
     * 在指定文件夹运行 Git 命令
     */
    protected async runGitCommandInFolder(command: string, folder: vscode.WorkspaceFolder, timeout?: number): Promise<string> {
        const actualTimeout = timeout ?? this.getGitTimeout();

        try {
            const { stdout } = await execAsync(command, { 
                cwd: folder.uri.fsPath,
                timeout: actualTimeout 
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

    /**
     * 带重试的 Git 命令（用于网络操作如 push/pull）
     */
    protected async runGitCommandWithRetry(command: string): Promise<string> {
        const config = this.getNetworkConfig();
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

    async isGitRepo(folder?: vscode.WorkspaceFolder): Promise<boolean> {
        try {
            if (folder) {
                await this.runGitCommandInFolder('git rev-parse --git-dir', folder);
            } else {
                await this.runGitCommand('git rev-parse --git-dir');
            }
            return true;
        } catch {
            return false;
        }
    }
}
