import * as vscode from 'vscode';
import { DialectId } from './dialectManager';
import { LpcConfigService } from '../config/lpcConfig';

export interface EfunDefinition {
    name: string;
    signature: string;
    documentation?: string;
    isSimulated?: boolean;
}

interface ProfileFile {
    efuns?: EfunDefinition[];
    sfuns?: EfunDefinition[];
}

export class EfunProvider {
    private definitions: Map<string, EfunDefinition> = new Map();
    private currentProfile: DialectId | undefined;
    private readonly emitter = new vscode.EventEmitter<void>();
    readonly onDidChange = this.emitter.event;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly output: vscode.OutputChannel,
        private readonly config?: LpcConfigService
    ) {}

    async loadProfile(dialect: DialectId): Promise<void> {
        this.definitions.clear();
        this.currentProfile = dialect;

        // 1. Eingebautes Profil aus dem Extension-Bundle.
        const builtIn = await this.readJson(
            vscode.Uri.joinPath(
                this.context.extensionUri,
                'resources',
                'profiles',
                `${dialect}.json`
            ),
            `Profil ${dialect}`
        );
        if (builtIn) {
            this.merge(builtIn);
        }

        // 2. Optionales workspace-spezifisches Profil aus lpc-config.json
        //    -> mudlib.efunDefinitions (relativ zum Workspace-Root).
        const cfg = this.config?.value;
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (cfg?.mudlib?.efunDefinitions && folder) {
            const userUri = vscode.Uri.joinPath(folder.uri, cfg.mudlib.efunDefinitions);
            const userProfile = await this.readJson(
                userUri,
                `Workspace-Profil ${cfg.mudlib.efunDefinitions}`
            );
            if (userProfile) {
                this.merge(userProfile);
            }
        }

        this.output.appendLine(
            `Efun-Profil aktiv: ${dialect} (${this.definitions.size} Symbole).`
        );
        this.emitter.fire();
    }

    lookup(name: string): EfunDefinition | undefined {
        return this.definitions.get(name);
    }

    list(): EfunDefinition[] {
        return Array.from(this.definitions.values());
    }

    get profile(): DialectId | undefined {
        return this.currentProfile;
    }

    get size(): number {
        return this.definitions.size;
    }

    private merge(profile: ProfileFile): void {
        for (const e of profile.efuns ?? []) {
            this.definitions.set(e.name, e);
        }
        for (const s of profile.sfuns ?? []) {
            this.definitions.set(s.name, { ...s, isSimulated: true });
        }
    }

    private async readJson(uri: vscode.Uri, label: string): Promise<ProfileFile | undefined> {
        try {
            const data = await vscode.workspace.fs.readFile(uri);
            return JSON.parse(Buffer.from(data).toString('utf8')) as ProfileFile;
        } catch (err) {
            this.output.appendLine(`${label} nicht ladbar (${uri.fsPath}): ${err}`);
            return undefined;
        }
    }
}
