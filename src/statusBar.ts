import * as vscode from 'vscode';
import { DialectManager } from './dialect/dialectManager';
import { EfunProvider } from './dialect/efunProvider';
import { LpcConfigService } from './config/lpcConfig';
import { ConnectionManager } from './ftp/connectionManager';
import { MudConsole } from './mud/mudConsole';
import { HomeMudService } from './homemud/homeMudService';

export function createStatusBar(
    dialect: DialectManager,
    efuns: EfunProvider,
    config: LpcConfigService,
    connections: ConnectionManager,
    remoteMud: MudConsole,
    homeMud: MudConsole,
    homeMudService: HomeMudService
): vscode.Disposable {
    const dialectItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    dialectItem.command = 'lpc.switchDialect';

    const ftpItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    const remoteMudItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 98);
    const homeMudItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 97);

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
                ftpItem.hide();
                return;
            }
        }
        ftpItem.show();
    };

    const updateMudItem = (
        item: vscode.StatusBarItem,
        mud: MudConsole,
        connectCmd: string
    ): void => {
        if (!mud.isConfigured) {
            item.hide();
            return;
        }
        const host = mud.host ?? '?';
        if (mud.isConnected) {
            item.text = `$(terminal) ${mud.label}: ${host}`;
            item.tooltip = `${mud.label}-Konsole verbunden\nKlick: Output anzeigen`;
        } else {
            item.text = `$(circle-slash) ${mud.label}: ${host}`;
            item.tooltip = `${mud.label}-Konsole nicht verbunden\nKlick: Output anzeigen`;
        }
        item.command = connectCmd;
        item.show();
    };

    const updateHome = (): void => {
        const cfg = config.value?.homemud;
        if (homeMud.isConfigured) {
            updateMudItem(homeMudItem, homeMud, 'lpc.openHomeMudConsole');
            return;
        }
        if (cfg?.path && homeMudService.localRoot) {
            // Konfigurierter homemud ohne Telnet — trotzdem als Hinweis anzeigen.
            homeMudItem.text = `$(home) homemud: ${cfg.path}`;
            homeMudItem.tooltip = `Lokaler MUD-Pfad: ${homeMudService.localRoot.fsPath}`;
            homeMudItem.command = 'lpc.revealHomeMud';
            homeMudItem.show();
        } else {
            homeMudItem.hide();
        }
    };

    updateDialect();
    updateFtp();
    updateMudItem(remoteMudItem, remoteMud, 'lpc.openRemoteMudConsole');
    updateHome();
    dialectItem.show();

    const subs = [
        dialect.onDidChange(updateDialect),
        efuns.onDidChange(updateDialect),
        config.onDidChange(() => {
            updateDialect();
            updateFtp();
            updateMudItem(remoteMudItem, remoteMud, 'lpc.openRemoteMudConsole');
            updateHome();
        }),
        connections.onDidChangeConnection(updateFtp),
        remoteMud.onDidChangeConnection(() =>
            updateMudItem(remoteMudItem, remoteMud, 'lpc.openRemoteMudConsole')
        ),
        homeMud.onDidChangeConnection(updateHome)
    ];

    return new vscode.Disposable(() => {
        subs.forEach((s) => s.dispose());
        dialectItem.dispose();
        ftpItem.dispose();
        remoteMudItem.dispose();
        homeMudItem.dispose();
    });
}
