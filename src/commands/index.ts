import * as vscode from 'vscode';
import { LpcConfigService } from '../config/lpcConfig';
import { DialectManager, DialectId } from '../dialect/dialectManager';
import { FtpFileSystemProvider } from '../ftp/ftpFileSystemProvider';
import { RemoteExplorerProvider } from '../tree/remoteExplorerProvider';
import { CredentialsManager } from '../ftp/credentialsManager';

export interface CommandContext {
    config: LpcConfigService;
    dialectManager: DialectManager;
    ftpProvider: FtpFileSystemProvider;
    treeProvider: RemoteExplorerProvider;
    credentials: CredentialsManager;
    output: vscode.OutputChannel;
}

export function registerCommands(
    context: vscode.ExtensionContext,
    deps: CommandContext
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('lpc.reloadConfig', async () => {
            await deps.config.load();
            deps.treeProvider.refresh();
            vscode.window.showInformationMessage('LPC-Konfiguration neu geladen.');
        }),

        vscode.commands.registerCommand('lpc.switchDialect', async () => {
            const choice = await vscode.window.showQuickPick(deps.dialectManager.listAvailable(), {
                placeHolder: 'Dialekt wählen'
            });
            if (choice) {
                await deps.dialectManager.setActive(choice as DialectId);
            }
        }),

        vscode.commands.registerCommand('lpc.connect', async () => {
            const cfg = deps.config.value;
            if (!cfg?.ftp?.host) {
                vscode.window.showWarningMessage('Keine FTP-Daten in lpc-config.json hinterlegt.');
                return;
            }
            // Erste readDirectory triggert den Verbindungsaufbau.
            deps.treeProvider.refresh();
        }),

        vscode.commands.registerCommand('lpc.disconnect', () => {
            // Verbindungsabbau erfolgt aktuell beim Beenden der Extension.
            vscode.window.showInformationMessage('Disconnect noch nicht implementiert.');
        }),

        vscode.commands.registerCommand('lpc.refreshRemote', () => {
            deps.treeProvider.refresh();
        }),

        vscode.commands.registerCommand('lpc.updateObject', async (node) => {
            deps.output.appendLine(`update angefordert für: ${node?.uri?.toString() ?? '?'}`);
            vscode.window.showInformationMessage('update Objekt: noch nicht implementiert (Phase 3).');
        }),

        vscode.commands.registerCommand('lpc.destructObject', async (node) => {
            deps.output.appendLine(`destruct angefordert für: ${node?.uri?.toString() ?? '?'}`);
            vscode.window.showInformationMessage('destruct Objekt: noch nicht implementiert (Phase 3).');
        })
    );
}
