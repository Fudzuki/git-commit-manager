import * as vscode from 'vscode';

export class GitCommitTreeDataProvider implements vscode.TreeDataProvider<GitCommitItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<GitCommitItem | undefined | null | void> = new vscode.EventEmitter<GitCommitItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<GitCommitItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor() {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: GitCommitItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: GitCommitItem): Thenable<GitCommitItem[]> {
        if (!vscode.workspace.workspaceFolders) {
            return Promise.resolve([]);
        }

        if (!element) {
            return Promise.resolve([
                new GitCommitItem(
                    'コミットエディターを開く',
                    vscode.TreeItemCollapsibleState.None,
                    {
                        command: 'git-commit-manager.openCommitEditor',
                        title: 'コミットエディターを開く'
                    }
                )
            ]);
        }

        return Promise.resolve([]);
    }
}

export class GitCommitItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);
        this.tooltip = label;
        this.contextValue = 'gitCommitItem';
    }
}