import * as vscode from 'vscode';

interface SavedSecret {
    name: string;
    value: string;
    description?: string;
    createdAt?: number;  // 时间戳
    updatedAt?: number;  // 更新时间戳
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
        
        const now = Date.now();
        // 检查是否已存在
        const existingIndex = secrets.findIndex(s => s.name === name);
        if (existingIndex >= 0) {
            secrets[existingIndex] = { 
                name, value, description, 
                createdAt: secrets[existingIndex].createdAt || now,
                updatedAt: now 
            };
        } else {
            secrets.push({ name, value, description, createdAt: now, updatedAt: now });
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
            { label: '$(eye) 查看密钥值', value: 'view' },
            { label: '$(edit) 编辑密钥', value: 'edit' },
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
            case 'view':
                await this.viewSecretDialog();
                break;
            case 'edit':
                await this.editSecretDialog();
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

    private formatDate(timestamp?: number): string {
        if (!timestamp) return '未知';
        return new Date(timestamp).toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    private async listSecretsDialog(): Promise<void> {
        const secrets = await this.getSavedSecrets();
        
        if (secrets.length === 0) {
            vscode.window.showInformationMessage('没有保存的密钥');
            return;
        }

        const items = secrets.map(s => ({
            label: `$(key) ${s.name}`,
            description: s.description || '无描述',
            detail: `添加: ${this.formatDate(s.createdAt)} | 更新: ${this.formatDate(s.updatedAt)} | 值长度: ${s.value.length} 字符`
        }));

        await vscode.window.showQuickPick(items, {
            placeHolder: `共 ${secrets.length} 个保存的密钥`
        });
    }

    private async viewSecretDialog(): Promise<void> {
        const secrets = await this.getSavedSecrets();
        
        if (secrets.length === 0) {
            vscode.window.showInformationMessage('没有保存的密钥');
            return;
        }

        const selected = await vscode.window.showQuickPick(
            secrets.map(s => ({ 
                label: s.name, 
                description: s.description,
                detail: `添加: ${this.formatDate(s.createdAt)}`
            })),
            { placeHolder: '选择要查看的密钥' }
        );

        if (!selected) return;

        const secret = secrets.find(s => s.name === selected.label);
        if (!secret) return;

        // 显示密钥详情
        const action = await vscode.window.showQuickPick([
            { label: '$(clippy) 复制到剪贴板', value: 'copy' },
            { label: '$(eye) 显示密钥值（5秒后自动关闭）', value: 'show' },
            { label: '$(close) 取消', value: 'cancel' }
        ], { 
            placeHolder: `密钥: ${secret.name} | 描述: ${secret.description || '无'} | 长度: ${secret.value.length} 字符`
        });

        if (!action) return;

        if (action.value === 'copy') {
            await vscode.env.clipboard.writeText(secret.value);
            vscode.window.showInformationMessage('✅ 密钥已复制到剪贴板');
        } else if (action.value === 'show') {
            // 使用 withProgress 显示密钥值，会自动消失
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: `🔑 ${secret.name}: ${secret.value}`,
                    cancellable: false
                },
                async () => {
                    // 显示 5 秒
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            );
        }
    }

    private async editSecretDialog(): Promise<void> {
        const secrets = await this.getSavedSecrets();
        
        if (secrets.length === 0) {
            vscode.window.showInformationMessage('没有保存的密钥');
            return;
        }

        const selected = await vscode.window.showQuickPick(
            secrets.map(s => ({ 
                label: s.name, 
                description: s.description,
                secret: s
            })),
            { placeHolder: '选择要编辑的密钥' }
        );

        if (!selected) return;

        const secret = (selected as { secret: SavedSecret }).secret;

        const editWhat = await vscode.window.showQuickPick([
            { label: '修改密钥值', value: 'value' },
            { label: '修改描述', value: 'description' },
            { label: '修改名称', value: 'name' }
        ], { placeHolder: `编辑: ${secret.name}` });

        if (!editWhat) return;

        if (editWhat.value === 'value') {
            const newValue = await vscode.window.showInputBox({
                prompt: '输入新的密钥值',
                password: true
            });
            if (newValue) {
                await this.saveSecret(secret.name, newValue, secret.description);
                vscode.window.showInformationMessage(`✅ 密钥值已更新`);
            }
        } else if (editWhat.value === 'description') {
            const newDesc = await vscode.window.showInputBox({
                prompt: '输入新的描述',
                value: secret.description || ''
            });
            if (newDesc !== undefined) {
                await this.saveSecret(secret.name, secret.value, newDesc);
                vscode.window.showInformationMessage(`✅ 描述已更新`);
            }
        } else if (editWhat.value === 'name') {
            const newName = await vscode.window.showInputBox({
                prompt: '输入新的名称',
                value: secret.name
            });
            if (newName && newName !== secret.name) {
                await this.deleteSecret(secret.name);
                await this.saveSecret(newName, secret.value, secret.description);
                vscode.window.showInformationMessage(`✅ 名称已更新为 "${newName}"`);
            }
        }
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
