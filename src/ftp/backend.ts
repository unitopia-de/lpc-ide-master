// Gemeinsame Schnittstelle für FTP- und SFTP-Backends. Der FileSystemProvider
// kennt nur dieses Interface — die konkrete Library liegt im jeweiligen Backend.

export interface RemoteEntry {
    name: string;
    isDirectory: boolean;
    size: number;
    modifiedAt?: Date;
}

export interface ConnectionOptions {
    host: string;
    port?: number;
    user: string;
    password: string;
    /** "ftp" (plain), "ftps" (explicit AUTH TLS) oder "ftps-implicit" (TLS ab Verbindungsbeginn). Nur für FTP-Backend relevant. */
    mode?: 'ftp' | 'ftps' | 'ftps-implicit';
    /** Übergeben an die TLS-Schicht (Node tls.connect-Optionen). */
    tls?: {
        rejectUnauthorized?: boolean;
    };
}

export type RemoteProtocol = 'ftp' | 'ftps' | 'ftps-implicit' | 'sftp';

export interface RemoteBackend {
    readonly protocol: RemoteProtocol;
    connect(opts: ConnectionOptions): Promise<void>;
    list(path: string): Promise<RemoteEntry[]>;
    stat(path: string): Promise<RemoteEntry>;
    download(remotePath: string): Promise<Buffer>;
    upload(remotePath: string, data: Buffer): Promise<void>;
    delete(remotePath: string): Promise<void>;
    mkdir(remotePath: string): Promise<void>;
    rename(oldPath: string, newPath: string): Promise<void>;
    close(): Promise<void>;
    readonly isConnected: boolean;
}

export class RemoteError extends Error {
    constructor(message: string, readonly cause?: unknown) {
        super(message);
        this.name = 'RemoteError';
    }
}
