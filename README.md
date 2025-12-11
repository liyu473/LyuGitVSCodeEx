# Workflow Generator

VS Code 扩展，用于快速生成 CI/CD 工作流和 Git 操作。

## 功能

### 工作流生成
- **生成 Release.yml**: 为 C# 项目生成 GitHub Actions 工作流，支持：
  - 选择多个项目发布到 NuGet
  - 自定义 NuGet 源地址
  - 配置 API Key 密钥名称
  - 自动创建 GitHub Release

### Git 快捷操作
- **删除最新 Tag**: 快速删除最新的 Git Tag（本地/远程）
- **Git Pull/Push**: 快速拉取和推送代码
- **删除本地 Tag**: 批量删除本地 Tags
- **删除远程 Tag**: 批量删除远程 Tags
- **清理已合并分支**: 删除已合并到主分支的本地分支

## 使用方法

1. 打开命令面板 (Ctrl+Shift+P)
2. 输入 "Workflow" 查看所有命令
3. 或者使用侧边栏的 Workflow Generator 面板

## 安装

```bash
npm install
npm run compile
```

按 F5 启动调试。

## 打包发布

```bash
npm install -g @vscode/vsce
vsce package
```
