import * as vscode from 'vscode';
import { CommitEditorProvider } from './commitEditor';
import { GitTreeViewProvider } from './gitTreeViewProvider';
import { DiffViewerProvider } from './diffViewer';
import simpleGit from 'simple-git';

export function activate(context: vscode.ExtensionContext) {
    const commitEditorProvider = new CommitEditorProvider(context.extensionUri);
    const treeDataProvider = new GitTreeViewProvider();
    const diffViewerProvider = new DiffViewerProvider();
    
    // Register tree view
    const treeView = vscode.window.createTreeView('gitCommitManagerView', {
        treeDataProvider: treeDataProvider,
        showCollapseAll: true
    });
    
    context.subscriptions.push(treeView);
    
    // コミットエディターを開くコマンド
    const openEditorCommand = vscode.commands.registerCommand('git-commit-manager.openCommitEditor', async () => {
        const panel = vscode.window.createWebviewPanel(
            'gitCommitEditor',
            'Git コミット管理',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );
        
        await commitEditorProvider.showCommitEditor(panel);
    });

    // ファイルをステージするコマンド
    const stageFileCommand = vscode.commands.registerCommand('git-commit-manager.stageFile', async (fileName: string) => {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) return;
            
            const git = simpleGit(workspaceFolder.uri.fsPath);
            await git.add(fileName);
            treeDataProvider.refresh();
            vscode.window.showInformationMessage(`${fileName} をステージしました`);
        } catch (error) {
            vscode.window.showErrorMessage(`ステージエラー: ${error}`);
        }
    });

    // ファイルのステージを解除するコマンド
    const unstageFileCommand = vscode.commands.registerCommand('git-commit-manager.unstageFile', async (fileName: string) => {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) return;
            
            const git = simpleGit(workspaceFolder.uri.fsPath);
            await git.reset(['HEAD', fileName]);
            treeDataProvider.refresh();
            vscode.window.showInformationMessage(`${fileName} のステージを解除しました`);
        } catch (error) {
            vscode.window.showErrorMessage(`ステージ解除エラー: ${error}`);
        }
    });

    // コミット時間を編集するコマンド
    const editCommitDateCommand = vscode.commands.registerCommand('git-commit-manager.editCommitDate', async (commitHash: string, currentDate?: string) => {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) return;
            
            const git = simpleGit(workspaceFolder.uri.fsPath);
            
            // 現在のコミット時間を取得
            let currentCommitDate = currentDate;
            if (!currentCommitDate) {
                try {
                    const commitInfo = await git.show(['--format=%ci', '-s', commitHash]);
                    currentCommitDate = commitInfo.trim();
                } catch {
                    currentCommitDate = '取得できませんでした';
                }
            }
            
            // 日本語形式で表示するための変換
            let displayDate = currentCommitDate;
            if (currentCommitDate && currentCommitDate !== '取得できませんでした') {
                try {
                    const date = new Date(currentCommitDate);
                    displayDate = date.toLocaleString('ja-JP', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                    });
                } catch {
                    displayDate = currentCommitDate;
                }
            }
            
            const newDate = await vscode.window.showInputBox({
                prompt: `新しいコミット時間を入力してください (YYYY-MM-DD HH:MM:SS)\n現在の時間: ${displayDate}`,
                placeHolder: '2024-01-01 12:00:00',
                value: currentCommitDate && currentCommitDate !== '取得できませんでした' ? 
                    new Date(currentCommitDate).toISOString().slice(0, 19).replace('T', ' ') : ''
            });
            
            if (!newDate) return;
            // コミット時間を変更（git filter-branchを使用）
            await git.raw([
                'filter-branch', '--env-filter', 
                `if [ $GIT_COMMIT = ${commitHash} ]; then export GIT_AUTHOR_DATE="${newDate}"; export GIT_COMMITTER_DATE="${newDate}"; fi`,
                '--', '--all'
            ]);
            
            treeDataProvider.refresh();
            vscode.window.showInformationMessage(`コミット ${commitHash.substring(0, 7)} の時間を更新しました`);
        } catch (error) {
            vscode.window.showErrorMessage(`コミット時間編集エラー: ${error}`);
        }
    });

    // ファイルの変更点を表示するコマンド
    const showFileDiffCommand = vscode.commands.registerCommand('git-commit-manager.showFileDiff', async (fileName: string, fileStatus: 'modified' | 'staged' | 'untracked') => {
        await diffViewerProvider.showFileDiff(fileName, fileStatus);
    });

    // ビューをリフレッシュするコマンド
    const refreshCommand = vscode.commands.registerCommand('git-commit-manager.refresh', () => {
        treeDataProvider.refresh();
    });

    context.subscriptions.push(
        openEditorCommand,
        stageFileCommand,
        unstageFileCommand, 
        editCommitDateCommand,
        showFileDiffCommand,
        refreshCommand
    );
}

export function deactivate() {}