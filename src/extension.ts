import * as vscode from 'vscode';
import { ReleaseYmlGenerator } from './generators/releaseYmlGenerator';
import { GitOperations } from './git/gitOperations';
import { GitHubHelper } from './git/githubHelper';
import { WorkflowTreeProvider } from './views/workflowTreeProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('Workflow Generator 已激活');

    const gitOps = new GitOperations();
    const releaseGenerator = new ReleaseYmlGenerator();
    const githubHelper = new GitHubHelper();

    // 注册树视图
    const treeProvider = new WorkflowTreeProvider();
    vscode.window.registerTreeDataProvider('workflowActions', treeProvider);

    // 生成 Release.yml
    context.subscriptions.push(
        vscode.commands.registerCommand('workflow-generator.generateReleaseYml', async () => {
            await releaseGenerator.generate();
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
}

export function deactivate() {}
