import * as vscode from 'vscode';
import { EfunProvider, EfunDefinition } from '../dialect/efunProvider';
import { LpcIndex, bestPerName } from '../analysis/lpcIndex';
import { parseDocument } from '../analysis/documentCache';
import { LpcFunction } from '../analysis/lpcParser';

// Efun-Vorschlag, dessen Hilfe erst beim Auswählen nachgeladen wird.
class EfunCompletionItem extends vscode.CompletionItem {
    efunName?: string;
}

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
    efuns: EfunProvider,
    index: LpcIndex
): void {
    const provider: vscode.CompletionItemProvider<EfunCompletionItem> = {
        async provideCompletionItems(document, position) {
            const linePrefix = document
                .lineAt(position)
                .text.substring(0, position.character);

            // Innerhalb von Strings/Kommentaren keine Vorschläge.
            if (isInsideString(linePrefix) || isInsideLineComment(linePrefix)) {
                return undefined;
            }

            const items: vscode.CompletionItem[] = [];
            const seen = new Set<string>();

            // 1. Funktionen dieser Datei
            for (const fn of bestPerName(parseDocument(document).functions)) {
                seen.add(fn.name);
                items.push(buildFunctionItem(fn, 'Funktion in dieser Datei', '0_'));
            }

            // 2. Geerbte Funktionen (nur mit homemud)
            for (const fn of await index.inheritedFunctions(document)) {
                if (seen.has(fn.name)) continue;
                seen.add(fn.name);
                items.push(buildFunctionItem(fn, 'Geerbt aus ' + fn.mudPath, '1_'));
            }

            // 3. Efuns und Sfuns — außer sie werden von einer eigenen Funktion überdeckt
            for (const def of efuns.list()) {
                if (seen.has(def.name)) continue;
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
        },

        async resolveCompletionItem(item) {
            if (item.efunName && !item.documentation) {
                const doc = await index.efunDoc(item.efunName);
                if (doc) item.documentation = new vscode.MarkdownString(doc.markdown);
            }
            return item;
        }
    };

    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(LPC_SELECTOR, provider)
    );
}

function buildFunctionItem(fn: LpcFunction, origin: string, sortPrefix: string): vscode.CompletionItem {
    const signature = fn.declaration ?? fn.signature;
    const item = new vscode.CompletionItem(fn.name, vscode.CompletionItemKind.Function);
    item.detail = signature;
    const md = new vscode.MarkdownString();
    if (fn.documentation) md.appendMarkdown(fn.documentation + '\n\n');
    md.appendMarkdown('*' + origin + '*');
    item.documentation = md;
    item.insertText = snippetFor(fn.name, signature);
    item.sortText = sortPrefix + fn.name;
    return item;
}

function buildEfunItem(def: EfunDefinition): EfunCompletionItem {
    const item = new EfunCompletionItem(
        def.name,
        def.isSimulated ? vscode.CompletionItemKind.Method : vscode.CompletionItemKind.Function
    );
    item.detail = def.signature;
    if (def.documentation) {
        item.documentation = new vscode.MarkdownString(def.documentation);
    } else if (!def.isSimulated) {
        item.efunName = def.name;
    }
    item.insertText = snippetFor(def.name, def.signature);
    item.sortText = def.isSimulated ? '3_' + def.name : '2_' + def.name;
    return item;
}

// Snippet mit Parameter-Tabstops, falls die Signatur Parameter enthält.
function snippetFor(name: string, signature: string): vscode.SnippetString | undefined {
    const params = extractParameters(signature);
    if (params.length > 0) {
        const snippet = new vscode.SnippetString(`${name}(`);
        params.forEach((p, i) => {
            if (i > 0) snippet.appendText(', ');
            snippet.appendPlaceholder(p);
        });
        snippet.appendText(')');
        return snippet;
    }
    return signature.includes('(') ? new vscode.SnippetString(`${name}($0)`) : undefined;
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
