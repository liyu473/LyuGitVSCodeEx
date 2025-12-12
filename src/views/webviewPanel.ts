import * as vscode from 'vscode';

export class WorkflowWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'workflowWebview';

    constructor(private readonly _extensionUri: vscode.Uri) {}

    resolveWebviewView(webviewView: vscode.WebviewView) {
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlContent();

        webviewView.webview.onDidReceiveMessage(async (message) => {
            if (message.command === 'executeCommand') {
                vscode.commands.executeCommand(message.commandId);
            }
        });
    }

    private _getHtmlContent(): string {
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            padding: 8px;
        }
        .section { margin-bottom: 4px; }
        .section-header {
            display: flex;
            align-items: center;
            padding: 6px 8px;
            cursor: pointer;
            border-radius: 4px;
            user-select: none;
        }
        .section-header:hover {
            background: var(--vscode-list-hoverBackground);
        }
        .section-title {
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            color: var(--vscode-descriptionForeground);
            letter-spacing: 0.5px;
            flex: 1;
        }
        .chevron {
            font-size: 10px;
            transition: transform 0.2s;
            margin-right: 6px;
        }
        .section.collapsed .chevron { transform: rotate(-90deg); }
        .section.collapsed .btn-group { display: none; }
        .btn-group {
            display: flex;
            flex-direction: column;
            gap: 2px;
            padding: 4px 0 8px 0;
        }
        .btn {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 10px;
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            text-align: left;
            transition: background 0.15s;
        }
        .btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
        .btn-primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
        .btn-danger { background: var(--vscode-inputValidation-errorBackground); }
        .btn-danger:hover { opacity: 0.9; }
        .icon { width: 14px; text-align: center; }
    </style>
</head>
<body>
    <div class="section" id="sec-start">
        <div class="section-header" onclick="toggle('sec-start')">
            <span class="chevron">▼</span>
            <span class="section-title">🚀 快速开始</span>
        </div>
        <div class="btn-group">
            <button class="btn btn-primary" onclick="exec('workflow-generator.initRepo')" title="在当前文件夹初始化一个新的 Git 仓库，可选择默认分支名称（main/master），并可选创建 .gitignore 文件">
                <span class="icon">📁</span> 初始化 Git 仓库
            </button>
            <button class="btn btn-primary" onclick="exec('workflow-generator.addRemoteAndPush')" title="将本地仓库推送到远程（如 GitHub）。如果没有配置远程地址会提示输入，如果没有提交会自动创建首次提交">
                <span class="icon">☁️</span> 推送到远程仓库
            </button>
        </div>
    </div>

    <div class="section" id="sec-workflow">
        <div class="section-header" onclick="toggle('sec-workflow')">
            <span class="chevron">▼</span>
            <span class="section-title">⚙️ 工作流</span>
        </div>
        <div class="btn-group">
            <button class="btn" onclick="exec('workflow-generator.generateReleaseYml')" title="为 C#/.NET 项目生成 GitHub Actions 的 release.yml 工作流。支持自动检测 .NET 版本、发布到 NuGet（类库）、生成 ZIP（应用程序）、Dry-run 测试模式">
                <span class="icon">📄</span> 生成 Release.yml
            </button>
            <button class="btn" onclick="exec('workflow-generator.manageSecrets')" title="管理 GitHub 仓库的 Secrets（如 NUGET_API_KEY）。使用 GitHub OAuth 登录，登录一次后会话保持无需重复登录，可添加、修改、删除 Secrets">
                <span class="icon">🔑</span> 管理 GitHub Secrets
            </button>
            <button class="btn" onclick="exec('workflow-generator.openActions')" title="在浏览器中打开当前仓库的 GitHub Actions 页面，查看工作流运行状态和日志">
                <span class="icon">▶️</span> 打开 Actions 页面
            </button>
        </div>
    </div>

    <div class="section" id="sec-project">
        <div class="section-header" onclick="toggle('sec-project')">
            <span class="chevron">▼</span>
            <span class="section-title">📋 项目配置</span>
        </div>
        <div class="btn-group">
            <button class="btn" onclick="exec('workflow-generator.addGitignore')" title="添加 .gitignore 文件，支持多种模板（VS/C#、Node、Python、Unity、JetBrains、macOS、Windows）。已有文件会追加内容。还可清理已被 Git 跟踪的忽略文件（如已提交的 .idea 文件夹）">
                <span class="icon">📝</span> 添加 .gitignore
            </button>
        </div>
    </div>

    <div class="section" id="sec-tag">
        <div class="section-header" onclick="toggle('sec-tag')">
            <span class="chevron">▼</span>
            <span class="section-title">🏷️ Tag 管理</span>
        </div>
        <div class="btn-group">
            <button class="btn" onclick="exec('workflow-generator.deleteLatestTag')" title="快速删除最新的 Git Tag。可选择只删除本地，或同时删除本地和远程的 Tag">
                <span class="icon">🗑️</span> 删除最新 Tag
            </button>
            <button class="btn" onclick="exec('workflow-generator.deleteLocalTag')" title="列出所有本地 Tag，可多选删除。只影响本地，不会删除远程的 Tag">
                <span class="icon">📍</span> 删除本地 Tag
            </button>
            <button class="btn btn-danger" onclick="exec('workflow-generator.deleteRemoteTag')" title="⚠️ 列出远程仓库的所有 Tag，可多选删除。此操作会从 GitHub 等远程仓库删除 Tag，不可撤销">
                <span class="icon">🌐</span> 删除远程 Tag
            </button>
        </div>
    </div>

    <div class="section" id="sec-reset">
        <div class="section-header" onclick="toggle('sec-reset')">
            <span class="chevron">▼</span>
            <span class="section-title">⏪ 回退记录</span>
        </div>
        <div class="btn-group">
            <button class="btn" onclick="exec('workflow-generator.resetLocalCommits')" title="选择一个历史提交回退到该状态。软回退：保留修改在暂存区；混合回退：保留修改但不暂存；硬回退：丢弃所有修改。回退后可用「恢复记录」找回">
                <span class="icon">↩️</span> 回退本地记录
            </button>
            <button class="btn btn-danger" onclick="exec('workflow-generator.resetRemoteCommits')" title="⚠️ 危险！选择一个历史提交，将本地和远程都回退到该状态（force push）。适用于撤销已推送的错误提交">
                <span class="icon">⚠️</span> 回退远程记录
            </button>
        </div>
    </div>

    <div class="section" id="sec-delete">
        <div class="section-header" onclick="toggle('sec-delete')">
            <span class="chevron">▼</span>
            <span class="section-title">🗑️ 删除记录</span>
        </div>
        <div class="btn-group">
            <button class="btn" onclick="exec('workflow-generator.deleteLocalCommits')" title="删除最近 N 个本地提交。与回退的区别：回退是选择回退到哪个提交，删除是选择删除几个。软删除保留修改在暂存区方便重新提交，硬删除彻底丢弃">
                <span class="icon">📍</span> 删除本地记录
            </button>
            <button class="btn btn-danger" onclick="exec('workflow-generator.deleteRemoteCommits')" title="⚠️ 危险！删除远程最近 N 个提交。可选择：保留本地修改（文件改动留在暂存区）或同时删除本地。选错了可用「恢复记录」找回本地状态">
                <span class="icon">🌐</span> 删除远程记录
            </button>
        </div>
    </div>

    <div class="section" id="sec-recover">
        <div class="section-header" onclick="toggle('sec-recover')">
            <span class="chevron">▼</span>
            <span class="section-title">🔄 恢复</span>
        </div>
        <div class="btn-group">
            <button class="btn btn-primary" onclick="exec('workflow-generator.recoverCommits')" title="使用 Git reflog 恢复之前的状态。Reflog 记录本地 HEAD 的所有移动历史（保留90天）。可恢复回退/删除后的状态、误操作 reset --hard 后的状态。注意：reflog 只存本地，与云端无关">
                <span class="icon">♻️</span> 恢复记录 (reflog)
            </button>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const state = vscode.getState() || {};
        
        Object.keys(state).forEach(id => {
            if (state[id]) document.getElementById(id)?.classList.add('collapsed');
        });
        
        function toggle(id) {
            const el = document.getElementById(id);
            el.classList.toggle('collapsed');
            state[id] = el.classList.contains('collapsed');
            vscode.setState(state);
        }
        
        function exec(commandId) {
            vscode.postMessage({ command: 'executeCommand', commandId });
        }
    </script>
</body>
</html>`;
    }
}
