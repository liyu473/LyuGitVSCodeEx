import * as vscode from 'vscode';
import { ReleaseYmlGenerator } from './generators/releaseYmlGenerator';
import { VSCodeExtGenerator } from './generators/vscodeExtGenerator';
import { GitOperations } from './git/gitOperations';
import { GitHubHelper } from './git/githubHelper';
import { RepoSync } from './git/repoSync';
import { SecretStorage } from './git/secretStorage';
import { WorkflowWebviewProvider } from './views/webviewPanel';

/**
 * 包装命令处理函数，添加全局错误处理
 */
function wrapCommand(fn: () => Promise<void>): () => Promise<void> {
    return async () => {
        try {
            await fn();
        } catch (error) {
            console.error('LyuGitEx 命令执行错误:', error);
            vscode.window.showErrorMessage(`操作失败: ${(error as Error).message}`);
        }
    };
}

export function activate(context: vscode.ExtensionContext) {
    console.log('LyuGitEx 已激活');

    // 初始化密钥存储
    const secretStorage = SecretStorage.getInstance();
    secretStorage.initialize(context.secrets);

    const gitOps = new GitOperations();
    const releaseGenerator = new ReleaseYmlGenerator();
    const vscodeExtGenerator = new VSCodeExtGenerator();
    const githubHelper = new GitHubHelper();
    const repoSync = new RepoSync();

    // 注册 Webview 视图
    const webviewProvider = new WorkflowWebviewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(WorkflowWebviewProvider.viewType, webviewProvider)
    );

    // 生成 Release.yml
    context.subscriptions.push(
        vscode.commands.registerCommand('lyugitex.generateReleaseYml', wrapCommand(() => releaseGenerator.generate()))
    );

    // 生成 VS Code 扩展工作流
    context.subscriptions.push(
        vscode.commands.registerCommand('lyugitex.generateVscodeExtYml', wrapCommand(() => vscodeExtGenerator.generate()))
    );

    // 创建 Tag
    context.subscriptions.push(
        vscode.commands.registerCommand('lyugitex.createTag', wrapCommand(() => gitOps.createTag()))
    );

    // 删除最新 Tag
    context.subscriptions.push(
        vscode.commands.registerCommand('lyugitex.deleteLatestTag', wrapCommand(() => gitOps.deleteLatestTag()))
    );

    // Git Pull
    context.subscriptions.push(
        vscode.commands.registerCommand('lyugitex.gitPull', wrapCommand(() => gitOps.pull()))
    );

    // Git Push
    context.subscriptions.push(
        vscode.commands.registerCommand('lyugitex.gitPush', wrapCommand(() => gitOps.push()))
    );

    // 删除本地 Tag
    context.subscriptions.push(
        vscode.commands.registerCommand('lyugitex.deleteLocalTag', wrapCommand(() => gitOps.deleteLocalTag()))
    );

    // 删除远程 Tag
    context.subscriptions.push(
        vscode.commands.registerCommand('lyugitex.deleteRemoteTag', wrapCommand(() => gitOps.deleteRemoteTag()))
    );

    // 清理本地已合并分支
    context.subscriptions.push(
        vscode.commands.registerCommand('lyugitex.cleanLocalBranches', wrapCommand(() => gitOps.cleanMergedBranches()))
    );

    // 管理 GitHub Secrets
    context.subscriptions.push(
        vscode.commands.registerCommand('lyugitex.manageSecrets', wrapCommand(() => githubHelper.manageSecrets()))
    );

    // 打开 GitHub Secrets 页面
    context.subscriptions.push(
        vscode.commands.registerCommand('lyugitex.openSecrets', wrapCommand(() => githubHelper.openSecretsPage()))
    );

    // 打开 GitHub Actions 页面
    context.subscriptions.push(
        vscode.commands.registerCommand('lyugitex.openActions', wrapCommand(() => githubHelper.openActionsPage()))
    );

    // 删除 Actions 运行记录
    context.subscriptions.push(
        vscode.commands.registerCommand('lyugitex.deleteWorkflowRuns', wrapCommand(() => githubHelper.deleteWorkflowRuns()))
    );

    // 初始化 Git 仓库
    context.subscriptions.push(
        vscode.commands.registerCommand('lyugitex.initRepo', wrapCommand(() => gitOps.initRepo()))
    );

    // 推送到远程仓库
    context.subscriptions.push(
        vscode.commands.registerCommand('lyugitex.addRemoteAndPush', wrapCommand(() => gitOps.addRemoteAndPush()))
    );

    // 回退本地记录
    context.subscriptions.push(
        vscode.commands.registerCommand('lyugitex.resetLocalCommits', wrapCommand(() => gitOps.resetLocalCommits()))
    );

    // 回退远程记录
    context.subscriptions.push(
        vscode.commands.registerCommand('lyugitex.resetRemoteCommits', wrapCommand(() => gitOps.resetRemoteCommits()))
    );

    // 删除本地记录
    context.subscriptions.push(
        vscode.commands.registerCommand('lyugitex.deleteLocalCommits', wrapCommand(() => gitOps.deleteLocalCommits()))
    );

    // 删除远程记录
    context.subscriptions.push(
        vscode.commands.registerCommand('lyugitex.deleteRemoteCommits', wrapCommand(() => gitOps.deleteRemoteCommits()))
    );

    // 恢复记录
    context.subscriptions.push(
        vscode.commands.registerCommand('lyugitex.recoverCommits', wrapCommand(() => gitOps.recoverCommits()))
    );

    // 添加 .gitignore
    context.subscriptions.push(
        vscode.commands.registerCommand('lyugitex.addGitignore', wrapCommand(() => gitOps.addGitignore()))
    );

    // 打开设置
    context.subscriptions.push(
        vscode.commands.registerCommand('lyugitex.openSettings', async () => {
            vscode.commands.executeCommand('workbench.action.openSettings', 'lyugitex');
        })
    );

    // 管理远程仓库
    context.subscriptions.push(
        vscode.commands.registerCommand('lyugitex.manageRemotes', wrapCommand(() => repoSync.manageRemotes()))
    );

    // 同步到远程仓库
    context.subscriptions.push(
        vscode.commands.registerCommand('lyugitex.syncToRemotes', wrapCommand(() => repoSync.syncToAll()))
    );

    // 管理本地保存的密钥
    context.subscriptions.push(
        vscode.commands.registerCommand('lyugitex.manageLocalSecrets', wrapCommand(() => secretStorage.manageSecrets()))
    );
}

export function deactivate() {}
