import * as vscode from 'vscode';
import { DialectManager } from './dialect/dialectManager';

export function createStatusBar(dialect: DialectManager): vscode.Disposable {
    const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    item.command = 'lpc.switchDialect';
    item.tooltip = 'LPC-Dialekt wechseln';

    const update = (): void => {
        item.text = `$(symbol-misc) LPC: ${dialect.current}`;
    };
    update();
    item.show();

    const sub = dialect.onDidChange(update);
    return new vscode.Disposable(() => {
        sub.dispose();
        item.dispose();
    });
}
