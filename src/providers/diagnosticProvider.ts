import * as vscode from 'vscode';
import { LpcConfigService, LpcConfig } from '../config/lpcConfig';
import { DialectManager } from '../dialect/dialectManager';
import { HomeMudService } from '../homemud/homeMudService';

const LPC_SCHEMES = ['file', 'lpc-ftp'];
const DEBOUNCE_MS = 400;

export function registerDiagnosticProvider(
    context: vscode.ExtensionContext,
    config: LpcConfigService,
    dialect: DialectManager,
    homemud: HomeMudService
): void {
    const collection = vscode.languages.createDiagnosticCollection('lpc');
    context.subscriptions.push(collection);

    const pending = new Map<string, NodeJS.Timeout>();
    const schedule = (doc: vscode.TextDocument): void => {
        if (doc.languageId !== 'lpc') return;
        if (!LPC_SCHEMES.includes(doc.uri.scheme)) return;
        const key = doc.uri.toString();
        const old = pending.get(key);
        if (old) clearTimeout(old);
        pending.set(
            key,
            setTimeout(() => {
                pending.delete(key);
                void run(doc, collection, config, dialect, homemud);
            }, DEBOUNCE_MS)
        );
    };

    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(schedule),
        vscode.workspace.onDidChangeTextDocument((e) => schedule(e.document)),
        vscode.workspace.onDidCloseTextDocument((doc) => {
            collection.delete(doc.uri);
            const old = pending.get(doc.uri.toString());
            if (old) clearTimeout(old);
            pending.delete(doc.uri.toString());
        }),
        config.onDidChange(() => {
            for (const doc of vscode.workspace.textDocuments) schedule(doc);
        }),
        dialect.onDidChange(() => {
            for (const doc of vscode.workspace.textDocuments) schedule(doc);
        })
    );

    for (const doc of vscode.workspace.textDocuments) schedule(doc);
}

async function run(
    document: vscode.TextDocument,
    collection: vscode.DiagnosticCollection,
    config: LpcConfigService,
    dialect: DialectManager,
    homemud: HomeMudService
): Promise<void> {
    const diagnostics: vscode.Diagnostic[] = [];
    const text = document.getText();

    const isLdmud = dialect.current.startsWith('ldmud');

    // 1) "class" in LDMud → struct bevorzugt
    if (isLdmud) {
        const classRe = /\bclass\s+([A-Za-z_]\w*)\b/g;
        let m: RegExpExecArray | null;
        while ((m = classRe.exec(text))) {
            const start = document.positionAt(m.index);
            const end = document.positionAt(m.index + 'class'.length);
            const diag = new vscode.Diagnostic(
                new vscode.Range(start, end),
                `LDMud bevorzugt "struct" statt "class".`,
                vscode.DiagnosticSeverity.Warning
            );
            diag.code = 'lpc.class-in-ldmud';
            diag.source = 'lpc';
            diagnostics.push(diag);
        }
    }

    // 2) Nicht auflösbare inherit-Pfade
    const inheritRe = /^([ \t]*)inherit\s+"([^"]+)"/gm;
    let im: RegExpExecArray | null;
    while ((im = inheritRe.exec(text))) {
        const path = im[2];
        const resolved = await resolveLpcPath(path, document, config, homemud, ['.c', '']);
        if (!resolved) {
            const offset = im.index + im[0].indexOf(`"${path}"`);
            const start = document.positionAt(offset);
            const end = document.positionAt(offset + path.length + 2);
            const diag = new vscode.Diagnostic(
                new vscode.Range(start, end),
                `inherit "${path}" konnte nicht aufgelöst werden (geprüft: baseDir, includeDirs, relativ).`,
                vscode.DiagnosticSeverity.Warning
            );
            diag.code = 'lpc.unresolved-inherit';
            diag.source = 'lpc';
            diagnostics.push(diag);
        }
    }

    // 3) Nicht auflösbare #include-Pfade (nur mit "..." Quote-Form; <...> ist System-Header)
    const includeRe = /^[ \t]*#\s*include\s+"([^"]+)"/gm;
    let icm: RegExpExecArray | null;
    while ((icm = includeRe.exec(text))) {
        const path = icm[1];
        const resolved = await resolveLpcPath(path, document, config, homemud, ['', '.h']);
        if (!resolved) {
            const offset = icm.index + icm[0].indexOf(`"${path}"`);
            const start = document.positionAt(offset);
            const end = document.positionAt(offset + path.length + 2);
            const diag = new vscode.Diagnostic(
                new vscode.Range(start, end),
                `#include "${path}" konnte nicht aufgelöst werden.`,
                vscode.DiagnosticSeverity.Information
            );
            diag.code = 'lpc.unresolved-include';
            diag.source = 'lpc';
            diagnostics.push(diag);
        }
    }

    collection.set(document.uri, diagnostics);
}

// — geteilte Auflösungs-Logik mit dem DefinitionProvider; bewusst hier dupliziert,
//   weil DefinitionProvider keine eigene Modul-Schnittstelle exportieren soll.
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
        for (const root of collectRoots(document, cfg, homemud)) {
            candidates.push(joinUri(root, requested));
        }
    } else {
        const dir = document.uri.with({
            path: document.uri.path.substring(0, document.uri.path.lastIndexOf('/'))
        });
        candidates.push(joinUri(dir, '/' + requested));
        for (const root of collectRoots(document, cfg, homemud)) {
            candidates.push(joinUri(root, '/' + requested));
        }
    }

    if (cfg?.mudlib?.includeDirs) {
        for (const root of collectRoots(document, cfg, homemud)) {
            for (const inc of cfg.mudlib.includeDirs) {
                candidates.push(
                    joinUri(joinUri(root, inc), '/' + requested.replace(/^\//, ''))
                );
            }
        }
    }

    for (const cand of candidates) {
        for (const ext of extensions) {
            const target = cand.with({ path: cand.path + ext });
            if (await exists(target)) return target;
        }
    }
    return undefined;
}

function collectRoots(
    document: vscode.TextDocument,
    cfg: LpcConfig | undefined,
    homemud: HomeMudService
): vscode.Uri[] {
    const roots: vscode.Uri[] = [];
    if (document.uri.scheme === 'lpc-ftp') {
        const host = document.uri.authority;
        const remoteRoot = cfg?.ftp?.remoteRoot ?? cfg?.mudlib?.baseDir ?? '/';
        roots.push(vscode.Uri.parse(`lpc-ftp://${host}${remoteRoot}`));
        roots.push(vscode.Uri.parse(`lpc-ftp://${host}/`));
    } else {
        const local = homemud.localRoot;
        if (local) roots.push(local);
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (folder) roots.push(folder.uri);
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
