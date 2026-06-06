import * as vscode from 'vscode';
import { LpcConfigService, LpcConfig } from '../config/lpcConfig';
import { HomeMudService } from '../homemud/homeMudService';

const LPC_SELECTOR: vscode.DocumentSelector = [
    { language: 'lpc', scheme: 'file' },
    { language: 'lpc', scheme: 'lpc-ftp' }
];

export function registerDefinitionProvider(
    context: vscode.ExtensionContext,
    config: LpcConfigService,
    homemud: HomeMudService
): void {
    const provider: vscode.DefinitionProvider = {
        async provideDefinition(document, position) {
            const line = document.lineAt(position.line).text;

            const inheritUri = await resolveInherit(line, document, config, homemud);
            if (inheritUri) {
                return new vscode.Location(inheritUri, new vscode.Position(0, 0));
            }

            const includeUri = await resolveInclude(line, document, config, homemud);
            if (includeUri) {
                return new vscode.Location(includeUri, new vscode.Position(0, 0));
            }

            return resolveLocalFunction(document, position);
        }
    };

    context.subscriptions.push(
        vscode.languages.registerDefinitionProvider(LPC_SELECTOR, provider)
    );
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

// Sucht die Definition einer Funktion innerhalb des aktuellen Dokuments.
// Erkennt: `[modifier*] type [*] funcname(`
function resolveLocalFunction(
    document: vscode.TextDocument,
    position: vscode.Position
): vscode.Location | undefined {
    const range = document.getWordRangeAtPosition(position, /[A-Za-z_]\w*/);
    if (!range) return undefined;
    const word = document.getText(range);

    const text = document.getText();
    const pattern = new RegExp(
        `^[ \\t]*(?:(?:private|protected|public|static|nomask|varargs|virtual|nosave|deprecated|noshadow)\\s+)*` +
            `(?:void|int|float|string|bytes|object|lwobject|mapping|mixed|status|closure|symbol|struct\\s+\\w+|array|function|funcall|unknown|coroutine|lpctype)` +
            `(?:\\s*\\*)?\\s+(${escapeRegex(word)})\\s*\\(`,
        'm'
    );
    const m = pattern.exec(text);
    if (!m) return undefined;
    const offset = (m.index ?? 0) + m[0].lastIndexOf(word);
    const start = document.positionAt(offset);
    const end = start.translate(0, word.length);
    return new vscode.Location(document.uri, new vscode.Range(start, end));
}

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
