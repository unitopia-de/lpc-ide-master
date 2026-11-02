// Mudlib-Modell ohne VS-Code-Abhängigkeit: Pfadauflösung wie beim UNItopia-
// Master, Vererbung und simul_efun. Arbeitet auf Mudlib-Pfaden ("/i/room.c")
// und greift über MudFs auf Dateien zu — im Plugin über vscode.workspace.fs,
// im Index-Generator über das Node-Dateisystem.
import { posix } from 'path';
import { evaluateStringExpression, LpcFunction, parseLpc, ParsedLpc } from './lpcParser';

export interface MudFs {
    /** Inhalt einer Datei als Text, undefined wenn nicht lesbar. */
    read(mudPath: string): Promise<string | undefined>;
    /** true, wenn eine (normale) Datei existiert. */
    exists(mudPath: string): Promise<boolean>;
}

export interface MudlibOptions {
    /** Zusätzliche Suchpfade für #include <...> (neben /sys). */
    includeDirs?: string[];
}

export interface InheritedFunction extends LpcFunction {
    /** Mudlib-Pfad der Datei, in der die Funktion steht. */
    file: string;
    /** Vererbungskette bis zu dieser Datei. */
    via: string[];
}

export interface SimulEfunFunction extends LpcFunction {
    file: string;
}

// Grenzen, damit eine kaputte oder riesige Vererbung nichts ausbremst.
const MAX_FILES = 300;
const MAX_INCLUDE_DEPTH = 4;

export class Mudlib {
    private readonly files = new Map<string, Promise<ParsedLpc | undefined>>();
    private readonly defines = new Map<string, Promise<Map<string, string>>>();
    private readonly existsCache = new Map<string, Promise<boolean>>();

    constructor(
        private readonly fs: MudFs,
        private readonly options: MudlibOptions = {}
    ) {}

    /** Zwischenspeicher für eine Datei verwerfen (nach Änderungen). */
    invalidate(mudPath: string): void {
        this.files.delete(mudPath);
        this.defines.delete(mudPath);
    }

    /** Nach Anlegen/Löschen von Dateien: Existenz-Prüfungen verwerfen. */
    invalidateExists(): void {
        this.existsCache.clear();
    }

    clear(): void {
        this.files.clear();
        this.defines.clear();
        this.existsCache.clear();
    }

    parsed(mudPath: string): Promise<ParsedLpc | undefined> {
        let entry = this.files.get(mudPath);
        if (!entry) {
            entry = this.fs.read(mudPath).then(
                (text) => (text === undefined ? undefined : parseLpc(text)),
                () => undefined
            );
            this.files.set(mudPath, entry);
        }
        return entry;
    }

    /**
     * Löst einen Pfad wie der UNItopia-Master auf: "%name" → /i/name,
     * absolute Pfade ab der Mudlib-Wurzel, relative ab der Datei.
     */
    async resolvePath(requested: string, from: string, extensions: string[]): Promise<string | undefined> {
        let path = requested.trim();
        if (path.startsWith('%/')) {
            path = path.substring(1);
        } else if (path.startsWith('%')) {
            // inherit "%name": Master sucht /i/name.c vom Verzeichnis der Datei aufwärts.
            return searchUpwards('/i/' + path.substring(1) + '.c', from, (p) => this.exists(p));
        }
        const candidates = path.startsWith('/')
            ? [normalize(path)]
            : [normalize(posix.join(posix.dirname(from), path)), normalize('/' + path)];
        for (const cand of candidates) {
            for (const ext of extensions) {
                const target = ext && cand.endsWith(ext) ? cand : cand + ext;
                if (await this.exists(target)) {
                    return target;
                }
            }
        }
        return undefined;
    }

    async resolveInclude(path: string, system: boolean, from: string): Promise<string | undefined> {
        const candidates: string[] = [];
        if (system) {
            // #include <datei>: Master sucht /sys/datei vom Verzeichnis der Datei aufwärts,
            // danach /p/sys/ für "p/..."; zuletzt die konfigurierten includeDirs.
            const found = await searchUpwards('/sys/' + path, from, (p) => this.exists(p));
            if (found) {
                return found;
            }
            if (path.startsWith('p/')) {
                candidates.push('/p/sys/' + path.substring(2));
            }
            candidates.push(...(this.options.includeDirs ?? []).map((d) => `${d}/${path}`));
        } else if (path.startsWith('/')) {
            candidates.push(path);
        } else {
            candidates.push(posix.join(posix.dirname(from), path), '/sys/' + path);
        }
        for (const c of candidates) {
            const target = normalize(c);
            if (await this.exists(target)) {
                return target;
            }
        }
        return undefined;
    }

    /** Löst den Ausdruck hinter inherit auf (Literal, Makro, Verkettung). */
    async resolveInherit(expression: string, from: string, parsed: ParsedLpc): Promise<string | undefined> {
        const literal = /^"([^"]*)"$/.exec(expression.trim());
        const path = literal
            ? literal[1]
            : evaluateStringExpression(expression, await this.definesFor(from, parsed));
        return path ? this.resolvePath(path, from, ['.c', '']) : undefined;
    }

    /**
     * Alle Funktionen, die eine Datei über inherit sieht — nächste Ebene
     * zuerst, private Funktionen der Eltern ausgenommen. Bei gleichem Namen
     * gewinnt die näher liegende Definition.
     */
    async inheritedFunctions(from: string, parsed: ParsedLpc): Promise<InheritedFunction[]> {
        const result = new Map<string, InheritedFunction>();
        const visited = new Set<string>([from]);
        let queue: { file: string; parsed: ParsedLpc; via: string[] }[] = [{ file: from, parsed, via: [] }];

        while (queue.length && visited.size < MAX_FILES) {
            const next: typeof queue = [];
            for (const item of queue) {
                for (const inh of item.parsed.inherits) {
                    const target = await this.resolveInherit(inh.expression, item.file, item.parsed);
                    if (!target || visited.has(target)) {
                        continue;
                    }
                    visited.add(target);
                    const targetParsed = await this.parsed(target);
                    if (!targetParsed) {
                        continue;
                    }
                    const via = [...item.via, target];
                    for (const fn of bestPerName(targetParsed.functions)) {
                        if (fn.modifiers.includes('private')) {
                            continue;
                        }
                        const existing = result.get(fn.name);
                        if (existing && !(existing.isPrototype && !fn.isPrototype)) {
                            continue;
                        }
                        result.set(fn.name, {
                            ...fn,
                            documentation: fn.documentation ?? existing?.documentation,
                            file: target,
                            via
                        });
                    }
                    next.push({ file: target, parsed: targetParsed, via });
                }
            }
            queue = next;
        }
        return Array.from(result.values());
    }

    /**
     * Sfuns der simul_efun: die Startdatei samt "..."-Includes und inherits.
     * Sfuns sind alle öffentlichen Funktionen (nicht private/protected/static).
     */
    async simulEfuns(start: string): Promise<{ functions: SimulEfunFunction[]; files: string[] }> {
        const visited = new Set<string>();
        const found = new Map<string, SimulEfunFunction>();
        const walk = async (file: string): Promise<void> => {
            if (visited.has(file) || visited.size >= MAX_FILES) {
                return;
            }
            visited.add(file);
            const parsed = await this.parsed(file);
            if (!parsed) {
                return;
            }
            for (const fn of bestPerName(parsed.functions)) {
                if (fn.isPrototype || fn.name.startsWith('__')) {
                    continue;
                }
                if (fn.modifiers.some((m) => m === 'private' || m === 'protected' || m === 'static')) {
                    continue;
                }
                if (!found.has(fn.name)) {
                    found.set(fn.name, { ...fn, file });
                }
            }
            for (const inc of parsed.includes) {
                if (inc.system) {
                    continue;
                }
                const target = await this.resolveInclude(inc.path, false, file);
                if (target) {
                    await walk(target);
                }
            }
            for (const inh of parsed.inherits) {
                const target = await this.resolveInherit(inh.expression, file, parsed);
                if (target) {
                    await walk(target);
                }
            }
        };
        await walk(start);
        return { functions: Array.from(found.values()), files: Array.from(visited) };
    }

    // --- intern -------------------------------------------------------------

    /** #defines einer Datei inklusive ihrer Includes (eigene Definitionen haben Vorrang). */
    private definesFor(file: string, parsed: ParsedLpc): Promise<Map<string, string>> {
        let entry = this.defines.get(file);
        if (!entry) {
            entry = this.collectDefines(file, parsed, 0, new Set([file]));
            this.defines.set(file, entry);
        }
        return entry;
    }

    private async collectDefines(
        file: string,
        parsed: ParsedLpc,
        depth: number,
        seen: Set<string>
    ): Promise<Map<string, string>> {
        const result = new Map(parsed.defines);
        if (depth >= MAX_INCLUDE_DEPTH) {
            return result;
        }
        for (const inc of parsed.includes) {
            const target = await this.resolveInclude(inc.path, inc.system, file);
            if (!target || seen.has(target)) {
                continue;
            }
            seen.add(target);
            const incParsed = await this.parsed(target);
            if (!incParsed) {
                continue;
            }
            const nested = await this.collectDefines(target, incParsed, depth + 1, seen);
            for (const [k, v] of nested) {
                if (!result.has(k)) {
                    result.set(k, v);
                }
            }
        }
        return result;
    }

    private exists(mudPath: string): Promise<boolean> {
        let entry = this.existsCache.get(mudPath);
        if (!entry) {
            entry = this.fs.exists(mudPath).catch(() => false);
            this.existsCache.set(mudPath, entry);
        }
        return entry;
    }
}

/** Pro Name die beste Fundstelle: Definition vor Prototyp, Doku notfalls vom Prototyp. */
export function bestPerName(functions: LpcFunction[]): LpcFunction[] {
    const best = new Map<string, LpcFunction>();
    for (const fn of functions) {
        const existing = best.get(fn.name);
        if (!existing) {
            best.set(fn.name, fn);
        } else if (existing.isPrototype && !fn.isPrototype) {
            best.set(fn.name, {
                ...fn,
                documentation: fn.documentation ?? existing.documentation,
                declaration: fn.declaration ?? existing.declaration
            });
        } else if (!existing.documentation && fn.documentation) {
            best.set(fn.name, { ...existing, documentation: fn.documentation });
        }
    }
    return Array.from(best.values());
}

/**
 * Nachbildung von search_file() aus /secure/master/include_file.inc:
 * Hängt file an jedes Elternverzeichnis der Datei from an (von innen nach
 * außen, ohne die oberste Ebene) und prüft danach file selbst.
 * Beispiel: file "/i/suedpol.c", from "/d/Arktis/Suedpol/Teil_2/i/ebene.c"
 * → /d/Arktis/Suedpol/Teil_2/i/i/suedpol.c, …/Teil_2/i/suedpol.c, …, /d/i/suedpol.c, /i/suedpol.c
 */
export async function searchUpwards(
    file: string,
    from: string,
    exists: (mudPath: string) => Promise<boolean>
): Promise<string | undefined> {
    for (const candidate of upwardCandidates(file, from)) {
        if (await exists(candidate)) {
            return candidate;
        }
    }
    return undefined;
}

/** Die Kandidaten von searchUpwards() in Suchreihenfolge. */
export function upwardCandidates(file: string, from: string): string[] {
    const co = from.split('/');
    let i = file.split('/').length - 1;
    // Sonderfall des Masters: <config.h> aus /sys/config.h selbst nicht rekursiv finden.
    i = file === '/' + co.slice(-i).join('/') ? co.length - i - 1 : co.length - 1;
    const out: string[] = [];
    for (; i-- > 1; ) {
        out.push(normalize(co.slice(0, i + 1).join('/') + file));
    }
    out.push(normalize(file));
    return out;
}

/** Normalisiert einen Mudlib-Pfad ("/a/./b/../c" → "/a/c"), immer mit führendem "/". */
export function normalize(path: string): string {
    const result = posix.normalize('/' + path.replace(/\\/g, '/'));
    return result.length > 1 ? result.replace(/\/+$/, '') : result;
}
