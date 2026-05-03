import * as vscode from 'vscode';
import { FtpFileSystemProvider } from '../ftp/ftpFileSystemProvider';
import { LpcConfigService } from '../config/lpcConfig';

export class RemoteNode extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly uri: vscode.Uri,
        public readonly isDirectory: boolean
    ) {
        super(
            label,
            isDirectory
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None
        );
        this.resourceUri = uri;
        this.contextValue = isDirectory ? 'lpcDir' : 'lpcFile';
        if (!isDirectory) {
            this.command = {
                command: 'vscode.open',
                title: 'Öffnen',
                arguments: [uri]
            };
        }
    }
}

export class RemoteExplorerProvider implements vscode.TreeDataProvider<RemoteNode> {
    private readonly emitter = new vscode.EventEmitter<RemoteNode | undefined>();
    readonly onDidChangeTreeData = this.emitter.event;

    constructor(
        private readonly fs: FtpFileSystemProvider,
        private readonly config: LpcConfigService
    ) {}

    refresh(node?: RemoteNode): void {
        this.emitter.fire(node);
    }

    getTreeItem(element: RemoteNode): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: RemoteNode): Promise<RemoteNode[]> {
        const cfg = this.config.value;
        if (!cfg?.ftp?.host) {
            return [];
        }
        const host = cfg.ftp.host;
        const basePath = element?.uri.path ?? cfg.mudlib?.baseDir ?? '/';
        const baseUri = vscode.Uri.parse(`lpc-ftp://${host}${basePath}`);

        try {
            const entries = await this.fs.readDirectory(baseUri);
            return entries.map(([name, type]) => {
                const childUri = vscode.Uri.parse(
                    `lpc-ftp://${host}${this.join(basePath, name)}`
                );
                return new RemoteNode(name, childUri, type === vscode.FileType.Directory);
            });
        } catch (err) {
            vscode.window.showErrorMessage(`Remote-Auflistung fehlgeschlagen: ${err}`);
            return [];
        }
    }

    private join(base: string, name: string): string {
        return base.endsWith('/') ? `${base}${name}` : `${base}/${name}`;
    }
}
