import * as vscode from 'vscode';
import { EfunProvider } from '../dialect/efunProvider';
import { LpcIndex, bestPerName } from '../analysis/lpcIndex';
import { parseDocument } from '../analysis/documentCache';
import { LpcFunction } from '../analysis/lpcParser';

const LPC_SELECTOR: vscode.DocumentSelector = [
    { language: 'lpc', scheme: 'file' },
    { language: 'lpc', scheme: 'lpc-ftp' }
];

export function registerHoverProvider(
    context: vscode.ExtensionContext,
    efuns: EfunProvider,
    index: LpcIndex
): void {
    const provider: vscode.HoverProvider = {
        async provideHover(document, position) {
            const range = document.getWordRangeAtPosition(position, /[A-Za-z_]\w*/);
            if (!range) return undefined;
            const word = document.getText(range);

            // 1. Funktion dieser Datei (überdeckt gleichnamige Efuns)
            const own = bestPerName(parseDocument(document).functions).find((f) => f.name === word);
            if (own) {
                return new vscode.Hover(functionHover(own, '*Funktion in dieser Datei*'), range);
            }

            // 2. Geerbte Funktion (nur mit homemud)
            const inherited = await index.findInherited(document, word);
            if (inherited) {
                const chain = inherited.via.length > 1 ? ` (über ${inherited.via.slice(0, -1).join(' → ')})` : '';
                return new vscode.Hover(
                    functionHover(inherited, `*Geerbt aus \`${inherited.mudPath}\`${chain}*`),
                    range
                );
            }

            // 3. Efun / Sfun
            const def = efuns.lookup(word);
            if (!def) return undefined;
            const md = new vscode.MarkdownString();
            const efunDoc = !def.isSimulated && !def.documentation ? await index.efunDocs.get(word) : undefined;
            if (efunDoc) {
                md.appendMarkdown(efunDoc.markdown);
            } else {
                md.appendCodeblock(def.signature, 'lpc');
                if (def.documentation) md.appendMarkdown('\n---\n' + def.documentation);
            }
            if (def.isSimulated) {
                const where = def.location ? ` aus \`${index.mudPathOf(def.location.uri)}\`` : '';
                md.appendMarkdown(`\n\n*Simulierte Efun (sfun)${where}*`);
            } else {
                md.appendMarkdown('\n\n*Driver-Efun*');
            }
            return new vscode.Hover(md, range);
        }
    };
    context.subscriptions.push(vscode.languages.registerHoverProvider(LPC_SELECTOR, provider));
}

function functionHover(fn: LpcFunction, origin: string): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.appendCodeblock(fn.declaration ?? fn.signature, 'lpc');
    if (fn.documentation) md.appendMarkdown('\n---\n' + fn.documentation);
    md.appendMarkdown('\n\n' + origin);
    return md;
}
