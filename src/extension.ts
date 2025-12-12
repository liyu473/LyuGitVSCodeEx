import * as vscode from 'vscode';
import { ReleaseYmlGenerator } from './generators/releaseYmlGenerator';
import { VSCodeExtGenerator } from './generators/vscodeExtGenerator';
import { GitOperations } from './git/gitOperations';
import { GitHubHelper } from './git/githubHelper';
import { RepoSync } from './git/repoSync';
import { WorkflowWebviewProvider } from './views/webviewPanel';

export function activate(context: vscode.ExtensionContext) {
    console.log('Workflow Generator 已激活');

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
        vscode.commands.registerCommand('workflow-generator.generateReleaseYml', async () => {
            await releaseGenerator.generate();
        })
    );

    // 生成 VS Code 扩展工作流
    context.subscriptions.push(
        vscode.commands.registerCommand('workflow-generator.generateVscodeExtYml', async () => {
            await vscodeExtGenerator.generate();
        })
    );

    // 创建 Tag
    context.subscriptions.push(
        vscode.commands.registerCommand('workflow-generator.createTag', async () => {
            await gitOps.createTag();
        })
    );

    // 删除最新 Tag
    context.subscriptions.push(
        vscode.commands.registerCommand('workflow-generator.deleteLatestTag', async () => {
            await gitOps.deleteLatestTag();
        })
    );

    // Git Pull
    context.subscriptions.push(
        vscode.commands.registerCommand('workflow-generator.gitPull', async () => {
            await gitOps.pull();
        })
    );

    // Git Push
    context.subscriptions.push(
        vscode.commands.registerCommand('workflow-generator.gitPush', async () => {
            await gitOps.push();
        })
    );

    // 删除本地 Tag
    context.subscriptions.push(
        vscode.commands.registerCommand('workflow-generator.deleteLocalTag', async () => {
            await gitOps.deleteLocalTag();
        })
    );

    // 删除远程 Tag
    context.subscriptions.push(
        vscode.commands.registerCommand('workflow-generator.deleteRemoteTag', async () => {
            await gitOps.deleteRemoteTag();
        })
    );

    // 清理本地已合并分支
    context.subscriptions.push(
        vscode.commands.registerCommand('workflow-generator.cleanLocalBranches', async () => {
            await gitOps.cleanMergedBranches();
        })
    );

    // 管理 GitHub Secrets
    context.subscriptions.push(
        vscode.commands.registerCommand('workflow-generator.manageSecrets', async () => {
            await githubHelper.manageSecrets();
        })
    );

    // 打开 GitHub Secrets 页面
    context.subscriptions.push(
        vscode.commands.registerCommand('workflow-generator.openSecrets', async () => {
            await githubHelper.openSecretsPage();
        })
    );

    // 打开 GitHub Actions 页面
    context.subscriptions.push(
        vscode.commands.registerCommand('workflow-generator.openActions', async () => {
            await githubHelper.openActionsPage();
        })
    );

    // 删除 Actions 运行记录
    context.subscriptions.push(
        vscode.commands.registerCommand('workflow-generator.deleteWorkflowRuns', async () => {
            await githubHelper.deleteWorkflowRuns();
        })
    );

    // 初始化 Git 仓库
    context.subscriptions.push(
        vscode.commands.registerCommand('workflow-generator.initRepo', async () => {
            await gitOps.initRepo();
        })
    );

    // 推送到远程仓库
    context.subscriptions.push(
        vscode.commands.registerCommand('workflow-generator.addRemoteAndPush', async () => {
            await gitOps.addRemoteAndPush();
        })
    );

    // 回退本地记录
    context.subscriptions.push(
        vscode.commands.registerCommand('workflow-generator.resetLocalCommits', async () => {
            await gitOps.resetLocalCommits();
        })
    );

    // 回退远程记录
    context.subscriptions.push(
        vscode.commands.registerCommand('workflow-generator.resetRemoteCommits', async () => {
            await gitOps.resetRemoteCommits();
        })
    );

    // 删除本地记录
    context.subscriptions.push(
        vscode.commands.registerCommand('workflow-generator.deleteLocalCommits', async () => {
            await gitOps.deleteLocalCommits();
        })
    );

    // 删除远程记录
    context.subscriptions.push(
        vscode.commands.registerCommand('workflow-generator.deleteRemoteCommits', async () => {
            await gitOps.deleteRemoteCommits();
        })
    );

    // 恢复记录
    context.subscriptions.push(
        vscode.commands.registerCommand('workflow-generator.recoverCommits', async () => {
            await gitOps.recoverCommits();
        })
    );

    // 添加 .gitignore
    context.subscriptions.push(
        vscode.commands.registerCommand('workflow-generator.addGitignore', async () => {
            await gitOps.addGitignore();
        })
    );

    // 打开设置
    context.subscriptions.push(
        vscode.commands.registerCommand('workflow-generator.openSettings', async () => {
            vscode.commands.executeCommand('workbench.action.openSettings', 'workflowGenerator');
        })
    );

    // 管理远程仓库
    context.subscriptions.push(
        vscode.commands.registerCommand('workflow-generator.manageRemotes', async () => {
            await repoSync.manageRemotes();
        })
    );

    // 同步到远程仓库
    context.subscriptions.push(
        vscode.commands.registerCommand('workflow-generator.syncToRemotes', async () => {
            await repoSync.syncToAll();
        })
    );
}

export function deactivate() {}
