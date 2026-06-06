import * as vscode from 'vscode';

const LPC_SELECTOR: vscode.DocumentSelector = [
    { language: 'lpc', scheme: 'file' },
    { language: 'lpc', scheme: 'lpc-ftp' }
];

const TYPE_KW =
    '(?:void|int|float|string|bytes|object|lwobject|mapping|mixed|closure|symbol|coroutine|lpctype|status|struct\\s+\\w+)';
const TYPE_PATTERN = `${TYPE_KW}(?:\\s*\\*)?(?:\\s*\\|\\s*${TYPE_KW}(?:\\s*\\*)?)*`;
const MOD_PATTERN = '(?:public|protected|private|static|nomask|varargs|deprecated|noshadow)';

// Funktion: optional modifier(s), Returntyp, Name, Parameter, dann '{' oder ';'
const FUNC_REGEX = new RegExp(
    `^[ \\t]*((?:${MOD_PATTERN}\\s+)*)(${TYPE_PATTERN})\\s+(\\w+)\\s*\\(([^)]*)\\)\\s*[\\{;]`,
    'gm'
);

const INHERIT_REGEX = /^\s*inherit\s+"([^"]+)"/gm;
const VARIABLE_REGEX = new RegExp(
    `^[ \\t]*((?:${MOD_PATTERN}\\s+)*)(${TYPE_PATTERN})\\s+(\\w+)\\s*[=;]`,
    'gm'
);

export function registerDocumentSymbolProvider(
    context: vscode.ExtensionContext
): void {
    const provider: vscode.DocumentSymbolProvider = {
        provideDocumentSymbols(document) {
            const text = stripCommentsAndStrings(document.getText());
            const symbols: vscode.DocumentSymbol[] = [];

            for (const m of text.matchAll(INHERIT_REGEX)) {
                const path = m[1];
                const range = rangeFor(document, m.index ?? 0, m[0].length);
                symbols.push(
                    new vscode.DocumentSymbol(
                        path,
                        'inherit',
                        vscode.SymbolKind.Module,
                        range,
                        range
                    )
                );
            }

            for (const m of text.matchAll(FUNC_REGEX)) {
                const mods = m[1].trim();
                const ret = m[2].trim().replace(/\s+/g, ' ');
                const name = m[3];
                const args = m[4].trim().replace(/\s+/g, ' ');
                const detail = `${ret} ${name}(${args})${mods ? `   [${mods}]` : ''}`;
                const range = rangeFor(document, m.index ?? 0, m[0].length);
                symbols.push(
                    new vscode.DocumentSymbol(
                        name,
                        detail,
                        vscode.SymbolKind.Function,
                        range,
                        range
                    )
                );
            }

            // Globale Variablen: nur die, die NICHT als Funktion erkannt wurden.
            const fnNames = new Set(symbols.filter((s) => s.kind === vscode.SymbolKind.Function).map((s) => s.name));
            for (const m of text.matchAll(VARIABLE_REGEX)) {
                const ret = m[2].trim().replace(/\s+/g, ' ');
                const name = m[3];
                if (fnNames.has(name)) continue;
                const range = rangeFor(document, m.index ?? 0, m[0].length);
                symbols.push(
                    new vscode.DocumentSymbol(
                        name,
                        ret,
                        vscode.SymbolKind.Variable,
                        range,
                        range
                    )
                );
            }

            return symbols;
        }
    };

    context.subscriptions.push(
        vscode.languages.registerDocumentSymbolProvider(LPC_SELECTOR, provider)
    );
}

function rangeFor(document: vscode.TextDocument, offset: number, length: number): vscode.Range {
    return new vscode.Range(document.positionAt(offset), document.positionAt(offset + length));
}

// Kommentare und Strings durch Leerzeichen gleicher Länge ersetzen, damit
// Offsets im Original-Dokument gültig bleiben.
function stripCommentsAndStrings(text: string): string {
    const out: string[] = [];
    let i = 0;
    const n = text.length;
    while (i < n) {
        const ch = text[i];
        const next = text[i + 1];
        if (ch === '/' && next === '/') {
            while (i < n && text[i] !== '\n') {
                out.push(text[i] === '\n' ? '\n' : ' ');
                i++;
            }
        } else if (ch === '/' && next === '*') {
            const end = text.indexOf('*/', i + 2);
            const stop = end === -1 ? n : end + 2;
            for (let j = i; j < stop; j++) out.push(text[j] === '\n' ? '\n' : ' ');
            i = stop;
        } else if (ch === '"') {
            out.push('"');
            i++;
            while (i < n && text[i] !== '"') {
                if (text[i] === '\\' && i + 1 < n) {
                    out.push(' ', ' ');
                    i += 2;
                    continue;
                }
                out.push(text[i] === '\n' ? '\n' : ' ');
                i++;
            }
            if (i < n) {
                out.push('"');
                i++;
            }
        } else {
            out.push(ch);
            i++;
        }
    }
    return out.join('');
}
