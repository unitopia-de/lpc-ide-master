import * as vscode from 'vscode';
import { LpcConfigService } from '../config/lpcConfig';
import { DialectManager, DialectId } from '../dialect/dialectManager';
import { FtpFileSystemProvider } from '../ftp/ftpFileSystemProvider';
import { ConnectionManager } from '../ftp/connectionManager';
import { RemoteExplorerProvider } from '../tree/remoteExplorerProvider';
import { CredentialsManager } from '../ftp/credentialsManager';

export interface CommandContext {
    config: LpcConfigService;
    dialectManager: DialectManager;
    connections: ConnectionManager;
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
                vscode.window.showWarningMessage(
                    'Keine FTP-Daten in lpc-config.json hinterlegt (Feld "ftp" fehlt).'
                );
                return;
            }
            try {
                await deps.connections.getOrConnect(cfg.ftp.host);
            } catch (err) {
                vscode.window.showErrorMessage(`Verbindung fehlgeschlagen: ${err}`);
                return;
            }

            const remoteRoot = cfg.ftp.remoteRoot ?? cfg.mudlib?.baseDir ?? '/';
            const folderUri = vscode.Uri.parse(`lpc-ftp://${cfg.ftp.host}${remoteRoot}`);

            const choice = await vscode.window.showInformationMessage(
                `Verbunden mit ${cfg.ftp.host}. Remote-Verzeichnis als Workspace-Ordner hinzufügen?`,
                'Hinzufügen',
                'Nur Tree zeigen'
            );
            if (choice === 'Hinzufügen') {
                const folders = vscode.workspace.workspaceFolders ?? [];
                vscode.workspace.updateWorkspaceFolders(folders.length, 0, {
                    uri: folderUri,
                    name: `MUD: ${cfg.ftp.host}`
                });
            }
            deps.treeProvider.refresh();
        }),

        vscode.commands.registerCommand('lpc.disconnect', async () => {
            const active = deps.connections.listConnections();
            if (active.length === 0) {
                vscode.window.showInformationMessage('Keine aktive FTP-Verbindung.');
                return;
            }
            if (active.length === 1) {
                await deps.connections.disconnect(active[0].host);
            } else {
                const choice = await vscode.window.showQuickPick(
                    active.map((a) => a.host),
                    { placeHolder: 'Verbindung trennen' }
                );
                if (choice) {
                    await deps.connections.disconnect(choice);
                }
            }
            deps.treeProvider.refresh();
        }),

        vscode.commands.registerCommand('lpc.refreshRemote', () => {
            deps.treeProvider.refresh();
        }),

        vscode.commands.registerCommand('lpc.changePassword', async () => {
            const cfg = deps.config.value?.ftp;
            if (!cfg?.host || !cfg.user) {
                vscode.window.showWarningMessage('Kein FTP-Host/-User in lpc-config.json.');
                return;
            }
            const pw = await deps.credentials.promptForPassword(cfg.host, cfg.user);
            if (pw) {
                await deps.connections.disconnect(cfg.host);
                vscode.window.showInformationMessage('Passwort gespeichert. Bitte neu verbinden.');
            }
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
