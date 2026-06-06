import * as vscode from 'vscode';
import { EfunProvider } from '../dialect/efunProvider';

const LPC_SELECTOR: vscode.DocumentSelector = [
    { language: 'lpc', scheme: 'file' },
    { language: 'lpc', scheme: 'lpc-ftp' }
];

export function registerHoverProvider(
    context: vscode.ExtensionContext,
    efuns: EfunProvider
): void {
    const provider: vscode.HoverProvider = {
        provideHover(document, position) {
            const range = document.getWordRangeAtPosition(position, /[A-Za-z_]\w*/);
            if (!range) return undefined;
            const word = document.getText(range);
            const def = efuns.lookup(word);
            if (!def) return undefined;

            const md = new vscode.MarkdownString();
            md.appendCodeblock(def.signature, 'lpc');
            if (def.documentation) {
                md.appendMarkdown('\n---\n' + def.documentation);
            }
            md.appendMarkdown(
                `\n\n*${def.isSimulated ? 'Simulierte Efun (sfun)' : 'Driver-Efun'}*`
            );
            return new vscode.Hover(md, range);
        }
    };
    context.subscriptions.push(vscode.languages.registerHoverProvider(LPC_SELECTOR, provider));
}
