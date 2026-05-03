import * as vscode from 'vscode';
import { DialectManager } from '../dialect/dialectManager';

// Stub für die spätere LSP-Anbindung. Solange kein Server-Modul vorhanden ist,
// wird hier nur die Client-Lebenszyklus-Schale vorbereitet, damit Phase 4
// (LSP-Feinabstimmung) ohne Strukturänderungen umgesetzt werden kann.
export class LpcLanguageClient {
    private client: any | undefined;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly dialect: DialectManager,
        private readonly output: vscode.OutputChannel
    ) {}

    async start(): Promise<void> {
        // Beispielhafter Aufbau (auskommentiert), bis ein Server-Bundle existiert:
        //
        // const lc = await import('vscode-languageclient/node');
        // const serverModule = this.context.asAbsolutePath('out/lsp/server.js');
        // const serverOptions: lc.ServerOptions = {
        //     run:   { module: serverModule, transport: lc.TransportKind.ipc },
        //     debug: { module: serverModule, transport: lc.TransportKind.ipc }
        // };
        // const clientOptions: lc.LanguageClientOptions = {
        //     documentSelector: [{ scheme: 'file', language: 'lpc' }],
        //     initializationOptions: { dialect: this.dialect.current }
        // };
        // this.client = new lc.LanguageClient('lpc', 'LPC Language Server', serverOptions, clientOptions);
        // await this.client.start();

        this.output.appendLine('LSP-Client als Stub aktiv (Phase 4 ausstehend).');
    }

    async stop(): Promise<void> {
        if (this.client?.stop) {
            await this.client.stop();
        }
    }
}
