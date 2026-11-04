import * as vscode from 'vscode';
import { LpcConfigService } from '../config/lpcConfig';
import { HomeMudService } from '../homemud/homeMudService';
import type { EfunDefinition } from '../dialect/efunProvider';
import { EfunDocs, EfunDoc } from './efunDocs';
import { decodeText, LpcFunction } from './lpcParser';
import { Mudlib, MudFs, bestPerName } from './mudlib';
import { IndexFunction, MudlibIndex } from './indexFormat';
import { parseDocument } from './documentCache';

export { bestPerName } from './mudlib';

export interface IndexedFunction extends LpcFunction {
    uri: vscode.Uri;
    /** Mudlib-Pfad der Datei, z. B. "/i/room.c". */
    mudPath: string;
    /** Vererbungskette bis zu dieser Datei, z. B. ["/i/room.c", "/i/item/smell.c"]. */
    via: string[];
    /** true, wenn die Angaben aus dem Mudlib-Index stammen (nicht live aus dem homemud). */
    fromIndex?: boolean;
}

/** Treffer für einen call_other-Aufruf. */
export interface CallTarget {
    fn: LpcFunction;
    /** Mudlib-Pfad der Datei, in der die Funktion steht. */
    mudPath: string;
    via: string[];
    fromIndex?: boolean;
}

export interface IndexedDoc {
    names: string[];
    signature?: string;
    documentation: string;
    uri: vscode.Uri | undefined;
    mudPath: string;
    /** 0-basierte Zeile. */
    line: number;
}

// Wissen über die Mudlib aus zwei Quellen:
//  1. homemud (lokale Mudlib) — live gelesen, immer aktuell.
//  2. Mudlib-Index (JSON vom Server oder aus dem homemud) — Rückfallebene ohne
//     homemud und Quelle für Doku-Blöcke außerhalb der Vererbung.
export class LpcIndex implements vscode.Disposable {
    readonly efunDocs: EfunDocs;

    private mudlib: Mudlib | undefined;
    private server: MudlibIndex | undefined;
    private serverSource = '';
    private simulEfunFiles = new Set<string>();

    private watcher: vscode.FileSystemWatcher | undefined;
    private readonly disposables: vscode.Disposable[] = [];
    private readonly sfunEmitter = new vscode.EventEmitter<void>();
    /** Feuert (verzögert), wenn sich die Sfuns geändert haben könnten. */
    readonly onDidChangeSimulEfuns = this.sfunEmitter.event;
    private sfunTimer: NodeJS.Timeout | undefined;
    private readonly indexEmitter = new vscode.EventEmitter<void>();
    /** Feuert, wenn ein Mudlib-Index geladen oder entfernt wurde. */
    readonly onDidChangeIndex = this.indexEmitter.event;

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

    /** true, wenn eine lokale homemud-Mudlib gelesen werden kann. */
    get enabled(): boolean {
        return !!this.mudlib;
    }

    /** Stand des geladenen Mudlib-Index, falls vorhanden. */
    get indexDate(): Date | undefined {
        return this.server?.generatedAt;
    }

    /** Herkunft des geladenen Mudlib-Index, z. B. "Server unitopia.de" oder "Zwischenspeicher". */
    get indexSource(): string | undefined {
        return this.server ? this.serverSource : undefined;
    }

    /** Umfang des geladenen Mudlib-Index für Anzeigen. */
    get indexSummary(): string | undefined {
        const d = this.server?.data;
        return d
            ? `${Object.keys(d.classes).length} Klassen, ${d.sfuns.length} Sfuns, ${d.efuns.length} Efuns, ${d.docs.length} Doku-Blöcke`
            : undefined;
    }

    dispose(): void {
        this.watcher?.dispose();
        this.sfunEmitter.dispose();
        this.indexEmitter.dispose();
        if (this.sfunTimer) {
            clearTimeout(this.sfunTimer);
        }
        for (const d of this.disposables) {
            d.dispose();
        }
    }

    /** Mudlib-Index setzen oder entfernen (vom Loader aufgerufen). */
    setServerIndex(index: MudlibIndex | undefined, source: string): void {
        this.server = index;
        this.serverSource = source;
        if (index) {
            this.output.appendLine(
                `Mudlib-Index geladen (${source}, Stand ${index.generatedAt.toLocaleString()}): ${this.indexSummary}.`
            );
        }
        this.indexEmitter.fire();
        this.scheduleSimulEfunReload();
    }

    // --- Pfade ------------------------------------------------------------

    /** Mudlib-Pfad ("/i/room.c") eines Dokuments, falls bestimmbar. */
    mudPathFor(uri: vscode.Uri): string | undefined {
        if (uri.scheme === 'lpc-ftp') {
            if (this.homemud.isConfigured) {
                try {
                    return this.mudPathFor(this.homemud.remoteToLocal(uri).localUri);
                } catch {
                    return uri.path;
                }
            }
            return uri.path;
        }
        const root = this.homemud.localRoot?.path.replace(/\/+$/, '');
        if (root && uri.path.toLowerCase().startsWith(root.toLowerCase() + '/')) {
            return uri.path.substring(root.length);
        }
        return undefined;
    }

    /** Für Anzeigen: Mudlib-Pfad, sonst der Dateiname. */
    mudPathOf(uri: vscode.Uri): string {
        return this.mudPathFor(uri) ?? uri.path.substring(uri.path.lastIndexOf('/') + 1);
    }

    /** URI zu einem Mudlib-Pfad: lokal im homemud, sonst über lpc-ftp://. */
    uriFor(mudPath: string): vscode.Uri | undefined {
        const root = this.homemud.localRoot;
        if (root) {
            return joinMud(root, mudPath);
        }
        const host = this.config.value?.ftp?.host;
        return host ? vscode.Uri.parse(`lpc-ftp://${host}${mudPath}`) : undefined;
    }

    // --- Vererbung ---------------------------------------------------------

    /** Für Strg+Klick auf eine inherit-Zeile im Editor. */
    async resolveInheritAtLine(document: vscode.TextDocument, line: number): Promise<vscode.Uri | undefined> {
        const parsed = parseDocument(document);
        const inh = parsed.inherits.find((i) => document.positionAt(i.offset).line === line);
        if (!inh) {
            return undefined;
        }
        const from = this.fromPath(document);
        let target: string | undefined;
        if (this.mudlib) {
            target = await this.mudlib.resolveInherit(inh.expression, from, parsed);
        } else if (this.server) {
            target = this.server.resolveInherit(inh.expression, from, parsed.defines);
        }
        return target ? this.uriFor(target) : undefined;
    }

    /** Prüft einen inherit-Pfad aus einem Dokument (nur mit homemud). */
    async resolveInheritPath(document: vscode.TextDocument, path: string): Promise<vscode.Uri | undefined> {
        if (!this.mudlib) {
            return undefined;
        }
        const target = await this.mudlib.resolvePath(path, this.fromPath(document), ['.c', '']);
        return target ? this.uriFor(target) : undefined;
    }

    /**
     * Alle Funktionen, die ein Dokument über inherit sieht — nächste Ebene
     * zuerst, private Funktionen der Eltern ausgenommen.
     */
    async inheritedFunctions(document: vscode.TextDocument): Promise<IndexedFunction[]> {
        const parsed = parseDocument(document);
        const from = this.fromPath(document);
        if (this.mudlib) {
            const fns = await this.mudlib.inheritedFunctions(from, parsed);
            return fns.flatMap((fn) => {
                const uri = this.uriFor(fn.file);
                return uri ? [{ ...fn, uri, mudPath: fn.file, via: fn.via }] : [];
            });
        }
        if (this.server) {
            const direct = parsed.inherits
                .map((i) => this.server!.resolveInherit(i.expression, from, parsed.defines))
                .filter((p): p is string => !!p);
            return this.server.inheritedFunctions(direct).flatMap(({ fn, file, via }) => {
                const uri = this.uriFor(file);
                return uri ? [{ ...fromIndexFunction(fn), uri, mudPath: file, via, fromIndex: true }] : [];
            });
        }
        return [];
    }

    async findInherited(document: vscode.TextDocument, name: string): Promise<IndexedFunction | undefined> {
        return (await this.inheritedFunctions(document)).find((f) => f.name === name);
    }

    // --- call_other (ob->fun(), ob.fun()) -----------------------------------

    /**
     * Funktion in einem namentlich bekannten Zielobjekt, z. B. "/i/room"->fun():
     * mit homemud live (eigene Funktionen, dann geerbte), sonst aus dem Index.
     */
    async findInObject(document: vscode.TextDocument, target: string, name: string): Promise<CallTarget | undefined> {
        const from = this.fromPath(document);
        if (this.mudlib) {
            const file = await this.mudlib.resolvePath(target, from, ['.c', '']);
            const parsed = file ? await this.mudlib.parsed(file) : undefined;
            if (file && parsed) {
                const own = bestPerName(parsed.functions).find((f) => f.name === name);
                if (own) {
                    return { fn: own, mudPath: file, via: [file] };
                }
                const inherited = (await this.mudlib.inheritedFunctions(file, parsed)).find((f) => f.name === name);
                return inherited ? { fn: inherited, mudPath: inherited.file, via: [file, ...inherited.via] } : undefined;
            }
        }
        const cls = this.server?.resolveInherit(JSON.stringify(target), from, new Map());
        const hit = cls ? this.server!.inheritedFunctions([cls]).find((f) => f.fn.n === name) : undefined;
        return hit ? { fn: fromIndexFunction(hit.fn), mudPath: hit.file, via: hit.via, fromIndex: true } : undefined;
    }

    /**
     * Klassen aus dem Mudlib-Index, die eine Funktion dieses Namens definieren —
     * für call_other auf ein unbekanntes Objekt. Ausführlich dokumentierte zuerst
     * (kurze Kommentare wie "Prototypes" sind meist Abschnittsüberschriften),
     * dann die Kern-Mudlib (/i/) vor /p/ und /d/; gleiche Kommentare nur einmal.
     */
    callCandidates(name: string): { candidates: CallTarget[]; total: number } {
        const all = this.allCallTargets(name);
        const seen = new Set<string>();
        const candidates = all.filter((c) => {
            const key = c.fn.documentation ?? '';
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
        return { candidates, total: all.length };
    }

    /**
     * Alle Klassen mit einer Funktion dieses Namens, sortiert wie callCandidates — für Strg+Klick.
     * Reine Prototypen (";" statt Rumpf) nur, wenn es nirgends eine Definition gibt.
     */
    allCallTargets(name: string): CallTarget[] {
        const rank = (file: string): number => (file.startsWith('/i/') ? 0 : file.startsWith('/p/') ? 1 : 2);
        const quality = (doc: string | undefined): number => (!doc ? 2 : doc.length < 40 ? 1 : 0);
        const all = this.server?.functionsNamed(name) ?? [];
        const definitions = all.filter((t) => !t.fn.p);
        return [...(definitions.length ? definitions : all)]
            .sort(
                (a, b) =>
                    quality(a.fn.d) - quality(b.fn.d) ||
                    rank(a.file) - rank(b.file) ||
                    a.file.length - b.file.length ||
                    a.file.localeCompare(b.file)
            )
            .map(({ fn, file, via }) => ({ fn: fromIndexFunction(fn), mudPath: file, via, fromIndex: true }));
    }

    // --- Sfuns, Efun-Hilfe, Doku-Blöcke --------------------------------------

    /**
     * Sfuns: mit homemud live aus der simul_efun (mudlib.simulEfunFile samt
     * Includes und inherits), sonst aus dem Mudlib-Index.
     */
    async loadSimulEfuns(): Promise<EfunDefinition[]> {
        if (this.mudlib) {
            const configured = this.config.value?.mudlib?.simulEfunFile ?? '/secure/simul_efun.c';
            const start = await this.mudlib.resolvePath(configured, '/', ['', '.c']);
            if (!start) {
                this.output.appendLine(`simul_efun nicht gefunden im homemud: ${configured}`);
            } else {
                const { functions, files } = await this.mudlib.simulEfuns(start);
                this.simulEfunFiles = new Set(files);
                this.output.appendLine(
                    `simul_efun aus homemud gelesen: ${functions.length} Sfuns aus ${files.length} Dateien (${start}).`
                );
                return functions.map((fn) => ({
                    name: fn.name,
                    signature: fn.declaration ?? fn.signature,
                    documentation: fn.documentation,
                    isSimulated: true,
                    location: this.location(fn.file, fn.line, fn.character)
                }));
            }
        }
        if (this.server) {
            return this.server.data.sfuns.map((s) => ({
                name: s.name,
                signature: s.signature,
                documentation: s.doc,
                isSimulated: true,
                location: this.location(s.file, s.line - 1, 0)
            }));
        }
        return [];
    }

    /** Efun-Hilfe: aus doc/efun im homemud, sonst aus dem Mudlib-Index. */
    async efunDoc(name: string): Promise<EfunDoc | undefined> {
        const local = this.mudlib ? await this.efunDocs.get(name) : undefined;
        if (local) {
            return local;
        }
        const doc = this.server?.efun(name)?.doc;
        return doc ? { markdown: doc } : undefined;
    }

    /** Doku-Blöcke ("FUNKTION:") aus dem Mudlib-Index zu einem Namen. */
    docsFor(name: string): IndexedDoc[] {
        return (this.server?.docs(name) ?? []).map((d) => ({
            names: d.names,
            signature: d.signature,
            documentation: d.doc,
            uri: this.uriFor(d.file),
            mudPath: d.file,
            line: d.line - 1
        }));
    }

    // --- intern -------------------------------------------------------------

    private fromPath(document: vscode.TextDocument): string {
        const known = this.mudPathFor(document.uri);
        if (known) {
            return known;
        }
        // Datei außerhalb der Mudlib: relative inherits ab der Wurzel auflösen.
        return '/' + document.uri.path.substring(document.uri.path.lastIndexOf('/') + 1);
    }

    private location(
        mudPath: string,
        line: number,
        character: number
    ): EfunDefinition['location'] {
        const uri = this.uriFor(mudPath);
        return uri ? { uri, line, character } : undefined;
    }

    private reset(): void {
        this.efunDocs.clear();
        this.watcher?.dispose();
        this.watcher = undefined;
        const root = this.homemud.localRoot;
        if (!root) {
            this.mudlib = undefined;
            return;
        }
        const fs: MudFs = {
            async read(mudPath) {
                const uri = joinMud(root, mudPath);
                // Geöffnete Dokumente (auch ungespeichert) direkt aus dem Editor lesen.
                const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
                if (open) {
                    return open.getText();
                }
                try {
                    return decodeText(await vscode.workspace.fs.readFile(uri));
                } catch {
                    return undefined;
                }
            },
            async exists(mudPath) {
                try {
                    return (await vscode.workspace.fs.stat(joinMud(root, mudPath))).type === vscode.FileType.File;
                } catch {
                    return false;
                }
            }
        };
        this.mudlib = new Mudlib(fs, { includeDirs: this.config.value?.mudlib?.includeDirs });

        this.watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root, '**/*.{c,h,inc}'));
        const onChange = (uri: vscode.Uri): void => {
            this.invalidate(uri);
            const path = this.mudPathFor(uri);
            if (path && this.simulEfunFiles.has(path)) {
                this.scheduleSimulEfunReload();
            }
        };
        const onCreateDelete = (uri: vscode.Uri): void => {
            this.mudlib?.invalidateExists();
            onChange(uri);
        };
        this.watcher.onDidChange(onChange);
        this.watcher.onDidCreate(onCreateDelete);
        this.watcher.onDidDelete(onCreateDelete);
    }

    private invalidate(uri: vscode.Uri): void {
        const path = this.mudPathFor(uri);
        if (path) {
            this.mudlib?.invalidate(path);
        }
    }

    private scheduleSimulEfunReload(): void {
        if (this.sfunTimer) {
            clearTimeout(this.sfunTimer);
        }
        this.sfunTimer = setTimeout(() => this.sfunEmitter.fire(), 500);
    }
}

function fromIndexFunction(fn: IndexFunction): LpcFunction {
    return {
        name: fn.n,
        signature: fn.s,
        modifiers: [],
        isPrototype: fn.p === 1,
        offset: 0,
        line: fn.l - 1,
        character: 0,
        declOffset: 0,
        declLength: 0,
        documentation: fn.d
    };
}

function joinMud(base: vscode.Uri, path: string): vscode.Uri {
    const segments = path.split('/').filter((s) => s && s !== '.');
    return segments.length ? vscode.Uri.joinPath(base, ...segments) : base;
}
