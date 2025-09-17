import * as vscode from 'vscode';
import * as path from 'path';
import simpleGit, { SimpleGit } from 'simple-git';

export class CommitEditorProvider {
    private git: SimpleGit;

    constructor(private readonly extensionUri: vscode.Uri) {
        this.git = simpleGit();
    }

    public async showCommitEditor(panel: vscode.WebviewPanel): Promise<void> {
        panel.webview.html = await this.getWebviewContent(panel.webview);

        panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'getStatus':
                    await this.handleGetStatus(panel.webview);
                    break;
                case 'commit':
                    await this.handleCommit(panel.webview, message.commitMessage, message.files, message.commitDate);
                    break;
                case 'push':
                    await this.handlePush(panel.webview);
                    break;
            }
        });

        await this.handleGetStatus(panel.webview);
    }

    private async handleGetStatus(webview: vscode.Webview): Promise<void> {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                webview.postMessage({ command: 'error', message: 'ワークスペースフォルダが見つかりません' });
                return;
            }

            this.git = simpleGit(workspaceFolder.uri.fsPath);
            const status = await this.git.status();
            
            webview.postMessage({
                command: 'statusUpdate',
                status: {
                    staged: status.staged,
                    modified: status.modified,
                    not_added: status.not_added,
                    deleted: status.deleted,
                    renamed: status.renamed,
                    current: status.current,
                    tracking: status.tracking
                }
            });
        } catch (error) {
            webview.postMessage({ 
                command: 'error', 
                message: `Gitステータスエラー: ${error instanceof Error ? error.message : '不明なエラー'}` 
            });
        }
    }

    private async handleCommit(webview: vscode.Webview, commitMessage: string, files: string[], commitDate?: string): Promise<void> {
        try {
            if (files.length > 0) {
                await this.git.add(files);
            }
            
            if (commitDate) {
                await this.git.commit(commitMessage, [], { '--date': commitDate });
            } else {
                await this.git.commit(commitMessage);
            }
            
            webview.postMessage({
                command: 'commitSuccess',
                message: 'コミットが成功しました！'
            });
            
            await this.handleGetStatus(webview);
        } catch (error) {
            webview.postMessage({
                command: 'error',
                message: `コミットエラー: ${error instanceof Error ? error.message : '不明なエラー'}`
            });
        }
    }

    private async handlePush(webview: vscode.Webview): Promise<void> {
        try {
            await this.git.push();
            
            webview.postMessage({
                command: 'pushSuccess',
                message: 'プッシュが成功しました！'
            });
        } catch (error) {
            webview.postMessage({
                command: 'error',
                message: `プッシュエラー: ${error instanceof Error ? error.message : '不明なエラー'}`
            });
        }
    }

    private async getWebviewContent(webview: vscode.Webview): Promise<string> {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Git Commit Manager</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
        }
        .section {
            margin-bottom: 30px;
            padding: 15px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 5px;
        }
        .section h3 {
            margin-top: 0;
            color: var(--vscode-textLink-foreground);
        }
        .file-list {
            margin: 10px 0;
        }
        .file-item {
            display: flex;
            align-items: center;
            margin: 5px 0;
            padding: 5px;
            background-color: var(--vscode-list-inactiveSelectionBackground);
            border-radius: 3px;
        }
        .file-item input[type="checkbox"] {
            margin-right: 10px;
        }
        .file-status {
            margin-left: auto;
            padding: 2px 8px;
            border-radius: 3px;
            font-size: 12px;
            font-weight: bold;
        }
        .status-modified { background-color: #ffa500; color: black; }
        .status-added { background-color: #28a745; color: white; }
        .status-deleted { background-color: #dc3545; color: white; }
        .status-renamed { background-color: #17a2b8; color: white; }
        textarea {
            width: 100%;
            min-height: 100px;
            padding: 10px;
            border: 1px solid var(--vscode-input-border);
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 3px;
            resize: vertical;
        }
        button {
            padding: 8px 16px;
            margin: 5px;
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 14px;
        }
        .btn-primary {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .btn-primary:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        .btn-secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .btn-secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        .status-info {
            background-color: var(--vscode-textBlockQuote-background);
            padding: 10px;
            border-left: 4px solid var(--vscode-textLink-foreground);
            margin-bottom: 20px;
        }
        .error {
            color: var(--vscode-errorForeground);
            background-color: var(--vscode-inputValidation-errorBackground);
            padding: 10px;
            border-radius: 3px;
            margin: 10px 0;
        }
        .success {
            color: var(--vscode-testing-iconPassed);
            background-color: var(--vscode-merge-incomingContentBackground);
            padding: 10px;
            border-radius: 3px;
            margin: 10px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Git コミット管理</h1>
        
        <div id="status-info" class="status-info">
            <strong>リポジトリの状態:</strong>
            <div id="repo-status">読み込み中...</div>
        </div>

        <div id="messages"></div>

        <div class="section">
            <h3>変更されたファイル</h3>
            <div id="modified-files" class="file-list">
                変更されたファイルなし
            </div>
        </div>

        <div class="section">
            <h3>ステージされたファイル</h3>
            <div id="staged-files" class="file-list">
                ステージされたファイルなし
            </div>
        </div>

        <div class="section">
            <h3>追跡されていないファイル</h3>
            <div id="untracked-files" class="file-list">
                追跡されていないファイルなし
            </div>
        </div>

        <div class="section">
            <h3>コミットメッセージ</h3>
            <textarea id="commit-message" placeholder="ここにコミットメッセージを入力してください..."></textarea>
            
            <div style="margin-top: 15px;">
                <label for="commit-date" style="display: block; margin-bottom: 5px; font-weight: bold;">コミット日時 (オプション):</label>
                <input type="datetime-local" id="commit-date" style="
                    width: 100%;
                    padding: 8px;
                    border: 1px solid var(--vscode-input-border);
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border-radius: 3px;
                    font-family: var(--vscode-font-family);
                ">
                <small style="color: var(--vscode-descriptionForeground); margin-top: 5px; display: block;">
                    空にすると現在時刻を使用します。形式: YYYY-MM-DDTHH:MM
                </small>
            </div>
            <div style="margin-top: 10px;">
                <button id="commit-btn" class="btn-primary">選択ファイルをコミット</button>
                <button id="commit-all-btn" class="btn-secondary">すべての変更をコミット</button>
                <button id="push-btn" class="btn-primary">リモートにプッシュ</button>
                <button id="refresh-btn" class="btn-secondary">状態を更新</button>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        function showMessage(message, type = 'info') {
            const messagesDiv = document.getElementById('messages');
            const messageDiv = document.createElement('div');
            messageDiv.className = type;
            messageDiv.textContent = message;
            messagesDiv.appendChild(messageDiv);
            setTimeout(() => messageDiv.remove(), 5000);
        }

        function createFileItem(fileName, status, isStaged = false) {
            const div = document.createElement('div');
            div.className = 'file-item';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = fileName;
            checkbox.checked = isStaged;
            
            const label = document.createElement('span');
            label.textContent = fileName;
            
            const statusSpan = document.createElement('span');
            statusSpan.className = \`file-status status-\${status.toLowerCase()}\`;
            statusSpan.textContent = status.toUpperCase();
            
            div.appendChild(checkbox);
            div.appendChild(label);
            div.appendChild(statusSpan);
            
            return div;
        }

        function updateFileList(elementId, files, status, isStaged = false) {
            const container = document.getElementById(elementId);
            container.innerHTML = '';
            
            if (files.length === 0) {
                const statusMap = { 'modified': '変更された', 'added': 'ステージされた', 'untracked': '追跡されていない' };
                container.textContent = \`\${statusMap[status.toLowerCase()] || status}ファイルなし\`;
                return;
            }
            
            files.forEach(file => {
                container.appendChild(createFileItem(file, status, isStaged));
            });
        }

        function getSelectedFiles() {
            const checkboxes = document.querySelectorAll('input[type="checkbox"]:checked');
            return Array.from(checkboxes).map(cb => cb.value);
        }

        function getAllFiles() {
            const checkboxes = document.querySelectorAll('input[type="checkbox"]');
            return Array.from(checkboxes).map(cb => cb.value);
        }

        document.getElementById('commit-btn').addEventListener('click', () => {
            const commitMessage = document.getElementById('commit-message').value.trim();
            if (!commitMessage) {
                showMessage('コミットメッセージを入力してください', 'error');
                return;
            }
            
            const selectedFiles = getSelectedFiles();
            if (selectedFiles.length === 0) {
                showMessage('コミットするファイルを選択してください', 'error');
                return;
            }
            
            const commitDate = document.getElementById('commit-date').value;
            
            vscode.postMessage({
                command: 'commit',
                commitMessage: commitMessage,
                files: selectedFiles,
                commitDate: commitDate || null
            });
        });

        document.getElementById('commit-all-btn').addEventListener('click', () => {
            const commitMessage = document.getElementById('commit-message').value.trim();
            if (!commitMessage) {
                showMessage('コミットメッセージを入力してください', 'error');
                return;
            }
            
            const allFiles = getAllFiles();
            if (allFiles.length === 0) {
                showMessage('コミットするファイルがありません', 'error');
                return;
            }
            
            const commitDate = document.getElementById('commit-date').value;
            
            vscode.postMessage({
                command: 'commit',
                commitMessage: commitMessage,
                files: allFiles,
                commitDate: commitDate || null
            });
        });

        document.getElementById('push-btn').addEventListener('click', () => {
            vscode.postMessage({ command: 'push' });
        });

        document.getElementById('refresh-btn').addEventListener('click', () => {
            vscode.postMessage({ command: 'getStatus' });
        });

        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.command) {
                case 'statusUpdate':
                    const status = message.status;
                    document.getElementById('repo-status').innerHTML = \`
                        ブランチ: <strong>\${status.current}</strong>
                        \${status.tracking ? \`<br>追跡中: \${status.tracking}\` : ''}
                    \`;
                    
                    updateFileList('modified-files', status.modified, 'Modified');
                    updateFileList('staged-files', status.staged, 'Added', true);
                    updateFileList('untracked-files', status.not_added, 'Untracked');
                    break;
                    
                case 'commitSuccess':
                    showMessage(message.message, 'success');
                    document.getElementById('commit-message').value = '';
                    document.getElementById('commit-date').value = '';
                    break;
                    
                case 'pushSuccess':
                    showMessage(message.message, 'success');
                    break;
                    
                case 'error':
                    showMessage(message.message, 'error');
                    break;
            }
        });

        vscode.postMessage({ command: 'getStatus' });
    </script>
</body>
</html>`;
    }
}