import * as vscode from 'vscode';
import { parseLpc, ParsedLpc } from './lpcParser';

// Zwischenspeicher für geparste Editor-Dokumente: Completion, Hover, Outline
// und Co. fragen oft mehrmals pro Tastendruck nach — geparst wird nur, wenn
// sich die Dokument-Version geändert hat.
const cache = new Map<string, { version: number; parsed: ParsedLpc }>();

export function parseDocument(document: vscode.TextDocument): ParsedLpc {
    const key = document.uri.toString();
    const hit = cache.get(key);
    if (hit && hit.version === document.version) {
        return hit.parsed;
    }
    const parsed = parseLpc(document.getText());
    cache.set(key, { version: document.version, parsed });
    return parsed;
}

export function registerDocumentCache(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument((doc) => cache.delete(doc.uri.toString()))
    );
}
