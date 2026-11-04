// Erkennt call_other-Aufrufe (ob->fun(), ob.fun()) vor einem Funktionsnamen —
// gemeinsam für Hover und Strg+Klick.

export interface CallContext {
    /** Zielobjekt als Pfad, wenn es ein String-Literal ist ("/i/room"->fun()). */
    target?: string;
    /** this_object()->fun(): Funktion der eigenen Datei. */
    self: boolean;
}

/**
 * `before` ist der Zeilentext vor dem Funktionsnamen. Liefert undefined, wenn
 * kein "->" bzw. "." davor steht ("..", "1." usw. zählen nicht).
 */
export function callContext(before: string): CallContext | undefined {
    const m = /(->|(?<![.\d])\.)\s*$/.exec(before);
    if (!m) {
        return undefined;
    }
    const object = before.slice(0, m.index).trimEnd();
    const literal = /"([^"\\]+)"$/.exec(object);
    return {
        target: literal?.[1],
        self: /\bthis_object\s*\(\s*\)$/.test(object)
    };
}
