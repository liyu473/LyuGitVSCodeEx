import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as https from 'https';

const execAsync = promisify(exec);

const GITHUB_AUTH_PROVIDER_ID = 'github';
const SCOPES = ['repo'];

export class GitHubHelper {
    private async getRepoUrl(): Promise<string | null> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) return null;

        try {
            const { stdout } = await execAsync('git remote get-url origin', { 
                cwd: workspaceFolder.uri.fsPath 
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

    private async githubRequest(method: string, path: string, token: string, body?: object): Promise<{ status: number; data: unknown }> {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.github.com',
                path,
                method,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/vnd.github+json',
                    'User-Agent': 'VSCode-Workflow-Generator',
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

            req.on('error', reject);
            if (body) req.write(JSON.stringify(body));
            req.end();
        });
    }

    async manageSecrets(): Promise<void> {
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
                await this.openSecretsPage();
                break;
        }
    }

    private async listSecrets(token: string, owner: string, repo: string): Promise<void> {
        const { status, data } = await this.githubRequest('GET', `/repos/${owner}/${repo}/actions/secrets`, token);
        
        if (status !== 200) {
            vscode.window.showErrorMessage('获取 Secrets 失败，请确认有仓库管理权限');
            return;
        }

        const secrets = (data as { secrets: { name: string; updated_at: string }[] }).secrets;
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
        const { status: keyStatus, data: keyData } = await this.githubRequest(
            'GET', `/repos/${owner}/${repo}/actions/secrets/public-key`, token
        );

        if (keyStatus !== 200) {
            vscode.window.showErrorMessage('获取公钥失败');
            return;
        }

        const { key, key_id } = keyData as { key: string; key_id: string };

        // 加密 secret（使用 tweetnacl）
        const encryptedValue = await this.encryptSecret(value, key);

        const { status } = await this.githubRequest(
            'PUT', `/repos/${owner}/${repo}/actions/secrets/${name}`, token,
            { encrypted_value: encryptedValue, key_id }
        );

        if (status === 201 || status === 204) {
            vscode.window.showInformationMessage(`Secret "${name}" 已创建/更新`);
        } else {
            vscode.window.showErrorMessage('创建 Secret 失败');
        }
    }

    private async encryptSecret(secret: string, publicKey: string): Promise<string> {
        const sodium = await import('tweetnacl');
        const util = await import('tweetnacl-util');
        
        const keyBytes = util.decodeBase64(publicKey);
        const messageBytes = util.decodeUTF8(secret);
        
        // GitHub 使用 sealed box，tweetnacl 不直接支持
        // 使用 box 模拟：生成临时密钥对，加密后把公钥和密文拼接
        const ephemeralKeyPair = sodium.box.keyPair();
        const nonce = new Uint8Array(sodium.box.nonceLength); // 全零 nonce（sealed box 规范）
        
        const encryptedBytes = sodium.box(messageBytes, nonce, keyBytes, ephemeralKeyPair.secretKey);
        
        // 拼接：临时公钥 + 密文
        const combined = new Uint8Array(ephemeralKeyPair.publicKey.length + encryptedBytes.length);
        combined.set(ephemeralKeyPair.publicKey);
        combined.set(encryptedBytes, ephemeralKeyPair.publicKey.length);
        
        return util.encodeBase64(combined);
    }

    private async deleteSecret(token: string, owner: string, repo: string): Promise<void> {
        const { status, data } = await this.githubRequest('GET', `/repos/${owner}/${repo}/actions/secrets`, token);
        
        if (status !== 200) {
            vscode.window.showErrorMessage('获取 Secrets 失败');
            return;
        }

        const secrets = (data as { secrets: { name: string }[] }).secrets;
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

        const { status: delStatus } = await this.githubRequest(
            'DELETE', `/repos/${owner}/${repo}/actions/secrets/${selected}`, token
        );

        if (delStatus === 204) {
            vscode.window.showInformationMessage(`Secret "${selected}" 已删除`);
        } else {
            vscode.window.showErrorMessage('删除失败');
        }
    }
}
