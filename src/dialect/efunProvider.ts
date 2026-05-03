import * as vscode from 'vscode';
import { DialectId } from './dialectManager';

export interface EfunDefinition {
    name: string;
    signature: string;
    documentation?: string;
    isSimulated?: boolean;
}

export class EfunProvider {
    private definitions: Map<string, EfunDefinition> = new Map();
    private currentProfile: DialectId | undefined;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly output: vscode.OutputChannel
    ) {}

    async loadProfile(dialect: DialectId): Promise<void> {
        const profileUri = vscode.Uri.joinPath(
            this.context.extensionUri,
            'src',
            'dialect',
            'profiles',
            `${dialect}.json`
        );
        try {
            const data = await vscode.workspace.fs.readFile(profileUri);
            const parsed = JSON.parse(Buffer.from(data).toString('utf8')) as {
                efuns: EfunDefinition[];
            };
            this.definitions = new Map(parsed.efuns.map((e) => [e.name, e]));
            this.currentProfile = dialect;
            this.output.appendLine(
                `Efun-Profil geladen: ${dialect} (${this.definitions.size} Symbole).`
            );
        } catch (err) {
            this.output.appendLine(`Profil ${dialect} konnte nicht geladen werden: ${err}`);
            this.definitions.clear();
        }
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
}
