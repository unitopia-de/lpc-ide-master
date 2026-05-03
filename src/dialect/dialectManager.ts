import * as vscode from 'vscode';
import { LpcConfigService } from '../config/lpcConfig';
import { EfunProvider } from './efunProvider';

export type DialectId = 'ldmud-unitopia' | 'ldmud-morgengrauen' | 'fluffos';

const DEFAULT_DIALECT: DialectId = 'ldmud-unitopia';

export class DialectManager {
    private active: DialectId = DEFAULT_DIALECT;
    private readonly emitter = new vscode.EventEmitter<DialectId>();
    readonly onDidChange = this.emitter.event;

    constructor(
        private readonly config: LpcConfigService,
        private readonly efuns: EfunProvider,
        private readonly output: vscode.OutputChannel
    ) {}

    async initialize(): Promise<void> {
        const settings = vscode.workspace.getConfiguration('lpc');
        const auto = settings.get<boolean>('dialect.autoDetect', true);
        if (auto) {
            const detected = await this.detect();
            if (detected) {
                this.active = detected;
            }
        }
        await this.efuns.loadProfile(this.active);
        this.output.appendLine(`Aktiver Dialekt: ${this.active}`);
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

    private async detect(): Promise<DialectId | undefined> {
        const cfg = this.config.value;
        if (cfg?.mudlib?.name) {
            const name = cfg.mudlib.name.toLowerCase();
            if (name.includes('uni')) return 'ldmud-unitopia';
            if (name.includes('mg') || name.includes('morgen')) return 'ldmud-morgengrauen';
            if (cfg.dialect === 'fluffos') return 'fluffos';
        }
        // Heuristik anhand vorhandener Dateien (master.c, lpctypes.h, ...) folgt in Phase 1.
        return undefined;
    }
}
