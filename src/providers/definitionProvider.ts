import * as vscode from 'vscode';
import { LpcConfigService, LpcConfig } from '../config/lpcConfig';
import { HomeMudService } from '../homemud/homeMudService';
import { EfunProvider } from '../dialect/efunProvider';
import { LpcIndex, bestPerName } from '../analysis/lpcIndex';
import { parseDocument } from '../analysis/documentCache';
import { callContext } from './callContext';

const LPC_SELECTOR: vscode.DocumentSelector = [
    { language: 'lpc', scheme: 'file' },
    { language: 'lpc', scheme: 'lpc-ftp' }
];

export function registerDefinitionProvider(
    context: vscode.ExtensionContext,
    config: LpcConfigService,
    homemud: HomeMudService,
    index: LpcIndex,
    efuns: EfunProvider
): void {
    const provider: vscode.DefinitionProvider = {
        async provideDefinition(document, position) {
            const line = document.lineAt(position.line).text;

            // Mit homemud: inherit-Zeilen wie der Master auflösen ("%room", Makros, Verkettung).
            const indexed = await index.resolveInheritAtLine(document, position.line);
            if (indexed) {
                return new vscode.Location(indexed, new vscode.Position(0, 0));
            }

            const inheritUri = await resolveInherit(line, document, config, homemud);
            if (inheritUri) {
                return new vscode.Location(inheritUri, new vscode.Position(0, 0));
            }

            const includeUri = await resolveInclude(line, document, config, homemud);
            if (includeUri) {
                return new vscode.Location(includeUri, new vscode.Position(0, 0));
            }

            const range = document.getWordRangeAtPosition(position, /[A-Za-z_]\w*/);
            if (!range) return undefined;
            const word = document.getText(range);

            // call_other: ob->fun() bzw. ob.fun() — Fundstellen im Zielobjekt bzw. in allen Klassen.
            const call = callContext(line.slice(0, range.start.character));
            if (call && !call.self) {
                const targets = await callOtherLocations(document, index, word, call.target);
                if (targets.length) return targets;
            }

            const local = resolveLocalFunction(document, word);
            if (local) return local;

            const inherited = await index.findInherited(document, word);
            if (inherited) {
                return new vscode.Location(inherited.uri, new vscode.Position(inherited.line, inherited.character));
            }

            // Sfun aus der homemud-simul_efun: direkt zur Quelle springen (nicht bei ob->fun()).
            const location = call ? undefined : efuns.lookup(word)?.location;
            if (location) {
                return new vscode.Location(location.uri, new vscode.Position(location.line, location.character));
            }

            // Doku-Blöcke aus dem Mudlib-Index — bei mehreren zeigt VS Code eine Auswahl.
            const docs = index.docsFor(word).filter((d) => d.uri);
            if (docs.length) {
                return docs.map((d) => new vscode.Location(d.uri!, new vscode.Position(d.line, 0)));
            }
            return undefined;
        }
    };

    context.subscriptions.push(
        vscode.languages.registerDefinitionProvider(LPC_SELECTOR, provider)
    );
}

// Ist das Ziel ein Pfad ("/i/room"->fun()), genau die Funktion dort; sonst alle
// Klassen des Mudlib-Index mit diesem Namen und die passenden Doku-Blöcke.
async function callOtherLocations(
    document: vscode.TextDocument,
    index: LpcIndex,
    word: string,
    target: string | undefined
): Promise<vscode.Location[]> {
    const toLocation = (mudPath: string, line: number, character: number): vscode.Location[] => {
        const uri = index.uriFor(mudPath);
        return uri ? [new vscode.Location(uri, new vscode.Position(line, character))] : [];
    };
    if (target) {
        const hit = await index.findInObject(document, target, word);
        if (hit) {
            return toLocation(hit.mudPath, hit.fn.line, hit.fn.character);
        }
    }
    return [
        ...index.allCallTargets(word).flatMap((t) => toLocation(t.mudPath, t.fn.line, t.fn.character)),
        ...index.docsFor(word).flatMap((d) => toLocation(d.mudPath, d.line, 0))
    ];
}

async function resolveInherit(
    line: string,
    document: vscode.TextDocument,
    config: LpcConfigService,
    homemud: HomeMudService
): Promise<vscode.Uri | undefined> {
    const m = /\binherit\s+"([^"]+)"/.exec(line);
    if (!m) return undefined;
    const path = m[1];
    return resolveLpcPath(path, document, config, homemud, ['.c', '']);
}

async function resolveInclude(
    line: string,
    document: vscode.TextDocument,
    config: LpcConfigService,
    homemud: HomeMudService
): Promise<vscode.Uri | undefined> {
    const m = /^\s*#\s*include\s+["<]([^">]+)[">]/.exec(line);
    if (!m) return undefined;
    return resolveLpcPath(m[1], document, config, homemud, ['', '.h']);
}

// Probiert mehrere Auflösungsstrategien in Reihenfolge:
// 1. Absoluter Pfad → über baseDir (lokal/remote)
// 2. Relativ zur aktuellen Datei
// 3. Über jedes includeDir aus der Config
async function resolveLpcPath(
    requested: string,
    document: vscode.TextDocument,
    config: LpcConfigService,
    homemud: HomeMudService,
    extensions: string[]
): Promise<vscode.Uri | undefined> {
    const cfg = config.value;
    const candidates: vscode.Uri[] = [];

    const isAbsolute = requested.startsWith('/');
    if (isAbsolute) {
        const roots = await collectRoots(document, cfg, homemud);
        for (const root of roots) {
            candidates.push(joinUri(root, requested));
        }
    } else {
        // Relativ zur aktuellen Datei
        const dir = document.uri.with({
            path: document.uri.path.substring(0, document.uri.path.lastIndexOf('/'))
        });
        candidates.push(joinUri(dir, '/' + requested));

        // Auch über alle Roots probieren (manche inherit-Pfade kommen ohne /)
        const roots = await collectRoots(document, cfg, homemud);
        for (const root of roots) {
            candidates.push(joinUri(root, '/' + requested));
        }
    }

    // includeDirs aus Config
    if (cfg?.mudlib?.includeDirs) {
        const roots = await collectRoots(document, cfg, homemud);
        for (const root of roots) {
            for (const inc of cfg.mudlib.includeDirs) {
                candidates.push(joinUri(joinUri(root, inc), '/' + requested.replace(/^\//, '')));
            }
        }
    }

    for (const cand of candidates) {
        for (const ext of extensions) {
            const target = cand.with({ path: cand.path + ext });
            if (await exists(target)) {
                return target;
            }
        }
    }
    return undefined;
}

// Liefert die möglichen "Mudlib-Wurzeln" für die Pfad-Auflösung —
// abhängig davon, ob das Dokument lokal (file:) oder remote (lpc-ftp:) ist.
async function collectRoots(
    document: vscode.TextDocument,
    cfg: LpcConfig | undefined,
    homemud: HomeMudService
): Promise<vscode.Uri[]> {
    const roots: vscode.Uri[] = [];
    if (document.uri.scheme === 'lpc-ftp') {
        const host = document.uri.authority;
        const remoteRoot = cfg?.ftp?.remoteRoot ?? cfg?.mudlib?.baseDir ?? '/';
        roots.push(vscode.Uri.parse(`lpc-ftp://${host}${remoteRoot}`));
        // Fallback: '/'
        roots.push(vscode.Uri.parse(`lpc-ftp://${host}/`));
    } else {
        // Lokale Datei → homemud-Wurzel verwenden, wenn konfiguriert
        const local = homemud.localRoot;
        if (local) {
            roots.push(local);
        }
        // Workspace-Root als Fallback
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (folder) {
            roots.push(folder.uri);
        }
    }
    return roots;
}

function joinUri(base: vscode.Uri, sub: string): vscode.Uri {
    const basePath = base.path.replace(/\/+$/, '');
    const subPath = sub.replace(/^\/+/, '/');
    return base.with({ path: basePath + subPath });
}

async function exists(uri: vscode.Uri): Promise<boolean> {
    try {
        const s = await vscode.workspace.fs.stat(uri);
        return s.type === vscode.FileType.File;
    } catch {
        return false;
    }
}

// Sucht die Definition einer Funktion innerhalb des aktuellen Dokuments
// (Definition vor Prototyp).
function resolveLocalFunction(
    document: vscode.TextDocument,
    word: string
): vscode.Location | undefined {
    const fn = bestPerName(parseDocument(document).functions).find((f) => f.name === word);
    if (!fn) return undefined;
    const start = document.positionAt(fn.offset);
    return new vscode.Location(document.uri, new vscode.Range(start, start.translate(0, word.length)));
}
