import * as vscode from 'vscode';
import { ReleaseYmlGenerator } from './generators/releaseYmlGenerator';
import { VSCodeExtGenerator } from './generators/vscodeExtGenerator';
import { GitOperations } from './git/gitOperations';
import { GitHubHelper } from './git/githubHelper';
import { RepoSync } from './git/repoSync';
import { WorkflowWebviewProvider } from './views/webviewPanel';

export function activate(context: vscode.ExtensionContext) {
    console.log('LyuGitEx 已激活');

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
        vscode.commands.registerCommand('lyugitex.generateReleaseYml', async () => {
            await releaseGenerator.generate();
        })
    );

    // 生成 VS Code 扩展工作流
    context.subscriptions.push(
        vscode.commands.registerCommand('lyugitex.generateVscodeExtYml', async () => {
            await vscodeExtGenerator.generate();
        })
    );

    // 创建 Tag
    context.subscriptions.push(
        vscode.commands.registerCommand('lyugitex.createTag', async () => {
            await gitOps.createTag();
        })
    );

    // 删除最新 Tag
    context.subscriptions.push(
        vscode.commands.registerCommand('lyugitex.deleteLatestTag', async () => {
            await gitOps.deleteLatestTag();
        })
    );

    // Git Pull
    context.subscriptions.push(
        vscode.commands.registerCommand('lyugitex.gitPull', async () => {
            await gitOps.pull();
        })
    );

    // Git Push
    context.subscriptions.push(
        vscode.commands.registerCommand('lyugitex.gitPush', async () => {
            await gitOps.push();
        })
    );

    // 删除本地 Tag
    context.subscriptions.push(
        vscode.commands.registerCommand('lyugitex.deleteLocalTag', async () => {
            await gitOps.deleteLocalTag();
        })
    );

    // 删除远程 Tag
    context.subscriptions.push(
        vscode.commands.registerCommand('lyugitex.deleteRemoteTag', async () => {
            await gitOps.deleteRemoteTag();
        })
    );

    // 清理本地已合并分支
    context.subscriptions.push(
        vscode.commands.registerCommand('lyugitex.cleanLocalBranches', async () => {
            await gitOps.cleanMergedBranches();
        })
    );

    // 管理 GitHub Secrets
    context.subscriptions.push(
        vscode.commands.registerCommand('lyugitex.manageSecrets', async () => {
            await githubHelper.manageSecrets();
        })
    );

    // 打开 GitHub Secrets 页面
    context.subscriptions.push(
        vscode.commands.registerCommand('lyugitex.openSecrets', async () => {
            await githubHelper.openSecretsPage();
        })
    );

    // 打开 GitHub Actions 页面
    context.subscriptions.push(
        vscode.commands.registerCommand('lyugitex.openActions', async () => {
            await githubHelper.openActionsPage();
        })
    );

    // 删除 Actions 运行记录
    context.subscriptions.push(
        vscode.commands.registerCommand('lyugitex.deleteWorkflowRuns', async () => {
            await githubHelper.deleteWorkflowRuns();
        })
    );

    // 初始化 Git 仓库
    context.subscriptions.push(
        vscode.commands.registerCommand('lyugitex.initRepo', async () => {
            await gitOps.initRepo();
        })
    );

    // 推送到远程仓库
    context.subscriptions.push(
        vscode.commands.registerCommand('lyugitex.addRemoteAndPush', async () => {
            await gitOps.addRemoteAndPush();
        })
    );

    // 回退本地记录
    context.subscriptions.push(
        vscode.commands.registerCommand('lyugitex.resetLocalCommits', async () => {
            await gitOps.resetLocalCommits();
        })
    );

    // 回退远程记录
    context.subscriptions.push(
        vscode.commands.registerCommand('lyugitex.resetRemoteCommits', async () => {
            await gitOps.resetRemoteCommits();
        })
    );

    // 删除本地记录
    context.subscriptions.push(
        vscode.commands.registerCommand('lyugitex.deleteLocalCommits', async () => {
            await gitOps.deleteLocalCommits();
        })
    );

    // 删除远程记录
    context.subscriptions.push(
        vscode.commands.registerCommand('lyugitex.deleteRemoteCommits', async () => {
            await gitOps.deleteRemoteCommits();
        })
    );

    // 恢复记录
    context.subscriptions.push(
        vscode.commands.registerCommand('lyugitex.recoverCommits', async () => {
            await gitOps.recoverCommits();
        })
    );

    // 添加 .gitignore
    context.subscriptions.push(
        vscode.commands.registerCommand('lyugitex.addGitignore', async () => {
            await gitOps.addGitignore();
        })
    );

    // 打开设置
    context.subscriptions.push(
        vscode.commands.registerCommand('lyugitex.openSettings', async () => {
            vscode.commands.executeCommand('workbench.action.openSettings', 'lyugitex');
        })
    );

    // 管理远程仓库
    context.subscriptions.push(
        vscode.commands.registerCommand('lyugitex.manageRemotes', async () => {
            await repoSync.manageRemotes();
        })
    );

    // 同步到远程仓库
    context.subscriptions.push(
        vscode.commands.registerCommand('lyugitex.syncToRemotes', async () => {
            await repoSync.syncToAll();
        })
    );
}

export function deactivate() {}
