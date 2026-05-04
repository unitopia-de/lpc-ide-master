import * as vscode from 'vscode';
import { DialectManager } from './dialect/dialectManager';
import { EfunProvider } from './dialect/efunProvider';
import { LpcConfigService } from './config/lpcConfig';
import { ConnectionManager } from './ftp/connectionManager';

export function createStatusBar(
    dialect: DialectManager,
    efuns: EfunProvider,
    config: LpcConfigService,
    connections: ConnectionManager
): vscode.Disposable {
    const dialectItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    dialectItem.command = 'lpc.switchDialect';

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

    const ftpItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);

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

    updateDialect();
    updateFtp();
    dialectItem.show();
    ftpItem.show();

    const subs = [
        dialect.onDidChange(updateDialect),
        efuns.onDidChange(updateDialect),
        config.onDidChange(() => {
            updateDialect();
            updateFtp();
        }),
        connections.onDidChangeConnection(updateFtp)
    ];

    return new vscode.Disposable(() => {
        subs.forEach((s) => s.dispose());
        dialectItem.dispose();
        ftpItem.dispose();
    });
}
