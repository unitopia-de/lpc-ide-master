import * as vscode from 'vscode';
import { LpcConfigService } from '../config/lpcConfig';

export interface PathMapping {
    /** Lokaler Pfad innerhalb der homemud-Mudlib (kein leading slash). */
    relative: string;
    /** Vollständige lokale URI. */
    localUri: vscode.Uri;
    /** Vollständige Remote-URI (lpc-ftp://...). */
    remoteUri: vscode.Uri;
}

// Pfad-Mapping zwischen Remote-MUD (lpc-ftp://) und lokalem homemud-Verzeichnis.
//
// Strategie:
//   remoteRoot = ftp.remoteRoot ?? mudlib.baseDir ?? '/'
//   localRoot  = <workspace>/<homemud.path>/<homemud.libPath>
//
// Eine Datei lpc-ftp://host/<remoteRoot>/foo/bar.c landet lokal unter
// <localRoot>/foo/bar.c — der Suffix nach remoteRoot wird 1:1 übernommen.
export class HomeMudService {
    constructor(private readonly config: LpcConfigService) {}

    get isConfigured(): boolean {
        return !!this.config.value?.homemud?.path;
    }

    /** Lokale Wurzel der homemud-Mudlib als URI, oder undefined wenn nicht konfiguriert. */
    get localRoot(): vscode.Uri | undefined {
        const cfg = this.config.value?.homemud;
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (!cfg || !folder) return undefined;
        const lib = (cfg.libPath ?? '/lib').replace(/^\/+/, '');
        return vscode.Uri.joinPath(folder.uri, cfg.path, lib);
    }

    get remoteRoot(): string {
        const cfg = this.config.value;
        return (cfg?.ftp?.remoteRoot ?? cfg?.mudlib?.baseDir ?? '/').replace(/\/+$/, '') || '/';
    }

    get remoteHost(): string | undefined {
        return this.config.value?.ftp?.host;
    }

    /**
     * Mappt eine Remote-URI auf die entsprechende lokale URI.
     * Wirft wenn der Remote-Pfad außerhalb von remoteRoot liegt.
     */
    remoteToLocal(remoteUri: vscode.Uri): PathMapping {
        const localRoot = this.requireLocalRoot();
        const remoteRoot = this.remoteRoot;
        const remotePath = remoteUri.path;
        if (!remotePath.startsWith(remoteRoot === '/' ? '/' : remoteRoot + '/') && remotePath !== remoteRoot) {
            throw new Error(
                `Remote-Pfad "${remotePath}" liegt außerhalb der konfigurierten remoteRoot "${remoteRoot}".`
            );
        }
        const suffix = remoteRoot === '/' ? remotePath : remotePath.substring(remoteRoot.length);
        const relative = suffix.replace(/^\/+/, '');
        return {
            relative,
            localUri: relative ? vscode.Uri.joinPath(localRoot, relative) : localRoot,
            remoteUri
        };
    }

    /**
     * Mappt eine lokale URI auf die entsprechende Remote-URI.
     * Wirft wenn die lokale Datei außerhalb der homemud-Mudlib liegt.
     */
    localToRemote(localUri: vscode.Uri): PathMapping {
        const localRoot = this.requireLocalRoot();
        const host = this.remoteHost;
        if (!host) {
            throw new Error('Kein FTP-Host konfiguriert (ftp.host).');
        }
        const localPath = normalize(localUri.path);
        const rootPath = normalize(localRoot.path);
        if (!localPath.startsWith(rootPath)) {
            throw new Error(
                `Lokale Datei "${localPath}" liegt außerhalb der homemud-Mudlib "${rootPath}".`
            );
        }
        const relative = localPath.substring(rootPath.length).replace(/^\/+/, '');
        const remoteRoot = this.remoteRoot;
        const remotePath = relative
            ? (remoteRoot === '/' ? '/' + relative : remoteRoot + '/' + relative)
            : remoteRoot;
        return {
            relative,
            localUri,
            remoteUri: vscode.Uri.parse(`lpc-ftp://${host}${remotePath}`)
        };
    }

    /**
     * Lädt rekursiv von Remote in den lokalen homemud-Pfad.
     * Verzeichnisse werden bei Bedarf angelegt; existierende Dateien werden überschrieben.
     */
    async copyFromRemote(
        remoteUri: vscode.Uri,
        progress?: vscode.Progress<{ message?: string }>
    ): Promise<number> {
        const mapping = this.remoteToLocal(remoteUri);
        return this.copyTreeFsToFs(remoteUri, mapping.localUri, progress);
    }

    /**
     * Lädt rekursiv vom homemud zur Remote.
     */
    async copyToRemote(
        localUri: vscode.Uri,
        progress?: vscode.Progress<{ message?: string }>
    ): Promise<number> {
        const mapping = this.localToRemote(localUri);
        return this.copyTreeFsToFs(localUri, mapping.remoteUri, progress);
    }

    // --- intern -----------------------------------------------------------

    private requireLocalRoot(): vscode.Uri {
        const root = this.localRoot;
        if (!root) {
            throw new Error('lpc-config.json: homemud.path fehlt oder Workspace nicht geöffnet.');
        }
        return root;
    }

    private async copyTreeFsToFs(
        source: vscode.Uri,
        target: vscode.Uri,
        progress?: vscode.Progress<{ message?: string }>
    ): Promise<number> {
        const stat = await vscode.workspace.fs.stat(source);
        if (stat.type === vscode.FileType.File) {
            await this.ensureParent(target);
            const data = await vscode.workspace.fs.readFile(source);
            await vscode.workspace.fs.writeFile(target, data);
            progress?.report({ message: target.path });
            return 1;
        }

        if (stat.type === vscode.FileType.Directory) {
            await this.ensureDir(target);
            const entries = await vscode.workspace.fs.readDirectory(source);
            let count = 0;
            for (const [name, type] of entries) {
                if (name === '.git' || name === 'node_modules') continue;
                const childSource = appendPath(source, name);
                const childTarget = appendPath(target, name);
                if (type === vscode.FileType.Directory) {
                    count += await this.copyTreeFsToFs(childSource, childTarget, progress);
                } else if (type === vscode.FileType.File) {
                    await this.ensureParent(childTarget);
                    const data = await vscode.workspace.fs.readFile(childSource);
                    await vscode.workspace.fs.writeFile(childTarget, data);
                    progress?.report({ message: childTarget.path });
                    count++;
                }
            }
            return count;
        }

        return 0;
    }

    private async ensureDir(uri: vscode.Uri): Promise<void> {
        try {
            await vscode.workspace.fs.createDirectory(uri);
        } catch {
            /* existiert bereits */
        }
    }

    private async ensureParent(uri: vscode.Uri): Promise<void> {
        const parent = uri.with({ path: uri.path.substring(0, uri.path.lastIndexOf('/')) || '/' });
        await this.ensureDir(parent);
    }
}

function normalize(p: string): string {
    return p.replace(/\\/g, '/').replace(/\/+$/, '');
}

function appendPath(uri: vscode.Uri, name: string): vscode.Uri {
    const sep = uri.path.endsWith('/') ? '' : '/';
    return uri.with({ path: uri.path + sep + name });
}
