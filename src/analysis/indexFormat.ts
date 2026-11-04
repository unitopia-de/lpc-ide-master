// Format der Mudlib-Index-Datei (z. B. /doc/lpc-ide/index.json.gz) und
// Abfragen darauf. Ohne VS-Code-Abhängigkeit — der Generator schreibt,
// das Plugin liest dieses Format.
import { posix } from 'path';
import { evaluateStringExpression } from './lpcParser';
import { upwardCandidates } from './mudlib';

export const INDEX_SCHEMA = 1;

export interface IndexFile {
    schema: number;
    /** Erzeuger und Version, z. B. "lpc-ide-master 0.2.2". */
    generator: string;
    /** Zeitpunkt der Erzeugung (ISO 8601). */
    generatedAt: string;
    efuns: IndexEfun[];
    sfuns: IndexSfun[];
    /** Erbbare Klassen: Mudlib-Pfad → bereits aufgelöste inherits und öffentliche Funktionen. */
    classes: Record<string, IndexClass>;
    /** Doku-Blöcke ("FUNKTION:") außerhalb der Klassen bzw. ohne Funktion darunter. */
    docs: IndexDoc[];
}

export interface IndexEfun {
    name: string;
    signature?: string;
    /** Hilfe als Markdown. */
    doc?: string;
}

export interface IndexSfun {
    name: string;
    signature: string;
    doc?: string;
    file: string;
    /** 1-basierte Zeile. */
    line: number;
}

export interface IndexClass {
    inherits: string[];
    functions: IndexFunction[];
}

/** Kurze Feldnamen, weil es zehntausende Einträge gibt. */
export interface IndexFunction {
    /** Name */
    n: string;
    /** Signatur */
    s: string;
    /** 1-basierte Zeile */
    l: number;
    /** Doku als Markdown */
    d?: string;
}

export interface IndexDoc {
    names: string[];
    signature?: string;
    doc: string;
    file: string;
    /** 1-basierte Zeile des Kommentars. */
    line: number;
}

export interface IndexedClassFunction {
    fn: IndexFunction;
    file: string;
    via: string[];
}

const MAX_CLASSES = 300;

export class MudlibIndex {
    private readonly efunsByName = new Map<string, IndexEfun>();
    private readonly docsByName = new Map<string, IndexDoc[]>();
    private functionsByName: Map<string, IndexedClassFunction[]> | undefined;

    constructor(readonly data: IndexFile) {
        if (data.schema !== INDEX_SCHEMA) {
            throw new Error(`Index-Schema ${data.schema} wird nicht unterstützt (erwartet ${INDEX_SCHEMA}).`);
        }
        for (const e of data.efuns ?? []) {
            this.efunsByName.set(e.name, e);
        }
        for (const d of data.docs ?? []) {
            for (const name of d.names) {
                let list = this.docsByName.get(name);
                if (!list) {
                    list = [];
                    this.docsByName.set(name, list);
                }
                list.push(d);
            }
        }
    }

    get generatedAt(): Date {
        return new Date(this.data.generatedAt);
    }

    efun(name: string): IndexEfun | undefined {
        return this.efunsByName.get(name);
    }

    docs(name: string): IndexDoc[] {
        return this.docsByName.get(name) ?? [];
    }

    /** Klasse zu einem (ggf. unvollständigen) Pfad: mit und ohne ".c". */
    resolveClass(path: string): string | undefined {
        for (const cand of [path, path + '.c']) {
            if (this.data.classes[cand]) {
                return cand;
            }
        }
        return undefined;
    }

    /**
     * Löst einen inherit-Ausdruck einer Datei gegen die Klassen im Index auf.
     * Makros werden nur aus den übergebenen #defines aufgelöst (meist nur die
     * der Datei selbst — Header kennt der Index nicht).
     */
    resolveInherit(expression: string, from: string, defines: Map<string, string>): string | undefined {
        const literal = /^"([^"]*)"$/.exec(expression.trim());
        let path = literal ? literal[1] : evaluateStringExpression(expression, defines);
        if (!path) {
            return undefined;
        }
        if (path.startsWith('%/')) {
            path = path.substring(1);
        } else if (path.startsWith('%')) {
            // Wie der Master: /i/name.c vom Verzeichnis der Datei aufwärts suchen.
            return upwardCandidates('/i/' + path.substring(1) + '.c', from).find((c) => this.data.classes[c]);
        }
        const candidates = path.startsWith('/')
            ? [posix.normalize(path)]
            : [posix.normalize(posix.join(posix.dirname(from), path)), posix.normalize('/' + path)];
        for (const cand of candidates) {
            const hit = this.resolveClass(cand);
            if (hit) {
                return hit;
            }
        }
        return undefined;
    }

    /** Alle Klassen, die eine Funktion dieses Namens selbst definieren (für call_other ohne bekanntes Ziel). */
    functionsNamed(name: string): IndexedClassFunction[] {
        if (!this.functionsByName) {
            this.functionsByName = new Map();
            for (const [file, cls] of Object.entries(this.data.classes)) {
                for (const fn of cls.functions) {
                    let list = this.functionsByName.get(fn.n);
                    if (!list) {
                        list = [];
                        this.functionsByName.set(fn.n, list);
                    }
                    list.push({ fn, file, via: [file] });
                }
            }
        }
        return this.functionsByName.get(name) ?? [];
    }

    /** Funktionen, die über die angegebenen (aufgelösten) Klassen geerbt werden — nächste Ebene zuerst. */
    inheritedFunctions(directInherits: string[]): IndexedClassFunction[] {
        const result = new Map<string, IndexedClassFunction>();
        const visited = new Set<string>();
        let queue = directInherits.map((file) => ({ file, via: [file] }));
        while (queue.length && visited.size < MAX_CLASSES) {
            const next: typeof queue = [];
            for (const item of queue) {
                if (visited.has(item.file)) {
                    continue;
                }
                visited.add(item.file);
                const cls = this.data.classes[item.file];
                if (!cls) {
                    continue;
                }
                for (const fn of cls.functions) {
                    if (!result.has(fn.n)) {
                        result.set(fn.n, { fn, file: item.file, via: item.via });
                    }
                }
                for (const parent of cls.inherits) {
                    next.push({ file: parent, via: [...item.via, parent] });
                }
            }
            queue = next;
        }
        return Array.from(result.values());
    }
}
