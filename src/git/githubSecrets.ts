import * as vscode from 'vscode';
import { GitHubApi } from './githubApi';
import sodium from 'libsodium-wrappers-sumo';

/**
 * GitHub Secrets 管理
 */
export class GitHubSecrets extends GitHubApi {
    async listSecrets(token: string, owner: string, repo: string): Promise<void> {
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

    async createSecret(token: string, owner: string, repo: string): Promise<void> {
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

        const keyResult = await this.githubRequestWithProgress<{ key: string; key_id: string }>(
            '正在获取公钥...',
            'GET', `/repos/${owner}/${repo}/actions/secrets/public-key`, token
        );

        if (!keyResult) return;
        
        if (keyResult.status !== 200) {
            vscode.window.showErrorMessage(`获取公钥失败 (${keyResult.status})，请确认有仓库管理权限`);
            return;
        }

        const { key, key_id } = keyResult.data;

        let encryptedValue: string;
        try {
            encryptedValue = await this.encryptSecret(value, key);
        } catch (error) {
            vscode.window.showErrorMessage(`加密失败: ${(error as Error).message}`);
            return;
        }

        const result = await this.githubRequestWithProgress<unknown>(
            '正在创建 Secret...',
            'PUT', `/repos/${owner}/${repo}/actions/secrets/${name}`, token,
            { encrypted_value: encryptedValue, key_id }
        );

        if (!result) return;

        if (result.status === 201 || result.status === 204) {
            vscode.window.showInformationMessage(`Secret "${name}" 已创建/更新`);
        } else {
            vscode.window.showErrorMessage(`创建 Secret 失败 (${result.status})`);
        }
    }

    async deleteSecret(token: string, owner: string, repo: string): Promise<void> {
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

    private async encryptSecret(secret: string, publicKey: string): Promise<string> {
        try {
            await sodium.ready;
            
            const keyBytes = sodium.from_base64(publicKey, sodium.base64_variants.ORIGINAL);
            const messageBytes = sodium.from_string(secret);
            const encryptedBytes = sodium.crypto_box_seal(messageBytes, keyBytes);
            
            return sodium.to_base64(encryptedBytes, sodium.base64_variants.ORIGINAL);
        } catch (error) {
            console.error('encryptSecret error:', error);
            throw new Error(`加密库初始化失败: ${(error as Error).message}`);
        }
    }
}
