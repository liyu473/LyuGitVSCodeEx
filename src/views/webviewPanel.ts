import * as vscode from 'vscode';

export class WorkflowWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'workflowWebview';
    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlContent();

        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'executeCommand':
                    vscode.commands.executeCommand(message.commandId);
                    break;
                case 'showInput':
                    const result = await vscode.window.showInputBox({
                        prompt: message.prompt,
                        value: message.defaultValue,
                        password: message.password
                    });
                    webviewView.webview.postMessage({ type: 'inputResult', id: message.id, value: result });
                    break;
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
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            padding: 12px;
        }
        .section {
            margin-bottom: 16px;
        }
        .section-title {
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 8px;
            letter-spacing: 0.5px;
        }
        .btn-group {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        .btn {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            text-align: left;
            transition: background 0.15s;
        }
        .btn:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        .btn-primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .btn-primary:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .btn-danger {
            background: var(--vscode-inputValidation-errorBackground);
        }
        .btn-danger:hover {
            opacity: 0.9;
        }
        .icon {
            width: 16px;
            height: 16px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
        }
        .divider {
            height: 1px;
            background: var(--vscode-widget-border);
            margin: 12px 0;
        }
        .status-bar {
            padding: 8px;
            background: var(--vscode-editor-background);
            border-radius: 4px;
            font-size: 12px;
            margin-bottom: 12px;
        }
        .status-item {
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 4px;
        }
        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--vscode-charts-green);
        }
        .status-dot.warning {
            background: var(--vscode-charts-yellow);
        }
        .status-dot.error {
            background: var(--vscode-charts-red);
        }
    </style>
</head>
<body>
    <div class="section">
        <div class="section-title">🚀 快速开始</div>
        <div class="btn-group">
            <button class="btn btn-primary" onclick="exec('workflow-generator.initRepo')">
                <span class="icon">📁</span> 初始化 Git 仓库
            </button>
            <button class="btn btn-primary" onclick="exec('workflow-generator.addRemoteAndPush')">
                <span class="icon">☁️</span> 推送到远程仓库
            </button>
        </div>
    </div>

    <div class="divider"></div>

    <div class="section">
        <div class="section-title">⚙️ 工作流</div>
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

    <div class="divider"></div>

    <div class="section">
        <div class="section-title">📦 Git 操作</div>
        <div class="btn-group">
            <button class="btn" onclick="exec('workflow-generator.gitPull')">
                <span class="icon">⬇️</span> Git Pull
            </button>
            <button class="btn" onclick="exec('workflow-generator.gitPush')">
                <span class="icon">⬆️</span> Git Push
            </button>
        </div>
    </div>

    <div class="divider"></div>

    <div class="section">
        <div class="section-title">🏷️ Tag 管理</div>
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

    <div class="divider"></div>

    <div class="section">
        <div class="section-title">⏪ 回退记录</div>
        <div class="btn-group">
            <button class="btn" onclick="exec('workflow-generator.resetLocalCommits')">
                <span class="icon">↩️</span> 回退本地记录
            </button>
            <button class="btn btn-danger" onclick="exec('workflow-generator.resetRemoteCommits')">
                <span class="icon">⚠️</span> 回退远程记录
            </button>
        </div>
    </div>

    <div class="divider"></div>

    <div class="section">
        <div class="section-title">🗑️ 删除记录</div>
        <div class="btn-group">
            <button class="btn" onclick="exec('workflow-generator.deleteLocalCommits')">
                <span class="icon">📍</span> 删除本地记录
            </button>
            <button class="btn btn-danger" onclick="exec('workflow-generator.deleteRemoteCommits')">
                <span class="icon">🌐</span> 删除远程记录
            </button>
        </div>
    </div>

    <div class="divider"></div>

    <div class="section">
        <div class="section-title">🔄 恢复</div>
        <div class="btn-group">
            <button class="btn btn-primary" onclick="exec('workflow-generator.recoverCommits')">
                <span class="icon">♻️</span> 恢复记录 (reflog)
            </button>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        function exec(commandId) {
            vscode.postMessage({ command: 'executeCommand', commandId });
        }
    </script>
</body>
</html>`;
    }
}
