import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as https from 'https';
import { WorkspaceManager } from './workspaceManager';

const execAsync = promisify(exec);

const GITHUB_AUTH_PROVIDER_ID = 'github';
const SCOPES = ['repo'];

interface NetworkConfig {
    retryCount: number;
    timeout: number;
    retryDelay: number;
}

export class GitHubHelper {
    private workspaceManager = WorkspaceManager.getInstance();
    private currentFolder: vscode.WorkspaceFolder | undefined;

    private getNetworkConfig(): NetworkConfig {
        const config = vscode.workspace.getConfiguration('workflowGenerator.network');
        return {
            retryCount: config.get('retryCount', 3),
            timeout: config.get('timeout', 15000),
            retryDelay: config.get('retryDelay', 1500)
        };
    }

    /**
     * 选择工作区
     */
    private async selectWorkspace(): Promise<vscode.WorkspaceFolder | undefined> {
        this.currentFolder = await this.workspaceManager.selectWorkspaceFolderSmart({
            gitRepoOnly: true,
            placeHolder: '选择要操作的 GitHub 仓库'
        });
        return this.currentFolder;
    }

    private async getRepoUrl(): Promise<string | null> {
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

    private parseGitHubUrl(remoteUrl: string): { owner: string; repo: string } | null {
        // 支持 https://github.com/owner/repo.git 和 git@github.com:owner/repo.git
        const httpsMatch = remoteUrl.match(/github\.com\/([^/]+)\/([^/.]+)/);
        const sshMatch = remoteUrl.match(/github\.com:([^/]+)\/([^/.]+)/);
        
        const match = httpsMatch || sshMatch;
        if (match) {
            return { owner: match[1], repo: match[2].replace('.git', '') };
        }
        return null;
    }

    async openSecretsPage(): Promise<void> {
        // 选择工作区
        if (!await this.selectWorkspace()) return;

        await this.openSecretsPageInternal();
    }

    /**
     * 内部方法，不会重新选择工作区
     */
    private async openSecretsPageInternal(): Promise<void> {
        const remoteUrl = await this.getRepoUrl();
        if (!remoteUrl) {
            vscode.window.showErrorMessage('未找到 Git 远程仓库');
            return;
        }

        const parsed = this.parseGitHubUrl(remoteUrl);
        if (!parsed) {
            vscode.window.showErrorMessage('不是 GitHub 仓库');
            return;
        }

        const secretsUrl = `https://github.com/${parsed.owner}/${parsed.repo}/settings/secrets/actions`;
        
        const action = await vscode.window.showInformationMessage(
            `即将打开 GitHub Secrets 设置页面`,
            '打开浏览器',
            '复制链接'
        );

        if (action === '打开浏览器') {
            vscode.env.openExternal(vscode.Uri.parse(secretsUrl));
        } else if (action === '复制链接') {
            await vscode.env.clipboard.writeText(secretsUrl);
            vscode.window.showInformationMessage('链接已复制');
        }
    }

    async openActionsPage(): Promise<void> {
        // 选择工作区
        if (!await this.selectWorkspace()) return;

        const remoteUrl = await this.getRepoUrl();
        if (!remoteUrl) {
            vscode.window.showErrorMessage('未找到 Git 远程仓库');
            return;
        }

        const parsed = this.parseGitHubUrl(remoteUrl);
        if (!parsed) {
            vscode.window.showErrorMessage('不是 GitHub 仓库');
            return;
        }

        const actionsUrl = `https://github.com/${parsed.owner}/${parsed.repo}/actions`;
        vscode.env.openExternal(vscode.Uri.parse(actionsUrl));
    }

    private async getGitHubToken(): Promise<string | null> {
        try {
            const session = await vscode.authentication.getSession(GITHUB_AUTH_PROVIDER_ID, SCOPES, { createIfNone: true });
            return session.accessToken;
        } catch {
            vscode.window.showErrorMessage('GitHub 授权失败');
            return null;
        }
    }

    private async githubRequest(method: string, path: string, token: string, body?: object, timeout?: number): Promise<{ status: number; data: unknown }> {
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

    // 带加载提示的 API 请求（使用配置的重试策略）
    private async githubRequestWithProgress<T>(
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

    async manageSecrets(): Promise<void> {
        // 选择工作区
        if (!await this.selectWorkspace()) return;

        const token = await this.getGitHubToken();
        if (!token) return;

        const remoteUrl = await this.getRepoUrl();
        if (!remoteUrl) {
            vscode.window.showErrorMessage('未找到 Git 远程仓库');
            return;
        }

        const parsed = this.parseGitHubUrl(remoteUrl);
        if (!parsed) {
            vscode.window.showErrorMessage('不是 GitHub 仓库');
            return;
        }

        const action = await vscode.window.showQuickPick([
            { label: '查看 Secrets 列表', value: 'list' },
            { label: '创建/更新 Secret', value: 'create' },
            { label: '删除 Secret', value: 'delete' },
            { label: '在浏览器中打开', value: 'open' }
        ], { placeHolder: '选择操作' });

        if (!action) return;

        const { owner, repo } = parsed;

        switch (action.value) {
            case 'list':
                await this.listSecrets(token, owner, repo);
                break;
            case 'create':
                await this.createSecret(token, owner, repo);
                break;
            case 'delete':
                await this.deleteSecret(token, owner, repo);
                break;
            case 'open':
                await this.openSecretsPageInternal();
                break;
        }
    }

    private async listSecrets(token: string, owner: string, repo: string): Promise<void> {
        const result = await this.githubRequestWithProgress<{ secrets: { name: string; updated_at: string }[] }>(
            '正在获取 Secrets...',
            'GET', `/repos/${owner}/${repo}/actions/secrets`, token
        );
        
        if (!result || result.status !== 200) {
            if (result) vscode.window.showErrorMessage('获取 Secrets 失败，请确认有仓库管理权限');
            return;
        }

        const secrets = result.data.secrets;
        if (secrets.length === 0) {
            vscode.window.showInformationMessage('暂无 Secrets');
            return;
        }

        const items = secrets.map(s => `${s.name} (更新于 ${new Date(s.updated_at).toLocaleDateString()})`);
        vscode.window.showQuickPick(items, { placeHolder: '当前仓库的 Secrets（只读）' });
    }

    private async createSecret(token: string, owner: string, repo: string): Promise<void> {
        const name = await vscode.window.showInputBox({
            prompt: 'Secret 名称',
            value: 'NUGET_API_KEY',
            validateInput: (v) => /^[A-Z_][A-Z0-9_]*$/.test(v) ? null : '只能使用大写字母、数字和下划线'
        });
        if (!name) return;

        const value = await vscode.window.showInputBox({
            prompt: 'Secret 值',
            password: true
        });
        if (!value) return;

        // 获取公钥
        const keyResult = await this.githubRequestWithProgress<{ key: string; key_id: string }>(
            '正在获取公钥...',
            'GET', `/repos/${owner}/${repo}/actions/secrets/public-key`, token
        );

        if (!keyResult || keyResult.status !== 200) {
            if (keyResult) vscode.window.showErrorMessage('获取公钥失败');
            return;
        }

        const { key, key_id } = keyResult.data;

        // 加密 secret（使用 tweetnacl）
        const encryptedValue = await this.encryptSecret(value, key);

        const result = await this.githubRequestWithProgress<unknown>(
            '正在创建 Secret...',
            'PUT', `/repos/${owner}/${repo}/actions/secrets/${name}`, token,
            { encrypted_value: encryptedValue, key_id }
        );

        if (!result) return;

        if (result.status === 201 || result.status === 204) {
            vscode.window.showInformationMessage(`Secret "${name}" 已创建/更新`);
        } else {
            vscode.window.showErrorMessage('创建 Secret 失败');
        }
    }

    private async encryptSecret(secret: string, publicKey: string): Promise<string> {
        const sodium = await import('libsodium-wrappers');
        await sodium.ready;
        
        // 解码公钥
        const keyBytes = sodium.from_base64(publicKey, sodium.base64_variants.ORIGINAL);
        
        // 使用 sealed box 加密（GitHub 要求的格式）
        const messageBytes = sodium.from_string(secret);
        const encryptedBytes = sodium.crypto_box_seal(messageBytes, keyBytes);
        
        // 返回 base64 编码
        return sodium.to_base64(encryptedBytes, sodium.base64_variants.ORIGINAL);
    }

    async deleteWorkflowRuns(): Promise<void> {
        // 选择工作区
        if (!await this.selectWorkspace()) return;

        const token = await this.getGitHubToken();
        if (!token) return;

        const remoteUrl = await this.getRepoUrl();
        if (!remoteUrl) {
            vscode.window.showErrorMessage('未找到 Git 远程仓库');
            return;
        }

        const parsed = this.parseGitHubUrl(remoteUrl);
        if (!parsed) {
            vscode.window.showErrorMessage('不是 GitHub 仓库');
            return;
        }

        const { owner, repo } = parsed;

        // 获取工作流运行记录
        type WorkflowRun = {
            id: number;
            name: string;
            head_branch: string;
            conclusion: string | null;
            status: string;
            created_at: string;
            run_number: number;
        };
        
        const result = await this.githubRequestWithProgress<{ workflow_runs: WorkflowRun[] }>(
            '正在获取 Actions 记录...',
            'GET', `/repos/${owner}/${repo}/actions/runs?per_page=30`, token
        );

        if (!result || result.status !== 200) {
            if (result) vscode.window.showErrorMessage('获取 Actions 记录失败');
            return;
        }

        const runs = result.data.workflow_runs;

        if (runs.length === 0) {
            vscode.window.showInformationMessage('没有 Actions 运行记录');
            return;
        }

        // 格式化显示
        const items = runs.map(run => {
            const status = run.conclusion || run.status;
            const statusIcon = status === 'success' ? '✅' : status === 'failure' ? '❌' : status === 'cancelled' ? '⚪' : '🔄';
            const date = new Date(run.created_at).toLocaleString();
            return {
                label: `${statusIcon} #${run.run_number} ${run.name}`,
                description: `${run.head_branch} - ${date}`,
                id: run.id
            };
        });

        const selected = await vscode.window.showQuickPick(items, {
            canPickMany: true,
            placeHolder: '选择要删除的 Actions 运行记录（可多选）'
        });

        if (!selected || selected.length === 0) return;

        const confirm = await vscode.window.showWarningMessage(
            `确定删除 ${selected.length} 条 Actions 运行记录？`,
            { modal: true },
            '确定删除'
        );

        if (confirm !== '确定删除') return;

        await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: '正在删除...' },
            async (progress) => {
                let deleted = 0;
                for (const item of selected) {
                    const { status: delStatus } = await this.githubRequest(
                        'DELETE', `/repos/${owner}/${repo}/actions/runs/${item.id}`, token
                    );
                    if (delStatus === 204) {
                        deleted++;
                    }
                    progress.report({ increment: 100 / selected.length });
                }
                vscode.window.showInformationMessage(`✅ 已删除 ${deleted} 条记录`);
            }
        );
    }

    private async deleteSecret(token: string, owner: string, repo: string): Promise<void> {
        const result = await this.githubRequestWithProgress<{ secrets: { name: string }[] }>(
            '正在获取 Secrets...',
            'GET', `/repos/${owner}/${repo}/actions/secrets`, token
        );
        
        if (!result || result.status !== 200) {
            if (result) vscode.window.showErrorMessage('获取 Secrets 失败');
            return;
        }

        const secrets = result.data.secrets;
        if (secrets.length === 0) {
            vscode.window.showInformationMessage('暂无 Secrets');
            return;
        }

        const selected = await vscode.window.showQuickPick(
            secrets.map(s => s.name),
            { placeHolder: '选择要删除的 Secret' }
        );
        if (!selected) return;

        const confirm = await vscode.window.showWarningMessage(
            `确定删除 Secret "${selected}"？`,
            { modal: true },
            '确定删除'
        );
        if (confirm !== '确定删除') return;

        const delResult = await this.githubRequestWithProgress<unknown>(
            '正在删除...',
            'DELETE', `/repos/${owner}/${repo}/actions/secrets/${selected}`, token
        );

        if (!delResult) return;

        if (delResult.status === 204) {
            vscode.window.showInformationMessage(`Secret "${selected}" 已删除`);
        } else {
            vscode.window.showErrorMessage('删除失败');
        }
    }
}
