import * as vscode from 'vscode';
import { MudClient } from './mudClient';
import { MudConsoleConfig } from '../config/lpcConfig';
import { CredentialsManager } from '../ftp/credentialsManager';

export type MudConsoleConfigProvider = () => MudConsoleConfig | undefined;

// Hochlevel-Wrapper. Zeigt Output im Channel "LPC MUD Console" und kapselt
// den Lifecycle einer Telnet-Session. Pro Konsolen-Instanz (remote, homemud)
// jeweils ein eigener OutputChannel.
export class MudConsole implements vscode.Disposable {
    private client: MudClient | undefined;
    private connecting: Promise<MudClient> | undefined;

    private readonly emitter = new vscode.EventEmitter<boolean>();
    readonly onDidChangeConnection = this.emitter.event;

    constructor(
        readonly label: string,
        private readonly channel: vscode.OutputChannel,
        private readonly getConfig: MudConsoleConfigProvider,
        private readonly credentials: CredentialsManager
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

    show(): void {
        this.channel.show(true);
    }

    async send(command: string): Promise<string> {
        const client = await this.ensureConnected();
        this.channel.appendLine(`> ${command}`);
        try {
            const reply = await client.send(command);
            const trimmed = reply.replace(/\s+$/, '');
            if (trimmed) {
                this.channel.appendLine(trimmed);
            }
            return reply;
        } catch (err) {
            this.channel.appendLine(`[Fehler] ${(err as Error).message}`);
            throw err;
        }
    }

    async disconnect(): Promise<void> {
        this.client?.close();
        this.client = undefined;
        this.connecting = undefined;
        this.channel.appendLine('— Verbindung getrennt —');
        this.emitter.fire(false);
    }

    dispose(): void {
        this.client?.close();
        this.emitter.dispose();
    }

    // --- intern -----------------------------------------------------------

    private async ensureConnected(): Promise<MudClient> {
        if (this.client?.isConnected) {
            return this.client;
        }
        if (this.connecting) {
            return this.connecting;
        }
        this.connecting = this.openConnection().finally(() => {
            this.connecting = undefined;
        });
        return this.connecting;
    }

    private async openConnection(): Promise<MudClient> {
        const cfg = this.getConfig();
        if (!cfg?.host) {
            throw new Error(`${this.label}: keine MUD-Konfiguration vorhanden.`);
        }
        const password = cfg.user ? await this.resolvePassword(cfg.host, cfg.user) : undefined;
        if (cfg.user && !password) {
            throw new Error('Passwort-Eingabe abgebrochen.');
        }

        this.channel.show(true);
        const who = cfg.user ?? '(kein Login)';
        this.channel.appendLine(
            `— ${this.label}: verbinde ${who}@${cfg.host}:${cfg.port ?? '(default)'} via ${cfg.protocol ?? 'telnet'} —`
        );

        const client = new MudClient({ ...cfg, password });
        client.on('data', (chunk: string) => {
            this.channel.append(chunk);
        });
        client.on('close', () => {
            this.client = undefined;
            this.emitter.fire(false);
            this.channel.appendLine('\n— Verbindung beendet —');
        });

        try {
            await client.connect();
        } catch (err) {
            this.channel.appendLine(`[Fehler] ${(err as Error).message}`);
            throw err;
        }

        this.client = client;
        this.emitter.fire(true);
        this.channel.appendLine('— Verbunden —');
        return client;
    }

    private async resolvePassword(host: string, user: string): Promise<string | undefined> {
        let pw = await this.credentials.getMudPassword(host, user);
        if (!pw) {
            pw = await this.credentials.promptForMudPassword(host, user);
        }
        return pw;
    }
}
