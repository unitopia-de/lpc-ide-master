import * as vscode from 'vscode';
import { RemoteBackend, RemoteError } from './backend';
import { FtpBackend } from './ftpBackend';
import { SftpBackend } from './sftpBackend';
import { CredentialsManager } from './credentialsManager';
import { LpcConfigService } from '../config/lpcConfig';

export interface ConnectionInfo {
    host: string;
    user: string;
    protocol: 'ftp' | 'sftp';
}

// Pro Host genau eine Verbindung. Verbindungsaufbau ist idempotent —
// parallele Aufrufe warten auf dieselbe Promise.
export class ConnectionManager {
    private readonly clients = new Map<string, RemoteBackend>();
    private readonly pending = new Map<string, Promise<RemoteBackend>>();

    private readonly emitter = new vscode.EventEmitter<ConnectionInfo | undefined>();
    readonly onDidChangeConnection = this.emitter.event;

    constructor(
        private readonly credentials: CredentialsManager,
        private readonly config: LpcConfigService,
        private readonly output: vscode.OutputChannel
    ) {}

    get active(): ConnectionInfo | undefined {
        const cfg = this.config.value?.ftp;
        if (!cfg?.host) return undefined;
        const client = this.clients.get(cfg.host);
        if (!client?.isConnected) return undefined;
        return {
            host: cfg.host,
            user: cfg.user ?? '',
            protocol: client.protocol
        };
    }

    listConnections(): ConnectionInfo[] {
        const out: ConnectionInfo[] = [];
        for (const [host, client] of this.clients) {
            if (client.isConnected) {
                out.push({ host, user: '', protocol: client.protocol });
            }
        }
        return out;
    }

    async getOrConnect(host: string): Promise<RemoteBackend> {
        const existing = this.clients.get(host);
        if (existing?.isConnected) {
            return existing;
        }
        const inFlight = this.pending.get(host);
        if (inFlight) {
            return inFlight;
        }
        const promise = this.openConnection(host).finally(() => this.pending.delete(host));
        this.pending.set(host, promise);
        return promise;
    }

    async disconnect(host?: string): Promise<void> {
        const targets = host ? [host] : Array.from(this.clients.keys());
        for (const h of targets) {
            const client = this.clients.get(h);
            if (client) {
                await client.close().catch(() => undefined);
                this.clients.delete(h);
                this.output.appendLine(`Verbindung getrennt: ${h}`);
            }
        }
        this.emitter.fire(this.active);
    }

    async dispose(): Promise<void> {
        await this.disconnect();
        this.emitter.dispose();
    }

    private async openConnection(host: string): Promise<RemoteBackend> {
        const cfg = this.config.value?.ftp;
        if (!cfg?.host || cfg.host !== host) {
            throw new RemoteError(`Kein FTP-Eintrag in lpc-config.json für Host ${host}.`);
        }
        const user = cfg.user;
        if (!user) {
            throw new RemoteError('lpc-config.json: ftp.user fehlt.');
        }
        const protocol = cfg.protocol ?? 'ftp';

        let password = await this.credentials.getPassword(host, user);
        if (!password) {
            password = await this.credentials.promptForPassword(host, user);
        }
        if (!password) {
            throw new RemoteError('Passwort-Eingabe abgebrochen.');
        }

        const backend: RemoteBackend = protocol === 'sftp' ? new SftpBackend() : new FtpBackend();
        await backend.connect({
            host,
            port: cfg.port,
            user,
            password
        });
        this.clients.set(host, backend);
        this.output.appendLine(
            `Verbunden: ${user}@${host} (${protocol.toUpperCase()})`
        );
        this.emitter.fire(this.active);
        return backend;
    }
}
