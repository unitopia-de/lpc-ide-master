import * as vscode from 'vscode';
import { DialectManager } from './dialect/dialectManager';
import { EfunProvider } from './dialect/efunProvider';
import { LpcConfigService } from './config/lpcConfig';
import { ConnectionManager } from './ftp/connectionManager';
import { MudConsole } from './mud/mudConsole';

export function createStatusBar(
    dialect: DialectManager,
    efuns: EfunProvider,
    config: LpcConfigService,
    connections: ConnectionManager,
    mud: MudConsole
): vscode.Disposable {
    const dialectItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    dialectItem.command = 'lpc.switchDialect';

    const ftpItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    const mudItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 98);

    const updateDialect = (): void => {
        const issues = config.issues;
        if (issues.length > 0) {
            dialectItem.text = `$(error) LPC: Konfig fehlerhaft`;
            dialectItem.tooltip = issues.map((i) => `${i.path}: ${i.message}`).join('\n');
            return;
        }
        dialectItem.text = `$(symbol-misc) LPC: ${dialect.current} (${efuns.size})`;
        dialectItem.tooltip =
            `Aktiver Dialekt: ${dialect.current}\n` +
            `Geladene Symbole: ${efuns.size}\n` +
            `Klick: Dialekt wechseln`;
    };

    const updateFtp = (): void => {
        const active = connections.active;
        if (active) {
            ftpItem.text = `$(plug) ${active.protocol.toUpperCase()}: ${active.host}`;
            ftpItem.tooltip = `Verbunden als ${active.user}@${active.host}\nKlick: Trennen`;
            ftpItem.command = 'lpc.disconnect';
        } else {
            const cfg = config.value?.ftp;
            if (cfg?.host) {
                ftpItem.text = `$(circle-slash) FTP: ${cfg.host}`;
                ftpItem.tooltip = `Nicht verbunden\nKlick: Verbinden`;
                ftpItem.command = 'lpc.connect';
            } else {
                ftpItem.text = `$(circle-slash) FTP: kein Host`;
                ftpItem.tooltip = 'lpc-config.json: ftp.host fehlt';
                ftpItem.command = 'lpc.reloadConfig';
            }
        }
        ftpItem.show();
    };

    const updateMud = (): void => {
        const cfg = config.value?.mud;
        if (!cfg?.host) {
            mudItem.hide();
            return;
        }
        if (mud.isConnected) {
            mudItem.text = `$(terminal) MUD: ${cfg.host}`;
            mudItem.tooltip = `MUD-Konsole verbunden\nKlick: Output anzeigen`;
            mudItem.command = 'lpc.openMudConsole';
        } else {
            mudItem.text = `$(circle-slash) MUD: ${cfg.host}`;
            mudItem.tooltip = `MUD-Konsole nicht verbunden\nKlick: Konsole anzeigen`;
            mudItem.command = 'lpc.openMudConsole';
        }
        mudItem.show();
    };

    updateDialect();
    updateFtp();
    updateMud();
    dialectItem.show();

    const subs = [
        dialect.onDidChange(updateDialect),
        efuns.onDidChange(updateDialect),
        config.onDidChange(() => {
            updateDialect();
            updateFtp();
            updateMud();
        }),
        connections.onDidChangeConnection(updateFtp),
        mud.onDidChangeConnection(updateMud)
    ];

    return new vscode.Disposable(() => {
        subs.forEach((s) => s.dispose());
        dialectItem.dispose();
        ftpItem.dispose();
        mudItem.dispose();
    });
}
