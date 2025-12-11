import * as vscode from 'vscode';

interface ActionItem {
    label: string;
    command: string;
    icon: string;
}

const ACTIONS: ActionItem[] = [
    { label: '生成 Release.yml', command: 'workflow-generator.generateReleaseYml', icon: 'file-code' },
    { label: '删除最新 Tag', command: 'workflow-generator.deleteLatestTag', icon: 'trash' },
    { label: 'Git Pull', command: 'workflow-generator.gitPull', icon: 'cloud-download' },
    { label: 'Git Push', command: 'workflow-generator.gitPush', icon: 'cloud-upload' },
    { label: '删除本地 Tag', command: 'workflow-generator.deleteLocalTag', icon: 'tag' },
    { label: '删除远程 Tag', command: 'workflow-generator.deleteRemoteTag', icon: 'remote' },
    { label: '清理已合并分支', command: 'workflow-generator.cleanLocalBranches', icon: 'git-branch' },
];

export class WorkflowTreeProvider implements vscode.TreeDataProvider<WorkflowTreeItem> {
    getTreeItem(element: WorkflowTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(): WorkflowTreeItem[] {
        return ACTIONS.map(action => new WorkflowTreeItem(action));
    }
}

class WorkflowTreeItem extends vscode.TreeItem {
    constructor(action: ActionItem) {
        super(action.label, vscode.TreeItemCollapsibleState.None);
        this.command = {
            command: action.command,
            title: action.label
        };
        this.iconPath = new vscode.ThemeIcon(action.icon);
        this.tooltip = action.label;
    }
}
