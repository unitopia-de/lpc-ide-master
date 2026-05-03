// Wrapper um basic-ftp. Bewusst dünn gehalten, damit der FileSystemProvider
// und der TreeProvider unabhängig vom konkreten FTP-Backend bleiben.
//
// Die Library wird per dynamic require geladen, damit die Extension auch dann
// kompiliert, wenn `npm install` noch nicht gelaufen ist.

export interface FtpConnectionOptions {
    host: string;
    port?: number;
    user: string;
    password: string;
    secure?: boolean;
}

export interface RemoteEntry {
    name: string;
    isDirectory: boolean;
    size: number;
    modifiedAt?: Date;
}

export class FtpClient {
    private client: any | undefined;

    async connect(opts: FtpConnectionOptions): Promise<void> {
        const basicFtp = await this.loadLib();
        this.client = new basicFtp.Client();
        await this.client.access({
            host: opts.host,
            port: opts.port ?? 21,
            user: opts.user,
            password: opts.password,
            secure: opts.secure ?? false
        });
    }

    async list(path: string): Promise<RemoteEntry[]> {
        this.assertConnected();
        const items = await this.client.list(path);
        return items.map((it: any) => ({
            name: it.name,
            isDirectory: it.isDirectory,
            size: it.size,
            modifiedAt: it.modifiedAt
        }));
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
        await this.client.downloadTo(sink, remotePath);
        return Buffer.concat(chunks);
    }

    async upload(remotePath: string, data: Buffer): Promise<void> {
        this.assertConnected();
        const { Readable } = await import('stream');
        const source = Readable.from(data);
        await this.client.uploadFrom(source, remotePath);
    }

    async delete(remotePath: string): Promise<void> {
        this.assertConnected();
        await this.client.remove(remotePath);
    }

    close(): void {
        this.client?.close();
        this.client = undefined;
    }

    private assertConnected(): void {
        if (!this.client) {
            throw new Error('FTP-Client ist nicht verbunden.');
        }
    }

    private async loadLib(): Promise<any> {
        try {
            return await import('basic-ftp');
        } catch (err) {
            throw new Error(
                'Das Paket "basic-ftp" ist nicht installiert. Bitte `npm install` ausführen.'
            );
        }
    }
}
