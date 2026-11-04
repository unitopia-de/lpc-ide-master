import * as net from 'net';
import * as tls from 'tls';
import { EventEmitter } from 'events';
import { TextDecoder } from 'util';
import { MudConsoleConfig } from '../config/lpcConfig';

// Telnet-Steuerzeichen (RFC 854/857).
const IAC = 255;
const DONT = 254;
const DO = 253;
const WONT = 252;
const WILL = 251;
const SB = 250;
const SE = 240;
const OPT_ECHO = 1;

type DuplexSocket = net.Socket | tls.TLSSocket;

const enum State {
    data,
    iac,
    option,
    sub,
    subIac
}

// Schlanker Telnet-Client ohne Login-Automatik. Reicht den Text des MUD weiter
// und wertet von den Telnet-Optionen nur ECHO aus: Schaltet das MUD das Echo
// ab (Passworteingabe), meldet der Client das über das Event 'echo'. Alle
// anderen Optionen lehnt er ab.
//
// Events: 'data' (text: string), 'echo' (localEcho: boolean), 'close' (reason?: string)
export class MudClient extends EventEmitter {
    private socket: DuplexSocket | undefined;
    private readonly decoder = new TextDecoder('utf-8');
    private state = State.data;
    private command = 0;
    private serverEcho = false;

    constructor(private readonly opts: MudConsoleConfig) {
        super();
    }

    get isConnected(): boolean {
        return !!this.socket && !this.socket.destroyed;
    }

    async connect(): Promise<void> {
        const protocol = this.opts.protocol ?? 'telnet';
        const port = this.opts.port ?? (protocol === 'telnets' ? 992 : 4711);

        const socket = await this.openSocket(protocol, this.opts.host, port);
        this.socket = socket;
        socket.on('data', (chunk: Buffer) => this.onData(chunk));
        socket.on('close', () => {
            this.socket = undefined;
            this.emit('close');
        });
        socket.on('error', (err) => {
            this.emit('close', err.message);
        });
    }

    sendLine(line: string): void {
        // IAC im Text verdoppeln, Zeilenende nach Telnet-Konvention CR LF.
        const bytes = Buffer.from(line + '\r\n', 'utf8');
        const escaped: number[] = [];
        for (const b of bytes) {
            escaped.push(b);
            if (b === IAC) {
                escaped.push(IAC);
            }
        }
        this.socket?.write(Buffer.from(escaped));
    }

    close(): void {
        try {
            this.socket?.end();
        } catch {
            /* ignore */
        }
        this.socket = undefined;
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
                    const cert = sock.authorized ? 'Zertifikat gültig' : `Zertifikat ungeprüft: ${sock.authorizationError}`;
                    this.emit('data', `[TLS aufgebaut: ${sock.getProtocol()}, ${cert}]\n`);
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

    private onData(chunk: Buffer): void {
        const text: number[] = [];
        for (const b of chunk) {
            switch (this.state) {
                case State.data:
                    if (b === IAC) {
                        this.state = State.iac;
                    } else {
                        text.push(b);
                    }
                    break;
                case State.iac:
                    if (b === IAC) {
                        text.push(IAC);
                        this.state = State.data;
                    } else if (b === WILL || b === WONT || b === DO || b === DONT) {
                        this.command = b;
                        this.state = State.option;
                    } else if (b === SB) {
                        this.state = State.sub;
                    } else {
                        // GA, EOR, NOP usw. haben für die Anzeige keine Bedeutung.
                        this.state = State.data;
                    }
                    break;
                case State.option:
                    this.negotiate(this.command, b);
                    this.state = State.data;
                    break;
                case State.sub:
                    if (b === IAC) {
                        this.state = State.subIac;
                    }
                    break;
                case State.subIac:
                    this.state = b === SE ? State.data : State.sub;
                    break;
            }
        }
        if (text.length > 0) {
            const decoded = this.decoder.decode(Buffer.from(text), { stream: true });
            if (decoded) {
                this.emit('data', decoded);
            }
        }
    }

    private negotiate(command: number, option: number): void {
        if (option === OPT_ECHO && (command === WILL || command === WONT)) {
            const serverEcho = command === WILL;
            if (serverEcho !== this.serverEcho) {
                this.serverEcho = serverEcho;
                this.reply(serverEcho ? DO : DONT, OPT_ECHO);
                this.emit('echo', !serverEcho);
            }
            return;
        }
        // Alles andere ablehnen. Auf WONT/DONT antworten wir nicht, das vermeidet Schleifen.
        if (command === WILL) {
            this.reply(DONT, option);
        }
        else if (command === DO) {
            this.reply(WONT, option);
        }
    }

    private reply(command: number, option: number): void {
        this.socket?.write(Buffer.from([IAC, command, option]));
    }
}
