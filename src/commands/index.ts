import * as vscode from 'vscode';
import { LpcConfigService } from '../config/lpcConfig';
import { DialectManager, DialectId } from '../dialect/dialectManager';
import { FtpFileSystemProvider } from '../ftp/ftpFileSystemProvider';
import { ConnectionManager } from '../ftp/connectionManager';
import { RemoteExplorerProvider, RemoteNode } from '../tree/remoteExplorerProvider';
import { CredentialsManager } from '../ftp/credentialsManager';
import { MudConsole } from '../mud/mudConsole';

export interface CommandContext {
    config: LpcConfigService;
    dialectManager: DialectManager;
    connections: ConnectionManager;
    ftpProvider: FtpFileSystemProvider;
    treeProvider: RemoteExplorerProvider;
    credentials: CredentialsManager;
    mudConsole: MudConsole;
    output: vscode.OutputChannel;
}

export function registerCommands(
    context: vscode.ExtensionContext,
    deps: CommandContext
): void {
    const sub = (cmd: string, handler: (...args: any[]) => any): void => {
        context.subscriptions.push(vscode.commands.registerCommand(cmd, handler));
    };

    // --- Konfig & Dialekt -------------------------------------------------

    sub('lpc.reloadConfig', async () => {
        await deps.config.load();
        deps.treeProvider.refresh();
        vscode.window.showInformationMessage('LPC-Konfiguration neu geladen.');
    });

    sub('lpc.switchDialect', async () => {
        const choice = await vscode.window.showQuickPick(deps.dialectManager.listAvailable(), {
            placeHolder: 'Dialekt wählen'
        });
        if (choice) {
            await deps.dialectManager.setActive(choice as DialectId);
        }
    });

    // --- FTP-Verbindung ---------------------------------------------------

    sub('lpc.connect', async () => {
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
    });

    sub('lpc.disconnect', async () => {
        const active = deps.connections.listConnections();
        if (active.length === 0) {
            vscode.window.showInformationMessage('Keine aktive FTP-Verbindung.');
            return;
        }
        if (active.length === 1) {
            await deps.connections.disconnect(active[0].host);
        } else {
            const choice = await vscode.window.showQuickPick(active.map((a) => a.host), {
                placeHolder: 'Verbindung trennen'
            });
            if (choice) {
                await deps.connections.disconnect(choice);
            }
        }
        deps.treeProvider.refresh();
    });

    sub('lpc.refreshRemote', () => {
        deps.treeProvider.refresh();
    });

    sub('lpc.changePassword', async () => {
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
    });

    // --- Datei-Operationen im Tree ---------------------------------------

    sub('lpc.newFile', async (node?: RemoteNode) => {
        const parent = await pickParent(node, deps);
        if (!parent) return;
        const name = await vscode.window.showInputBox({
            prompt: 'Name der neuen Datei',
            placeHolder: 'name.c',
            ignoreFocusOut: true
        });
        if (!name) return;
        const uri = childUri(parent, name);
        try {
            await vscode.workspace.fs.writeFile(uri, new Uint8Array());
            deps.treeProvider.refresh();
            await vscode.window.showTextDocument(uri);
        } catch (err) {
            vscode.window.showErrorMessage(`Anlegen fehlgeschlagen: ${err}`);
        }
    });

    sub('lpc.newFolder', async (node?: RemoteNode) => {
        const parent = await pickParent(node, deps);
        if (!parent) return;
        const name = await vscode.window.showInputBox({
            prompt: 'Name des neuen Verzeichnisses',
            ignoreFocusOut: true
        });
        if (!name) return;
        const uri = childUri(parent, name);
        try {
            await vscode.workspace.fs.createDirectory(uri);
            deps.treeProvider.refresh();
        } catch (err) {
            vscode.window.showErrorMessage(`Verzeichnis anlegen fehlgeschlagen: ${err}`);
        }
    });

    sub('lpc.renameRemote', async (node?: RemoteNode) => {
        if (!node) return;
        const oldName = node.label;
        const newName = await vscode.window.showInputBox({
            prompt: 'Neuer Name',
            value: oldName,
            ignoreFocusOut: true
        });
        if (!newName || newName === oldName) return;
        const parentPath = parentOf(node.uri.path);
        const newUri = node.uri.with({ path: joinPath(parentPath, newName) });
        try {
            await vscode.workspace.fs.rename(node.uri, newUri, { overwrite: false });
            deps.treeProvider.refresh();
        } catch (err) {
            vscode.window.showErrorMessage(`Umbenennen fehlgeschlagen: ${err}`);
        }
    });

    sub('lpc.deleteRemote', async (node?: RemoteNode) => {
        if (!node) return;
        const confirm = await vscode.window.showWarningMessage(
            `${node.isDirectory ? 'Verzeichnis' : 'Datei'} "${node.uri.path}" wirklich löschen?`,
            { modal: true },
            'Löschen'
        );
        if (confirm !== 'Löschen') return;
        try {
            await vscode.workspace.fs.delete(node.uri, { recursive: node.isDirectory });
            deps.treeProvider.refresh();
        } catch (err) {
            vscode.window.showErrorMessage(`Löschen fehlgeschlagen: ${err}`);
        }
    });

    sub('lpc.copyRemotePath', async (node?: RemoteNode) => {
        if (!node) return;
        await vscode.env.clipboard.writeText(node.uri.path);
        vscode.window.setStatusBarMessage(`Pfad kopiert: ${node.uri.path}`, 3000);
    });

    // --- MUD-Konsole ------------------------------------------------------

    sub('lpc.openMudConsole', () => {
        deps.mudConsole.show();
    });

    sub('lpc.disconnectMud', async () => {
        await deps.mudConsole.disconnect();
    });

    sub('lpc.changeMudPassword', async () => {
        const cfg = deps.config.value?.mud;
        if (!cfg?.host || !cfg?.user) {
            vscode.window.showWarningMessage('Kein MUD-Host/-User in lpc-config.json.');
            return;
        }
        const pw = await deps.credentials.promptForMudPassword(cfg.host, cfg.user);
        if (pw) {
            await deps.mudConsole.disconnect();
            vscode.window.showInformationMessage('MUD-Passwort gespeichert. Bitte neu verbinden.');
        }
    });

    sub('lpc.updateObject', async (node?: RemoteNode) => {
        const path = node?.uri.path;
        if (!path) {
            vscode.window.showWarningMessage('Kein Datei-Knoten ausgewählt.');
            return;
        }
        try {
            await deps.mudConsole.send(`update ${path}`);
        } catch (err) {
            vscode.window.showErrorMessage(`update fehlgeschlagen: ${err}`);
        }
    });

    sub('lpc.destructObject', async (node?: RemoteNode) => {
        const path = node?.uri.path;
        if (!path) {
            vscode.window.showWarningMessage('Kein Datei-Knoten ausgewählt.');
            return;
        }
        const confirm = await vscode.window.showWarningMessage(
            `Objekt "${path}" im MUD zerstören?\n\n` +
                `Alle Instanzen verschwinden aus dem laufenden MUD. Die Source-Datei bleibt erhalten.`,
            { modal: true },
            'Zerstören'
        );
        if (confirm !== 'Zerstören') return;
        try {
            await deps.mudConsole.send(`destruct ${path}`);
        } catch (err) {
            vscode.window.showErrorMessage(`destruct fehlgeschlagen: ${err}`);
        }
    });
}

// --- Helpers --------------------------------------------------------------

async function pickParent(
    node: RemoteNode | undefined,
    deps: CommandContext
): Promise<vscode.Uri | undefined> {
    if (node) {
        return node.isDirectory ? node.uri : node.uri.with({ path: parentOf(node.uri.path) });
    }
    const cfg = deps.config.value;
    if (!cfg?.ftp?.host) {
        vscode.window.showWarningMessage('Keine FTP-Verbindung konfiguriert.');
        return undefined;
    }
    const root = cfg.ftp.remoteRoot ?? cfg.mudlib?.baseDir ?? '/';
    return vscode.Uri.parse(`lpc-ftp://${cfg.ftp.host}${root}`);
}

function childUri(parent: vscode.Uri, name: string): vscode.Uri {
    return parent.with({ path: joinPath(parent.path, name) });
}

function parentOf(path: string): string {
    const idx = path.lastIndexOf('/');
    if (idx <= 0) return '/';
    return path.substring(0, idx);
}

function joinPath(base: string, name: string): string {
    return base.endsWith('/') ? `${base}${name}` : `${base}/${name}`;
}
