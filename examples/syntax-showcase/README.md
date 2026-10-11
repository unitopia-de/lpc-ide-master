# Syntax-Showcase

`showcase.c` enthält **alle** LPC-Syntax-Elemente, die das Plugin highlightet.
Die Datei ist nicht auf Kompilierbarkeit ausgelegt — sie dient dem **visuellen
Test des Syntax-Highlightings** und der anderen Provider.

## So nutzt du sie

1. Im Dev-Host (F5) Plugin starten.
2. **Datei → Datei öffnen…** → diese `showcase.c`.
3. **Strg+Shift+P** → `Inspect Editor Tokens and Scopes` öffnet ein Popup,
   das pro Cursor-Position den genauen TextMate-Scope anzeigt.

## Abschnitte

| # | Abschnitt | Was es testet |
|---|---|---|
| 1 | Kommentare | Line/Block, Code-Tags (TODO/FIXME/…) |
| 2 | Preprocessor | `#include`, `#define`, `#if/#elif/#else/#endif`, `#pragma`, `#warn`, `#error`, Backslash-Continuation |
| 3 | Konstanten | `__FILE__`, `__LDMUD__`, `__VERSION__`, … |
| 4 | Typen + Modifier | Alle 18 Typen + 9 Modifier |
| 5 | Strukturen | `struct Name { ... }` |
| 6 | Zahlen | Dec, Hex, Bin, Oct, Float (mit `e`, `f`, `L`, `u`, `.`) |
| 7 | Zeichen + Symbole | Char-Literals mit Escapes, `'name`-Symbole |
| 8 | Strings | Plain, Escapes, sprintf-Placeholder, Heredoc (`@TAG`, `@@TAG`) |
| 9 | Closures | `#'name`, `lambda()`, `(: ... :)`, `$1`-Captures |
| 10 | LPC-Klammern | `({ })` Array, `([ ])` Mapping, `(< >)` Multiset |
| 11 | Kontrollstrukturen | if/else, for, while, do, foreach, switch/case/default, break/continue/return |
| 12 | Inherit + Applies | `inherit`, `virtual inherit`, `create`/`init`/`reset`/`heart_beat`/`catch_tell` |
| 13 | Funktions-Deklarationen | Mit verschiedenen Modifier-Kombinationen |
| 14 | Efun-Aufrufe | Hover/Completion/Signature-Help testen |
| 15 | Sfun-Aufrufe | UNItopia-spezifisch (`SetProp`, `QueryProp`, …) |
| 16 | Operatoren | Arithmetik, Zuweisung, Vergleich, Logik, Bitwise, Member/Scope, Ternär |
| 17 | `catch` / `throw` | LPC-Fehlerbehandlung |
| 18 | Coroutinen | LDMud 3.6+: `coroutine`, `yield`, `call_coroutine` |
| 19 | sprintf-Formate | Verschiedene Format-Specifier |
| 20 | Edge-Cases | Tab-Escapes, Pfad-Strings, große Bit-Shifts |

## Was du im Editor prüfen kannst

- **Theme-Wechsel**: Die Datei zeigt sofort, wie unterschiedliche Themes die
  Token-Scopes interpretieren. Dunkle Themes wie *Dark+* funktionieren mit
  der jetzigen Grammatik gut.
- **Hover**: Mouse über `write`, `find_player`, `sprintf` → Tooltip mit
  Signatur und Doku.
- **Completion**: Tippe in einer Funktion `wri` → Vorschlagsliste.
- **Outline-Panel** (Strg+Shift+O): zeigt alle Funktionen, Variablen und
  `inherit`-Pfade — die Anzahl sollte zu den Abschnittsüberschriften passen.
- **Diagnostics** (Strg+Shift+M): Du solltest Warnungen für die drei
  Heredoc-Inhalts-Strings sehen, falls dort `inherit`/`#include` interpretiert
  wird — und keine Warnung in normalen Code-Bereichen. (Edge-Cases der Engine.)
- **Goto-Definition**: Strg+Klick auf `create` in `efun_demo` springt zu
  dessen Definition oben in der Datei.

## Bekannte Anzeige-Edge-Cases

- **Heredoc-Inhalt** mit Format-Placeholdern wird sprintf-artig gefärbt —
  beabsichtigt.
- **`(int)pl->query_level()`** — der Cast `(int)` wird aktuell nicht
  separat hervorgehoben (TextMate-Grammar-Grenze).
- **Verschachtelte Klammer-Konstrukte** (`(([ ... ]))`) klappen, brauchen aber
  im Theme-Inspektor genaue Beobachtung.
