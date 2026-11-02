import * as vscode from 'vscode';
import { LpcConfigService } from '../config/lpcConfig';
import { HomeMudService } from '../homemud/homeMudService';
import type { EfunDefinition } from '../dialect/efunProvider';
import { EfunDocs } from './efunDocs';
import { decodeText, evaluateStringExpression, LpcFunction, parseLpc, ParsedLpc } from './lpcParser';
import { parseDocument } from './documentCache';

export interface IndexedFunction extends LpcFunction {
    uri: vscode.Uri;
    /** Mudlib-Pfad der Datei, z. B. "/i/room.c". */
    mudPath: string;
    /** Vererbungskette bis zu dieser Datei, z. B. ["/i/room.c", "/i/item/smell.c"]. */
    via: string[];
}

// Grenzen, damit eine kaputte oder riesige Vererbung den Editor nicht ausbremst.
const MAX_FILES = 300;
const MAX_INCLUDE_DEPTH = 4;

// Index über die lokale homemud-Mudlib: löst Vererbung auf, sammelt geerbte
// Funktionen, liest die Sfuns aus der simul_efun und stellt die Efun-Hilfe
// bereit. Ohne konfiguriertes homemud ist er inaktiv.
export class LpcIndex implements vscode.Disposable {
    readonly efunDocs: EfunDocs;

    private readonly files = new Map<string, Promise<ParsedLpc | undefined>>();
    private readonly defines = new Map<string, Promise<Map<string, string>>>();
    private readonly existsCache = new Map<string, Promise<boolean>>();
    private simulEfunFiles = new Set<string>();

    private watcher: vscode.FileSystemWatcher | undefined;
    private readonly disposables: vscode.Disposable[] = [];
    private readonly sfunEmitter = new vscode.EventEmitter<void>();
    /** Feuert (verzögert), wenn sich eine Datei der simul_efun geändert hat. */
    readonly onDidChangeSimulEfuns = this.sfunEmitter.event;
    private sfunTimer: NodeJS.Timeout | undefined;

    constructor(
        private readonly config: LpcConfigService,
        private readonly homemud: HomeMudService,
        private readonly output: vscode.OutputChannel
    ) {
        this.efunDocs = new EfunDocs(homemud);
        this.disposables.push(
            config.onDidChange(() => this.reset()),
            vscode.workspace.onDidChangeTextDocument((e) => this.invalidate(e.document.uri)),
            vscode.workspace.onDidCloseTextDocument((doc) => this.invalidate(doc.uri))
        );
        this.reset();
    }

    get enabled(): boolean {
        return !!this.homemud.localRoot;
    }

    dispose(): void {
        this.watcher?.dispose();
        this.sfunEmitter.dispose();
        if (this.sfunTimer) {
            clearTimeout(this.sfunTimer);
        }
        for (const d of this.disposables) {
            d.dispose();
        }
    }

    // --- Pfade ------------------------------------------------------------

    /** Lokale homemud-Datei zu einem Dokument (lpc-ftp:// wird auf das homemud abgebildet). */
    toLocal(uri: vscode.Uri): vscode.Uri | undefined {
        if (uri.scheme === 'file') {
            return uri;
        }
        if (uri.scheme === 'lpc-ftp' && this.homemud.isConfigured) {
            try {
                return this.homemud.remoteToLocal(uri).localUri;
            } catch {
                return undefined;
            }
        }
        return undefined;
    }

    /** Mudlib-Pfad ("/i/room.c") einer lokalen Datei, sonst der Dateiname. */
    mudPathOf(uri: vscode.Uri): string {
        const root = this.homemud.localRoot?.path.replace(/\/+$/, '');
        if (root && uri.path.toLowerCase().startsWith(root.toLowerCase() + '/')) {
            return uri.path.substring(root.length);
        }
        return uri.path.substring(uri.path.lastIndexOf('/') + 1);
    }

    /**
     * Löst einen Mudlib-Pfad wie bei UNItopia auf: "%name" → /i/name,
     * absolute Pfade ab der Mudlib-Wurzel, relative ab der Datei.
     */
    async resolveMudPath(
        requested: string,
        from: vscode.Uri,
        extensions: string[]
    ): Promise<vscode.Uri | undefined> {
        const root = this.homemud.localRoot;
        if (!root) {
            return undefined;
        }
        let path = requested.trim();
        if (path.startsWith('%/')) {
            path = path.substring(1);
        }
        else if (path.startsWith('%')) {
            path = '/i/' + path.substring(1);
        }

        const candidates: vscode.Uri[] = [];
        if (path.startsWith('/')) {
            candidates.push(joinMud(root, path));
        } else {
            candidates.push(joinMud(dirname(from), path), joinMud(root, path));
        }
        for (const cand of candidates) {
            for (const ext of extensions) {
                const target = ext && cand.path.endsWith(ext) ? cand : cand.with({ path: cand.path + ext });
                if (await this.exists(target)) {
                    return target;
                }
            }
        }
        return undefined;
    }

    /** Löst den Ausdruck hinter inherit auf (Literal, Makro, Verkettung). */
    async resolveInherit(
        expression: string,
        from: vscode.Uri,
        parsed: ParsedLpc
    ): Promise<vscode.Uri | undefined> {
        const literal = /^"([^"]*)"$/.exec(expression.trim());
        const path = literal
            ? literal[1]
            : evaluateStringExpression(expression, await this.definesFor(from, parsed));
        if (!path) {
            return undefined;
        }
        return this.resolveMudPath(path, from, ['.c', '']);
    }

    /** Für Strg+Klick auf eine inherit-Zeile im Editor. */
    async resolveInheritAtLine(document: vscode.TextDocument, line: number): Promise<vscode.Uri | undefined> {
        const local = this.toLocal(document.uri);
        if (!this.enabled || !local) {
            return undefined;
        }
        const parsed = parseDocument(document);
        const inh = parsed.inherits.find((i) => document.positionAt(i.offset).line === line);
        return inh ? this.resolveInherit(inh.expression, local, parsed) : undefined;
    }

    async resolveInclude(path: string, system: boolean, from: vscode.Uri): Promise<vscode.Uri | undefined> {
        const root = this.homemud.localRoot;
        if (!root) {
            return undefined;
        }
        const candidates: string[] = [];
        if (system) {
            candidates.push('/sys/' + path, ...(this.config.value?.mudlib?.includeDirs ?? []).map((d) => `${d}/${path}`));
        } else if (path.startsWith('/')) {
            candidates.push(path);
        } else {
            const viaFile = joinMud(dirname(from), path);
            if (await this.exists(viaFile)) {
                return viaFile;
            }
            candidates.push('/sys/' + path);
        }
        for (const c of candidates) {
            const uri = joinMud(root, c);
            if (await this.exists(uri)) {
                return uri;
            }
        }
        return undefined;
    }

    // --- Vererbung ---------------------------------------------------------

    /**
     * Alle Funktionen, die ein Dokument über inherit sieht — nächste Ebene
     * zuerst, private Funktionen der Eltern ausgenommen. Bei gleichem Namen
     * gewinnt die näher liegende Definition.
     */
    async inheritedFunctions(document: vscode.TextDocument): Promise<IndexedFunction[]> {
        const local = this.toLocal(document.uri);
        if (!this.enabled || !local) {
            return [];
        }

        const result = new Map<string, IndexedFunction>();
        const visited = new Set<string>([local.toString()]);
        let queue: { uri: vscode.Uri; parsed: ParsedLpc; via: string[] }[] = [
            { uri: local, parsed: parseDocument(document), via: [] }
        ];

        while (queue.length && visited.size < MAX_FILES) {
            const next: typeof queue = [];
            for (const item of queue) {
                for (const inh of item.parsed.inherits) {
                    const target = await this.resolveInherit(inh.expression, item.uri, item.parsed);
                    if (!target || visited.has(target.toString())) {
                        continue;
                    }
                    visited.add(target.toString());
                    const parsed = await this.parsedFile(target);
                    if (!parsed) {
                        continue;
                    }
                    const via = [...item.via, this.mudPathOf(target)];
                    for (const fn of bestPerName(parsed.functions)) {
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
                            uri: target,
                            mudPath: via[via.length - 1],
                            via
                        });
                    }
                    next.push({ uri: target, parsed, via });
                }
            }
            queue = next;
        }
        return Array.from(result.values());
    }

    async findInherited(document: vscode.TextDocument, name: string): Promise<IndexedFunction | undefined> {
        return (await this.inheritedFunctions(document)).find((f) => f.name === name);
    }

    // --- simul_efun --------------------------------------------------------

    /**
     * Liest die Sfuns aus der simul_efun des homemud: die Datei aus
     * mudlib.simulEfunFile samt "..."-Includes und inherits. Sfuns sind alle
     * öffentlichen Funktionen (nicht private/protected/static).
     */
    async loadSimulEfuns(): Promise<EfunDefinition[]> {
        const root = this.homemud.localRoot;
        if (!root) {
            return [];
        }
        const configured = this.config.value?.mudlib?.simulEfunFile ?? '/secure/simul_efun.c';
        const start = await this.resolveMudPath(configured, root, ['', '.c']);
        if (!start) {
            this.output.appendLine(`simul_efun nicht gefunden im homemud: ${configured}`);
            return [];
        }

        const visited = new Set<string>();
        const found = new Map<string, { fn: LpcFunction; uri: vscode.Uri }>();
        const walk = async (uri: vscode.Uri): Promise<void> => {
            if (visited.has(uri.toString()) || visited.size >= MAX_FILES) {
                return;
            }
            visited.add(uri.toString());
            const parsed = await this.parsedFile(uri);
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
                if (!found.has(fn.name)) {found.set(fn.name, { fn, uri });}
            }
            for (const inc of parsed.includes) {
                if (inc.system) {
                    continue;
                }
                const target = await this.resolveInclude(inc.path, false, uri);
                if (target) {
                    await walk(target);
                }
            }
            for (const inh of parsed.inherits) {
                const target = await this.resolveInherit(inh.expression, uri, parsed);
                if (target) {
                    await walk(target);
                }
            }
        };
        await walk(start);
        this.simulEfunFiles = visited;

        const defs: EfunDefinition[] = Array.from(found.values()).map(({ fn, uri }) => ({
            name: fn.name,
            signature: fn.declaration ?? fn.signature,
            documentation: fn.documentation,
            isSimulated: true,
            location: { uri, line: fn.line, character: fn.character }
        }));
        this.output.appendLine(
            `simul_efun aus homemud gelesen: ${defs.length} Sfuns aus ${visited.size} Dateien (${this.mudPathOf(start)}).`
        );
        return defs;
    }

    // --- intern -------------------------------------------------------------

    private reset(): void {
        this.files.clear();
        this.defines.clear();
        this.existsCache.clear();
        this.efunDocs.clear();
        this.watcher?.dispose();
        this.watcher = undefined;
        const root = this.homemud.localRoot;
        if (!root) {
            return;
        }
        this.watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(root, '**/*.{c,h,inc}')
        );
        const onChange = (uri: vscode.Uri): void => {
            this.invalidate(uri);
            if (this.simulEfunFiles.has(uri.toString())) {
                this.scheduleSimulEfunReload();
            }
        };
        const onCreateDelete = (uri: vscode.Uri): void => {
            this.existsCache.clear();
            onChange(uri);
        };
        this.watcher.onDidChange(onChange);
        this.watcher.onDidCreate(onCreateDelete);
        this.watcher.onDidDelete(onCreateDelete);
    }

    private invalidate(uri: vscode.Uri): void {
        const key = uri.toString();
        this.files.delete(key);
        this.defines.delete(key);
    }

    private scheduleSimulEfunReload(): void {
        if (this.sfunTimer) {
            clearTimeout(this.sfunTimer);
        }
        this.sfunTimer = setTimeout(() => this.sfunEmitter.fire(), 500);
    }

    private parsedFile(uri: vscode.Uri): Promise<ParsedLpc | undefined> {
        const key = uri.toString();
        // Geöffnete Dokumente mit ungespeicherten Änderungen direkt aus dem Editor lesen.
        const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === key);
        if (open?.isDirty) {
            return Promise.resolve(parseDocument(open));
        }
        let entry = this.files.get(key);
        if (!entry) {
            entry = Promise.resolve(vscode.workspace.fs.readFile(uri)).then(
                (data) => parseLpc(decodeText(data)),
                () => undefined
            );
            this.files.set(key, entry);
        }
        return entry;
    }

    /** #defines einer Datei inklusive ihrer Includes (eigene Definitionen haben Vorrang). */
    private definesFor(uri: vscode.Uri, parsed: ParsedLpc): Promise<Map<string, string>> {
        const key = uri.toString();
        let entry = this.defines.get(key);
        if (!entry) {
            entry = this.collectDefines(uri, parsed, 0, new Set([key]));
            this.defines.set(key, entry);
        }
        return entry;
    }

    private async collectDefines(
        uri: vscode.Uri,
        parsed: ParsedLpc,
        depth: number,
        seen: Set<string>
    ): Promise<Map<string, string>> {
        const result = new Map(parsed.defines);
        if (depth >= MAX_INCLUDE_DEPTH) {
            return result;
        }
        for (const inc of parsed.includes) {
            const target = await this.resolveInclude(inc.path, inc.system, uri);
            if (!target || seen.has(target.toString())) {
                continue;
            }
            seen.add(target.toString());
            const incParsed = await this.parsedFile(target);
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

    private exists(uri: vscode.Uri): Promise<boolean> {
        const key = uri.toString();
        let entry = this.existsCache.get(key);
        if (!entry) {
            entry = Promise.resolve(vscode.workspace.fs.stat(uri)).then(
                (s) => s.type === vscode.FileType.File,
                () => false
            );
            this.existsCache.set(key, entry);
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

function dirname(uri: vscode.Uri): vscode.Uri {
    return uri.with({ path: uri.path.substring(0, uri.path.lastIndexOf('/')) || '/' });
}

function joinMud(base: vscode.Uri, path: string): vscode.Uri {
    const segments = path.split('/').filter((s) => s && s !== '.');
    return segments.length ? vscode.Uri.joinPath(base, ...segments) : base;
}
