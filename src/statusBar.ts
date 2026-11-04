import * as vscode from 'vscode';
import { DialectManager } from './dialect/dialectManager';
import { EfunProvider } from './dialect/efunProvider';
import { LpcConfigService } from './config/lpcConfig';
import { ConnectionManager } from './ftp/connectionManager';
import { MudConsole } from './mud/mudConsole';
import { HomeMudService } from './homemud/homeMudService';
import { LpcIndex } from './analysis/lpcIndex';
import { ServerIndexLoader } from './analysis/serverIndexLoader';

export function createStatusBar(
    dialect: DialectManager,
    efuns: EfunProvider,
    config: LpcConfigService,
    connections: ConnectionManager,
    remoteMud: MudConsole,
    homeMud: MudConsole,
    homeMudService: HomeMudService,
    lpcIndex: LpcIndex,
    indexLoader: ServerIndexLoader
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
        dialectItem.text = indexLoader.isLoading
            ? `$(sync~spin) LPC: Mudlib-Index …`
            : `$(symbol-misc) LPC: ${dialect.current} (${efuns.size})`;
        dialectItem.tooltip =
            `Aktiver Dialekt: ${dialect.current}\n` +
            `Geladene Symbole: ${efuns.size}\n` +
            `${indexLine()}\n` +
            `Klick: Dialekt wechseln`;
    };

    const indexLine = (): string => {
        if (indexLoader.isLoading) {
            return 'Mudlib-Index: wird mit dem Server abgeglichen …';
        }
        const date = lpcIndex.indexDate;
        if (!date) {
            return homeMudService.isConfigured
                ? 'Mudlib-Index: keiner (Vererbung, Sfuns und Efun-Hilfe live aus dem homemud)'
                : 'Mudlib-Index: keiner geladen';
        }
        return (
            `Mudlib-Index: Stand ${date.toLocaleString()} (${lpcIndex.indexSource})\n` +
            `  ${lpcIndex.indexSummary}`
        );
    };

    const updateFtp = (): void => {
        const active = connections.active;
        if (active) {
            ftpItem.text = `$(plug) ${protocolLabel(active.protocol)}: ${active.host}`;
            ftpItem.tooltip = `Verbunden als ${active.user}@${active.host} (${active.protocol})\nKlick: Trennen`;
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
            item.tooltip = `${mud.label}-Terminal verbunden\nKlick: Terminal öffnen`;
        } else {
            item.text = `$(circle-slash) ${mud.label}: ${host}`;
            item.tooltip = `${mud.label}-Terminal nicht verbunden\nKlick: Terminal öffnen und verbinden`;
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
        lpcIndex.onDidChangeIndex(updateDialect),
        indexLoader.onDidChangeLoading(updateDialect),
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

function protocolLabel(p: string): string {
    switch (p) {
        case 'ftps-implicit':
            return 'FTPS-I';
        case 'ftps':
            return 'FTPS';
        case 'sftp':
            return 'SFTP';
        default:
            return 'FTP';
    }
}
