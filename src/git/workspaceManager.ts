import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface WorkspaceInfo {
    folder: vscode.WorkspaceFolder;
    isGitRepo: boolean;
    repoName?: string;
}

export class WorkspaceManager {
    private static instance: WorkspaceManager;
    private lastSelectedFolder: vscode.WorkspaceFolder | undefined;

    private constructor() {}

    static getInstance(): WorkspaceManager {
        if (!WorkspaceManager.instance) {
            WorkspaceManager.instance = new WorkspaceManager();
        }
        return WorkspaceManager.instance;
    }

    /**
     * 获取所有工作区文件夹
     */
    getWorkspaceFolders(): readonly vscode.WorkspaceFolder[] {
        return vscode.workspace.workspaceFolders || [];
    }

    /**
     * 检查是否是多项目工作区
     */
    isMultiRoot(): boolean {
        return this.getWorkspaceFolders().length > 1;
    }

    /**
     * 检查指定文件夹是否是 Git 仓库
     */
    async isGitRepo(folder: vscode.WorkspaceFolder): Promise<boolean> {
        try {
            await execAsync('git rev-parse --git-dir', { cwd: folder.uri.fsPath });
            return true;
        } catch {
            return false;
        }
    }

    /**
     * 获取仓库名称（从 remote url 或文件夹名）
     */
    async getRepoName(folder: vscode.WorkspaceFolder): Promise<string> {
        try {
            const { stdout } = await execAsync('git remote get-url origin', { cwd: folder.uri.fsPath });
            const url = stdout.trim();
            // 从 URL 提取仓库名
            const match = url.match(/\/([^/]+?)(\.git)?$/);
            if (match) {
                return match[1];
            }
        } catch {
            // 没有 remote，使用文件夹名
        }
        return folder.name;
    }

    /**
     * 获取所有工作区的详细信息
     */
    async getWorkspaceInfos(): Promise<WorkspaceInfo[]> {
        const folders = this.getWorkspaceFolders();
        const infos: WorkspaceInfo[] = [];

        for (const folder of folders) {
            const isGitRepo = await this.isGitRepo(folder);
            const repoName = isGitRepo ? await this.getRepoName(folder) : undefined;
            infos.push({ folder, isGitRepo, repoName });
        }

        return infos;
    }

    /**
     * 选择工作区文件夹
     * - 单项目：直接返回
     * - 多项目：显示选择器让用户选择
     * @param options 配置选项
     */
    async selectWorkspaceFolder(options?: {
        /** 是否只显示 Git 仓库 */
        gitRepoOnly?: boolean;
        /** 提示文字 */
        placeHolder?: string;
        /** 是否记住选择（同一会话内） */
        rememberChoice?: boolean;
    }): Promise<vscode.WorkspaceFolder | undefined> {
        const folders = this.getWorkspaceFolders();

        if (folders.length === 0) {
            vscode.window.showErrorMessage('请先打开一个工作区');
            return undefined;
        }

        // 单项目直接返回
        if (folders.length === 1) {
            return folders[0];
        }

        // 如果记住选择且有上次选择，直接返回
        if (options?.rememberChoice && this.lastSelectedFolder) {
            // 验证上次选择的文件夹是否还存在
            if (folders.some(f => f.uri.fsPath === this.lastSelectedFolder!.uri.fsPath)) {
                return this.lastSelectedFolder;
            }
        }

        // 多项目，获取详细信息
        let infos = await this.getWorkspaceInfos();

        // 如果只要 Git 仓库
        if (options?.gitRepoOnly) {
            infos = infos.filter(info => info.isGitRepo);
            if (infos.length === 0) {
                vscode.window.showErrorMessage('没有找到 Git 仓库');
                return undefined;
            }
            if (infos.length === 1) {
                return infos[0].folder;
            }
        }

        // 构建选择项
        const items = infos.map(info => ({
            label: info.isGitRepo ? `$(repo) ${info.folder.name}` : `$(folder) ${info.folder.name}`,
            description: info.repoName && info.repoName !== info.folder.name ? info.repoName : undefined,
            detail: info.folder.uri.fsPath,
            folder: info.folder
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: options?.placeHolder || '选择要操作的项目'
        });

        if (selected) {
            if (options?.rememberChoice) {
                this.lastSelectedFolder = selected.folder;
            }
            return selected.folder;
        }

        return undefined;
    }

    /**
     * 清除记住的选择
     */
    clearRememberedChoice(): void {
        this.lastSelectedFolder = undefined;
    }

    /**
     * 获取当前活动编辑器所在的工作区文件夹
     */
    getActiveEditorWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            return vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
        }
        return undefined;
    }

    /**
     * 智能选择工作区：优先使用当前编辑器所在的工作区
     */
    async selectWorkspaceFolderSmart(options?: {
        gitRepoOnly?: boolean;
        placeHolder?: string;
    }): Promise<vscode.WorkspaceFolder | undefined> {
        const folders = this.getWorkspaceFolders();

        if (folders.length === 0) {
            vscode.window.showErrorMessage('请先打开一个工作区');
            return undefined;
        }

        if (folders.length === 1) {
            return folders[0];
        }

        // 尝试使用当前编辑器所在的工作区
        const activeFolder = this.getActiveEditorWorkspaceFolder();
        if (activeFolder) {
            if (!options?.gitRepoOnly || await this.isGitRepo(activeFolder)) {
                return activeFolder;
            }
        }

        // 否则让用户选择
        return this.selectWorkspaceFolder(options);
    }
}
