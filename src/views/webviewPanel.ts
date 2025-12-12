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
            <button class="btn btn-primary" onclick="exec('workflow-generator.initRepo')">
                <span class="icon">📁</span> 初始化 Git 仓库
            </button>
            <button class="btn btn-primary" onclick="exec('workflow-generator.addRemoteAndPush')">
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
            <button class="btn" onclick="exec('workflow-generator.generateReleaseYml')">
                <span class="icon">📄</span> 生成 Release.yml
            </button>
            <button class="btn" onclick="exec('workflow-generator.manageSecrets')">
                <span class="icon">🔑</span> 管理 GitHub Secrets
            </button>
            <button class="btn" onclick="exec('workflow-generator.openActions')">
                <span class="icon">▶️</span> 打开 Actions 页面
            </button>
        </div>
    </div>

    <div class="section" id="sec-git">
        <div class="section-header" onclick="toggle('sec-git')">
            <span class="chevron">▼</span>
            <span class="section-title">📦 Git 操作</span>
        </div>
        <div class="btn-group">
            <button class="btn" onclick="exec('workflow-generator.gitPull')">
                <span class="icon">⬇️</span> Git Pull
            </button>
            <button class="btn" onclick="exec('workflow-generator.gitPush')">
                <span class="icon">⬆️</span> Git Push
            </button>
        </div>
    </div>

    <div class="section" id="sec-tag">
        <div class="section-header" onclick="toggle('sec-tag')">
            <span class="chevron">▼</span>
            <span class="section-title">🏷️ Tag 管理</span>
        </div>
        <div class="btn-group">
            <button class="btn" onclick="exec('workflow-generator.deleteLatestTag')">
                <span class="icon">🗑️</span> 删除最新 Tag
            </button>
            <button class="btn" onclick="exec('workflow-generator.deleteLocalTag')">
                <span class="icon">📍</span> 删除本地 Tag
            </button>
            <button class="btn btn-danger" onclick="exec('workflow-generator.deleteRemoteTag')">
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
            <button class="btn" onclick="exec('workflow-generator.resetLocalCommits')">
                <span class="icon">↩️</span> 回退本地记录
            </button>
            <button class="btn btn-danger" onclick="exec('workflow-generator.resetRemoteCommits')">
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
            <button class="btn" onclick="exec('workflow-generator.deleteLocalCommits')">
                <span class="icon">📍</span> 删除本地记录
            </button>
            <button class="btn btn-danger" onclick="exec('workflow-generator.deleteRemoteCommits')">
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
            <button class="btn btn-primary" onclick="exec('workflow-generator.recoverCommits')">
                <span class="icon">♻️</span> 恢复记录 (reflog)
            </button>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const state = vscode.getState() || {};
        
        // 恢复折叠状态
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
