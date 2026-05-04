import * as vscode from 'vscode';
import { LpcConfigService } from './config/lpcConfig';
import { DialectManager } from './dialect/dialectManager';
import { EfunProvider } from './dialect/efunProvider';
import { FtpFileSystemProvider } from './ftp/ftpFileSystemProvider';
import { CredentialsManager } from './ftp/credentialsManager';
import { ConnectionManager } from './ftp/connectionManager';
import { RemoteExplorerProvider } from './tree/remoteExplorerProvider';
import { LpcLanguageClient } from './lsp/client';
import { registerCommands } from './commands';
import { createStatusBar } from './statusBar';

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

    const treeProvider = new RemoteExplorerProvider(ftpProvider, config);
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('lpcRemoteExplorer', treeProvider)
    );

    const statusBar = createStatusBar(dialectManager, efunProvider, config, connections);
    context.subscriptions.push(statusBar);

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
        output
    });
}

export function deactivate(): void {
    // Aufräumen erfolgt über context.subscriptions.
}
