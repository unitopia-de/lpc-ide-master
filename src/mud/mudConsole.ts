import * as vscode from 'vscode';
import { MudClient } from './mudClient';
import { LpcConfigService, MudConsoleConfig } from '../config/lpcConfig';
import { CredentialsManager } from '../ftp/credentialsManager';

// Hochlevel-Wrapper. Zeigt Output im Channel "LPC MUD Console" und kapselt
// den Lifecycle einer Telnet-Session.
export class MudConsole implements vscode.Disposable {
    private client: MudClient | undefined;
    private connecting: Promise<MudClient> | undefined;

    private readonly emitter = new vscode.EventEmitter<boolean>();
    readonly onDidChangeConnection = this.emitter.event;

    constructor(
        private readonly channel: vscode.OutputChannel,
        private readonly config: LpcConfigService,
        private readonly credentials: CredentialsManager
    ) {}

    get isConnected(): boolean {
        return this.client?.isConnected === true;
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
        const cfg = this.config.value?.mud;
        if (!cfg?.host || !cfg?.user) {
            throw new Error('lpc-config.json: Block "mud" mit host und user fehlt.');
        }
        const password = await this.resolvePassword(cfg);
        if (!password) {
            throw new Error('Passwort-Eingabe abgebrochen.');
        }

        this.channel.show(true);
        this.channel.appendLine(
            `— Verbinde ${cfg.user}@${cfg.host}:${cfg.port ?? '(default)'} via ${cfg.protocol ?? 'telnet'} —`
        );

        const client = new MudClient({ ...cfg, password });
        client.on('data', (chunk: string) => {
            // Roh-Output nur, wenn er nicht über send() abgeholt wurde
            // (z.B. asynchrone tells). Wir zeigen ihn immer mit.
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

    private async resolvePassword(cfg: MudConsoleConfig): Promise<string | undefined> {
        let pw = await this.credentials.getMudPassword(cfg.host, cfg.user);
        if (!pw) {
            pw = await this.credentials.promptForMudPassword(cfg.host, cfg.user);
        }
        return pw;
    }
}
