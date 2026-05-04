import { RemoteBackend, RemoteEntry, ConnectionOptions, RemoteError } from './backend';

// SFTP-Backend auf Basis von ssh2-sftp-client.

export class SftpBackend implements RemoteBackend {
    readonly protocol = 'sftp' as const;
    private client: any | undefined;

    get isConnected(): boolean {
        return this.client !== undefined;
    }

    async connect(opts: ConnectionOptions): Promise<void> {
        const SftpClient = await this.loadLib();
        this.client = new SftpClient();
        try {
            await this.client.connect({
                host: opts.host,
                port: opts.port ?? 22,
                username: opts.user,
                password: opts.password,
                readyTimeout: 20000
            });
        } catch (err) {
            this.client = undefined;
            throw new RemoteError(`SFTP-Verbindung fehlgeschlagen: ${(err as Error).message}`, err);
        }
    }

    async list(path: string): Promise<RemoteEntry[]> {
        this.assertConnected();
        try {
            const items = await this.client.list(path || '/');
            return items.map((it: any) => ({
                name: it.name,
                isDirectory: it.type === 'd',
                size: it.size,
                modifiedAt: it.modifyTime ? new Date(it.modifyTime) : undefined
            }));
        } catch (err) {
            throw new RemoteError(`SFTP list ${path} fehlgeschlagen`, err);
        }
    }

    async stat(path: string): Promise<RemoteEntry> {
        this.assertConnected();
        try {
            const s = await this.client.stat(path);
            const name = path.substring(path.lastIndexOf('/') + 1) || path;
            return {
                name,
                isDirectory: s.isDirectory,
                size: s.size,
                modifiedAt: s.modifyTime ? new Date(s.modifyTime) : undefined
            };
        } catch (err) {
            throw new RemoteError(`SFTP stat ${path} fehlgeschlagen`, err);
        }
    }

    async download(remotePath: string): Promise<Buffer> {
        this.assertConnected();
        try {
            const result = await this.client.get(remotePath);
            return result instanceof Buffer ? result : Buffer.from(result as ArrayBuffer);
        } catch (err) {
            throw new RemoteError(`SFTP download ${remotePath} fehlgeschlagen`, err);
        }
    }

    async upload(remotePath: string, data: Buffer): Promise<void> {
        this.assertConnected();
        try {
            await this.client.put(data, remotePath);
        } catch (err) {
            throw new RemoteError(`SFTP upload ${remotePath} fehlgeschlagen`, err);
        }
    }

    async delete(remotePath: string): Promise<void> {
        this.assertConnected();
        try {
            await this.client.delete(remotePath);
        } catch (err) {
            throw new RemoteError(`SFTP delete ${remotePath} fehlgeschlagen`, err);
        }
    }

    async mkdir(remotePath: string): Promise<void> {
        this.assertConnected();
        try {
            await this.client.mkdir(remotePath, true);
        } catch (err) {
            throw new RemoteError(`SFTP mkdir ${remotePath} fehlgeschlagen`, err);
        }
    }

    async rename(oldPath: string, newPath: string): Promise<void> {
        this.assertConnected();
        try {
            await this.client.rename(oldPath, newPath);
        } catch (err) {
            throw new RemoteError(`SFTP rename ${oldPath} -> ${newPath} fehlgeschlagen`, err);
        }
    }

    async close(): Promise<void> {
        try {
            await this.client?.end();
        } finally {
            this.client = undefined;
        }
    }

    private assertConnected(): void {
        if (!this.client) {
            throw new RemoteError('SFTP-Backend ist nicht verbunden.');
        }
    }

    private async loadLib(): Promise<any> {
        try {
            const mod = await import('ssh2-sftp-client');
            return mod.default ?? mod;
        } catch {
            throw new RemoteError('Paket "ssh2-sftp-client" fehlt. `npm install` ausführen.');
        }
    }
}
