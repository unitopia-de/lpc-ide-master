import * as vscode from 'vscode';
import { LpcConfigService } from './config/lpcConfig';
import { DialectManager } from './dialect/dialectManager';
import { EfunProvider } from './dialect/efunProvider';
import { FtpFileSystemProvider } from './ftp/ftpFileSystemProvider';
import { CredentialsManager } from './ftp/credentialsManager';
import { ConnectionManager } from './ftp/connectionManager';
import { RemoteExplorerProvider } from './tree/remoteExplorerProvider';
import { LpcLanguageClient } from './lsp/client';
import { MudConsole } from './mud/mudConsole';
import { HomeMudService } from './homemud/homeMudService';
import { registerCommands } from './commands';
import { createStatusBar } from './statusBar';
import { registerHoverProvider } from './providers/hoverProvider';
import { registerCompletionProvider } from './providers/completionProvider';
import { registerDocumentSymbolProvider } from './providers/documentSymbolProvider';
import { registerDefinitionProvider } from './providers/definitionProvider';
import { registerDiagnosticProvider } from './providers/diagnosticProvider';
import { registerSignatureHelpProvider } from './providers/signatureHelpProvider';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const output = vscode.window.createOutputChannel('LPC-IDE-Master');
    context.subscriptions.push(output);
    output.appendLine('LPC-IDE-Master aktiviert.');

    const credentials = new CredentialsManager(context.secrets);
    const config = new LpcConfigService(output);
    context.subscriptions.push(config);
    await config.load();

    const efunProvider = new EfunProvider(context, output, config);
    const dialectManager = new DialectManager(config, efunProvider, output);
    context.subscriptions.push(dialectManager);
    await dialectManager.initialize();

    const connections = new ConnectionManager(credentials, config, output);
    context.subscriptions.push({ dispose: () => void connections.dispose() });

    const ftpProvider = new FtpFileSystemProvider(connections, output);
    context.subscriptions.push(
        vscode.workspace.registerFileSystemProvider('lpc-ftp', ftpProvider, {
            isCaseSensitive: true
        })
    );

    const treeProvider = new RemoteExplorerProvider(ftpProvider, config, connections);
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('lpcRemoteExplorer', treeProvider)
    );

    const updateContextKeys = (): void => {
        const cfg = config.value;
        void vscode.commands.executeCommand('setContext', 'lpc.hasFtpConfig', !!cfg?.ftp?.host);
        void vscode.commands.executeCommand('setContext', 'lpc.ftpConnected', !!connections.active);
        void vscode.commands.executeCommand('setContext', 'lpc.hasHomeMud', !!cfg?.homemud?.path);
    };
    updateContextKeys();
    context.subscriptions.push(
        config.onDidChange(updateContextKeys),
        connections.onDidChangeConnection(updateContextKeys)
    );

    // Zwei OutputChannels + zwei MudConsole-Instanzen (remote + homemud).
    const remoteChannel = vscode.window.createOutputChannel('LPC MUD Console (remote)');
    const homeChannel = vscode.window.createOutputChannel('LPC MUD Console (homemud)');
    context.subscriptions.push(remoteChannel, homeChannel);

    const remoteMud = new MudConsole(
        'remote',
        remoteChannel,
        () => config.value?.mud,
        credentials
    );
    const homeMud = new MudConsole(
        'homemud',
        homeChannel,
        () => config.value?.homemud?.mud,
        credentials
    );
    context.subscriptions.push(remoteMud, homeMud);

    const homeMudService = new HomeMudService(config);

    const statusBar = createStatusBar(
        dialectManager,
        efunProvider,
        config,
        connections,
        remoteMud,
        homeMud,
        homeMudService
    );
    context.subscriptions.push(statusBar);

    registerHoverProvider(context, efunProvider);
    registerCompletionProvider(context, efunProvider);
    registerDocumentSymbolProvider(context);
    registerDefinitionProvider(context, config, homeMudService);
    registerDiagnosticProvider(context, config, dialectManager, homeMudService);
    registerSignatureHelpProvider(context, efunProvider);

    const lspClient = new LpcLanguageClient(context, dialectManager, output);
    context.subscriptions.push({ dispose: () => lspClient.stop() });
    await lspClient.start();

    registerCommands(context, {
        config,
        dialectManager,
        connections,
        ftpProvider,
        treeProvider,
        credentials,
        remoteMud,
        homeMud,
        homeMudService,
        output
    });
}

export function deactivate(): void {
    // Aufräumen erfolgt über context.subscriptions.
}
