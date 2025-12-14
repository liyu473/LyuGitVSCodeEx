import * as vscode from 'vscode';
import { GitHubApi } from './githubApi';

/**
 * GitHub Actions 相关操作
 */
export class GitHubActions extends GitHubApi {
    async deleteWorkflowRuns(token: string, owner: string, repo: string): Promise<void> {
        type WorkflowRun = {
            id: number;
            name: string;
            head_branch: string;
            conclusion: string | null;
            status: string;
            created_at: string;
            run_number: number;
        };
        
        const result = await this.githubRequestWithProgress<{ workflow_runs: WorkflowRun[] }>(
            '正在获取 Actions 记录...',
            'GET', `/repos/${owner}/${repo}/actions/runs?per_page=30`, token
        );

        if (!result || result.status !== 200) {
            if (result) vscode.window.showErrorMessage('获取 Actions 记录失败');
            return;
        }

        const runs = result.data.workflow_runs;

        if (runs.length === 0) {
            vscode.window.showInformationMessage('没有 Actions 运行记录');
            return;
        }

        const items = runs.map(run => {
            const status = run.conclusion || run.status;
            const statusIcon = status === 'success' ? '✅' : status === 'failure' ? '❌' : status === 'cancelled' ? '⚪' : '🔄';
            const date = new Date(run.created_at).toLocaleString();
            return {
                label: `${statusIcon} #${run.run_number} ${run.name}`,
                description: `${run.head_branch} - ${date}`,
                id: run.id
            };
        });

        const selected = await vscode.window.showQuickPick(items, {
            canPickMany: true,
            placeHolder: '选择要删除的 Actions 运行记录（可多选）'
        });

        if (!selected || selected.length === 0) return;

        const confirm = await vscode.window.showWarningMessage(
            `确定删除 ${selected.length} 条 Actions 运行记录？`,
            { modal: true },
            '确定删除'
        );

        if (confirm !== '确定删除') return;

        await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: '正在删除...' },
            async (progress) => {
                let deleted = 0;
                for (const item of selected) {
                    const { status: delStatus } = await this.githubRequest(
                        'DELETE', `/repos/${owner}/${repo}/actions/runs/${item.id}`, token
                    );
                    if (delStatus === 204) {
                        deleted++;
                    }
                    progress.report({ increment: 100 / selected.length });
                }
                vscode.window.showInformationMessage(`✅ 已删除 ${deleted} 条记录`);
            }
        );
    }
}
