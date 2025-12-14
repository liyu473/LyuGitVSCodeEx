import * as vscode from 'vscode';
import { GitHubApi } from './githubApi';
import { GitHubSecrets } from './githubSecrets';
import { GitHubActions } from './githubActions';

/**
 * GitHub 操作主类
 */
export class GitHubHelper extends GitHubApi {
    private secretsOps = new GitHubSecrets();
    private actionsOps = new GitHubActions();

    async openSecretsPage(): Promise<void> {
        if (!await this.selectWorkspace()) return;
        await this.openSecretsPageInternal();
    }

    async openSecretsPageInternal(): Promise<void> {
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

    async manageSecrets(): Promise<void> {
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
                await this.secretsOps.listSecrets(token, owner, repo);
                break;
            case 'create':
                await this.secretsOps.createSecret(token, owner, repo);
                break;
            case 'delete':
                await this.secretsOps.deleteSecret(token, owner, repo);
                break;
            case 'open':
                await this.openSecretsPageInternal();
                break;
        }
    }

    async deleteWorkflowRuns(): Promise<void> {
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

        await this.actionsOps.deleteWorkflowRuns(token, parsed.owner, parsed.repo);
    }
}
