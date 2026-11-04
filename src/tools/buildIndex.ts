// Index-Generator: liest eine Mudlib (auch schreibgeschützt eingehängt) und
// schreibt eine JSON-Datei mit Efuns, Sfuns, erbbaren Klassen und allen
// Doku-Blöcken ("FUNKTION:"). Nutzt denselben Parser wie das Plugin und
// braucht nur Node-Bordmittel.
//
//   node out/tools/buildIndex.js --lib /mudlib --out /out/index.json.gz
import { promises as fsp } from 'fs';
import * as path from 'path';
import { gzipSync } from 'zlib';
import { decodeText, ParsedLpc } from '../analysis/lpcParser';
import { bestPerName, Mudlib, MudFs, normalize } from '../analysis/mudlib';
import { efunDocCandidates, parseEfunDocText } from '../analysis/efunDocText';
import { IndexClass, IndexDoc, IndexEfun, IndexFile, IndexSfun, INDEX_SCHEMA } from '../analysis/indexFormat';

interface Options {
    lib: string;
    out: string;
    simulEfun?: string;
    classes: RegExp;
    exclude: RegExp[];
    includeDirs: string[];
    includeOld: boolean;
    includeW: boolean;
}

// Verzeichnisse mit diesen Namen sind ausgemustert (wie NO_INCLUDE_DIRS im UNItopia-Master).
const OLD_DIRS = new Set(['OLD', 'Old']);
// Magier-Verzeichnisse: privat, und laut Master nur von /w aus erbbar.
const WIZARD_DIR = '/w';

/** true, wenn ein Mudlib-Pfad (Datei oder Verzeichnis) nicht in den Index gehört. */
function isSkippedPath(mudPath: string, opts: Options): boolean {
    if (!opts.includeOld && mudPath.split('/').some((segment) => OLD_DIRS.has(segment))) {
        return true;
    }
    return !opts.includeW && (mudPath === WIZARD_DIR || mudPath.startsWith(WIZARD_DIR + '/'));
}

const USAGE = `Aufruf: node buildIndex.js --lib <mudlib-verzeichnis> --out <datei[.gz]> [Optionen]

  --lib <dir>          Wurzel der Mudlib (darf schreibgeschützt sein)
  --out <datei>        Ausgabedatei; Endung .gz schreibt gzip-komprimiert
  --simul-efun <pfad>  simul_efun-Datei als Mudlib-Pfad
                       (Standard: /secure/simul_efun/simul_efun.c, sonst /secure/simul_efun.c)
  --classes <regex>    Welche Dateien als erbbare Klassen gelten (Standard: "/i/")
  --exclude <regex>    Mudlib-Pfade überspringen, z. B. "^/secure/(?!simul_efun/)" — mehrfach möglich
  --include-dir <pfad> Zusätzlicher Suchpfad für #include <...> — mehrfach möglich
  --include-old        Auch Verzeichnisse namens OLD/Old einlesen (Standard: überspringen)
  --include-w          Auch die Magier-Verzeichnisse unter /w einlesen (Standard: überspringen)
  --help               Diese Hilfe`;

async function main(): Promise<number> {
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
        console.log(USAGE);
        return 0;
    }
    const opts = parseArgs(process.argv.slice(2));
    if (!opts) {
        return 1;
    }
    const started = Date.now();
    const root = path.resolve(opts.lib);
    try {
        if (!(await fsp.stat(root)).isDirectory()) {
            throw new Error('kein Verzeichnis');
        }
    } catch (err) {
        log(`Mudlib nicht gefunden: ${root} (${err})`);
        return 2;
    }

    const stats = { unreadable: 0, unresolvedInherits: 0 };
    const fs: MudFs = {
        async read(mudPath) {
            if (isSkippedPath(mudPath, opts)) {
                return undefined;
            }
            try {
                return decodeText(await fsp.readFile(toHost(root, mudPath)));
            } catch {
                stats.unreadable++;
                return undefined;
            }
        },
        async exists(mudPath) {
            if (isSkippedPath(mudPath, opts)) {
                return false;
            }
            try {
                return (await fsp.stat(toHost(root, mudPath))).isFile();
            } catch {
                return false;
            }
        }
    };
    const mudlib = new Mudlib(fs, { includeDirs: opts.includeDirs });
    const excluded = (p: string): boolean => opts.exclude.some((re) => re.test(p));

    log(`Durchsuche ${root} …`);
    const unreadableDirs: string[] = [];
    const skipped: string[] = [];
    const files = (
        await listSources(root, unreadableDirs, (dir) => isSkippedPath(dir, opts), skipped)
    ).filter((p) => !excluded(p));
    const skippedW = skipped.filter((d) => d === WIZARD_DIR || d.startsWith(WIZARD_DIR + '/')).length;
    if (skipped.length - skippedW) {
        log(`${skipped.length - skippedW} Verzeichnis(se) namens OLD/Old übersprungen (--include-old schaltet das ab).`);
    }
    if (skippedW) {
        log(`Magier-Verzeichnisse unter ${WIZARD_DIR} übersprungen (--include-w schaltet das ab).`);
    }
    log(`${files.length} Quelldateien (.c/.h/.inc)`);
    if (!files.length) {
        // Lieber gar nichts schreiben, als einen funktionierenden Index durch einen leeren zu ersetzen.
        log(
            `FEHLER: Keine einzige Quelldatei lesbar — Index wird nicht geschrieben.` +
                (unreadableDirs.length ? ` Nicht lesbar: ${unreadableDirs.slice(0, 3).join(', ')}.` : '') +
                ` Läuft der Generator als Benutzer ${userInfo()}? Docker: --user <uid>:<gid> des` +
                ' Mudlib-Besitzers; rootless Podman: --userns=keep-id --user "$(id -u):$(id -g)".'
        );
        return 3;
    }
    if (unreadableDirs.length) {
        log(
            `WARNUNG: ${unreadableDirs.length} Verzeichnis(se) nicht lesbar — fehlen im Index:\n` +
                unreadableDirs.slice(0, 10).map((d) => `  ${d}`).join('\n') +
                (unreadableDirs.length > 10 ? `\n  … und ${unreadableDirs.length - 10} weitere` : '') +
                `\n  Läuft der Generator als Benutzer ${userInfo()}? Docker: mit --user <uid>:<gid>` +
                ' des Mudlib-Besitzers starten. Rootless Podman: --userns=keep-id --user "$(id -u):$(id -g)"' +
                ` (bei SELinux zusätzlich --security-opt label=disable).`
        );
    }

    // --- Sfuns
    const sfuns: IndexSfun[] = [];
    const sefunStart = await firstExisting(mudlib, opts.simulEfun
        ? [opts.simulEfun]
        : ['/secure/simul_efun/simul_efun.c', '/secure/simul_efun.c']);
    if (sefunStart) {
        const { functions, files: sefunFiles } = await mudlib.simulEfuns(sefunStart);
        for (const fn of functions) {
            sfuns.push(compact({
                name: fn.name,
                signature: fn.declaration ?? fn.signature,
                doc: fn.documentation,
                file: fn.file,
                line: fn.line + 1
            }));
        }
        sfuns.sort((a, b) => a.name.localeCompare(b.name));
        log(`Sfuns: ${sfuns.length} aus ${sefunFiles.length} Dateien (${sefunStart})`);
    } else {
        log(
            'WARNUNG: Keine simul_efun gefunden — Sfuns fehlen im Index.' +
                (unreadableDirs.some((d) => d.startsWith('/secure')) ? ' Ursache: /secure ist nicht lesbar (siehe oben).' : '')
        );
    }

    // --- Klassen und Doku-Blöcke
    const classes: Record<string, IndexClass> = {};
    const docs: IndexDoc[] = [];
    let done = 0;
    for (const file of files) {
        const parsed = await mudlib.parsed(file);
        if (++done % 5000 === 0) {
            log(`  … ${done}/${files.length}`);
        }
        if (!parsed) {
            continue;
        }
        let documented = new Set<string>();
        if (file.endsWith('.c') && opts.classes.test(file)) {
            const cls = await buildClass(mudlib, file, parsed, stats);
            classes[file] = cls;
            documented = new Set(cls.functions.filter((f) => f.d).map((f) => f.n));
        }
        for (const block of parsed.docBlocks) {
            // Was schon als Funktion einer Klasse samt Doku drin ist, nicht doppelt aufnehmen.
            if (block.names.every((n) => documented.has(n))) {
                continue;
            }
            docs.push(compact({
                names: block.names,
                signature: block.declaration,
                doc: block.markdown,
                file,
                line: block.line + 1
            }));
        }
    }
    log(`Klassen: ${Object.keys(classes).length}, Doku-Blöcke: ${docs.length}`);

    // --- Efuns
    const efuns = excluded('/doc/efun/') ? [] : await buildEfuns(fs);
    log(`Efuns: ${efuns.length}, davon mit Hilfe: ${efuns.filter((e) => e.doc).length}`);

    const index: IndexFile = {
        schema: INDEX_SCHEMA,
        generator: `lpc-ide-master index-generator ${generatorVersion()}`,
        generatedAt: new Date().toISOString(),
        efuns,
        sfuns,
        classes,
        docs
    };

    const json = JSON.stringify(index);
    const payload = opts.out.endsWith('.gz') ? gzipSync(json) : Buffer.from(json, 'utf8');
    try {
        await fsp.mkdir(path.dirname(path.resolve(opts.out)), { recursive: true });
        const tmp = `${opts.out}.tmp-${process.pid}`;
        await fsp.writeFile(tmp, payload);
        await fsp.rename(tmp, opts.out);
        // Kleiner Zeitstempel daneben: Das Plugin lädt beim Verbinden nur diese Datei
        // und holt den Index nur, wenn sie sich geändert hat.
        const stampTmp = `${opts.out}.stamp.tmp-${process.pid}`;
        await fsp.writeFile(stampTmp, `${index.generatedAt}\n`);
        await fsp.rename(stampTmp, `${opts.out}.stamp`);
    } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS') {
            log(
                `FEHLER: ${path.dirname(path.resolve(opts.out))} ist für Benutzer ${userInfo()} nicht beschreibbar (${code}).` +
                    ' Das Verzeichnis muss dem Benutzer gehören, unter dem der Generator läuft.' +
                    ' Docker: --user <uid>:<gid> des Besitzers.' +
                    ' Rootless Podman: --userns=keep-id --user "$(id -u):$(id -g)".'
            );
            return 4;
        }
        throw err;
    }

    log(
        `Geschrieben: ${opts.out} (${(payload.length / 1e6).toFixed(2)} MB` +
            `${opts.out.endsWith('.gz') ? `, unkomprimiert ${(json.length / 1e6).toFixed(1)} MB` : ''}) ` +
            `in ${((Date.now() - started) / 1000).toFixed(1)} s. ` +
            `Nicht lesbar: ${stats.unreadable}, nicht auflösbare inherits: ${stats.unresolvedInherits}.`
    );
    return 0;
}

async function buildClass(
    mudlib: Mudlib,
    file: string,
    parsed: ParsedLpc,
    stats: { unresolvedInherits: number }
): Promise<IndexClass> {
    const inherits: string[] = [];
    for (const inh of parsed.inherits) {
        const target = await mudlib.resolveInherit(inh.expression, file, parsed);
        if (target) {
            inherits.push(target);
        } else {
            stats.unresolvedInherits++;
        }
    }
    const functions = bestPerName(parsed.functions)
        .filter((fn) => !fn.modifiers.includes('private'))
        .map((fn) =>
            compact({
                n: fn.name,
                s: fn.declaration ?? fn.signature,
                l: fn.line + 1,
                d: fn.documentation,
                p: fn.isPrototype ? (1 as const) : undefined
            })
        );
    return { inherits, functions };
}

async function buildEfuns(fs: MudFs): Promise<IndexEfun[]> {
    const signatures = new Map<string, string>();
    const alpha = await fs.read('/doc/efun/efuns.alpha');
    for (const line of alpha?.split('\n') ?? []) {
        const m = /^(\S+)\s+(.+?)\s*$/.exec(line);
        if (m && /^[A-Za-z_]\w*$/.test(m[1])) {
            signatures.set(m[1], m[2]);
        }
    }
    const efuns: IndexEfun[] = [];
    for (const [name, signature] of signatures) {
        let doc: string | undefined;
        for (const rel of efunDocCandidates(name)) {
            if (!(await fs.exists('/doc/efun/' + rel))) {
                continue;
            }
            const text = await fs.read('/doc/efun/' + rel);
            if (text !== undefined) {
                doc = parseEfunDocText(text)?.markdown;
                break;
            }
        }
        efuns.push(compact({ name, signature, doc }));
    }
    return efuns;
}

/** Alle .c/.h/.inc-Dateien als Mudlib-Pfade. Symlinks werden nicht verfolgt. */
async function listSources(
    root: string,
    unreadableDirs: string[],
    skipDir: (mudPath: string) => boolean,
    skipped: string[]
): Promise<string[]> {
    const out: string[] = [];
    const walk = async (dir: string): Promise<void> => {
        let entries;
        try {
            entries = await fsp.readdir(dir, { withFileTypes: true });
        } catch (err) {
            unreadableDirs.push(`${normalize(path.relative(root, dir))} (${(err as NodeJS.ErrnoException).code ?? err})`);
            return;
        }
        for (const e of entries) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) {
                const mudPath = normalize(path.relative(root, full));
                if (skipDir(mudPath)) {
                    skipped.push(mudPath);
                    continue;
                }
                await walk(full);
            } else if (e.isFile() && /\.(c|h|inc)$/.test(e.name)) {
                out.push(normalize(path.relative(root, full)));
            }
        }
    };
    await walk(root);
    return out.sort();
}

async function firstExisting(mudlib: Mudlib, candidates: string[]): Promise<string | undefined> {
    for (const c of candidates) {
        const hit = await mudlib.resolvePath(c, '/', ['', '.c']);
        if (hit) {
            return hit;
        }
    }
    return undefined;
}

function toHost(root: string, mudPath: string): string {
    const resolved = path.join(root, ...normalize(mudPath).split('/').filter(Boolean));
    // Sicherheitsnetz: nie außerhalb der Mudlib lesen.
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
        throw new Error(`Pfad außerhalb der Mudlib: ${mudPath}`);
    }
    return resolved;
}

/** Felder mit undefined weglassen — spart Platz in der Ausgabe. */
function compact<T extends object>(obj: T): T {
    for (const key of Object.keys(obj) as (keyof T)[]) {
        if (obj[key] === undefined) {
            delete obj[key];
        }
    }
    return obj;
}

function generatorVersion(): string {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('../../package.json').version as string;
    } catch {
        return 'unbekannt';
    }
}

function parseArgs(args: string[]): Options | undefined {
    const opts: Partial<Options> & { exclude: RegExp[]; includeDirs: string[] } = {
        classes: /\/i\//,
        exclude: [],
        includeDirs: [],
        includeOld: false,
        includeW: false
    };
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        const value = (): string => {
            const v = args[++i];
            if (v === undefined) {
                throw new Error(`Wert fehlt für ${arg}`);
            }
            return v;
        };
        try {
            switch (arg) {
                case '--lib': opts.lib = value(); break;
                case '--out': opts.out = value(); break;
                case '--simul-efun': opts.simulEfun = value(); break;
                case '--classes': opts.classes = new RegExp(value()); break;
                case '--exclude': opts.exclude.push(new RegExp(value())); break;
                case '--include-dir': opts.includeDirs.push(value()); break;
                case '--include-old': opts.includeOld = true; break;
                case '--include-w': opts.includeW = true; break;
                default:
                    throw new Error(`Unbekannte Option: ${arg}`);
            }
        } catch (err) {
            log(`${(err as Error).message}\n\n${USAGE}`);
            return undefined;
        }
    }
    if (!opts.lib || !opts.out) {
        log(USAGE);
        return undefined;
    }
    return opts as Options;
}

function userInfo(): string {
    const uid = process.getuid?.();
    const gid = process.getgid?.();
    return uid === undefined ? 'dieses Prozesses' : `${uid}:${gid}`;
}

function log(message: string): void {
    process.stderr.write(message + '\n');
}

main().then(
    (code) => {
        process.exitCode = code;
    },
    (err) => {
        log(`Fehler: ${err?.stack ?? err}`);
        process.exitCode = 1;
    }
);
