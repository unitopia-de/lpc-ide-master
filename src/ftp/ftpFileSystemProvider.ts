import * as vscode from 'vscode';
import { ConnectionManager } from './connectionManager';
import { RemoteEntry, RemoteError } from './backend';

// Implementiert vscode.FileSystemProvider für das Schema lpc-ftp://
// URIs haben die Form lpc-ftp://<host>/<absoluter-mudpfad>
export class FtpFileSystemProvider implements vscode.FileSystemProvider {
    private readonly emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    readonly onDidChangeFile = this.emitter.event;

    constructor(
        private readonly connections: ConnectionManager,
        private readonly output: vscode.OutputChannel
    ) {}

    watch(): vscode.Disposable {
        return new vscode.Disposable(() => undefined);
    }

    async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
        const { host, path } = this.split(uri);
        if (path === '/' || path === '') {
            return this.dirStat();
        }
        const backend = await this.getBackend(host, uri);
        try {
            const entry = await backend.stat(path);
            return this.toStat(entry);
        } catch (err) {
            if (err instanceof RemoteError) {
                throw vscode.FileSystemError.FileNotFound(uri);
            }
            throw err;
        }
    }

    async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
        const { host, path } = this.split(uri);
        const backend = await this.getBackend(host, uri);
        const entries = await backend.list(path);
        return entries.map((e) => [
            e.name,
            e.isDirectory ? vscode.FileType.Directory : vscode.FileType.File
        ]);
    }

    async createDirectory(uri: vscode.Uri): Promise<void> {
        const { host, path } = this.split(uri);
        const backend = await this.getBackend(host, uri);
        await backend.mkdir(path);
        this.emitter.fire([{ type: vscode.FileChangeType.Created, uri }]);
    }

    async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        const { host, path } = this.split(uri);
        const backend = await this.getBackend(host, uri);
        try {
            return await backend.download(path);
        } catch (err) {
            this.handleRemoteError(err, uri);
        }
    }

    async writeFile(
        uri: vscode.Uri,
        content: Uint8Array,
        options: { create: boolean; overwrite: boolean }
    ): Promise<void> {
        const { host, path } = this.split(uri);
        const backend = await this.getBackend(host, uri);

        // Existenz-Prüfung gemäß FileSystemProvider-Vertrag.
        let exists = true;
        try {
            await backend.stat(path);
        } catch {
            exists = false;
        }
        if (!exists && !options.create) {
            throw vscode.FileSystemError.FileNotFound(uri);
        }
        if (exists && options.create && !options.overwrite) {
            throw vscode.FileSystemError.FileExists(uri);
        }

        try {
            await backend.upload(path, Buffer.from(content));
        } catch (err) {
            this.handleRemoteError(err, uri);
        }
        this.emitter.fire([
            {
                type: exists ? vscode.FileChangeType.Changed : vscode.FileChangeType.Created,
                uri
            }
        ]);
    }

    async delete(uri: vscode.Uri, options: { recursive: boolean }): Promise<void> {
        const { host, path } = this.split(uri);
        const backend = await this.getBackend(host, uri);
        const stat = await backend.stat(path).catch(() => undefined);
        if (!stat) {
            throw vscode.FileSystemError.FileNotFound(uri);
        }
        if (stat.isDirectory && !options.recursive) {
            // Wir verlassen uns aktuell auf die Backend-Semantik: FTP rmdir
            // schlägt bei nicht-leeren Verzeichnissen fehl.
        }
        try {
            await backend.delete(path);
        } catch (err) {
            this.handleRemoteError(err, uri);
        }
        this.emitter.fire([{ type: vscode.FileChangeType.Deleted, uri }]);
    }

    async rename(
        oldUri: vscode.Uri,
        newUri: vscode.Uri,
        _options: { overwrite: boolean }
    ): Promise<void> {
        const { host: oldHost, path: oldPath } = this.split(oldUri);
        const { host: newHost, path: newPath } = this.split(newUri);
        if (oldHost !== newHost) {
            throw vscode.FileSystemError.NoPermissions(
                'Verschieben zwischen verschiedenen Hosts wird nicht unterstützt.'
            );
        }
        const backend = await this.getBackend(oldHost, oldUri);
        try {
            await backend.rename(oldPath, newPath);
        } catch (err) {
            this.handleRemoteError(err, oldUri);
        }
        this.emitter.fire([
            { type: vscode.FileChangeType.Deleted, uri: oldUri },
            { type: vscode.FileChangeType.Created, uri: newUri }
        ]);
    }

    private split(uri: vscode.Uri): { host: string; path: string } {
        return { host: uri.authority, path: uri.path || '/' };
    }

    private async getBackend(host: string, uri: vscode.Uri) {
        if (!host) {
            throw vscode.FileSystemError.FileNotFound(uri);
        }
        try {
            return await this.connections.getOrConnect(host);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.output.appendLine(`Verbindungsaufbau fehlgeschlagen: ${msg}`);
            throw vscode.FileSystemError.Unavailable(msg);
        }
    }

    private toStat(entry: RemoteEntry): vscode.FileStat {
        const time = entry.modifiedAt?.getTime() ?? Date.now();
        return {
            type: entry.isDirectory ? vscode.FileType.Directory : vscode.FileType.File,
            ctime: time,
            mtime: time,
            size: entry.size
        };
    }

    private dirStat(): vscode.FileStat {
        const now = Date.now();
        return { type: vscode.FileType.Directory, ctime: now, mtime: now, size: 0 };
    }

    private handleRemoteError(err: unknown, uri: vscode.Uri): never {
        const msg = err instanceof Error ? err.message : String(err);
        this.output.appendLine(`Remote-Fehler bei ${uri.toString()}: ${msg}`);
        throw vscode.FileSystemError.Unavailable(msg);
    }
}
