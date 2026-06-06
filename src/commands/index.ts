import * as vscode from 'vscode';
import { LpcConfigService } from '../config/lpcConfig';
import { DialectManager, DialectId } from '../dialect/dialectManager';
import { FtpFileSystemProvider } from '../ftp/ftpFileSystemProvider';
import { ConnectionManager } from '../ftp/connectionManager';
import { RemoteExplorerProvider, RemoteNode } from '../tree/remoteExplorerProvider';
import { CredentialsManager } from '../ftp/credentialsManager';
import { MudConsole } from '../mud/mudConsole';
import { HomeMudService } from '../homemud/homeMudService';

export interface CommandContext {
    config: LpcConfigService;
    dialectManager: DialectManager;
    connections: ConnectionManager;
    ftpProvider: FtpFileSystemProvider;
    treeProvider: RemoteExplorerProvider;
    credentials: CredentialsManager;
    remoteMud: MudConsole;
    homeMud: MudConsole;
    homeMudService: HomeMudService;
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
        if (choice) await deps.dialectManager.setActive(choice as DialectId);
    });

    // --- FTP-Verbindung ---------------------------------------------------

    sub('lpc.connect', async () => {
        const cfg = deps.config.value;
        if (!cfg?.ftp?.host) {
            vscode.window.showWarningMessage('Keine FTP-Daten in lpc-config.json hinterlegt.');
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
            if (choice) await deps.connections.disconnect(choice);
        }
        deps.treeProvider.refresh();
    });

    sub('lpc.refreshRemote', () => deps.treeProvider.refresh());

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
        const newUri = node.uri.with({ path: joinPath(parentOf(node.uri.path), newName) });
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

    // --- MUD-Konsolen -----------------------------------------------------

    sub('lpc.openRemoteMudConsole', () => deps.remoteMud.show());
    sub('lpc.openHomeMudConsole', () => deps.homeMud.show());

    sub('lpc.disconnectMud', async () => {
        const choice = await pickMud(deps, 'Welche Konsole trennen?');
        if (choice) await choice.disconnect();
    });

    sub('lpc.changeMudPassword', async () => {
        const choice = await pickMud(deps, 'Welcher MUD?');
        if (!choice) return;
        const cfg = choice === deps.remoteMud ? deps.config.value?.mud : deps.config.value?.homemud?.mud;
        if (!cfg?.host || !cfg.user) {
            vscode.window.showWarningMessage('Dieses MUD nutzt keinen Login.');
            return;
        }
        const pw = await deps.credentials.promptForMudPassword(cfg.host, cfg.user);
        if (pw) {
            await choice.disconnect();
            vscode.window.showInformationMessage('Passwort gespeichert. Bitte neu verbinden.');
        }
    });

    sub('lpc.updateObject', async (node?: RemoteNode) => {
        const path = await pickObjectPath(node);
        if (!path) return;
        const mud = await pickMudForCommand(deps);
        if (!mud) return;
        try {
            await mud.send(`update ${path}`);
        } catch (err) {
            vscode.window.showErrorMessage(`update fehlgeschlagen: ${err}`);
        }
    });

    sub('lpc.destructObject', async (node?: RemoteNode) => {
        const path = await pickObjectPath(node);
        if (!path) return;
        const mud = await pickMudForCommand(deps);
        if (!mud) return;
        const confirm = await vscode.window.showWarningMessage(
            `Objekt "${path}" im ${mud.label}-MUD zerstören?\n\n` +
                `Alle Instanzen verschwinden aus dem laufenden MUD. Die Source-Datei bleibt erhalten.`,
            { modal: true },
            'Zerstören'
        );
        if (confirm !== 'Zerstören') return;
        try {
            await mud.send(`destruct ${path}`);
        } catch (err) {
            vscode.window.showErrorMessage(`destruct fehlgeschlagen: ${err}`);
        }
    });

    // --- HomeMUD: Sync ----------------------------------------------------

    sub('lpc.copyToHomemud', async (node?: RemoteNode) => {
        if (!node) return;
        if (!deps.homeMudService.isConfigured) {
            vscode.window.showWarningMessage('homemud nicht konfiguriert (lpc-config.json: homemud.path).');
            return;
        }
        try {
            const mapping = deps.homeMudService.remoteToLocal(node.uri);
            const confirm = await vscode.window.showInformationMessage(
                `Nach lokal kopieren?\n\n${node.uri.path}\n→ ${mapping.localUri.fsPath}`,
                { modal: true },
                'Kopieren'
            );
            if (confirm !== 'Kopieren') return;
            const count = await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: `Lade ${node.label} nach homemud …`,
                    cancellable: false
                },
                (progress) => deps.homeMudService.copyFromRemote(node.uri, progress)
            );
            vscode.window.showInformationMessage(`${count} Datei(en) ins homemud kopiert.`);
        } catch (err) {
            vscode.window.showErrorMessage(`Kopieren fehlgeschlagen: ${err}`);
        }
    });

    sub('lpc.uploadToRemote', async (uri?: vscode.Uri) => {
        const target = uri ?? vscode.window.activeTextEditor?.document.uri;
        if (!target) {
            vscode.window.showWarningMessage('Keine Datei ausgewählt.');
            return;
        }
        if (!deps.homeMudService.isConfigured) {
            vscode.window.showWarningMessage('homemud nicht konfiguriert.');
            return;
        }
        try {
            const mapping = deps.homeMudService.localToRemote(target);
            const confirm = await vscode.window.showWarningMessage(
                `Zur Remote hochladen?\n\n${target.fsPath}\n→ ${mapping.remoteUri.toString()}\n\n` +
                    `Eine ggf. existierende Remote-Datei wird überschrieben.`,
                { modal: true },
                'Hochladen'
            );
            if (confirm !== 'Hochladen') return;
            const count = await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: `Lade ${labelFor(target)} zur Remote …`,
                    cancellable: false
                },
                (progress) => deps.homeMudService.copyToRemote(target, progress)
            );
            vscode.window.showInformationMessage(`${count} Datei(en) zur Remote hochgeladen.`);
            deps.treeProvider.refresh();
        } catch (err) {
            vscode.window.showErrorMessage(`Hochladen fehlgeschlagen: ${err}`);
        }
    });

    sub('lpc.revealHomeMud', async () => {
        const root = deps.homeMudService.localRoot;
        if (!root) {
            vscode.window.showWarningMessage('homemud nicht konfiguriert.');
            return;
        }
        try {
            await vscode.commands.executeCommand('revealInExplorer', root);
        } catch {
            vscode.window.showInformationMessage(`homemud-Pfad: ${root.fsPath}`);
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

async function pickMud(
    deps: CommandContext,
    placeHolder: string
): Promise<MudConsole | undefined> {
    const choices: { label: string; mud: MudConsole }[] = [];
    if (deps.homeMud.isConfigured) choices.push({ label: 'homemud (lokal)', mud: deps.homeMud });
    if (deps.remoteMud.isConfigured) choices.push({ label: 'remote', mud: deps.remoteMud });
    if (choices.length === 0) {
        vscode.window.showWarningMessage('Kein MUD konfiguriert.');
        return undefined;
    }
    if (choices.length === 1) return choices[0].mud;
    const picked = await vscode.window.showQuickPick(choices, { placeHolder });
    return picked?.mud;
}

// Default für update/destruct: homemud, falls konfiguriert. Sonst remote.
async function pickMudForCommand(deps: CommandContext): Promise<MudConsole | undefined> {
    if (deps.homeMud.isConfigured && deps.remoteMud.isConfigured) {
        const picked = await vscode.window.showQuickPick(
            [
                { label: '$(home) homemud (Default)', mud: deps.homeMud },
                { label: '$(globe) remote', mud: deps.remoteMud }
            ],
            { placeHolder: 'Auf welchem MUD ausführen?' }
        );
        return picked?.mud;
    }
    if (deps.homeMud.isConfigured) return deps.homeMud;
    if (deps.remoteMud.isConfigured) return deps.remoteMud;
    vscode.window.showWarningMessage('Kein MUD konfiguriert.');
    return undefined;
}

async function pickObjectPath(node?: RemoteNode): Promise<string | undefined> {
    const path = node?.uri.path;
    if (!path) {
        vscode.window.showWarningMessage('Kein Datei-Knoten ausgewählt.');
        return undefined;
    }
    return path;
}

function childUri(parent: vscode.Uri, name: string): vscode.Uri {
    return parent.with({ path: joinPath(parent.path, name) });
}

function parentOf(path: string): string {
    const idx = path.lastIndexOf('/');
    return idx <= 0 ? '/' : path.substring(0, idx);
}

function joinPath(base: string, name: string): string {
    return base.endsWith('/') ? `${base}${name}` : `${base}/${name}`;
}

function labelFor(uri: vscode.Uri): string {
    const i = uri.path.lastIndexOf('/');
    return i >= 0 ? uri.path.substring(i + 1) : uri.path;
}
