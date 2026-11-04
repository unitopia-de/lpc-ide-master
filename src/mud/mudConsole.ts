import * as vscode from 'vscode';
import { MudClient } from './mudClient';
import { MudConsoleConfig } from '../config/lpcConfig';

export type MudConsoleConfigProvider = () => MudConsoleConfig | undefined;

const HISTORY_SIZE = 100;

// MUD-Sitzung in einem VS-Code-Terminal (Pseudoterminal). Pro Konsolen-Instanz
// (remote, homemud) ein eigenes Terminal. Die Zeile wird lokal bearbeitet und
// mit Enter ans MUD geschickt. Ein Login macht der Benutzer selbst.
export class MudConsole implements vscode.Disposable {
    private client: MudClient | undefined;
    private terminal: vscode.Terminal | undefined;
    private readonly writeEmitter = new vscode.EventEmitter<string>();

    private line = '';
    private cursor = 0;
    private localEcho = true;
    private history: string[] = [];
    private historyPos = 0;

    private readonly emitter = new vscode.EventEmitter<boolean>();
    readonly onDidChangeConnection = this.emitter.event;

    constructor(
        readonly label: string,
        private readonly getConfig: MudConsoleConfigProvider
    ) {}

    get isConnected(): boolean {
        return this.client?.isConnected === true;
    }

    get isConfigured(): boolean {
        return !!this.getConfig()?.host;
    }

    get host(): string | undefined {
        return this.getConfig()?.host;
    }

    /** Zeigt das Terminal und baut die Verbindung auf, falls noch keine besteht. */
    open(): void {
        if (this.terminal) {
            this.terminal.show();
            if (!this.isConnected) {
                void this.connect();
            }
            return;
        }
        const pty: vscode.Pseudoterminal = {
            onDidWrite: this.writeEmitter.event,
            open: () => void this.connect(),
            close: () => {
                this.terminal = undefined;
                this.closeClient();
            },
            handleInput: (data) => this.handleInput(data)
        };
        this.terminal = vscode.window.createTerminal({
            name: `MUD ${this.label}${this.host ? ': ' + this.host : ''}`,
            pty,
            iconPath: new vscode.ThemeIcon('terminal')
        });
        this.terminal.show();
    }

    async disconnect(): Promise<void> {
        if (this.client) {
            this.closeClient();
            this.print('\r\n— Verbindung getrennt —\r\n');
        }
    }

    dispose(): void {
        this.closeClient();
        this.terminal?.dispose();
        this.writeEmitter.dispose();
        this.emitter.dispose();
    }

    // --- Verbindung -------------------------------------------------------

    private async connect(): Promise<void> {
        if (this.client) {
            return;
        }
        const cfg = this.getConfig();
        if (!cfg?.host) {
            this.print(
                `— ${this.label}: keine MUD-Verbindung konfiguriert. Nötig sind der Block ` +
                    `"mud" in lpc-config.json und die Einstellung "lpc.mud.enabled": true. —\r\n`
            );
            return;
        }
        this.print(`— ${this.label}: verbinde mit ${cfg.host}:${cfg.port ?? '(Standard)'} via ${cfg.protocol ?? 'telnet'} —\r\n`);

        const client = new MudClient(cfg);
        this.client = client;
        this.localEcho = true;
        client.on('data', (text: string) => this.print(text.replace(/\r?\n/g, '\r\n')));
        client.on('echo', (localEcho: boolean) => {
            this.localEcho = localEcho;
        });
        client.on('close', (reason?: string) => {
            if (this.client !== client) {
                return;
            }
            this.client = undefined;
            this.emitter.fire(false);
            this.print(`\r\n— Verbindung beendet${reason ? ': ' + reason : ''}. Enter verbindet neu. —\r\n`);
        });

        try {
            await client.connect();
        } catch (err) {
            this.client = undefined;
            this.print(`[Fehler] ${(err as Error).message}\r\nEnter versucht es erneut.\r\n`);
            return;
        }
        this.emitter.fire(true);
    }

    private closeClient(): void {
        const client = this.client;
        this.client = undefined;
        client?.close();
        if (client) {
            this.emitter.fire(false);
        }
    }

    // --- Ausgabe ----------------------------------------------------------

    /** Schreibt Text vom MUD, ohne die gerade getippte Zeile zu zerstören. */
    private print(text: string): void {
        const typed = this.localEcho && this.line.length > 0;
        if (typed) {
            this.writeEmitter.fire(this.moveLeft(this.cursor) + '\x1b[K');
        }
        this.writeEmitter.fire(text);
        if (typed) {
            this.writeEmitter.fire(this.line + this.moveLeft(this.line.length - this.cursor));
        }
    }

    private moveLeft(n: number): string {
        return n > 0 ? `\x1b[${n}D` : '';
    }

    // --- Eingabe ----------------------------------------------------------

    private handleInput(data: string): void {
        let i = 0;
        while (i < data.length) {
            const rest = data.slice(i);
            const seq = /^\x1b(\[[0-9;]*[A-Za-z~]|O[A-Za-z])/.exec(rest);
            if (seq) {
                this.handleEscape(seq[1]);
                i += seq[0].length;
                continue;
            }
            const ch = data[i++];
            if (ch === '\r' || ch === '\n') {
                if (ch === '\n' && data[i - 2] === '\r') {
                    continue;
                }
                this.submit();
            } else if (ch === '\x7f' || ch === '\b') {
                this.backspace();
            } else if (ch === '\x03') {
                // Strg+C: Zeile verwerfen.
                this.setLine('');
            } else if (ch >= ' ') {
                this.insert(ch);
            }
        }
    }

    private handleEscape(seq: string): void {
        switch (seq) {
            case '[D': case 'OD':
                if (this.cursor > 0) {
                    this.cursor--;
                    this.echo('\x1b[D');
                }
                break;
            case '[C': case 'OC':
                if (this.cursor < this.line.length) {
                    this.cursor++;
                    this.echo('\x1b[C');
                }
                break;
            case '[H': case 'OH': case '[1~':
                this.echo(this.moveLeft(this.cursor));
                this.cursor = 0;
                break;
            case '[F': case 'OF': case '[4~':
                this.echo(this.line.length > this.cursor ? `\x1b[${this.line.length - this.cursor}C` : '');
                this.cursor = this.line.length;
                break;
            case '[3~':
                if (this.cursor < this.line.length) {
                    this.line = this.line.slice(0, this.cursor) + this.line.slice(this.cursor + 1);
                    this.echo(this.line.slice(this.cursor) + ' ' + this.moveLeft(this.line.length - this.cursor + 1));
                }
                break;
            case '[A': case 'OA':
                if (this.localEcho && this.historyPos > 0) {
                    this.historyPos--;
                    this.setLine(this.history[this.historyPos]);
                }
                break;
            case '[B': case 'OB':
                if (this.localEcho && this.historyPos < this.history.length) {
                    this.historyPos++;
                    this.setLine(this.history[this.historyPos] ?? '');
                }
                break;
        }
    }

    private submit(): void {
        const line = this.line;
        const echoed = this.localEcho;
        this.line = '';
        this.cursor = 0;
        this.writeEmitter.fire('\r\n');

        if (!this.client) {
            void this.connect();
            return;
        }
        if (echoed && line.trim() && this.history[this.history.length - 1] !== line) {
            this.history.push(line);
            if (this.history.length > HISTORY_SIZE) {
                this.history.shift();
            }
        }
        this.historyPos = this.history.length;
        this.client.sendLine(line);
    }

    private insert(ch: string): void {
        this.line = this.line.slice(0, this.cursor) + ch + this.line.slice(this.cursor);
        this.cursor += ch.length;
        const tail = this.line.slice(this.cursor);
        this.echo(ch + tail + this.moveLeft(tail.length));
    }

    private backspace(): void {
        if (this.cursor === 0) {
            return;
        }
        this.line = this.line.slice(0, this.cursor - 1) + this.line.slice(this.cursor);
        this.cursor--;
        const tail = this.line.slice(this.cursor);
        this.echo('\b' + tail + ' ' + this.moveLeft(tail.length + 1));
    }

    private setLine(text: string): void {
        this.echo(this.moveLeft(this.cursor) + '\x1b[K' + text);
        this.line = text;
        this.cursor = text.length;
    }

    /** Lokales Echo der Eingabe; bei abgeschaltetem Echo (Passwort) bleibt sie unsichtbar. */
    private echo(text: string): void {
        if (this.localEcho && text) {
            this.writeEmitter.fire(text);
        }
    }
}
