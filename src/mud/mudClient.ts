import * as net from 'net';
import * as tls from 'tls';
import { EventEmitter } from 'events';
import { MudConsoleConfig } from '../config/lpcConfig';

const DEFAULTS = {
    loginPrompt: '(Name|Wie\\s*hei[ßs]?t\\s*du)',
    passwordPrompt: 'Passwort',
    commandPrompt: '^>\\s*$',
    timeoutMs: 5000,
    loginTimeoutMs: 15000
};

export interface MudClientOptions extends MudConsoleConfig {
    /** Pflicht nur wenn user gesetzt ist. Bei MUDs ohne Login leer lassen. */
    password?: string;
}

export interface MudClientEvents {
    data: (chunk: string) => void;
    close: (reason?: string) => void;
}

type DuplexSocket = net.Socket | tls.TLSSocket;

// Sehr schlanker Telnet-Client. Behandelt nur die Login-Sequenz und
// einfache Request/Response-Befehle. IAC-Negotiation wird ignoriert
// (UNItopia braucht das nicht für Magier-Befehle).
export class MudClient extends EventEmitter {
    private socket: DuplexSocket | undefined;
    private buffer = '';
    private connected = false;

    constructor(private readonly opts: MudClientOptions) {
        super();
    }

    get isConnected(): boolean {
        return this.connected;
    }

    async connect(): Promise<void> {
        const protocol = this.opts.protocol ?? 'telnet';
        const port = this.opts.port ?? (protocol === 'telnets' ? 992 : 4711);

        this.socket = await this.openSocket(protocol, this.opts.host, port);
        this.socket.setEncoding('utf8');
        this.socket.on('data', (data: string) => this.onData(data));
        this.socket.on('close', () => {
            this.connected = false;
            this.emit('close');
        });
        this.socket.on('error', (err) => {
            this.emit('close', err.message);
        });

        await this.runLogin();
        this.connected = true;
    }

    /**
     * Sendet einen Befehl und sammelt die Antwort bis zum nächsten Prompt
     * (oder bis zum completionMarker, falls konfiguriert).
     */
    async send(command: string): Promise<string> {
        if (!this.socket || !this.connected) {
            throw new Error('MUD-Client ist nicht verbunden.');
        }
        const promptRe = new RegExp(this.opts.commandPrompt ?? DEFAULTS.commandPrompt, 'm');
        const marker = this.opts.completionMarker;
        const collected = this.collectUntil(
            marker ? new RegExp(this.escape(marker)) : promptRe,
            DEFAULTS.timeoutMs
        );
        this.write(command + '\n');
        if (marker) {
            // Marker nach dem eigentlichen Befehl als zweiten Befehl absetzen.
            this.write(`echo ${marker}\n`);
        }
        return collected;
    }

    close(): void {
        try {
            this.socket?.end();
        } catch {
            /* ignore */
        }
        this.socket = undefined;
        this.connected = false;
    }

    // --- intern -----------------------------------------------------------

    private openSocket(
        protocol: 'telnet' | 'telnets',
        host: string,
        port: number
    ): Promise<DuplexSocket> {
        return new Promise((resolve, reject) => {
            if (protocol === 'telnets') {
                const sock = tls.connect({ host, port, rejectUnauthorized: false }, () => {
                    sock.removeListener('error', reject);
                    resolve(sock);
                });
                sock.once('error', reject);
            } else {
                const sock = net.connect({ host, port }, () => {
                    sock.removeListener('error', reject);
                    resolve(sock);
                });
                sock.once('error', reject);
            }
        });
    }

    private onData(chunk: string): void {
        // IAC-Bytes (0xff) grob entfernen, falls der Server welche schickt.
        const cleaned = chunk.replace(/\xff[\xfb-\xfe]./g, '');
        this.buffer += cleaned;
        this.emit('data', cleaned);
    }

    private write(data: string): void {
        this.socket?.write(data);
    }

    private async runLogin(): Promise<void> {
        const promptRe = new RegExp(this.opts.commandPrompt ?? DEFAULTS.commandPrompt, 'm');

        if (!this.opts.user) {
            // Kein Login — direkt auf Befehlsprompt warten.
            await this.collectUntil(promptRe, DEFAULTS.loginTimeoutMs);
            return;
        }

        const loginRe = new RegExp(this.opts.loginPrompt ?? DEFAULTS.loginPrompt, 'i');
        await this.collectUntil(loginRe, DEFAULTS.loginTimeoutMs);
        this.write(this.opts.user + '\n');

        if (this.opts.password) {
            const passRe = new RegExp(this.opts.passwordPrompt ?? DEFAULTS.passwordPrompt, 'i');
            await this.collectUntil(passRe, DEFAULTS.loginTimeoutMs);
            this.write(this.opts.password + '\n');
        }

        await this.collectUntil(promptRe, DEFAULTS.loginTimeoutMs);
    }

    private collectUntil(pattern: RegExp, timeoutMs: number): Promise<string> {
        return new Promise((resolve, reject) => {
            // Wenn das Pattern bereits im Puffer ist: sofort liefern.
            const existing = this.matchAndConsume(pattern);
            if (existing !== undefined) {
                resolve(existing);
                return;
            }

            const onData = (): void => {
                const matched = this.matchAndConsume(pattern);
                if (matched !== undefined) {
                    cleanup();
                    resolve(matched);
                }
            };
            const onClose = (reason?: string): void => {
                cleanup();
                reject(new Error(`Verbindung getrennt${reason ? ': ' + reason : ''}`));
            };
            const timer = setTimeout(() => {
                cleanup();
                reject(new Error(`Timeout beim Warten auf "${pattern.source}".`));
            }, timeoutMs);

            const cleanup = (): void => {
                clearTimeout(timer);
                this.off('data', onData);
                this.off('close', onClose);
            };

            this.on('data', onData);
            this.on('close', onClose);
        });
    }

    private matchAndConsume(pattern: RegExp): string | undefined {
        const match = pattern.exec(this.buffer);
        if (!match) return undefined;
        const end = (match.index ?? 0) + match[0].length;
        const collected = this.buffer.slice(0, match.index);
        this.buffer = this.buffer.slice(end);
        return collected;
    }

    private escape(s: string): string {
        return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
