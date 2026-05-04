import * as vscode from 'vscode';

export interface MudlibConfig {
    name: string;
    baseDir: string;
    simulEfunFile?: string;
    includeDirs?: string[];
    efunDefinitions?: string;
}

export interface FtpConfig {
    host: string;
    port?: number;
    user?: string;
    remoteRoot?: string;
    protocol?: 'ftp' | 'sftp';
}

export interface MudConsoleConfig {
    host: string;
    port?: number;
    user: string;
    protocol?: 'telnet' | 'telnets';
    loginPrompt?: string;
    passwordPrompt?: string;
    commandPrompt?: string;
    /** Endmarker, der nach jedem Befehl in die Antwort eingebettet wird, um das Ende zu erkennen. */
    completionMarker?: string;
}

export interface LpcConfig {
    dialect: 'ldmud' | 'fluffos' | 'mudos';
    version?: string;
    mudlib: MudlibConfig;
    ftp?: FtpConfig;
    mud?: MudConsoleConfig;
}

export interface ValidationIssue {
    path: string;
    message: string;
}

export class LpcConfigService implements vscode.Disposable {
    private current: LpcConfig | undefined;
    private currentUri: vscode.Uri | undefined;
    private lastIssues: ValidationIssue[] = [];

    private readonly emitter = new vscode.EventEmitter<LpcConfig | undefined>();
    readonly onDidChange = this.emitter.event;

    private watcher: vscode.FileSystemWatcher | undefined;

    constructor(private readonly output: vscode.OutputChannel) {}

    get value(): LpcConfig | undefined {
        return this.current;
    }

    get uri(): vscode.Uri | undefined {
        return this.currentUri;
    }

    get issues(): ValidationIssue[] {
        return this.lastIssues;
    }

    async load(): Promise<LpcConfig | undefined> {
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (!folder) {
            this.output.appendLine('Kein Workspace geöffnet — Konfiguration übersprungen.');
            return undefined;
        }
        const settings = vscode.workspace.getConfiguration('lpc');
        const fileName = settings.get<string>('configFile', 'lpc-config.json');
        const uri = vscode.Uri.joinPath(folder.uri, fileName);
        this.currentUri = uri;

        this.ensureWatcher(folder, fileName);

        let raw: Uint8Array;
        try {
            raw = await vscode.workspace.fs.readFile(uri);
        } catch {
            this.output.appendLine(`Keine ${fileName} gefunden (${uri.fsPath}).`);
            this.current = undefined;
            this.lastIssues = [];
            this.emitter.fire(undefined);
            return undefined;
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(Buffer.from(raw).toString('utf8'));
        } catch (err) {
            this.output.appendLine(`Konfiguration ungültig (JSON-Fehler): ${err}`);
            this.current = undefined;
            this.lastIssues = [{ path: '$', message: `JSON-Parse-Fehler: ${err}` }];
            this.emitter.fire(undefined);
            return undefined;
        }

        const issues = validate(parsed);
        this.lastIssues = issues;
        if (issues.length > 0) {
            this.output.appendLine(`Konfiguration enthält ${issues.length} Problem(e):`);
            for (const issue of issues) {
                this.output.appendLine(`  - ${issue.path}: ${issue.message}`);
            }
            this.current = undefined;
            this.emitter.fire(undefined);
            return undefined;
        }

        this.current = parsed as LpcConfig;
        this.output.appendLine(`Konfiguration geladen: ${uri.fsPath}`);
        this.emitter.fire(this.current);
        return this.current;
    }

    dispose(): void {
        this.watcher?.dispose();
        this.emitter.dispose();
    }

    private ensureWatcher(folder: vscode.WorkspaceFolder, fileName: string): void {
        if (this.watcher) {
            return;
        }
        const pattern = new vscode.RelativePattern(folder, fileName);
        this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
        const reload = (): void => {
            this.output.appendLine('lpc-config.json geändert — neu laden.');
            void this.load();
        };
        this.watcher.onDidChange(reload);
        this.watcher.onDidCreate(reload);
        this.watcher.onDidDelete(reload);
    }
}

function validate(input: unknown): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (typeof input !== 'object' || input === null) {
        return [{ path: '$', message: 'Erwartetes JSON-Objekt.' }];
    }
    const cfg = input as Record<string, unknown>;

    const dialect = cfg.dialect;
    if (typeof dialect !== 'string' || !['ldmud', 'fluffos', 'mudos'].includes(dialect)) {
        issues.push({
            path: 'dialect',
            message: 'Pflichtfeld; erlaubt: "ldmud" | "fluffos" | "mudos".'
        });
    }

    const mudlib = cfg.mudlib as Record<string, unknown> | undefined;
    if (!mudlib || typeof mudlib !== 'object') {
        issues.push({ path: 'mudlib', message: 'Pflichtfeld; Objekt erwartet.' });
    } else {
        if (typeof mudlib.name !== 'string' || !mudlib.name) {
            issues.push({ path: 'mudlib.name', message: 'Pflichtfeld; nicht-leerer String.' });
        }
        if (typeof mudlib.baseDir !== 'string' || !mudlib.baseDir) {
            issues.push({ path: 'mudlib.baseDir', message: 'Pflichtfeld; nicht-leerer String.' });
        }
        if (mudlib.includeDirs !== undefined && !Array.isArray(mudlib.includeDirs)) {
            issues.push({ path: 'mudlib.includeDirs', message: 'Array von Strings erwartet.' });
        }
    }

    const ftp = cfg.ftp as Record<string, unknown> | undefined;
    if (ftp !== undefined) {
        if (typeof ftp !== 'object' || ftp === null) {
            issues.push({ path: 'ftp', message: 'Objekt erwartet.' });
        } else {
            if (typeof ftp.host !== 'string' || !ftp.host) {
                issues.push({ path: 'ftp.host', message: 'Pflichtfeld wenn ftp gesetzt ist.' });
            }
            if (ftp.port !== undefined && typeof ftp.port !== 'number') {
                issues.push({ path: 'ftp.port', message: 'Zahl erwartet.' });
            }
            if (ftp.protocol !== undefined && !['ftp', 'sftp'].includes(ftp.protocol as string)) {
                issues.push({ path: 'ftp.protocol', message: 'Erlaubt: "ftp" | "sftp".' });
            }
        }
    }

    const mud = cfg.mud as Record<string, unknown> | undefined;
    if (mud !== undefined) {
        if (typeof mud !== 'object' || mud === null) {
            issues.push({ path: 'mud', message: 'Objekt erwartet.' });
        } else {
            if (typeof mud.host !== 'string' || !mud.host) {
                issues.push({ path: 'mud.host', message: 'Pflichtfeld wenn mud gesetzt ist.' });
            }
            if (typeof mud.user !== 'string' || !mud.user) {
                issues.push({ path: 'mud.user', message: 'Pflichtfeld wenn mud gesetzt ist.' });
            }
            if (mud.port !== undefined && typeof mud.port !== 'number') {
                issues.push({ path: 'mud.port', message: 'Zahl erwartet.' });
            }
            if (mud.protocol !== undefined && !['telnet', 'telnets'].includes(mud.protocol as string)) {
                issues.push({ path: 'mud.protocol', message: 'Erlaubt: "telnet" | "telnets".' });
            }
        }
    }

    return issues;
}
