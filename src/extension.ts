import * as vscode from 'vscode';
import { ReleaseYmlGenerator } from './generators/releaseYmlGenerator';
import { GitOperations } from './git/gitOperations';
import { WorkflowTreeProvider } from './views/workflowTreeProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('Workflow Generator 已激活');

    const gitOps = new GitOperations();
    const releaseGenerator = new ReleaseYmlGenerator();

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
}

export function deactivate() {}
