import * as vscode from 'vscode';
import { HomeMudService } from '../homemud/homeMudService';
import { decodeText, escapeMarkdown, textToMarkdown } from './lpcParser';

export interface EfunDoc {
    /** Vollständige Hilfe als Markdown (Synopsis, Beschreibung, Beispiele, Verweise). */
    markdown: string;
    /** Nur die Beschreibung — kompakt genug für die Parameterhilfe. */
    description?: string;
}

// Abschnittsnamen der LDMud-Doku, deutsch und englisch.
const SECTION_ALIASES = new Map<string, string>([
    ['SYNOPSIS', 'synopsis'],
    ['BESCHREIBUNG', 'description'],
    ['DESCRIPTION', 'description'],
    ['ANMERKUNG', 'notes'],
    ['ANMERKUNGEN', 'notes'],
    ['NOTE', 'notes'],
    ['NOTES', 'notes'],
    ['BEISPIEL', 'examples'],
    ['BEISPIELE', 'examples'],
    ['EXAMPLE', 'examples'],
    ['EXAMPLES', 'examples'],
    ['VERALTET', 'deprecated'],
    ['DEPRECATED', 'deprecated'],
    ['SIEHE AUCH', 'seeAlso'],
    ['SEE ALSO', 'seeAlso']
]);

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
        if (!root || !/^[\w[\]]+$/.test(name)) {
            return undefined;
        }
        const docDir = vscode.Uri.joinPath(root, 'doc', 'efun');
        const subdirs = /^[a-m]/i.test(name) ? ['a-m', 'n-z'] : ['n-z', 'a-m'];
        const candidates = [
            ...subdirs.flatMap((d) => [`${d}/${name}.de`, `${d}/${name}`]),
            `${name}.de`,
            name
        ];
        for (const rel of candidates) {
            try {
                const data = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(docDir, ...rel.split('/')));
                return toEfunDoc(decodeText(data));
            } catch {
                /* nächster Kandidat */
            }
        }
        return undefined;
    }
}

function toEfunDoc(text: string): EfunDoc | undefined {
    const sections: Record<string, string[]> = {};
    let current: string | undefined;
    for (const line of text.replace(/\r/g, '').split('\n')) {
        const heading = /^([A-ZÄÖÜ][A-ZÄÖÜ ]+?)\s*$/.exec(line);
        if (heading) {
            current = SECTION_ALIASES.get(heading[1]);
            if (current) {
                sections[current] = [];
            }
            continue;
        }
        if (current) {
            sections[current].push(line);
        }
    }
    const body = (key: string): string | undefined => {
        const text = sections[key]?.join('\n').replace(/^\n+|\s+$/g, '');
        return text || undefined;
    };

    const parts: string[] = [];
    const synopsis = body('synopsis');
    if (synopsis) {
        parts.push('```lpc\n' + dedent(synopsis) + '\n```');
    }
    const description = body('description');
    const descriptionMd = description ? textToMarkdown(description) : undefined;
    if (descriptionMd) {
        parts.push(descriptionMd);
    }
    const deprecated = body('deprecated');
    if (deprecated) {
        parts.push('**Veraltet:** ' + textToMarkdown(deprecated));
    }
    const notes = body('notes');
    if (notes) {
        parts.push('**Anmerkungen:**\n\n' + textToMarkdown(notes));
    }
    const examples = body('examples');
    if (examples) {
        parts.push('**Beispiele:**\n\n```lpc\n' + dedent(examples) + '\n```');
    }
    const seeAlso = body('seeAlso');
    if (seeAlso) {parts.push(`*Siehe auch:* ${escapeMarkdown(seeAlso.replace(/\s+/g, ' ').trim())}`);}

    if (!parts.length) {
        return undefined;
    }
    return { markdown: parts.join('\n\n'), description: descriptionMd };
}

function dedent(text: string): string {
    const lines = text.replace(/\t/g, '        ').split('\n');
    const indents = lines.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length);
    const base = indents.length ? Math.min(...indents) : 0;
    return lines.map((l) => l.substring(Math.min(base, l.length))).join('\n');
}
