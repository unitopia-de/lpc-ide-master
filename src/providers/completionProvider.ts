import * as vscode from 'vscode';
import { EfunProvider, EfunDefinition } from '../dialect/efunProvider';

const LPC_SELECTOR: vscode.DocumentSelector = [
    { language: 'lpc', scheme: 'file' },
    { language: 'lpc', scheme: 'lpc-ftp' }
];

const KEYWORDS = [
    'if', 'else', 'for', 'foreach', 'while', 'do', 'switch', 'case', 'default',
    'break', 'continue', 'return', 'inherit', 'include',
    'private', 'public', 'protected', 'static', 'nomask', 'varargs', 'deprecated',
    'create', 'init', 'reset'
];

const TYPES = [
    'int', 'string', 'object', 'lwobject', 'mapping', 'mixed', 'float', 'void',
    'status', 'closure', 'symbol', 'struct', 'bytes', 'coroutine', 'lpctype'
];

export function registerCompletionProvider(
    context: vscode.ExtensionContext,
    efuns: EfunProvider
): void {
    const provider: vscode.CompletionItemProvider = {
        provideCompletionItems(document, position) {
            const linePrefix = document
                .lineAt(position)
                .text.substring(0, position.character);

            // Innerhalb von Strings/Kommentaren keine Vorschläge.
            if (isInsideString(linePrefix) || isInsideLineComment(linePrefix)) {
                return undefined;
            }

            const items: vscode.CompletionItem[] = [];

            for (const def of efuns.list()) {
                items.push(buildEfunItem(def));
            }

            for (const kw of KEYWORDS) {
                const item = new vscode.CompletionItem(kw, vscode.CompletionItemKind.Keyword);
                items.push(item);
            }

            for (const t of TYPES) {
                const item = new vscode.CompletionItem(t, vscode.CompletionItemKind.TypeParameter);
                items.push(item);
            }

            return items;
        }
    };

    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(LPC_SELECTOR, provider)
    );
}

function buildEfunItem(def: EfunDefinition): vscode.CompletionItem {
    const item = new vscode.CompletionItem(
        def.name,
        def.isSimulated ? vscode.CompletionItemKind.Method : vscode.CompletionItemKind.Function
    );
    item.detail = def.signature;
    if (def.documentation) {
        item.documentation = new vscode.MarkdownString(def.documentation);
    }

    // Snippet-Insertion mit Parameter-Tabstops, falls Signatur Parameter enthält.
    const params = extractParameters(def.signature);
    if (params.length > 0) {
        const snippet = new vscode.SnippetString(`${def.name}(`);
        params.forEach((p, i) => {
            if (i > 0) snippet.appendText(', ');
            snippet.appendPlaceholder(p);
        });
        snippet.appendText(')');
        item.insertText = snippet;
    } else if (def.signature.includes('(')) {
        item.insertText = new vscode.SnippetString(`${def.name}($0)`);
    }

    item.sortText = def.isSimulated ? '1_' + def.name : '0_' + def.name;
    return item;
}

// Extrahiert die Parameter-Namen aus einer Signatur grob heuristisch.
// "void write(mixed msg)" -> ["msg"]
// "object find_player(string name)" -> ["name"]
// "void say(string msg, mixed exclude)" -> ["msg", "exclude"]
function extractParameters(signature: string): string[] {
    const m = signature.match(/\(([^)]*)\)/);
    if (!m) return [];
    const inside = m[1].trim();
    if (!inside || inside === 'void') return [];
    return inside
        .split(',')
        .map((p) => {
            // Letztes Wort vor `=`/`default` ist der Parameter-Name.
            const cleaned = p.split(/=|default/)[0].trim();
            const tokens = cleaned.split(/\s+/);
            return tokens[tokens.length - 1].replace(/[*&\[\].]+/g, '');
        })
        .filter((s) => s && /^[A-Za-z_]\w*$/.test(s));
}

function isInsideString(linePrefix: string): boolean {
    let inString = false;
    for (let i = 0; i < linePrefix.length; i++) {
        const ch = linePrefix[i];
        if (ch === '\\') {
            i++;
            continue;
        }
        if (ch === '"') inString = !inString;
    }
    return inString;
}

function isInsideLineComment(linePrefix: string): boolean {
    return /(^|[^:])\/\//.test(linePrefix);
}
