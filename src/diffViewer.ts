import * as vscode from 'vscode';
import simpleGit, { SimpleGit } from 'simple-git';

export class DiffViewerProvider {
    private git: SimpleGit;

    constructor() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            this.git = simpleGit(workspaceFolder.uri.fsPath);
        } else {
            this.git = simpleGit();
        }
    }

    public async showFileDiff(fileName: string, fileStatus: 'modified' | 'staged' | 'untracked'): Promise<void> {
        const panel = vscode.window.createWebviewPanel(
            'gitFileDiff',
            `差分表示: ${fileName}`,
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        try {
            let diffContent = '';
            
            switch (fileStatus) {
                case 'modified':
                    // 作業ディレクトリとインデックスの差分
                    diffContent = await this.git.diff([fileName]);
                    break;
                case 'staged':
                    // インデックスとHEADの差分
                    diffContent = await this.git.diff(['--cached', fileName]);
                    break;
                case 'untracked':
                    // 新しいファイルの内容を表示
                    try {
                        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                        if (workspaceFolder) {
                            const filePath = vscode.Uri.joinPath(workspaceFolder.uri, fileName);
                            const fileContent = await vscode.workspace.fs.readFile(filePath);
                            const content = Buffer.from(fileContent).toString('utf8');
                            diffContent = this.createNewFileDiff(fileName, content);
                        }
                    } catch (error) {
                        diffContent = `ファイルの読み取りに失敗しました: ${error}`;
                    }
                    break;
            }

            panel.webview.html = this.getWebviewContent(fileName, fileStatus, diffContent);
        } catch (error) {
            panel.webview.html = this.getErrorContent(fileName, `差分の取得に失敗しました: ${error}`);
        }
    }

    private createNewFileDiff(fileName: string, content: string): string {
        const lines = content.split('\n');
        let diff = `diff --git a/${fileName} b/${fileName}\n`;
        diff += `new file mode 100644\n`;
        diff += `index 0000000..1234567\n`;
        diff += `--- /dev/null\n`;
        diff += `+++ b/${fileName}\n`;
        diff += `@@ -0,0 +1,${lines.length} @@\n`;
        
        lines.forEach(line => {
            diff += `+${line}\n`;
        });
        
        return diff;
    }

    private getWebviewContent(fileName: string, fileStatus: string, diffContent: string): string {
        const statusText = {
            'modified': '変更',
            'staged': 'ステージ済み',
            'untracked': '新規'
        };

        // diffContentをHTMLエスケープして、色付けする
        const escapedDiff = this.escapeHtml(diffContent);
        const coloredDiff = this.colorDiff(escapedDiff);

        return `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>差分表示: ${fileName}</title>
    <style>
        body {
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            margin: 0;
            padding: 20px;
            line-height: 1.4;
        }
        .header {
            background-color: var(--vscode-textBlockQuote-background);
            padding: 15px;
            border-left: 4px solid var(--vscode-textLink-foreground);
            margin-bottom: 20px;
            border-radius: 5px;
        }
        .file-name {
            font-size: 18px;
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
        }
        .file-status {
            font-size: 14px;
            color: var(--vscode-descriptionForeground);
            margin-top: 5px;
        }
        .diff-container {
            background-color: var(--vscode-textCodeBlock-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 5px;
            overflow: auto;
            max-height: 80vh;
        }
        .diff-content {
            padding: 15px;
            white-space: pre;
            font-size: 13px;
            margin: 0;
        }
        .diff-line-added {
            background-color: rgba(0, 255, 0, 0.1);
            color: #4ec9b0;
        }
        .diff-line-removed {
            background-color: rgba(255, 0, 0, 0.1);
            color: #f48771;
        }
        .diff-line-info {
            background-color: rgba(0, 150, 255, 0.1);
            color: #9cdcfe;
        }
        .diff-line-context {
            color: var(--vscode-editor-foreground);
        }
        .no-changes {
            color: var(--vscode-descriptionForeground);
            font-style: italic;
            text-align: center;
            padding: 40px;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="file-name">${fileName}</div>
        <div class="file-status">ステータス: ${statusText[fileStatus as keyof typeof statusText] || fileStatus}</div>
    </div>
    
    <div class="diff-container">
        ${diffContent.trim() ? 
            `<pre class="diff-content">${coloredDiff}</pre>` : 
            `<div class="no-changes">変更点がありません</div>`
        }
    </div>
</body>
</html>`;
    }

    private getErrorContent(fileName: string, errorMessage: string): string {
        return `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>エラー: ${fileName}</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            background-color: var(--vscode-editor-background);
            color: var(--vscode-errorForeground);
            margin: 0;
            padding: 20px;
        }
        .error-container {
            background-color: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            border-radius: 5px;
            padding: 20px;
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="error-container">
        <h2>エラーが発生しました</h2>
        <p>${errorMessage}</p>
    </div>
</body>
</html>`;
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    private colorDiff(diffText: string): string {
        return diffText
            .split('\n')
            .map(line => {
                if (line.startsWith('+')) {
                    return `<span class="diff-line-added">${line}</span>`;
                } else if (line.startsWith('-')) {
                    return `<span class="diff-line-removed">${line}</span>`;
                } else if (line.startsWith('@@')) {
                    return `<span class="diff-line-info">${line}</span>`;
                } else {
                    return `<span class="diff-line-context">${line}</span>`;
                }
            })
            .join('\n');
    }
}