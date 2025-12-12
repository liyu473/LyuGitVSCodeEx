# LyuGitEx

VS Code 扩展，提供 Git 操作增强和 GitHub Actions 工作流生成。

## 功能

### 🚀 快速开始
- 初始化 Git 仓库（支持选择分支名称）
- 推送到远程仓库（自动配置 remote）

### ⚙️ 工作流生成
- **C#/.NET 工作流**: 自动检测 .NET 版本，支持 NuGet 发布、ZIP 打包
- **VS Code 扩展工作流**: 打包 .vsix 或发布到 Marketplace
- **GitHub Secrets 管理**: OAuth 登录，添加/修改/删除 Secrets
- **Actions 记录管理**: 查看和删除工作流运行记录

### 🏷️ Tag 管理
- 创建 Tag（轻量/附注）
- 删除本地/远程 Tag（支持批量）

### ⏪ 提交管理
- 回退本地/远程提交（soft/mixed/hard）
- 删除本地/远程提交
- 恢复记录（reflog）

### 🔄 多仓库同步
- 管理多个远程仓库（GitHub、Gitee、GitLab 等）
- 一键同步到所有远程

### 📋 项目配置
- 添加 .gitignore（多种模板）
- 清理已跟踪的忽略文件

## 设置

可在设置中配置网络重试次数、超时时间等参数。
