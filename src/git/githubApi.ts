import * as vscode from 'vscode';
import * as https from 'https';
import { exec } from 'child_process';
import { promisify } from 'util';
import { WorkspaceManager } from './workspaceManager';

const execAsync = promisify(exec);

const GITHUB_AUTH_PROVIDER_ID = 'github';
const SCOPES = ['repo'];

interface NetworkConfig {
    retryCount: number;
    timeout: number;
    retryDelay: number;
}

/**
 * GitHub API 基础类
 */
export class GitHubApi {
    protected workspaceManager = WorkspaceManager.getInstance();
    protected currentFolder: vscode.WorkspaceFolder | undefined;

    protected getNetworkConfig(): NetworkConfig {
        const config = vscode.workspace.getConfiguration('workflowGenerator.network');
        return {
            retryCount: config.get('retryCount', 3),
            timeout: config.get('timeout', 15000),
            retryDelay: config.get('retryDelay', 1500)
        };
    }

    async selectWorkspace(): Promise<vscode.WorkspaceFolder | undefined> {
        this.currentFolder = await this.workspaceManager.selectWorkspaceFolderSmart({
            gitRepoOnly: true,
            placeHolder: '选择要操作的 GitHub 仓库'
        });
        return this.currentFolder;
    }

    async getRepoUrl(): Promise<string | null> {
        if (!this.currentFolder) return null;

        try {
            const { stdout } = await execAsync('git remote get-url origin', { 
                cwd: this.currentFolder.uri.fsPath 
            });
            return stdout.trim();
        } catch {
            return null;
        }
    }

    parseGitHubUrl(remoteUrl: string): { owner: string; repo: string } | null {
        const httpsMatch = remoteUrl.match(/github\.com\/([^/]+)\/([^/.]+)/);
        const sshMatch = remoteUrl.match(/github\.com:([^/]+)\/([^/.]+)/);
        
        const match = httpsMatch || sshMatch;
        if (match) {
            return { owner: match[1], repo: match[2].replace('.git', '') };
        }
        return null;
    }

    async getGitHubToken(): Promise<string | null> {
        try {
            const session = await vscode.authentication.getSession(GITHUB_AUTH_PROVIDER_ID, SCOPES, { createIfNone: true });
            return session.accessToken;
        } catch {
            vscode.window.showErrorMessage('GitHub 授权失败');
            return null;
        }
    }

    async githubRequest(method: string, path: string, token: string, body?: object, timeout?: number): Promise<{ status: number; data: unknown }> {
        const actualTimeout = timeout ?? this.getNetworkConfig().timeout;
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.github.com',
                path,
                method,
                timeout: actualTimeout,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/vnd.github+json',
                    'User-Agent': 'VSCode-LyuGitEx',
                    'X-GitHub-Api-Version': '2022-11-28',
                    ...(body ? { 'Content-Type': 'application/json' } : {})
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve({ status: res.statusCode || 0, data: data ? JSON.parse(data) : null });
                    } catch {
                        resolve({ status: res.statusCode || 0, data: null });
                    }
                });
            });

            req.setTimeout(actualTimeout, () => {
                req.destroy();
                reject(new Error('请求超时，请检查网络连接'));
            });

            req.on('error', (err) => {
                reject(new Error(`网络错误: ${err.message}`));
            });
            
            if (body) req.write(JSON.stringify(body));
            req.end();
        });
    }

    async githubRequestWithProgress<T>(
        title: string,
        method: string,
        path: string,
        token: string,
        body?: object
    ): Promise<{ status: number; data: T } | null> {
        const config = this.getNetworkConfig();
        
        try {
            return await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title, cancellable: true },
                async (progress, cancelToken) => {
                    let cancelled = false;
                    cancelToken.onCancellationRequested(() => {
                        cancelled = true;
                    });
                    
                    let lastError: Error | null = null;
                    for (let i = 0; i < config.retryCount; i++) {
                        if (cancelled) throw new Error('已取消');
                        
                        try {
                            progress.report({ message: i > 0 ? `重试中 (${i}/${config.retryCount})...` : undefined });
                            const result = await this.githubRequest(method, path, token, body);
                            return result as { status: number; data: T };
                        } catch (error) {
                            lastError = error as Error;
                            if (i < config.retryCount - 1) {
                                await new Promise(resolve => setTimeout(resolve, config.retryDelay));
                            }
                        }
                    }
                    throw lastError;
                }
            );
        } catch (error: unknown) {
            const msg = (error as Error).message;
            if (msg !== '已取消') {
                vscode.window.showErrorMessage(msg);
            }
            return null;
        }
    }
}
