import * as vscode from 'vscode';
import { EfunProvider } from '../dialect/efunProvider';
import { LpcIndex, bestPerName } from '../analysis/lpcIndex';
import { parseDocument } from '../analysis/documentCache';
import { LpcFunction } from '../analysis/lpcParser';
import { callContext } from './callContext';

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

            // 0. call_other: ob->fun() bzw. ob.fun() — die Funktion steht im Zielobjekt.
            const call = callContext(document.lineAt(range.start.line).text.slice(0, range.start.character));
            if (call && !call.self) {
                const hover = await callOtherHover(document, index, word, call.target, range);
                if (hover) {
                    return hover;
                }
            }

            // 1. Funktion dieser Datei (überdeckt gleichnamige Efuns)
            const own = bestPerName(parseDocument(document).functions).find((f) => f.name === word);
            if (own) {
                return new vscode.Hover(functionHover(own, '*Funktion in dieser Datei*'), range);
            }

            // 2. Geerbte Funktion (homemud oder Mudlib-Index)
            const inherited = await index.findInherited(document, word);
            if (inherited) {
                const chain = inherited.via.length > 1 ? ` (über ${inherited.via.slice(0, -1).join(' → ')})` : '';
                return new vscode.Hover(
                    functionHover(inherited, `*Geerbt aus \`${inherited.mudPath}\`${chain}${indexNote(index, inherited.fromIndex)}*`),
                    range
                );
            }

            // 3. Efun / Sfun — nicht bei ob->fun(), das ruft nie eine Efun auf.
            const def = call ? undefined : efuns.lookup(word);
            if (!def) {
                return docsHover(index, word, range);
            }
            const md = new vscode.MarkdownString();
            const efunDoc = !def.isSimulated && !def.documentation ? await index.efunDoc(word) : undefined;
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

const MAX_CALL_TARGETS = 3;

async function callOtherHover(
    document: vscode.TextDocument,
    index: LpcIndex,
    word: string,
    target: string | undefined,
    range: vscode.Range
): Promise<vscode.Hover | undefined> {
    if (target) {
        const hit = await index.findInObject(document, target, word);
        if (hit) {
            const chain = hit.via.length > 1 ? ` (über ${hit.via.slice(0, -1).join(' → ')})` : '';
            return new vscode.Hover(
                functionHover(hit.fn, `*Funktion in \`${hit.mudPath}\`${chain}${indexNote(index, hit.fromIndex)}*`),
                range
            );
        }
    }

    const { candidates, total } = index.callCandidates(word);
    const docs = index.docsFor(word);
    if (!candidates.some((c) => c.fn.documentation) && docs.length) {
        return docsHover(index, word, range);
    }
    if (!candidates.length) {
        return undefined;
    }
    const md = new vscode.MarkdownString();
    const shown = candidates.slice(0, MAX_CALL_TARGETS);
    shown.forEach((c, i) => {
        if (i > 0) md.appendMarkdown('\n\n---\n\n');
        md.appendCodeblock(c.fn.declaration ?? c.fn.signature, 'lpc');
        if (c.fn.documentation) md.appendMarkdown(c.fn.documentation + '\n\n');
        md.appendMarkdown(`*Definiert in \`${c.mudPath}\`*`);
    });
    const rest = total - shown.length;
    if (rest > 0) {
        md.appendMarkdown(
            `\n\n*Zielobjekt unbekannt — ${total} Klassen definieren \`${word}\`, ${rest} weitere nicht gezeigt (Strg+Klick listet alle).*`
        );
    }
    if (docs.length) {
        md.appendMarkdown(`\n\n*Dazu ${docs.length} Doku-Block/-Blöcke, z. B. in \`${docs[0].mudPath}\`.*`);
    }
    const note = indexNote(index, true).replace(/^ — /, '');
    if (note) md.appendMarkdown(`\n\n*${note}*`);
    return new vscode.Hover(md, range);
}

// 4. Doku-Blöcke aus dem Mudlib-Index ("FUNKTION:" außerhalb der Vererbung) —
//    z. B. für Funktionen, die per call_other aufgerufen oder in Objekten implementiert werden.
const MAX_DOCS_IN_HOVER = 3;

function docsHover(index: LpcIndex, word: string, range: vscode.Range): vscode.Hover | undefined {
    const docs = index.docsFor(word);
    if (!docs.length) return undefined;
    const md = new vscode.MarkdownString();
    docs.slice(0, MAX_DOCS_IN_HOVER).forEach((d, i) => {
        if (i > 0) md.appendMarkdown('\n\n---\n\n');
        if (d.signature) md.appendCodeblock(d.signature, 'lpc');
        md.appendMarkdown(d.documentation + `\n\n*Dokumentiert in \`${d.mudPath}\`*`);
    });
    if (docs.length > MAX_DOCS_IN_HOVER) {
        md.appendMarkdown(`\n\n*… und ${docs.length - MAX_DOCS_IN_HOVER} weitere Stellen (Strg+Klick)*`);
    }
    const note = indexNote(index, true).replace(/^ — /, '');
    if (note) md.appendMarkdown(`\n\n*${note}*`);
    return new vscode.Hover(md, range);
}

function indexNote(index: LpcIndex, fromIndex: boolean | undefined): string {
    const date = index.indexDate;
    return fromIndex && date ? ` — Mudlib-Index vom ${date.toLocaleDateString()}` : '';
}

function functionHover(fn: LpcFunction, origin: string): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.appendCodeblock(fn.declaration ?? fn.signature, 'lpc');
    if (fn.documentation) md.appendMarkdown('\n---\n' + fn.documentation);
    md.appendMarkdown('\n\n' + origin);
    return md;
}
