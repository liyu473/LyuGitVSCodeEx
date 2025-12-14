import * as vscode from 'vscode';

interface SavedSecret {
    name: string;
    value: string;
    description?: string;
}

/**
 * 本地密钥存储管理
 * 使用 VS Code SecretStorage 安全存储密钥
 */
export class SecretStorage {
    private static instance: SecretStorage;
    private secrets: vscode.SecretStorage | undefined;
    private static readonly STORAGE_KEY = 'lyugitex.savedSecrets';

    private constructor() {}

    static getInstance(): SecretStorage {
        if (!SecretStorage.instance) {
            SecretStorage.instance = new SecretStorage();
        }
        return SecretStorage.instance;
    }

    /**
     * 初始化（需要在扩展激活时调用）
     */
    initialize(secrets: vscode.SecretStorage): void {
        this.secrets = secrets;
    }

    /**
     * 获取所有保存的密钥
     */
    async getSavedSecrets(): Promise<SavedSecret[]> {
        if (!this.secrets) return [];
        
        try {
            const data = await this.secrets.get(SecretStorage.STORAGE_KEY);
            if (data) {
                return JSON.parse(data) as SavedSecret[];
            }
        } catch (error) {
            console.error('读取保存的密钥失败:', error);
        }
        return [];
    }

    /**
     * 保存密钥
     */
    async saveSecret(name: string, value: string, description?: string): Promise<void> {
        if (!this.secrets) {
            vscode.window.showErrorMessage('密钥存储未初始化');
            return;
        }

        const secrets = await this.getSavedSecrets();
        
        // 检查是否已存在
        const existingIndex = secrets.findIndex(s => s.name === name);
        if (existingIndex >= 0) {
            secrets[existingIndex] = { name, value, description };
        } else {
            secrets.push({ name, value, description });
        }

        await this.secrets.store(SecretStorage.STORAGE_KEY, JSON.stringify(secrets));
    }

    /**
     * 删除密钥
     */
    async deleteSecret(name: string): Promise<void> {
        if (!this.secrets) return;

        const secrets = await this.getSavedSecrets();
        const filtered = secrets.filter(s => s.name !== name);
        await this.secrets.store(SecretStorage.STORAGE_KEY, JSON.stringify(filtered));
    }

    /**
     * 获取单个密钥
     */
    async getSecret(name: string): Promise<string | undefined> {
        const secrets = await this.getSavedSecrets();
        return secrets.find(s => s.name === name)?.value;
    }

    /**
     * 显示密钥选择器，返回选中的密钥值
     */
    async showSecretPicker(placeHolder?: string): Promise<string | undefined> {
        const secrets = await this.getSavedSecrets();
        
        if (secrets.length === 0) {
            const action = await vscode.window.showInformationMessage(
                '没有保存的密钥，是否手动输入？',
                '手动输入', '取消'
            );
            if (action === '手动输入') {
                return await vscode.window.showInputBox({
                    prompt: 'Secret 值',
                    password: true
                });
            }
            return undefined;
        }

        const items: (vscode.QuickPickItem & { value?: string })[] = [
            { label: '$(add) 手动输入新值', description: '不使用保存的密钥' },
            { label: '', kind: vscode.QuickPickItemKind.Separator },
            ...secrets.map(s => ({
                label: `$(key) ${s.name}`,
                description: s.description || '已保存的密钥',
                value: s.value
            }))
        ];

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: placeHolder || '选择已保存的密钥或手动输入'
        });

        if (!selected) return undefined;

        if (selected.label.includes('手动输入')) {
            return await vscode.window.showInputBox({
                prompt: 'Secret 值',
                password: true
            });
        }

        return (selected as { value: string }).value;
    }

    /**
     * 管理保存的密钥
     */
    async manageSecrets(): Promise<void> {
        const action = await vscode.window.showQuickPick([
            { label: '$(add) 添加新密钥', value: 'add' },
            { label: '$(list-unordered) 查看已保存的密钥', value: 'list' },
            { label: '$(trash) 删除密钥', value: 'delete' }
        ], { placeHolder: '管理本地保存的密钥' });

        if (!action) return;

        switch (action.value) {
            case 'add':
                await this.addSecretDialog();
                break;
            case 'list':
                await this.listSecretsDialog();
                break;
            case 'delete':
                await this.deleteSecretDialog();
                break;
        }
    }

    private async addSecretDialog(): Promise<void> {
        const name = await vscode.window.showInputBox({
            prompt: '密钥名称（用于识别）',
            placeHolder: '例如: NuGet API Key'
        });
        if (!name) return;

        const value = await vscode.window.showInputBox({
            prompt: '密钥值',
            password: true
        });
        if (!value) return;

        const description = await vscode.window.showInputBox({
            prompt: '描述（可选）',
            placeHolder: '例如: 用于发布 NuGet 包'
        });

        await this.saveSecret(name, value, description);
        vscode.window.showInformationMessage(`✅ 密钥 "${name}" 已保存`);
    }

    private async listSecretsDialog(): Promise<void> {
        const secrets = await this.getSavedSecrets();
        
        if (secrets.length === 0) {
            vscode.window.showInformationMessage('没有保存的密钥');
            return;
        }

        const items = secrets.map(s => ({
            label: `$(key) ${s.name}`,
            description: s.description,
            detail: `值: ${'*'.repeat(Math.min(s.value.length, 20))}...`
        }));

        await vscode.window.showQuickPick(items, {
            placeHolder: `共 ${secrets.length} 个保存的密钥（只读）`
        });
    }

    private async deleteSecretDialog(): Promise<void> {
        const secrets = await this.getSavedSecrets();
        
        if (secrets.length === 0) {
            vscode.window.showInformationMessage('没有保存的密钥');
            return;
        }

        const selected = await vscode.window.showQuickPick(
            secrets.map(s => ({ label: s.name, description: s.description })),
            { placeHolder: '选择要删除的密钥' }
        );

        if (!selected) return;

        const confirm = await vscode.window.showWarningMessage(
            `确定删除密钥 "${selected.label}"？`,
            { modal: true },
            '确定删除'
        );

        if (confirm === '确定删除') {
            await this.deleteSecret(selected.label);
            vscode.window.showInformationMessage(`✅ 密钥 "${selected.label}" 已删除`);
        }
    }
}
