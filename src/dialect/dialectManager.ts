import * as vscode from 'vscode';
import { LpcConfigService } from '../config/lpcConfig';
import { EfunProvider } from './efunProvider';

export type DialectId = 'ldmud-unitopia' | 'ldmud-morgengrauen' | 'fluffos';

const DEFAULT_DIALECT: DialectId = 'ldmud-unitopia';

interface DiscoveryHint {
    dialect: DialectId;
    reason: string;
}

export class DialectManager implements vscode.Disposable {
    private active: DialectId = DEFAULT_DIALECT;
    private readonly emitter = new vscode.EventEmitter<DialectId>();
    readonly onDidChange = this.emitter.event;

    private configSub: vscode.Disposable | undefined;

    constructor(
        private readonly config: LpcConfigService,
        private readonly efuns: EfunProvider,
        private readonly output: vscode.OutputChannel
    ) {}

    async initialize(): Promise<void> {
        const settings = vscode.workspace.getConfiguration('lpc');
        const auto = settings.get<boolean>('dialect.autoDetect', true);
        if (auto) {
            const hint = await this.detect();
            if (hint) {
                this.active = hint.dialect;
                this.output.appendLine(`Auto-Discovery: ${hint.dialect} (${hint.reason}).`);
            }
        }
        await this.efuns.loadProfile(this.active);
        this.output.appendLine(`Aktiver Dialekt: ${this.active}`);

        // Bei Config-Reload neu prüfen, ob ein anderer Dialekt passt.
        this.configSub = this.config.onDidChange(async () => {
            const hint = await this.detect();
            if (hint && hint.dialect !== this.active) {
                this.output.appendLine(
                    `Konfig geändert — wechsle Dialekt: ${this.active} -> ${hint.dialect} (${hint.reason}).`
                );
                await this.setActive(hint.dialect);
            } else {
                // Profil neu laden, falls efunDefinitions geändert wurde.
                await this.efuns.loadProfile(this.active);
            }
        });
    }

    get current(): DialectId {
        return this.active;
    }

    async setActive(dialect: DialectId): Promise<void> {
        this.active = dialect;
        await this.efuns.loadProfile(dialect);
        this.output.appendLine(`Dialekt gewechselt auf: ${dialect}`);
        this.emitter.fire(dialect);
    }

    listAvailable(): DialectId[] {
        return ['ldmud-unitopia', 'ldmud-morgengrauen', 'fluffos'];
    }

    dispose(): void {
        this.configSub?.dispose();
        this.emitter.dispose();
    }

    private async detect(): Promise<DiscoveryHint | undefined> {
        // 1. Heuristik aus lpc-config.json (mudlib.name, dialect)
        const cfg = this.config.value;
        if (cfg?.mudlib?.name) {
            const name = cfg.mudlib.name.toLowerCase();
            if (name.includes('uni')) {
                return { dialect: 'ldmud-unitopia', reason: `mudlib.name="${cfg.mudlib.name}"` };
            }
            if (name.includes('mg') || name.includes('morgen')) {
                return { dialect: 'ldmud-morgengrauen', reason: `mudlib.name="${cfg.mudlib.name}"` };
            }
        }
        if (cfg?.dialect === 'fluffos') {
            return { dialect: 'fluffos', reason: 'dialect="fluffos" in lpc-config.json' };
        }

        // 2. Heuristik anhand vorhandener Dateien im Workspace
        const fileHint = await this.findSignatureFile();
        if (fileHint) {
            return fileHint;
        }

        return undefined;
    }

    private async findSignatureFile(): Promise<DiscoveryHint | undefined> {
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (!folder) {
            return undefined;
        }

        // findFiles ist case-insensitive auf Windows, aber nicht auf Linux —
        // wir suchen daher mit mehreren Patterns.
        const patterns: { glob: string; hint: DiscoveryHint }[] = [
            {
                glob: '**/secure/master.c',
                hint: { dialect: 'ldmud-unitopia', reason: 'secure/master.c gefunden' }
            },
            {
                glob: '**/sys/include/lpctypes.h',
                hint: { dialect: 'ldmud-unitopia', reason: 'sys/include/lpctypes.h gefunden' }
            },
            {
                glob: '**/master.c',
                hint: { dialect: 'ldmud-unitopia', reason: 'master.c gefunden (LDMud-Annahme)' }
            },
            {
                glob: '**/lpctypes.h',
                hint: { dialect: 'ldmud-unitopia', reason: 'lpctypes.h gefunden (LDMud-Annahme)' }
            }
        ];

        for (const p of patterns) {
            const found = await vscode.workspace.findFiles(p.glob, '**/node_modules/**', 1);
            if (found.length > 0) {
                return p.hint;
            }
        }
        return undefined;
    }
}
