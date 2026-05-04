import { RemoteBackend, RemoteEntry, ConnectionOptions, RemoteError } from './backend';

// FTP-Backend auf Basis von basic-ftp.
// Die Library wird per dynamic import geladen, damit die Extension auch dann
// kompiliert, wenn `npm install` noch nicht gelaufen ist.

export class FtpBackend implements RemoteBackend {
    readonly protocol = 'ftp' as const;
    private client: any | undefined;

    get isConnected(): boolean {
        return this.client !== undefined && !this.client.closed;
    }

    async connect(opts: ConnectionOptions): Promise<void> {
        const basicFtp = await this.loadLib();
        this.client = new basicFtp.Client();
        try {
            await this.client.access({
                host: opts.host,
                port: opts.port ?? 21,
                user: opts.user,
                password: opts.password,
                secure: false
            });
        } catch (err) {
            this.client = undefined;
            throw new RemoteError(`FTP-Verbindung fehlgeschlagen: ${(err as Error).message}`, err);
        }
    }

    async list(path: string): Promise<RemoteEntry[]> {
        this.assertConnected();
        try {
            const items = await this.client.list(path || '/');
            return items.map((it: any) => ({
                name: it.name,
                isDirectory: it.isDirectory,
                size: it.size,
                modifiedAt: it.modifiedAt
            }));
        } catch (err) {
            throw new RemoteError(`FTP list ${path} fehlgeschlagen`, err);
        }
    }

    async stat(path: string): Promise<RemoteEntry> {
        // basic-ftp hat kein direktes stat — wir listen das Parent-Verzeichnis.
        const parent = path.substring(0, path.lastIndexOf('/')) || '/';
        const name = path.substring(path.lastIndexOf('/') + 1) || path;
        const entries = await this.list(parent);
        const found = entries.find((e) => e.name === name);
        if (!found) {
            throw new RemoteError(`FTP stat: Pfad nicht gefunden: ${path}`);
        }
        return found;
    }

    async download(remotePath: string): Promise<Buffer> {
        this.assertConnected();
        const { Writable } = await import('stream');
        const chunks: Buffer[] = [];
        const sink = new Writable({
            write(chunk, _enc, cb) {
                chunks.push(Buffer.from(chunk));
                cb();
            }
        });
        try {
            await this.client.downloadTo(sink, remotePath);
        } catch (err) {
            throw new RemoteError(`FTP download ${remotePath} fehlgeschlagen`, err);
        }
        return Buffer.concat(chunks);
    }

    async upload(remotePath: string, data: Buffer): Promise<void> {
        this.assertConnected();
        const { Readable } = await import('stream');
        const source = Readable.from(data);
        try {
            await this.client.uploadFrom(source, remotePath);
        } catch (err) {
            throw new RemoteError(`FTP upload ${remotePath} fehlgeschlagen`, err);
        }
    }

    async delete(remotePath: string): Promise<void> {
        this.assertConnected();
        try {
            await this.client.remove(remotePath);
        } catch (err) {
            throw new RemoteError(`FTP delete ${remotePath} fehlgeschlagen`, err);
        }
    }

    async mkdir(remotePath: string): Promise<void> {
        this.assertConnected();
        try {
            await this.client.ensureDir(remotePath);
            // ensureDir wechselt das Arbeitsverzeichnis — wieder zurück nach /
            await this.client.cd('/');
        } catch (err) {
            throw new RemoteError(`FTP mkdir ${remotePath} fehlgeschlagen`, err);
        }
    }

    async rename(oldPath: string, newPath: string): Promise<void> {
        this.assertConnected();
        try {
            await this.client.rename(oldPath, newPath);
        } catch (err) {
            throw new RemoteError(`FTP rename ${oldPath} -> ${newPath} fehlgeschlagen`, err);
        }
    }

    async close(): Promise<void> {
        try {
            this.client?.close();
        } finally {
            this.client = undefined;
        }
    }

    private assertConnected(): void {
        if (!this.client) {
            throw new RemoteError('FTP-Backend ist nicht verbunden.');
        }
    }

    private async loadLib(): Promise<any> {
        try {
            return await import('basic-ftp');
        } catch {
            throw new RemoteError('Paket "basic-ftp" fehlt. `npm install` ausführen.');
        }
    }
}
