import * as vscode from 'vscode';
import { RemoteBackend, RemoteEntry, ConnectionOptions, RemoteError } from './backend';

// FTP-Backend auf Basis von basic-ftp.
// Die Library wird per dynamic import geladen, damit die Extension auch dann
// kompiliert, wenn `npm install` noch nicht gelaufen ist.

export class FtpBackend implements RemoteBackend {
    private _protocol: 'ftp' | 'ftps' | 'ftps-implicit' = 'ftp';
    get protocol(): 'ftp' | 'ftps' | 'ftps-implicit' {
        return this._protocol;
    }

    private client: any | undefined;

    // basic-ftp erlaubt nur EINE Operation pro Verbindung gleichzeitig.
    // VS Code ruft stat() und readFile() parallel auf -> wir serialisieren hier.
    private queue: Promise<unknown> = Promise.resolve();
    private serialize<T>(task: () => Promise<T>): Promise<T> {
        const result = this.queue.then(() => task());
        this.queue = result.catch(() => undefined);
        return result;
    }

    get isConnected(): boolean {
        return this.client !== undefined && !this.client.closed;
    }

    async connect(opts: ConnectionOptions): Promise<void> {
        const basicFtp = await this.loadLib();
        this.client = new basicFtp.Client();

        // Optionales Verbose-Logging der FTP-Protokoll-Kommandos.
        const settings = vscode.workspace.getConfiguration('lpc');
        if (settings.get<boolean>('ftp.verbose', false)) {
            const channel = vscode.window.createOutputChannel('LPC FTP Trace');
            this.client.ftp.verbose = true;
            this.client.ftp.log = (msg: string) => channel.appendLine(msg);
            channel.show(true);
        }

        const mode = opts.mode ?? 'ftp';
        this._protocol = mode;
        const secure = mode === 'ftps' ? true : mode === 'ftps-implicit' ? 'implicit' : false;
        const port = opts.port ?? (mode === 'ftps-implicit' ? 990 : 21);
        const secureOptions =
            mode === 'ftp'
                ? undefined
                : { rejectUnauthorized: opts.tls?.rejectUnauthorized !== false };

        try {
            await this.client.access({
                host: opts.host,
                port,
                user: opts.user,
                password: opts.password,
                secure,
                secureOptions
            });
        } catch (err) {
            this.client = undefined;
            throw new RemoteError(`FTP-Verbindung fehlgeschlagen: ${(err as Error).message}`, err);
        }
    }

    list(path: string): Promise<RemoteEntry[]> {
        return this.serialize(async () => {
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
        });
    }

    async stat(path: string): Promise<RemoteEntry> {
        // basic-ftp hat kein direktes stat — wir listen das Parent-Verzeichnis.
        // list() ist bereits serialisiert.
        const parent = path.substring(0, path.lastIndexOf('/')) || '/';
        const name = path.substring(path.lastIndexOf('/') + 1) || path;
        const entries = await this.list(parent);
        const found = entries.find((e) => e.name === name);
        if (!found) {
            throw new RemoteError(`FTP stat: Pfad nicht gefunden: ${path}`);
        }
        return found;
    }

    download(remotePath: string): Promise<Buffer> {
        return this.serialize(async () => {
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
        });
    }

    upload(remotePath: string, data: Buffer): Promise<void> {
        return this.serialize(async () => {
            this.assertConnected();
            const { Readable } = await import('stream');
            const source = Readable.from(data);
            try {
                await this.client.uploadFrom(source, remotePath);
            } catch (err) {
                throw new RemoteError(`FTP upload ${remotePath} fehlgeschlagen`, err);
            }
        });
    }

    delete(remotePath: string): Promise<void> {
        return this.serialize(async () => {
            this.assertConnected();
            try {
                await this.client.remove(remotePath);
            } catch (err) {
                throw new RemoteError(`FTP delete ${remotePath} fehlgeschlagen`, err);
            }
        });
    }

    mkdir(remotePath: string): Promise<void> {
        return this.serialize(async () => {
            this.assertConnected();
            try {
                await this.client.ensureDir(remotePath);
                // ensureDir wechselt das Arbeitsverzeichnis — wieder zurück nach /
                await this.client.cd('/');
            } catch (err) {
                throw new RemoteError(`FTP mkdir ${remotePath} fehlgeschlagen`, err);
            }
        });
    }

    rename(oldPath: string, newPath: string): Promise<void> {
        return this.serialize(async () => {
            this.assertConnected();
            try {
                await this.client.rename(oldPath, newPath);
            } catch (err) {
                throw new RemoteError(`FTP rename ${oldPath} -> ${newPath} fehlgeschlagen`, err);
            }
        });
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
