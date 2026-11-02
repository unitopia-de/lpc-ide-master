import * as vscode from 'vscode';
import { gunzipSync } from 'zlib';
import { LpcConfigService } from '../config/lpcConfig';
import { HomeMudService } from '../homemud/homeMudService';
import { ConnectionManager } from '../ftp/connectionManager';
import { IndexFile, MudlibIndex } from './indexFormat';
import { LpcIndex } from './lpcIndex';

export const DEFAULT_INDEX_FILE = '/doc/lpc-ide/index.json.gz';

// Lädt den Mudlib-Index (mudlib.indexFile, Standard /doc/lpc-ide/index.json.gz):
//  - mit homemud aus der lokalen Mudlib,
//  - sonst per FTP, sobald eine Verbindung besteht. Dabei wird nur die kleine
//    ".stamp"-Datei gelesen; der Index selbst nur, wenn sie sich geändert hat.
//    Die Kopie liegt im Extension-Speicher und wird beim nächsten Start ohne
//    Verbindung verwendet.
export class ServerIndexLoader implements vscode.Disposable {
    private readonly disposables: vscode.Disposable[] = [];
    private loading: Promise<void> | undefined;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly config: LpcConfigService,
        private readonly homemud: HomeMudService,
        private readonly connections: ConnectionManager,
        private readonly index: LpcIndex,
        private readonly output: vscode.OutputChannel
    ) {
        this.disposables.push(
            config.onDidChange(() => void this.reload()),
            connections.onDidChangeConnection((info) => {
                if (info && !this.homemud.localRoot) {
                    void this.refreshFromFtp();
                }
            })
        );
    }

    dispose(): void {
        for (const d of this.disposables) {
            d.dispose();
        }
    }

    /** Beim Start bzw. nach Konfig-Änderung: homemud-Datei oder zwischengespeicherte Kopie laden. */
    async reload(): Promise<void> {
        if (!this.config.value) {
            this.index.setServerIndex(undefined, '');
            return;
        }
        const root = this.homemud.localRoot;
        if (root) {
            const uri = vscode.Uri.joinPath(root, ...this.indexPath().split('/').filter(Boolean));
            const data = await readOptional(uri);
            this.apply(data, `homemud ${this.indexPath()}`);
            return;
        }
        const cached = await readOptional(this.cacheUri());
        this.apply(cached, 'Zwischenspeicher');
        if (this.connections.active) {
            await this.refreshFromFtp();
        }
    }

    /** Index per FTP aktualisieren (nur bei bestehender Verbindung). */
    refreshFromFtp(force = false): Promise<void> {
        if (!this.loading) {
            this.loading = this.doRefresh(force).finally(() => (this.loading = undefined));
        }
        return this.loading;
    }

    private async doRefresh(force: boolean): Promise<void> {
        const host = this.config.value?.ftp?.host;
        if (!host || !this.connections.active) {
            return;
        }
        const remote = vscode.Uri.parse(`lpc-ftp://${host}${this.indexPath()}`);
        const stampKey = `lpc.index.stamp.${host}`;
        try {
            const stampData = await readOptional(remote.with({ path: remote.path + '.stamp' }));
            const stamp = stampData ? Buffer.from(stampData).toString('utf8').trim() : undefined;
            const cachedStamp = this.context.globalState.get<string>(stampKey);
            if (!force && stamp && stamp === cachedStamp && (await readOptional(this.cacheUri()))) {
                return; // Zwischengespeicherte Kopie ist aktuell.
            }
            const data = await readOptional(remote);
            if (!data) {
                this.output.appendLine(`Kein Mudlib-Index auf dem Server (${this.indexPath()}).`);
                return;
            }
            if (this.apply(data, `Server ${host}`)) {
                await vscode.workspace.fs.createDirectory(this.context.globalStorageUri);
                await vscode.workspace.fs.writeFile(this.cacheUri(), data);
                await this.context.globalState.update(stampKey, stamp);
            }
        } catch (err) {
            this.output.appendLine(`Mudlib-Index vom Server nicht ladbar: ${err}`);
        }
    }

    private apply(data: Uint8Array | undefined, source: string): boolean {
        if (!data) {
            this.index.setServerIndex(undefined, '');
            return false;
        }
        try {
            const bytes = Buffer.from(data);
            // gzip an den ersten beiden Bytes erkennen, nicht an der Endung.
            const json = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;
            this.index.setServerIndex(new MudlibIndex(JSON.parse(json.toString('utf8')) as IndexFile), source);
            return true;
        } catch (err) {
            this.output.appendLine(`Mudlib-Index (${source}) ungültig: ${err}`);
            return false;
        }
    }

    private indexPath(): string {
        const p = this.config.value?.mudlib?.indexFile ?? DEFAULT_INDEX_FILE;
        return p.startsWith('/') ? p : '/' + p;
    }

    private cacheUri(): vscode.Uri {
        const host = (this.config.value?.ftp?.host ?? 'local').replace(/[^\w.-]/g, '_');
        return vscode.Uri.joinPath(this.context.globalStorageUri, `index-${host}.json.gz`);
    }
}

async function readOptional(uri: vscode.Uri): Promise<Uint8Array | undefined> {
    try {
        return await vscode.workspace.fs.readFile(uri);
    } catch {
        return undefined;
    }
}
