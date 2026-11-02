import * as vscode from 'vscode';
import { EfunProvider } from '../dialect/efunProvider';
import { LpcIndex, bestPerName } from '../analysis/lpcIndex';
import { parseDocument } from '../analysis/documentCache';

const LPC_SELECTOR: vscode.DocumentSelector = [
    { language: 'lpc', scheme: 'file' },
    { language: 'lpc', scheme: 'lpc-ftp' }
];

export function registerSignatureHelpProvider(
    context: vscode.ExtensionContext,
    efuns: EfunProvider,
    index: LpcIndex
): void {
    const provider: vscode.SignatureHelpProvider = {
        async provideSignatureHelp(document, position) {
            const ctx = locateCall(document, position);
            if (!ctx) return undefined;

            // Eigene Funktion vor geerbter vor Efun/Sfun — wie beim Hover.
            const fn =
                bestPerName(parseDocument(document).functions).find((f) => f.name === ctx.name) ??
                (await index.findInherited(document, ctx.name));
            const def = fn ? undefined : efuns.lookup(ctx.name);
            if (!fn && !def) return undefined;

            const sigLabel = fn ? fn.declaration ?? fn.signature : def!.signature;
            const sig = new vscode.SignatureInformation(sigLabel);
            let documentation = fn ? fn.documentation : def!.documentation;
            if (!documentation && def && !def.isSimulated) {
                documentation = (await index.efunDocs.get(def.name))?.description;
            }
            if (documentation) {
                sig.documentation = new vscode.MarkdownString(documentation);
            }

            const params = extractParameterRanges(sigLabel);
            sig.parameters = params.map((p) => new vscode.ParameterInformation([p.start, p.end]));

            const help = new vscode.SignatureHelp();
            help.signatures = [sig];
            help.activeSignature = 0;
            help.activeParameter = Math.min(ctx.argIndex, Math.max(0, params.length - 1));
            return help;
        }
    };

    context.subscriptions.push(
        vscode.languages.registerSignatureHelpProvider(LPC_SELECTOR, provider, '(', ',')
    );
}

// Findet den eingeschlossenen Funktionsaufruf an position:
// gibt den Namen und den 0-basierten Index des aktuellen Arguments zurück.
function locateCall(
    document: vscode.TextDocument,
    position: vscode.Position
): { name: string; argIndex: number } | undefined {
    const offset = document.offsetAt(position);
    const text = document.getText().substring(0, offset);

    let depth = 0;
    let commas = 0;
    let i = text.length - 1;
    while (i >= 0) {
        const ch = text[i];
        if (ch === ')') depth++;
        else if (ch === '(') {
            if (depth === 0) break;
            depth--;
        } else if (ch === ',' && depth === 0) {
            commas++;
        } else if (ch === '"' || ch === "'") {
            // Über String springen (rückwärts vereinfacht)
            i--;
            while (i >= 0 && text[i] !== ch) i--;
        }
        i--;
    }
    if (i < 0) return undefined;

    // Vor dem '(' steht der Funktionsname
    let j = i - 1;
    while (j >= 0 && /\s/.test(text[j])) j--;
    let nameEnd = j + 1;
    while (j >= 0 && /[A-Za-z0-9_]/.test(text[j])) j--;
    const name = text.substring(j + 1, nameEnd);
    if (!name) return undefined;
    return { name, argIndex: commas };
}

// Liefert pro Parameter die Position in der Signatur-Zeile,
// damit VS Code den aktiven Parameter hervorheben kann.
function extractParameterRanges(signature: string): { start: number; end: number }[] {
    const open = signature.indexOf('(');
    const close = signature.lastIndexOf(')');
    if (open < 0 || close < 0 || close <= open) return [];

    const params: { start: number; end: number }[] = [];
    let depth = 0;
    let start = open + 1;
    for (let i = open + 1; i < close; i++) {
        const ch = signature[i];
        if (ch === '(' || ch === '[' || ch === '{' || ch === '<') depth++;
        else if (ch === ')' || ch === ']' || ch === '}' || ch === '>') depth--;
        else if (ch === ',' && depth === 0) {
            params.push(trimRange(signature, start, i));
            start = i + 1;
        }
    }
    params.push(trimRange(signature, start, close));
    return params.filter((p) => p.end > p.start);
}

function trimRange(s: string, start: number, end: number): { start: number; end: number } {
    while (start < end && /\s/.test(s[start])) start++;
    while (end > start && /\s/.test(s[end - 1])) end--;
    return { start, end };
}
