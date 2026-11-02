import * as vscode from 'vscode';
import { HomeMudService } from '../homemud/homeMudService';
import { decodeText } from './lpcParser';
import { EfunDoc, efunDocCandidates, parseEfunDocText } from './efunDocText';

export type { EfunDoc } from './efunDocText';

// Liest die Efun-Hilfe aus <homemud-Mudlib>/doc/efun/. Die Dateien liegen in
// a-m/ und n-z/, deutsche Fassungen mit Endung .de haben Vorrang.
export class EfunDocs {
    private readonly cache = new Map<string, Promise<EfunDoc | undefined>>();

    constructor(private readonly homemud: HomeMudService) {}

    get(name: string): Promise<EfunDoc | undefined> {
        let entry = this.cache.get(name);
        if (!entry) {
            entry = this.load(name);
            this.cache.set(name, entry);
        }
        return entry;
    }

    clear(): void {
        this.cache.clear();
    }

    private async load(name: string): Promise<EfunDoc | undefined> {
        const root = this.homemud.localRoot;
        if (!root) {
            return undefined;
        }
        const docDir = vscode.Uri.joinPath(root, 'doc', 'efun');
        for (const rel of efunDocCandidates(name)) {
            try {
                const data = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(docDir, ...rel.split('/')));
                return parseEfunDocText(decodeText(data));
            } catch {
                /* nächster Kandidat */
            }
        }
        return undefined;
    }
}
