import * as vscode from 'vscode';
import { FtpClient, RemoteEntry } from './ftpClient';
import { CredentialsManager } from './credentialsManager';
import { LpcConfigService } from '../config/lpcConfig';

// Implementiert vscode.FileSystemProvider für das Schema lpc-ftp://
// URIs haben die Form lpc-ftp://<host>/<absoluter-mudpfad>
export class FtpFileSystemProvider implements vscode.FileSystemProvider {
    private readonly emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    readonly onDidChangeFile = this.emitter.event;

    private readonly clients = new Map<string, FtpClient>();

    constructor(
        private readonly credentials: CredentialsManager,
        private readonly config: LpcConfigService,
        private readonly output: vscode.OutputChannel
    ) {}

    watch(): vscode.Disposable {
        // FTP unterstützt kein natives Watch — no-op.
        return new vscode.Disposable(() => undefined);
    }

    async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
        const { host, path } = this.split(uri);
        const client = await this.getClient(host);
        const parent = path.substring(0, path.lastIndexOf('/')) || '/';
        const name = path.substring(path.lastIndexOf('/') + 1);
        const entries = await client.list(parent);
        const found = entries.find((e) => e.name === name);
        if (!found) {
            throw vscode.FileSystemError.FileNotFound(uri);
        }
        return this.toStat(found);
    }

    async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
        const { host, path } = this.split(uri);
        const client = await this.getClient(host);
        const entries = await client.list(path || '/');
        return entries.map((e) => [
            e.name,
            e.isDirectory ? vscode.FileType.Directory : vscode.FileType.File
        ]);
    }

    async createDirectory(_uri: vscode.Uri): Promise<void> {
        throw vscode.FileSystemError.NoPermissions('createDirectory ist noch nicht implementiert.');
    }

    async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        const { host, path } = this.split(uri);
        const client = await this.getClient(host);
        return client.download(path);
    }

    async writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void> {
        const { host, path } = this.split(uri);
        const client = await this.getClient(host);
        await client.upload(path, Buffer.from(content));
        this.emitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);
    }

    async delete(uri: vscode.Uri): Promise<void> {
        const { host, path } = this.split(uri);
        const client = await this.getClient(host);
        await client.delete(path);
        this.emitter.fire([{ type: vscode.FileChangeType.Deleted, uri }]);
    }

    async rename(_oldUri: vscode.Uri, _newUri: vscode.Uri): Promise<void> {
        throw vscode.FileSystemError.NoPermissions('rename ist noch nicht implementiert.');
    }

    async listRoot(host: string): Promise<RemoteEntry[]> {
        const client = await this.getClient(host);
        const cfg = this.config.value;
        const root = cfg?.mudlib?.baseDir ?? '/';
        return client.list(root);
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

    private split(uri: vscode.Uri): { host: string; path: string } {
        return { host: uri.authority, path: uri.path || '/' };
    }

    private async getClient(host: string): Promise<FtpClient> {
        let client = this.clients.get(host);
        if (client) {
            return client;
        }
        client = new FtpClient();
        const cfg = this.config.value?.ftp;
        const user = cfg?.user;
        if (!user) {
            throw new Error('Kein FTP-Benutzer in lpc-config.json hinterlegt.');
        }
        let password = await this.credentials.getPassword(host, user);
        if (!password) {
            password = await this.credentials.promptForPassword(host, user);
        }
        if (!password) {
            throw new Error('FTP-Verbindung abgebrochen: kein Passwort.');
        }
        await client.connect({
            host,
            port: cfg?.port,
            user,
            password,
            secure: cfg?.protocol === 'sftp'
        });
        this.clients.set(host, client);
        this.output.appendLine(`FTP-Verbindung aufgebaut: ${user}@${host}`);
        return client;
    }
}
