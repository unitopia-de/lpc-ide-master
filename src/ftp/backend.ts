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
}

export interface RemoteBackend {
    readonly protocol: 'ftp' | 'sftp';
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
