import * as vscode from 'vscode';
import simpleGit, { SimpleGit, StatusResult } from 'simple-git';

export class GitTreeViewProvider implements vscode.TreeDataProvider<GitTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<GitTreeItem | undefined | null | void> = new vscode.EventEmitter<GitTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<GitTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private git: SimpleGit;
    private workspaceRoot: string | undefined;

    constructor() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            this.workspaceRoot = workspaceFolder.uri.fsPath;
            this.git = simpleGit(this.workspaceRoot);
        } else {
            this.git = simpleGit();
        }
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: GitTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: GitTreeItem): Promise<GitTreeItem[]> {
        if (!this.workspaceRoot) {
            return [new GitTreeItem('ワークスペースを開いてください', vscode.TreeItemCollapsibleState.None, 'info')];
        }

        if (!element) {
            try {
                const status = await this.git.status();
                const items: GitTreeItem[] = [];

                // ステータス情報
                items.push(new GitTreeItem(
                    `ブランチ: ${status.current}`,
                    vscode.TreeItemCollapsibleState.None,
                    'branch'
                ));

                if (status.tracking) {
                    items.push(new GitTreeItem(
                        `追跡中: ${status.tracking}`,
                        vscode.TreeItemCollapsibleState.None,
                        'tracking'
                    ));
                }

                // 変更されたファイル
                if (status.modified.length > 0) {
                    items.push(new GitTreeItem(
                        `変更されたファイル (${status.modified.length})`,
                        vscode.TreeItemCollapsibleState.Collapsed,
                        'modified-group'
                    ));
                }

                // ステージされたファイル
                if (status.staged.length > 0) {
                    items.push(new GitTreeItem(
                        `ステージされたファイル (${status.staged.length})`,
                        vscode.TreeItemCollapsibleState.Collapsed,
                        'staged-group'
                    ));
                }

                // 追跡されていないファイル
                if (status.not_added.length > 0) {
                    items.push(new GitTreeItem(
                        `追跡されていないファイル (${status.not_added.length})`,
                        vscode.TreeItemCollapsibleState.Collapsed,
                        'untracked-group'
                    ));
                }

                // プッシュされていないコミット
                try {
                    // まずリモートの存在を確認
                    const remotes = await this.git.getRemotes();
                    if (remotes.length > 0) {
                        // origin/main または origin/master との差分を確認
                        let unpushedCommits: any[] = [];
                        try {
                            // 最初に origin/main を試す
                            const logMain = await this.git.log([`origin/main..HEAD`]);
                            unpushedCommits = [...logMain.all];
                        } catch {
                            try {
                                // origin/main が存在しない場合は origin/master を試す
                                const logMaster = await this.git.log([`origin/master..HEAD`]);
                                unpushedCommits = [...logMaster.all];
                            } catch {
                                // デフォルトブランチを取得してそれと比較
                                try {
                                    const branches = await this.git.branch(['-r']);
                                    const defaultBranch = branches.all.find(b => b.includes('origin/'));
                                    if (defaultBranch) {
                                        const logDefault = await this.git.log([`${defaultBranch}..HEAD`]);
                                        unpushedCommits = [...logDefault.all];
                                    }
                                } catch {
                                    // 最後の手段として、すべてのローカルコミットを表示
                                    const allCommits = await this.git.log(['--oneline', '-10']);
                                    unpushedCommits = [...allCommits.all];
                                }
                            }
                        }
                        
                        if (unpushedCommits.length > 0) {
                            items.push(new GitTreeItem(
                                `プッシュされていないコミット (${unpushedCommits.length})`,
                                vscode.TreeItemCollapsibleState.Collapsed,
                                'unpushed-commits'
                            ));
                        }
                    } else {
                        // リモートが設定されていない場合は最新の10コミットを表示
                        const allCommits = await this.git.log(['--oneline', '-10']);
                        if (allCommits.all.length > 0) {
                            items.push(new GitTreeItem(
                                `最新のコミット (${allCommits.all.length})`,
                                vscode.TreeItemCollapsibleState.Collapsed,
                                'unpushed-commits'
                            ));
                        }
                    }
                } catch (error) {
                    console.log('Git log error:', error);
                    // エラーが発生した場合もローカルコミットを表示
                    try {
                        const allCommits = await this.git.log(['--oneline', '-5']);
                        if (allCommits.all.length > 0) {
                            items.push(new GitTreeItem(
                                `ローカルコミット (${allCommits.all.length})`,
                                vscode.TreeItemCollapsibleState.Collapsed,
                                'unpushed-commits'
                            ));
                        }
                    } catch (logError) {
                        console.log('Failed to get any commits:', logError);
                    }
                }

                // コミットエディターを開くボタン
                items.push(new GitTreeItem(
                    '新しいコミットを作成',
                    vscode.TreeItemCollapsibleState.None,
                    'action',
                    {
                        command: 'git-commit-manager.openCommitEditor',
                        title: '新しいコミットを作成'
                    }
                ));

                return items;
            } catch (error) {
                return [new GitTreeItem('Gitリポジトリが見つかりません', vscode.TreeItemCollapsibleState.None, 'error')];
            }
        } else {
            return this.getChildrenForElement(element);
        }
    }

    private async getChildrenForElement(element: GitTreeItem): Promise<GitTreeItem[]> {
        const status = await this.git.status();
        
        switch (element.contextValue) {
            case 'modified-group':
                return status.modified.map(file => new GitTreeItem(
                    file,
                    vscode.TreeItemCollapsibleState.None,
                    'modified-file',
                    {
                        command: 'git-commit-manager.showFileDiff',
                        title: '変更点を表示',
                        arguments: [file, 'modified']
                    }
                ));

            case 'staged-group':
                return status.staged.map(file => new GitTreeItem(
                    file,
                    vscode.TreeItemCollapsibleState.None,
                    'staged-file',
                    {
                        command: 'git-commit-manager.showFileDiff',
                        title: '変更点を表示',
                        arguments: [file, 'staged']
                    }
                ));

            case 'untracked-group':
                return status.not_added.map(file => new GitTreeItem(
                    file,
                    vscode.TreeItemCollapsibleState.None,
                    'untracked-file',
                    {
                        command: 'git-commit-manager.showFileDiff',
                        title: '新規ファイル内容を表示',
                        arguments: [file, 'untracked']
                    }
                ));

            case 'unpushed-commits':
                try {
                    let commits: any[] = [];
                    
                    // リモートとの差分を確認
                    const remotes = await this.git.getRemotes();
                    if (remotes.length > 0) {
                        try {
                            const logMain = await this.git.log([`origin/main..HEAD`]);
                            commits = [...logMain.all];
                        } catch {
                            try {
                                const logMaster = await this.git.log([`origin/master..HEAD`]);
                                commits = [...logMaster.all];
                            } catch {
                                try {
                                    const branches = await this.git.branch(['-r']);
                                    const defaultBranch = branches.all.find(b => b.includes('origin/'));
                                    if (defaultBranch) {
                                        const logDefault = await this.git.log([`${defaultBranch}..HEAD`]);
                                        commits = [...logDefault.all];
                                    }
                                } catch {
                                    const allCommits = await this.git.log(['--oneline', '-10']);
                                    commits = [...allCommits.all];
                                }
                            }
                        }
                    } else {
                        // リモートがない場合は最新コミットを表示
                        const allCommits = await this.git.log(['--oneline', '-10']);
                        commits = [...allCommits.all];
                    }
                    
                    return commits.map(commit => {
                        const commitDate = new Date(commit.date).toLocaleString('ja-JP', {
                            year: 'numeric',
                            month: '2-digit', 
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                        });
                        return new GitTreeItem(
                            `${commit.hash.substring(0, 7)} ${commit.message}`,
                            vscode.TreeItemCollapsibleState.None,
                            'unpushed-commit',
                            {
                                command: 'git-commit-manager.editCommitDate',
                                title: 'コミット時間を編集',
                                arguments: [commit.hash, commit.date]
                            },
                            commitDate
                        );
                    });
                } catch (error) {
                    console.log('Error getting unpushed commits:', error);
                    return [];
                }

            default:
                return [];
        }
    }
}

export class GitTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly contextValue: string,
        public readonly command?: vscode.Command,
        public readonly commitTime?: string
    ) {
        super(label, collapsibleState);
        
        // コミットの場合は時間を含めたツールチップを設定
        if (commitTime && contextValue === 'unpushed-commit') {
            this.tooltip = `${label}\nコミット時間: ${commitTime}`;
            this.description = commitTime;
        } else {
            this.tooltip = label;
        }
        
        // アイコンの設定
        switch (contextValue) {
            case 'branch':
                this.iconPath = new vscode.ThemeIcon('git-branch');
                break;
            case 'tracking':
                this.iconPath = new vscode.ThemeIcon('cloud');
                break;
            case 'modified-file':
                this.iconPath = new vscode.ThemeIcon('diff-modified');
                break;
            case 'staged-file':
                this.iconPath = new vscode.ThemeIcon('diff-added');
                break;
            case 'untracked-file':
                this.iconPath = new vscode.ThemeIcon('diff-ignored');
                break;
            case 'unpushed-commit':
                this.iconPath = new vscode.ThemeIcon('git-commit');
                break;
            case 'action':
                this.iconPath = new vscode.ThemeIcon('add');
                break;
            case 'modified-group':
            case 'staged-group':
            case 'untracked-group':
            case 'unpushed-commits':
                this.iconPath = new vscode.ThemeIcon('folder');
                break;
        }
    }
}