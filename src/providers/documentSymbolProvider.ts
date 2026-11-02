import * as vscode from 'vscode';
import { parseDocument } from '../analysis/documentCache';
import { bestPerName } from '../analysis/lpcIndex';

const LPC_SELECTOR: vscode.DocumentSelector = [
    { language: 'lpc', scheme: 'file' },
    { language: 'lpc', scheme: 'lpc-ftp' }
];

export function registerDocumentSymbolProvider(
    context: vscode.ExtensionContext
): void {
    const provider: vscode.DocumentSymbolProvider = {
        provideDocumentSymbols(document) {
            const parsed = parseDocument(document);
            const symbols: vscode.DocumentSymbol[] = [];

            for (const inh of parsed.inherits) {
                const range = rangeFor(document, inh.offset, inh.length);
                symbols.push(
                    new vscode.DocumentSymbol(
                        inh.expression.replace(/^"(.*)"$/, '$1'),
                        'inherit',
                        vscode.SymbolKind.Module,
                        range,
                        range
                    )
                );
            }

            // Pro Name ein Eintrag — die Definition, sonst der Prototyp.
            for (const fn of bestPerName(parsed.functions)) {
                const range = rangeFor(document, fn.declOffset, fn.declLength);
                const selection = rangeFor(document, fn.offset, fn.name.length);
                symbols.push(
                    new vscode.DocumentSymbol(
                        fn.name,
                        fn.signature + (fn.isPrototype ? '   [Prototyp]' : ''),
                        vscode.SymbolKind.Function,
                        range,
                        selection
                    )
                );
            }

            for (const v of parsed.variables) {
                const range = rangeFor(document, v.offset, v.length);
                symbols.push(
                    new vscode.DocumentSymbol(v.name, v.type, vscode.SymbolKind.Variable, range, range)
                );
            }

            return symbols.sort((a, b) => a.range.start.compareTo(b.range.start));
        }
    };

    context.subscriptions.push(
        vscode.languages.registerDocumentSymbolProvider(LPC_SELECTOR, provider)
    );
}

function rangeFor(document: vscode.TextDocument, offset: number, length: number): vscode.Range {
    return new vscode.Range(document.positionAt(offset), document.positionAt(offset + length));
}
