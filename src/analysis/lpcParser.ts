// Leichtgewichtiger LPC-Parser auf Regex-Basis. Kein echter Compiler —
// er erkennt Funktionen, inherit, #include und #define gut genug für
// Completion, Hover, Outline und Goto-Definition.

const TYPE_KW =
    '(?:void|int|float|string|bytes|object|lwobject|mapping|mixed|closure|symbol|coroutine|lpctype|status|unknown|struct\\s+\\w+)';
const TYPE_PATTERN = `${TYPE_KW}(?:\\s*\\*)*(?:\\s*\\|\\s*${TYPE_KW}(?:\\s*\\*)*)*`;
const MOD_PATTERN = '(?:public|protected|private|static|nomask|varargs|deprecated|noshadow|nosave|visible)';

// [modifier*] [typ] name(parameter) { oder ;
// Nach einem '*' darf der Name direkt folgen ("string *foo(").
const FUNC_REGEX = new RegExp(
    `^[ \\t]*((?:${MOD_PATTERN}\\s+)*)(?:(${TYPE_PATTERN})(?:\\s+|(?<=\\*)\\s*))?(\\w+)\\s*\\(([^)]*)\\)\\s*([{;])`,
    'gm'
);

// Globale Variable: [modifier*] typ name = ... ;  bzw.  typ name;  (nur außerhalb von Funktionen)
const VARIABLE_REGEX = new RegExp(
    `^[ \\t]*((?:${MOD_PATTERN}\\s+)*)(${TYPE_PATTERN})(?:\\s+|(?<=\\*)\\s*)(\\w+)\\s*[=;,]`,
    'gm'
);

const NOT_A_FUNCTION = new Set([
    'if', 'else', 'for', 'foreach', 'while', 'do', 'switch', 'case', 'return',
    'catch', 'sizeof', 'inherit', 'default', 'break', 'continue'
]);

const INHERIT_REGEX = new RegExp(
    `^[ \\t]*(?:(?:virtual|public|protected|private|static|nosave|deprecated)\\s+)*inherit\\s+([^;]+);`,
    'gm'
);
const INCLUDE_REGEX = /^[ \t]*#[ \t]*include[ \t]+(?:"([^"]+)"|<([^>]+)>)/gm;
const DEFINE_REGEX = /^[ \t]*#[ \t]*define[ \t]+(\w+)[ \t]+(.+)$/gm;

export interface LpcFunction {
    name: string;
    /** Normalisierte Signatur, z. B. "varargs string file_path(object|lwobject ob)". */
    signature: string;
    modifiers: string[];
    /** true, wenn nur eine Deklaration (Prototyp) ohne Rumpf. */
    isPrototype: boolean;
    /** Position des Funktionsnamens im Original-Text. */
    offset: number;
    line: number;
    character: number;
    /** Offset des Zeilenanfangs der Deklaration (für die Outline). */
    declOffset: number;
    /** Länge der Deklaration bis einschließlich '{' bzw. ';'. */
    declLength: number;
    /** Dokumentation als Markdown, falls ein Kommentar direkt davor steht. */
    documentation?: string;
    /** DEKLARATION aus einem UNItopia-Doku-Kommentar, z. B. "string file_path([object file])". */
    declaration?: string;
}

export interface LpcVariable {
    name: string;
    type: string;
    offset: number;
    length: number;
}

export interface LpcInherit {
    /** Roh-Ausdruck hinter inherit, z. B. "\"/i/room\"", "CPR" oder "SBI+\"x\"". */
    expression: string;
    offset: number;
    length: number;
}

export interface LpcInclude {
    path: string;
    /** true bei <datei>, false bei "datei". */
    system: boolean;
}

export interface ParsedLpc {
    functions: LpcFunction[];
    variables: LpcVariable[];
    inherits: LpcInherit[];
    includes: LpcInclude[];
    /** #define NAME wert — Werte als Roh-Text. */
    defines: Map<string, string>;
    /** Alle Doku-Blöcke im UNItopia-Format, auch solche ohne Funktion darunter. */
    docBlocks: LpcDocBlock[];
}

export interface LpcDocBlock {
    /** Namen aus "FUNKTION:" (ein Block kann mehrere Funktionen beschreiben). */
    names: string[];
    declaration?: string;
    markdown: string;
    /** 0-basierte Zeile, in der der Kommentar beginnt. */
    line: number;
}

export function parseLpc(source: string): ParsedLpc {
    // CRLF-Dateien: "\r" vor "\n" durch ein Leerzeichen ersetzen — gleiche Länge,
    // also bleiben alle Offsets gültig; die Regex der Doku-Erkennung sehen nur "\n".
    const text = source.replace(/\r(?=\n)/g, ' ');
    const blockComments: { start: number; end: number }[] = [];
    const stripped = stripCommentsAndStrings(text, blockComments);
    const mask = inactiveLineMask(stripped);
    const code = applyLineMask(stripped, mask);
    // Für die Doku-Suche: Kommentare behalten, inaktive Zweige und #if-Zeilen ausblenden —
    // sonst trennt ein "#if ... #else" den Kommentar von der Funktion.
    const docText = applyLineMask(text, mask);
    const lineStarts = computeLineStarts(text);

    const functions: LpcFunction[] = [];
    // Für die Gruppenregel unten: Prototypen mit schlichtem Kommentar darüber.
    const plainDocPrototypes: { fn: LpcFunction; endLine: number }[] = [];
    const depthAt = depthTracker(code);
    for (const m of code.matchAll(FUNC_REGEX)) {
        const name = m[3];
        if (NOT_A_FUNCTION.has(name)) {
            continue;
        }
        const start = m.index ?? 0;
        if (depthAt(start) !== 0) {
            continue;
        }
        const modsRaw = m[1].trim();
        const type = m[2]?.trim().replace(/\s+/g, ' ');
        const isPrototype = m[5] === ';';
        // Ohne Rückgabetyp nur echte Definitionen akzeptieren (sonst zu viele Fehltreffer).
        if (!type && isPrototype) {
            continue;
        }

        // Der Name steht direkt vor der ersten '(' (ggf. mit Leerraum dazwischen).
        const parenIdx = m[0].indexOf('(');
        let nameEnd = parenIdx;
        while (nameEnd > 0 && /\s/.test(m[0][nameEnd - 1])) {
            nameEnd--;
        }
        const nameOffset = start + nameEnd - name.length;
        const params = text.substring(start + parenIdx + 1, start + m[0].lastIndexOf(')'));
        const signature = [modsRaw, type, `${name}(${normalizeParams(params)})`]
            .filter((s) => s)
            .join(' ')
            .replace(/\s+/g, ' ')
            .replace(/\s*\*\s*/g, ' *')
            .replace(/\| \*/g, '|*');
        const pos = offsetToPosition(lineStarts, nameOffset);
        const declOffset = start + (m[0].length - m[0].trimStart().length);
        const doc = extractDocumentation(docText, lineStarts, offsetToPosition(lineStarts, declOffset).line, name);
        const fn: LpcFunction = {
            name,
            signature,
            modifiers: modsRaw ? modsRaw.split(/\s+/) : [],
            isPrototype,
            offset: nameOffset,
            line: pos.line,
            character: pos.character,
            declOffset,
            declLength: start + m[0].length - declOffset,
            documentation: doc?.markdown,
            declaration: doc?.declaration
        };
        functions.push(fn);
        if (isPrototype && doc?.plain) {
            plainDocPrototypes.push({ fn, endLine: offsetToPosition(lineStarts, start + m[0].length).line });
        }
    }

    // Ein schlichter Kommentar über einem Prototyp, dem direkt der nächste Prototyp
    // folgt, ist eine Überschrift für die ganze Gruppe ("// Funktionen aus …"), keine Doku.
    const prototypeLines = new Set(
        functions.filter((f) => f.isPrototype).map((f) => offsetToPosition(lineStarts, f.declOffset).line)
    );
    for (const { fn, endLine } of plainDocPrototypes) {
        if (prototypeLines.has(endLine + 1)) {
            fn.documentation = undefined;
        }
    }

    const inherits: LpcInherit[] = [];
    for (const m of code.matchAll(INHERIT_REGEX)) {
        const start = m.index ?? 0;
        const exprStart = start + m[0].indexOf(m[1]);
        // Den Ausdruck aus dem Original nehmen — im bereinigten Text sind Strings leer.
        inherits.push({
            expression: text.substring(exprStart, exprStart + m[1].length).trim(),
            offset: start + (m[0].length - m[0].trimStart().length),
            length: m[0].trim().length
        });
    }

    const variables: LpcVariable[] = [];
    const varDepthAt = depthTracker(code);
    const functionNames = new Set(functions.map((f) => f.name));
    for (const m of code.matchAll(VARIABLE_REGEX)) {
        const start = m.index ?? 0;
        if (varDepthAt(start) !== 0 || functionNames.has(m[3])) {
            continue;
        }
        const declOffset = start + (m[0].length - m[0].trimStart().length);
        variables.push({
            name: m[3],
            type: m[2].trim().replace(/\s+/g, ' '),
            offset: declOffset,
            length: start + m[0].length - 1 - declOffset
        });
    }

    const includes: LpcInclude[] = [];
    const defines = new Map<string, string>();
    // Präprozessor-Zeilen stehen im bereinigten Text noch, Strings darin aber nicht —
    // daher Treffer im Original an derselben Position auswerten.
    for (const m of code.matchAll(/^[ \t]*#[ \t]*(include|define)\b.*$/gm)) {
        const start = m.index ?? 0;
        // Nur bis zum Ende des Codes lesen — ein Kommentar am Zeilenende ist im bereinigten Text leer.
        const original = text.substring(start, start + m[0].replace(/\s+$/, '').length);
        if (m[1] === 'include') {
            INCLUDE_REGEX.lastIndex = 0;
            const inc = INCLUDE_REGEX.exec(original);
            if (inc) {includes.push({ path: inc[1] ?? inc[2], system: !inc[1] });}
        } else {
            DEFINE_REGEX.lastIndex = 0;
            const def = DEFINE_REGEX.exec(original);
            if (def && !defines.has(def[1])) {
                defines.set(def[1], def[2].trim());
            }
        }
    }

    const docBlocks: LpcDocBlock[] = [];
    for (const c of blockComments) {
        const raw = text.substring(c.start + 2, Math.max(c.start + 2, c.end - 2));
        const doc = parseUnitopiaDoc(raw);
        const names = doc?.FUNKTION?.split(/[\s,]+/).filter((n) => /^[A-Za-z_]\w*$/.test(n)) ?? [];
        if (!doc || !names.length) {
            continue;
        }
        docBlocks.push({
            names,
            declaration: doc.DEKLARATION?.replace(/\s+/g, ' ').trim() || undefined,
            markdown: unitopiaDocToMarkdown(doc),
            line: offsetToPosition(lineStarts, c.start).line
        });
    }

    return { functions, variables, inherits, includes, defines, docBlocks };
}

/**
 * Wertet einen einfachen String-Ausdruck aus: Literale, Makros und deren
 * Verkettung mit '+' oder durch Nebeneinanderstellen. Liefert undefined,
 * wenn etwas nicht auflösbar ist.
 */
export function evaluateStringExpression(
    expression: string,
    defines: Map<string, string>,
    depth = 0
): string | undefined {
    if (depth > 8) {
        return undefined;
    }
    let result = '';
    const tokenRegex = /\s*(?:"((?:[^"\\]|\\.)*)"|(\w+)|(\+)|\(|\))\s*/y;
    let pos = 0;
    let sawValue = false;
    const expr = expression.trim();
    while (pos < expr.length) {
        tokenRegex.lastIndex = pos;
        const t = tokenRegex.exec(expr);
        if (!t) {
            return undefined;
        }
        pos = tokenRegex.lastIndex;
        if (t[1] !== undefined) {
            result += t[1].replace(/\\(.)/g, '$1');
            sawValue = true;
        } else if (t[2] !== undefined) {
            const value = defines.get(t[2]);
            if (value === undefined) {
                return undefined;
            }
            const resolved = evaluateStringExpression(value, defines, depth + 1);
            if (resolved === undefined) {
                return undefined;
            }
            result += resolved;
            sawValue = true;
        }
        // '+', '(' und ')' werden übersprungen.
    }
    return sawValue ? result : undefined;
}

/** Kommentare und Strings durch Leerzeichen gleicher Länge ersetzen; Offsets bleiben gültig. */
export function stripCommentsAndStrings(
    text: string,
    blockComments?: { start: number; end: number }[]
): string {
    const out: string[] = [];
    let i = 0;
    const n = text.length;
    while (i < n) {
        const ch = text[i];
        const next = text[i + 1];
        if (ch === '/' && next === '/') {
            while (i < n && text[i] !== '\n') {
                out.push(' ');
                i++;
            }
        } else if (ch === '/' && next === '*') {
            const end = text.indexOf('*/', i + 2);
            const stop = end === -1 ? n : end + 2;
            blockComments?.push({ start: i, end: stop });
            for (let j = i; j < stop; j++) {
                out.push(text[j] === '\n' ? '\n' : ' ');
            }
            i = stop;
        } else if (ch === '\'' && isCharLiteral(text, i)) {
            // Zeichenliterale wie '"' oder '\'' — sonst bringen sie die String-Erkennung durcheinander.
            const len = text[i + 1] === '\\' ? 4 : 3;
            for (let j = 0; j < len; j++) {
                out.push(' ');
            }
            i += len;
        } else if (ch === '"') {
            out.push('"');
            i++;
            while (i < n && text[i] !== '"' && text[i] !== '\n') {
                if (text[i] === '\\' && i + 1 < n) {
                    out.push(' ', text[i + 1] === '\n' ? '\n' : ' ');
                    i += 2;
                    continue;
                }
                out.push(' ');
                i++;
            }
            if (i < n && text[i] === '"') {
                out.push('"');
                i++;
            }
        } else {
            out.push(ch);
            i++;
        }
    }
    return out.join('');
}

function isCharLiteral(text: string, i: number): boolean {
    if (text[i + 1] === '\\') {
        return text[i + 3] === '\'';
    }
    return text[i + 2] === '\'' && text[i + 1] !== '\n';
}

/**
 * Blendet Präprozessor-Zweige aus, die vermutlich nicht aktiv sind.
 * Faustregel: Gibt es ein #else, gilt der #else-Zweig (typisch für
 * "#if Sonderfall ... #else Normalfall"); "#if 0" ist immer inaktiv,
 * "#if 1" immer aktiv. Ohne #else bleibt der Zweig aktiv.
 * Treiber-Makros (#ifdef __LDMUD__ usw.) gelten als definiert.
 */
export function blankInactiveRegions(code: string): string {
    return applyLineMask(code, inactiveLineMask(code));
}

function applyLineMask(text: string, mask: boolean[]): string {
    return text
        .split('\n')
        .map((l, i) => (mask[i] ? ' '.repeat(l.length) : l))
        .join('\n');
}

/** Zeilen, die ausgeblendet werden: inaktive Zweige sowie die #if/#else/#endif-Zeilen selbst. */
function inactiveLineMask(code: string): boolean[] {
    const lines = code.split('\n');
    interface Branch { line: number; cond: string }
    interface Group { branches: Branch[]; end: number }
    const groups: Group[] = [];
    const stack: Group[] = [];
    const directive = new Array<boolean>(lines.length).fill(false);

    lines.forEach((l, idx) => {
        const m = /^[ \t]*#[ \t]*(if|ifdef|ifndef|elif|else|endif)\b(.*)$/.exec(l);
        if (!m) {
            return;
        }
        directive[idx] = true;
        const kind = m[1];
        if (kind === 'if' || kind === 'ifdef' || kind === 'ifndef') {
            const cond = kind === 'if' ? m[2].trim() : `${kind} ${m[2].trim()}`;
            const g: Group = { branches: [{ line: idx, cond }], end: -1 };
            stack.push(g);
            groups.push(g);
        } else if (kind === 'elif' || kind === 'else') {
            stack[stack.length - 1]?.branches.push({ line: idx, cond: kind === 'else' ? 'else' : m[2].trim() });
        } else {
            const g = stack.pop();
            if (g) {
                g.end = idx;
            }
        }
    });

    const inactive = new Array<boolean>(lines.length).fill(false);
    for (const g of groups) {
        if (g.end < 0) {
            continue;
        }
        const first = g.branches[0].cond;
        const hasElse = g.branches.some((b) => b.cond === 'else');
        let active: number;
        if (first === '1' || /^ifdef __\w+__$/.test(first) || /^defined\s*\(?\s*__\w+__\s*\)?$/.test(first)) {
            active = 0;
        } else if (/^ifndef __\w+__$/.test(first)) {
            active = hasElse ? g.branches.length - 1 : -1;
        } else if (hasElse) {
            active = g.branches.length - 1;
        } else {
            active = g.branches.findIndex((b) => b.cond !== '0');
        }
        g.branches.forEach((b, i) => {
            if (i === active) {
                return;
            }
            const stop = i + 1 < g.branches.length ? g.branches[i + 1].line : g.end;
            for (let l = b.line + 1; l < stop; l++) {
                inactive[l] = true;
            }
        });
    }
    // Auch die #if/#else/#endif-Zeilen selbst ausblenden — sonst trennen sie einen
    // Funktionskopf von seiner "{" ("varargs string f(...)" / "#endif" / "{").
    return lines.map((_l, i) => inactive[i] || directive[i]);
}

// Liefert eine Funktion, die für aufsteigende Offsets die Klammertiefe ({ }) zurückgibt.
function depthTracker(code: string): (offset: number) => number {
    let pos = 0;
    let depth = 0;
    return (offset: number) => {
        for (; pos < offset; pos++) {
            const ch = code[pos];
            if (ch === '{') {
                depth++;
            }
            else if (ch === '}') {
                depth = Math.max(0, depth - 1);
            }
        }
        return depth;
    };
}

function normalizeParams(params: string): string {
    return params.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/\s+/g, ' ').trim();
}

function computeLineStarts(text: string): number[] {
    const starts = [0];
    for (let i = 0; i < text.length; i++) {
        if (text[i] === '\n') {
            starts.push(i + 1);
        }
    }
    return starts;
}

function offsetToPosition(lineStarts: number[], offset: number): { line: number; character: number } {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (lineStarts[mid] <= offset) {
            lo = mid;
        }
        else {
            hi = mid - 1;
        }
    }
    return { line: lo, character: offset - lineStarts[lo] };
}

// --- Dokumentations-Kommentare --------------------------------------------

/**
 * Sucht einen Kommentar direkt über der Deklaration (Zeile declLine).
 * UNItopia-Format ("FUNKTION: ... BESCHREIBUNG: ...") wird auch akzeptiert,
 * wenn Leerzeilen dazwischen liegen — sonst muss der Kommentar unmittelbar
 * darüber stehen.
 */
function extractDocumentation(
    text: string,
    lineStarts: number[],
    declLine: number,
    name: string
): { markdown?: string; declaration?: string; plain?: boolean } | undefined {
    let gap = 0;
    let p = lineStarts[declLine] - 1;
    while (p >= 0 && /\s/.test(text[p])) {
        if (text[p] === '\n') {
            gap++;
        }
        p--;
    }
    if (p < 1) {
        return undefined;
    }

    let raw: string | undefined;
    if (text[p] === '/' && text[p - 1] === '*') {
        const open = text.lastIndexOf('/*', p - 2);
        if (open < 0) {
            return undefined;
        }
        raw = text.substring(open + 2, p - 1);
    } else if (gap <= 1) {
        // Zusammenhängende //-Zeilen direkt darüber
        const collected: string[] = [];
        for (let l = declLine - 1; l >= 0; l--) {
            const t = lineText(text, lineStarts, l).trim();
            if (!t.startsWith('//')) {
                break;
            }
            collected.unshift(t.replace(/^\/\/+ ?/, ''));
        }
        if (collected.length) {
            raw = collected.join('\n');
        }
    }
    if (!raw) {
        return undefined;
    }

    const unitopia = parseUnitopiaDoc(raw);
    if (unitopia) {
        if (unitopia.FUNKTION && !unitopia.FUNKTION.split(/[\s,]+/).includes(name)) {
            return undefined;
        }
        return {
            markdown: unitopiaDocToMarkdown(unitopia) || undefined,
            declaration: unitopia.DEKLARATION?.replace(/\s+/g, ' ').trim() || undefined
        };
    }
    if (gap > 1) {
        return undefined;
    }
    const cleaned = raw
        .split('\n')
        .map((l) => l.replace(/^\s*\*+ ?/, ''))
        .filter((l) => !/^[\s\-=*_#~+]+$/.test(l))
        .join('\n')
        .trim();
    // Kopfkommentare von Dateien ("This file is part...", "File:") und
    // Abschnitts-Überschriften ("--- Initialisierung: ---") nicht als Doku verwenden.
    if (!cleaned || /^(This file is part|File:)/m.test(cleaned)) {
        return undefined;
    }
    if (/^[-=*]{2,}.*[-=*]{2,}$/.test(cleaned)) {
        return undefined;
    }
    // Überschriften über Prototyp-Blöcken ("// Prototypes", "Prototypen:", "Protos").
    if (!cleaned.includes('\n') && SECTION_HEADING.test(cleaned)) {
        return undefined;
    }
    return { markdown: textToMarkdown(cleaned), plain: true };
}

const SECTION_HEADING =
    /^(?:forward[ -]?)?(?:proto(?:typ\w*|s)?|deklarationen|declarations?|vorwärtsdeklarationen)\b[^.!?]{0,40}$/i;

function lineText(text: string, lineStarts: number[], line: number): string {
    const end = line + 1 < lineStarts.length ? lineStarts[line + 1] - 1 : text.length;
    return text.substring(lineStarts[line], end);
}

// Feldnamen der UNItopia-Doku. Andere Großbuchstaben-Wörter mit Doppelpunkt
// ("ACHTUNG:") gehören zum Text des jeweiligen Feldes.
const UNITOPIA_DOC_KEYS = new Set([
    'FUNKTION', 'DEKLARATION', 'BESCHREIBUNG', 'VERWEISE', 'GRUPPEN',
    'BEISPIEL', 'BEISPIELE', 'NOENZY', 'SOURCE'
]);

export type UnitopiaDoc = Record<string, string>;

/** Zerlegt einen Kommentar im UNItopia-Format in seine Felder. */
export function parseUnitopiaDoc(raw: string): UnitopiaDoc | undefined {
    if (!/^[ \t*]*FUNKTION:/m.test(raw)) {
        return undefined;
    }
    const doc: UnitopiaDoc = {};
    let key: string | undefined;
    for (const line of raw.split('\n')) {
        const cleaned = line.replace(/^[ \t]*\*+ ?/, '');
        const m = /^([A-Z]+):[ \t]?(.*)$/.exec(cleaned);
        if (m && UNITOPIA_DOC_KEYS.has(m[1])) {
            key = m[1];
            doc[key] = m[2];
        } else if (key) {
            doc[key] += '\n' + cleaned;
        }
    }
    for (const k of Object.keys(doc)) {
        doc[k] = doc[k].replace(/\s+$/, '');
    }
    return doc;
}

function unitopiaDocToMarkdown(doc: UnitopiaDoc): string {
    const parts: string[] = [];
    if (doc.BESCHREIBUNG) {
        parts.push(textToMarkdown(doc.BESCHREIBUNG));
    }
    const example = doc.BEISPIEL ?? doc.BEISPIELE;
    if (example?.trim()) {
        parts.push('**Beispiel:**\n\n' + textToMarkdown(example));
    }
    if (doc.VERWEISE?.trim()) {
        parts.push(`*Siehe auch:* ${escapeMarkdown(doc.VERWEISE.replace(/\s+/g, ' ').trim())}`);
    }
    return parts.join('\n\n');
}

// --- Hilfsfunktionen ------------------------------------------------------

/** Dekodiert Dateiinhalt als UTF-8, bei ungültigen Bytes als Latin-1 (ältere Mudlib-Dateien). */
export function decodeText(data: Uint8Array): string {
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(data);
    } catch {
        return new TextDecoder('latin1').decode(data);
    }
}

// --- Markdown -------------------------------------------------------------

export function escapeMarkdown(s: string): string {
    return s.replace(/([\\`*_{}[\]<>#|~])/g, '\\$1');
}

/**
 * Wandelt Fließtext aus Doku-Dateien in Markdown um: gemeinsame Einrückung
 * entfernen, Absätze zusammenziehen, stärker eingerückte Zeilen als
 * Code-Block darstellen.
 */
export function textToMarkdown(text: string): string {
    const lines = text.replace(/\t/g, '        ').split('\n');
    const indents = lines.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length);
    const base = indents.length ? Math.min(...indents) : 0;
    const out: string[] = [];
    let para: string[] = [];
    let code: string[] = [];

    const flushPara = (): void => {
        if (para.length) {
            out.push(escapeMarkdown(para.join(' ')));
        }
        para = [];
    };
    const flushCode = (): void => {
        if (code.length) {
            const ci = Math.min(...code.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length));
            out.push('```\n' + code.map((l) => l.substring(ci)).join('\n').replace(/\n+$/, '') + '\n```');
        }
        code = [];
    };

    for (const raw of lines) {
        const l = raw.substring(Math.min(base, raw.length - raw.trimStart().length)).replace(/\s+$/, '');
        if (!l.trim()) {
            if (code.length) {
                code.push('');
            }
            else {
                flushPara();
            }
            continue;
        }
        if (/^\s/.test(l)) {
            flushPara();
            code.push(l);
        } else {
            flushCode();
            para.push(l.trim());
        }
    }
    flushPara();
    flushCode();
    return out.join('\n\n');
}
