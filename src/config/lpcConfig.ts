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

export interface LpcConfig {
    dialect: 'ldmud' | 'fluffos' | 'mudos';
    version?: string;
    mudlib: MudlibConfig;
    ftp?: FtpConfig;
}

export class LpcConfigService {
    private current: LpcConfig | undefined;
    private readonly emitter = new vscode.EventEmitter<LpcConfig | undefined>();
    readonly onDidChange = this.emitter.event;

    constructor(private readonly output: vscode.OutputChannel) {}

    get value(): LpcConfig | undefined {
        return this.current;
    }

    async load(): Promise<LpcConfig | undefined> {
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (!folder) {
            return undefined;
        }
        const settings = vscode.workspace.getConfiguration('lpc');
        const fileName = settings.get<string>('configFile', 'lpc-config.json');
        const uri = vscode.Uri.joinPath(folder.uri, fileName);

        try {
            const data = await vscode.workspace.fs.readFile(uri);
            const parsed = JSON.parse(Buffer.from(data).toString('utf8')) as LpcConfig;
            this.current = parsed;
            this.output.appendLine(`Konfiguration geladen: ${uri.fsPath}`);
            this.emitter.fire(parsed);
            return parsed;
        } catch (err) {
            this.output.appendLine(`Keine lpc-config.json gefunden (${uri.fsPath}).`);
            return undefined;
        }
    }
}
