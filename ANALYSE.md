# Analyse: LPC-IDE-Master (UNItopia Edition)

Stand der Analyse: 2026-11-02 (erstmals 2026-10-11) · Branch `master`

## 1. Überblick

| Eigenschaft | Wert |
| --- | --- |
| Paketname | `lpc-ide-master` |
| Anzeigename | LPC-IDE-Master (UNItopia Edition) |
| Version | 0.1.0 |
| Publisher | `myonara` (Extension-ID `myonara.lpc-ide-master`, im VS Code Marketplace veröffentlicht) |
| Lizenz | MIT (`LICENSE` noch nicht eingecheckt) |
| VS-Code-Version | `^1.85.0` |
| Sprache | TypeScript (strict), ca. 3.350 Zeilen in 23 Dateien unter `src/` |
| Laufzeit-Abhängigkeiten | `basic-ftp`, `ssh2-sftp-client` |
| Einstiegspunkt | `out/extension.js` (kompiliert aus [src/extension.ts](src/extension.ts)) |

Die Extension ist eine Entwicklungsumgebung für LPC (die Sprache von LP-MUDs), mit Schwerpunkt
auf der UNItopia-Mudlib (LDMud 3.5/3.6). Sie kombiniert vier Bereiche:

1. **Sprachunterstützung** – Syntax-Highlighting und eigene Editor-Provider (ohne externen Language Server)
2. **Remote-Dateisystem** – Mudlib-Dateien per FTP/FTPS/SFTP direkt im Editor bearbeiten (`lpc-ftp://`)
3. **HomeMUD** – ein lokales Entwicklungs-MUD mit Datei-Abgleich zum Remote-MUD
4. **MUD-Terminal** – Telnet-/TLS-Verbindung zum MUD als Terminal in VS Code

## 2. Build- und Qualitätsstatus

| Prüfung | Ergebnis |
| --- | --- |
| `tsc -p ./ --noEmit` | ✅ fehlerfrei |
| `eslint src --ext ts` | ⚠️ 0 Fehler, 72 Warnungen (fast nur die `curly`-Regel; 69 mit `--fix` automatisch behebbar) |
| Unit-Tests | ❌ keine vorhanden |
| CI | ❌ keine eingerichtet |
| VSIX-Paketierung | ✅ `npm run package` erzeugt `lpc-ide-master-0.2.1.vsix` (271 Dateien, 655 KB); `@vscode/vsce` 4.0.0 ist devDependency |
| Git | 9 Commits; uncommittet: `.vscodeignore`, `language-configuration.json` (`colorizedBracketPairs`), neu: `LICENSE`, `examples/syntax-showcase/` |

## 3. Architektur

```
src/
├── extension.ts                 Aktivierung, Verdrahtung aller Dienste
├── config/lpcConfig.ts          Laden + Validieren von lpc-config.json, File-Watcher
├── dialect/
│   ├── dialectManager.ts        Aktiver Dialekt, Auto-Erkennung, Umschalten
│   └── efunProvider.ts          Efun/Sfun-Definitionen aus Profil + Workspace-Datei
├── ftp/
│   ├── backend.ts               Gemeinsames Interface RemoteBackend
│   ├── ftpBackend.ts            FTP / FTPS / FTPS-implicit (basic-ftp)
│   ├── sftpBackend.ts           SFTP (ssh2-sftp-client)
│   ├── connectionManager.ts     Eine Verbindung pro Host, Passwortabfrage
│   ├── credentialsManager.ts    Passwörter in SecretStorage (OS-Keychain)
│   └── ftpFileSystemProvider.ts vscode.FileSystemProvider für lpc-ftp://
├── tree/remoteExplorerProvider.ts   Baumansicht "Remote Explorer" (Lazy Loading)
├── homemud/homeMudService.ts    Pfad-Mapping und rekursives Kopieren Remote ↔ lokal
├── mud/
│   ├── mudClient.ts             Eigener Telnet/TLS-Client (Telnet-Optionen, Echo für Passwörter)
│   └── mudConsole.ts            Pseudoterminal mit Zeilenbearbeitung und Verlauf je MUD
├── analysis/
│   ├── lpcParser.ts             Regex-Parser: Funktionen, Variablen, inherit, #include, #define, Doku-Kommentare
│   ├── lpcIndex.ts              homemud-Index: Vererbung, simul_efun, Pfadauflösung ("%room", Makros)
│   ├── efunDocs.ts              Efun-Hilfe aus <homemud>/doc/efun/
│   ├── documentCache.ts         Geparste Editor-Dokumente je Version
│   ├── mudlib.ts                Pfadauflösung/Vererbung/simul_efun ohne VS-Code-Abhängigkeit (auch im Generator)
│   ├── efunDocText.ts           Umwandlung der Efun-Doku in Markdown (auch im Generator)
│   ├── indexFormat.ts           Format des Mudlib-Index und Abfragen darauf
│   └── serverIndexLoader.ts     Lädt den Mudlib-Index aus dem homemud oder per FTP (mit .stamp-Abgleich)
├── tools/buildIndex.ts          Index-Generator (Kommandozeile, Docker: tools/index-generator/)
├── providers/                   Hover, Completion, Outline, Goto-Definition,
│                                Diagnostics, Signature-Help
├── commands/index.ts            Alle 20 Befehle
├── statusBar.ts                 4 Statusleisten-Einträge
└── lsp/client.ts                Platzhalter (Stub) für einen späteren Language Server
```

Weitere Bestandteile:

- [syntaxes/lpc.tmLanguage.json](syntaxes/lpc.tmLanguage.json) – TextMate-Grammatik (LPC-Klammerformen `({ })`, `([ ])`, `(< >)`, Closures, Heredocs, Preprocessor)
- [language-configuration.json](language-configuration.json) – Klammern, Auto-Closing, Folding, Kommentare
- [schemas/lpc-config.schema.json](schemas/lpc-config.schema.json) – JSON-Schema für Autovervollständigung in `lpc-config.json`
- [resources/profiles/](resources/profiles/) – Efun-Profile `ldmud-unitopia`, `ldmud-morgengrauen`, `fluffos`
- [examples/](examples/) – `sample-workspace` (minimal), `unitopia-full` (alle Felder, ausführlich dokumentiert), `syntax-showcase` (Testdatei für das Highlighting)

### Ablauf beim Start

1. Aktivierung, sobald der Workspace eine `lpc-config.json` enthält oder eine `lpc-ftp://`-Ressource geöffnet wird.
2. `lpc-config.json` wird geladen und validiert; Fehler landen im Output-Channel **LPC-IDE-Master**.
3. Der Dialekt wird automatisch erkannt (über `mudlib.name` oder Dateien wie `secure/master.c`, `lpctypes.h`) und das passende Efun-Profil geladen.
4. Dateisystem-Provider, Baumansicht, zwei MUD-Terminals (remote, homemud), Statusleiste, Editor-Provider und Befehle werden registriert.
5. Context-Keys (`lpc.hasFtpConfig`, `lpc.ftpConnected`, `lpc.hasHomeMud`) steuern, welche Menüs und Willkommensansichten erscheinen.

## 4. Funktionsumfang im Detail

### 4.1 Sprachunterstützung

- **Sprache `lpc`** für die Endungen `.c`, `.h`, `.lpc`, `.inc`, `.d`
- **Hover** – Signatur und Beschreibung eigener und geerbter Funktionen sowie von Efuns/Sfuns
- **Completion** – eigene Funktionen, geerbte Funktionen, Efuns, Sfuns, Keywords und Typen, mit Snippet-Platzhaltern für Parameter
- **Outline** – Funktionen (auch ohne Rückgabetyp), `inherit`-Pfade, globale Variablen
- **Goto-Definition** – auf `inherit`, `#include`, eigene und geerbte Funktionen sowie Sfuns (springt in die `simul_efun`)
- **Diagnostics** (mit 400 ms Verzögerung) – Warnung bei `class` unter LDMud, nicht auflösbare `inherit`-/`#include`-Pfade; funktioniert für `file://` und `lpc-ftp://`
- **Signature-Help** – Parameterhinweis mit Hervorhebung des aktuellen Arguments, auch für eigene und geerbte Funktionen

**Zusätzlich mit HomeMUD** (lokale Mudlib, Modul [src/analysis/](src/analysis/)):

- **Vererbung:** `inherit`-Ketten werden wie vom UNItopia-Master aufgelöst: `"%room"` → `/i/room.c`, Makros aus `#define`s der Datei und ihrer Includes, Verkettungen wie `SBI+"sb_basis"`, relative Pfade. Geerbte Funktionen (ohne `private`) erscheinen in Completion, Hover, Goto-Definition und Parameterhilfe, mit Doku aus UNItopia-Kommentaren (`FUNKTION:`/`BESCHREIBUNG:`).
- **Efun-Hilfe:** Beschreibung, Beispiele und Verweise aus `doc/efun/a-m|n-z/<name>.de` (deutsch) bzw. `<name>` (englisch), erst beim ersten Bedarf gelesen.
- **Sfuns aus der `simul_efun`:** Beim Laden des Profils wird `mudlib.simulEfunFile` samt `"..."`-Includes und inherits gelesen. Alle öffentlichen Funktionen gelten als Sfuns und ergänzen bzw. überschreiben das JSON-Profil. Änderungen an diesen Dateien laden die Liste automatisch neu.
- **Aufwand:** Getestet gegen die UNItopia-Mudlib: 49.010 Dateien ohne Parserfehler, im Schnitt 0,35 ms pro Datei. Eine Vererbungskette wie `/i/room` (16 Dateien) ist beim ersten Mal in rund 60 ms aufgelöst, danach aus dem Zwischenspeicher in 1–2 ms.

### 4.2 Remote-Dateisystem (`lpc-ftp://`)

- URIs der Form `lpc-ftp://<host>/<absoluter-mudpfad>`
- Lesen, Schreiben, Auflisten, Anlegen, Umbenennen, Löschen
- Protokolle: `ftp`, `ftps` (AUTH TLS), `ftps-implicit`, `sftp`
- `tls.rejectUnauthorized: false` erlaubt selbst-signierte Zertifikate
- Eine Verbindung pro Host; gleichzeitige Verbindungsaufbauten werden zusammengeführt, Operationen serialisiert
- Passwörter nur in der OS-Keychain (SecretStorage), nie in Dateien
- Protokoll-Mitschnitt mit `lpc.ftp.verbose` im Output-Channel **LPC FTP Trace**

### 4.3 Remote Explorer

Eigener Bereich **Remote MUD** in der Activity Bar. Verzeichnisse werden erst beim Aufklappen geladen,
Ordner stehen vor Dateien. Kontextmenü: Neue Datei/Ordner, Umbenennen, Löschen (mit Bestätigung),
Pfad kopieren, „Nach homemud kopieren“.

### 4.4 HomeMUD

Pfad-Mapping zwischen Remote und lokalem Verzeichnis:

```
remoteRoot = ftp.remoteRoot ?? mudlib.baseDir ?? "/"
localRoot  = <workspace>/<homemud.path>/<homemud.libPath ?? "/lib">
```

`lpc-ftp://host/<remoteRoot>/foo/bar.c` entspricht also `<localRoot>/foo/bar.c`. Dateien und ganze
Verzeichnisse lassen sich in beide Richtungen rekursiv kopieren (mit Fortschrittsanzeige, ohne `.git` und `node_modules`).

### 4.5 MUD-Terminal (Telnet)

- Standardmäßig **aus**; wird über das Setting `lpc.mud.enabled` eingeschaltet
- Eigener TCP-/TLS-Client (`telnet` / `telnets`), UTF-8; von den Telnet-Optionen wird nur ECHO ausgewertet (Passworteingabe verbergen), alle anderen lehnt der Client ab
- VS-Code-Pseudoterminal mit lokaler Zeilenbearbeitung, Verlauf und ANSI-Farben; Enter verbindet nach einem Abbruch neu
- Kein automatisches Login und keine gespeicherten MUD-Passwörter; früher gespeicherte werden beim Start entfernt
- Zwei getrennte Terminals: **remote** und **homemud**

### 4.6 Statusleiste

Bis zu vier Einträge: Dialekt mit Anzahl der Symbole, FTP-Status, Remote-MUD, HomeMUD. Ein Klick
auf FTP oder MUD verbindet bzw. trennt.

## 5. Verwendung

### 5.1 Installation / Entwicklung

```bash
npm install
npm run compile      # oder: npm run watch
```

Danach in VS Code **F5** drücken („Run Extension“). Das startet einen Extension Development Host
mit dem Plugin.

Ein VSIX-Paket erstellen:

```bash
npm run package
code --install-extension lpc-ide-master-0.2.12.vsix
```

### 5.2 Workspace einrichten

Lege im Workspace-Root eine `lpc-config.json` an. Minimal:

```json
{
  "$schema": "<pfad>/schemas/lpc-config.schema.json",
  "dialect": "ldmud",
  "version": "3.6.8",
  "mudlib": {
    "name": "UNIlib",
    "baseDir": "/sys/unitopia",
    "includeDirs": ["/sys/include"]
  },
  "ftp": {
    "host": "unitopia.de",
    "port": 21,
    "user": "deinmagier",
    "remoteRoot": "/",
    "protocol": "ftps"
  }
}
```

Pflichtfelder: `dialect` (`ldmud` | `fluffos`), `mudlib.name`, `mudlib.baseDir`.
Wenn ein `ftp`-Block da ist, ist `ftp.host` Pflicht und `ftp.user` wird zum Verbinden gebraucht. Ohne `ftp.protocol` wird `ftps` verwendet.
Optional sind die Blöcke `mud` (Telnet) und `homemud` (`path`, `libPath`, `mud`).
Eine vollständige, kommentierte Vorlage steht in [examples/unitopia-full/](examples/unitopia-full/).

Die Datei wird überwacht; Änderungen werden sofort neu geladen.

### 5.3 Typischer Arbeitsablauf

1. Workspace mit `lpc-config.json` öffnen → das Plugin aktiviert sich.
2. Im Bereich **Remote MUD** auf **Verbinden** klicken (oder `LPC: Mit MUD verbinden`).
3. Beim ersten Mal das FTP-Passwort eingeben; es wird in der OS-Keychain gespeichert.
4. Wählen, ob das Remote-Verzeichnis als Workspace-Ordner eingebunden werden soll oder nur im Baum erscheint.
5. Dateien öffnen, bearbeiten und speichern; Speichern schreibt direkt auf den Server.
6. Optional mit `lpc.mud.enabled = true` und einem `mud`-Block: **LPC: Remote-MUD-Terminal öffnen** und im Terminal einloggen.
7. Optional mit HomeMUD: Dateien per **Nach homemud kopieren** holen, lokal testen und per **Zur Remote hochladen** (Rechtsklick im Explorer oder Editor-Tab) zurückspielen. Über dasselbe Menü lassen sich lokale Dateien mit **Von Remote herunterladen** aktualisieren oder mit **Mit Remote vergleichen** in einer Diff-Ansicht gegenüberstellen.

### 5.4 Befehle (Befehlspalette)

| Befehl | Funktion |
| --- | --- |
| `LPC: Mit MUD verbinden` / `LPC: Verbindung trennen` | FTP-Verbindung auf- bzw. abbauen |
| `LPC: Remote-Baum aktualisieren` | Remote Explorer neu laden |
| `LPC: Dialekt wechseln` | Profil manuell wählen |
| `LPC: lpc-config.json neu laden` | Konfiguration neu einlesen |
| `LPC: FTP-Passwort ändern` | Gespeichertes FTP-Passwort ersetzen |
| `LPC: Remote-MUD-Terminal öffnen` / `LPC: HomeMUD-Terminal öffnen` | MUD-Terminal öffnen und verbinden |
| `LPC: MUD-Terminal trennen` | Telnet-Verbindung beenden |
| `LPC: HomeMUD im Explorer öffnen` | Lokales HomeMUD-Verzeichnis im Explorer anzeigen |
| Kontextmenü | Neue Datei/Ordner, Umbenennen, Löschen, Pfad kopieren, Nach homemud kopieren, Zur Remote hochladen, Von Remote herunterladen, Mit Remote vergleichen |

### 5.5 Einstellungen

| Setting | Default | Status |
| --- | --- | --- |
| `lpc.configFile` | `lpc-config.json` | aktiv |
| `lpc.dialect.autoDetect` | `true` | aktiv |
| `lpc.mud.enabled` | `false` | aktiv |
| `lpc.ftp.verbose` | `false` | aktiv |
| `lpc.ftp.uploadOnSave` | `false` | **ohne Funktion** (nirgends im Code ausgewertet) |
| `lpc.ftp.protocol` | `ftps` | **ohne Funktion** (das Protokoll kommt aus `lpc-config.json`) |

## 6. Auffälligkeiten und offene Punkte

### 6.1 Abweichungen zwischen Dokumentation und Code

1. **Anzahl der Efuns/Sfuns – behoben:** README und CHANGELOG versprechen Hover/Completion für „322 LDMud-Efuns und 201 UNItopia-Sfuns“. Das eingebaute Profil enthielt ursprünglich nur 33 Efuns und 4 Sfuns. Die vollständigen Daten lagen nur im Workspace `C:\_M\mud\lpc-efuns.json`. Sie wurden als [resources/profiles/ldmud-unitopia.json](resources/profiles/ldmud-unitopia.json) ins Plugin übernommen (322 Efuns, 201 Sfuns). Drei alte Einträge ohne Bezug zu UNItopia (`members`, `SetProp`, `QueryProp`) sind dabei entfallen. Offen bleibt: Die Efuns haben noch keine Beschreibungstexte, bei den Sfuns haben 137 von 201 eine. Die Profile für MorgenGrauen und FluffOS enthalten weiterhin nur je 2 Efuns. **Nachtrag:** Die Sfun-Liste wurde inzwischen direkt aus der `simul_efun` neu erzeugt, mit 229 Sfuns, 123 davon mit Beschreibung. Dazu gehören alle öffentlichen Funktionen aus `deklin.c` (77) und `parse_com.c` (9). 14 Einträge des alten JSON, die keine Sfuns sind, sind entfallen: `protected`-Funktionen wie `create`, Funktionen aus `#if 0` und Hooks wie `query_dativ`, die Objekte selbst implementieren.
2. **Standard-Protokoll – behoben:** Der Default war `ftp` (unverschlüsselt), obwohl Setting und README `ftps` nahelegten. Wer `protocol` wegließ, übertrug das Passwort im Klartext. Jetzt ist `ftps` der Default, in [connectionManager.ts](src/ftp/connectionManager.ts), [ftpBackend.ts](src/ftp/ftpBackend.ts) und im JSON-Schema. Die Beispielkonfigurationen setzen `"protocol": "ftp"` weiterhin ausdrücklich.
3. **`mudos` – entfernt:** Der Wert wurde als Dialekt akzeptiert, ohne dass es ein Profil oder eine Erkennung dafür gab. Er ist aus Typ, Validierung, Schema und Doku entfernt. Eine `lpc-config.json` mit `"dialect": "mudos"` gilt jetzt als ungültig.
4. **`simulEfunFile`** und **`version`** werden gelesen, aber nicht ausgewertet (laut Plan für Phase 4 vorgesehen).

### 6.2 Funktionale Lücken

- Kein automatischer Reconnect, wenn die FTP-Verbindung abbricht; keine SSH-Key-Anmeldung bei SFTP.
- `FileSystemProvider.watch()` macht nichts – Änderungen auf dem Server, die nicht aus VS Code kommen, werden nicht bemerkt.
- `uploadOnSave` existiert nur als Setting.
- Bei Multi-Root-Workspaces wird nur der erste Ordner berücksichtigt.
- Die Auto-Erkennung ordnet jede `master.c`/`lpctypes.h` dem UNItopia-Profil zu, auch bei anderen LDMud-Mudlibs.
- Präprozessor-Bedingungen werden nicht ausgewertet, sondern per Faustregel entschieden: bei `#if … #else` gilt der `#else`-Zweig, `#if 0` ist inaktiv, Treiber-Makros wie `__LDMUD__` gelten als definiert. Bei `#if __VERSION__ > "…" … #else` kann das den falschen Zweig treffen.
- Ohne HomeMUD kommen geerbte Funktionen, Efun-Hilfe und Sfuns aus dem Mudlib-Index, sofern der Server einen bereitstellt. Der Index ist ein Stand vom Zeitpunkt der Erzeugung, und Makros in `inherit` löst das Plugin ohne HomeMUD nur auf, wenn sie in der Datei selbst definiert sind.
- `private inherit` wird wie normales `inherit` behandelt, Funktionen daraus sind in Enkel-Dateien also fälschlich sichtbar.
- [src/lsp/client.ts](src/lsp/client.ts) ist nur ein Platzhalter. Für die Anbindung eines Language Servers muss `vscode-languageclient` wieder installiert werden.

### 6.3 Aktivierung und Konflikte

- Es gibt kein `onLanguage:lpc`-Aktivierungsereignis. Ohne `lpc-config.json` im Workspace funktioniert nur das Syntax-Highlighting; Hover, Completion und Diagnostics bleiben aus.
- Die Endungen `.c` und `.h` überschneiden sich mit der C/C++-Unterstützung von VS Code. Je nach installierten Extensions muss der Sprachmodus manuell auf LPC gestellt oder über `files.associations` festgelegt werden.

### 6.4 Vor einer Veröffentlichung im Marketplace

- `LICENSE` und `examples/syntax-showcase/` committen; die Änderungen an `.vscodeignore` übernehmen.
- ~~Repository-URL und Publisher prüfen.~~ Erledigt: Publisher `myonara`, Extension im Marketplace.
- ~~`@vscode/vsce` als devDependency und ein `package`-Skript ergänzen.~~ Erledigt (Version 0.2.0).
- ESLint-Warnungen mit `npx eslint src --ext ts --fix` beheben.
- Mindestens einfache Tests ergänzen, z. B. für die Konfigurationsprüfung (`validate`) und das HomeMUD-Pfad-Mapping.
- `README_old.md` löschen oder archivieren.

## 7. Einordnung des Entwicklungsstands

Gemessen am Plan in [PLUGIN_PLAN.md](PLUGIN_PLAN.md):

| Phase | Inhalt | Stand |
| --- | --- | --- |
| 1 | `lpc-config.json`, Profil-Umschaltung | ✅ vollständig |
| 2 | FileSystemProvider FTP/SFTP + SecretStorage | 🟡 vollständig bis auf `uploadOnSave` |
| 3 | Remote-Explorer-Baum | ✅ vollständig |
| 4 | Feinabstimmung auf UNItopia-Header und simul_efuns | 🟡 weitgehend, mit HomeMUD; ohne echten Language Server |

### Abschnitt 1 – Dialekt-Management

| Punkt | Stand |
| --- | --- |
| `lpc-config.json` mit Schema, Prüfung, Live-Reload | ✅ |
| Efuns/Sfuns als JSON-Definitionen (322 / 229) | ✅ Sfun-Liste aus der `simul_efun` erzeugt, inklusive `deklin.c` und `parse_com.c` |
| Sfuns aus der `simul_efun.c` parsen | ✅ mit HomeMUD: 229 Sfuns aus 48 Dateien, Neuladen bei Änderungen |
| `struct`, Closures (`#'`), Symbole (`'`) | ✅ im Syntax-Highlighting |
| UNIlib-Vererbung (`/i/room.c`, `create()`, `init()`) | ✅ mit HomeMUD: Vererbungskette wird aufgelöst, geerbte Funktionen sind bekannt |

### Abschnitt 2 – Efun-Profile

| Punkt | Stand |
| --- | --- |
| Profile für UNItopia, MorgenGrauen, FluffOS | 🟡 UNItopia vollständig, die beiden anderen nur Platzhalter (je 2 Efuns) |
| Umschalten über Statusleiste und Befehlspalette | ✅ |
| Auto-Erkennung (`mudlib.name`, `master.c`, `lpctypes.h`) | ✅ |

### Abschnitt 3 – Remote-FTP und Navigationsbaum

| Punkt | Stand |
| --- | --- |
| Remote Explorer mit Lazy Loading | ✅ |
| Kontextmenü Update/Destruct über Telnet | entfernt in 0.2.8 (bei UNItopia andere Befehle); stattdessen MUD-Terminal |
| `lpc-ftp://`-Dateisystem, Passwörter im OS-Schlüsselbund | ✅ |
| `uploadOnSave` | ❌ Setting ohne Funktion. Dateien unter `lpc-ftp://` werden ohnehin direkt gespeichert; gemeint wäre der automatische Upload aus dem HomeMUD. |

### Abschnitt 4 – Editor-Funktionen („LSP“)

| Punkt | Stand |
| --- | --- |
| Inheritance-Tracking über `baseDir`/`includeDirs` | ✅ mit HomeMUD auch über die ganze Kette, inklusive `"%name"`, Makros und Verkettungen |
| Hilfetexte beim Hover | ✅ mit HomeMUD: Efuns aus `doc/efun` (deutsch bevorzugt), Sfuns und geerbte Funktionen aus den UNItopia-Doku-Kommentaren. Ohne HomeMUD nur Signaturen. |
| Fehlerdiagnose (`class`, unauflösbare Pfade) | 🟡 vorhanden; echte Syntaxfehler erkennt erst ein Parser bzw. Compiler |
| Language Server | ❌ nur Platzhalter in [src/lsp/client.ts](src/lsp/client.ts) |

### Abschnitt 5 – Sichtbarkeitsmodell

Sichtbar sind die Funktionen der (indirekt) geerbten Objekte, die Sfuns und die Efuns.

| Teil | Stand |
| --- | --- |
| Efuns | ✅ |
| Sfuns | ✅ mit HomeMUD direkt aus der `simul_efun`, sonst aus dem JSON-Profil |
| Funktionen der eigenen Datei | ✅ |
| Geerbte Funktionen | ✅ mit HomeMUD; `private` wird beachtet, `private inherit` noch nicht |

### Über den Plan hinaus umgesetzt

HomeMUD mit Herunterladen, Hochladen und Vergleichen; zwei MUD-Terminals; Statusleiste;
Parameterhilfe; Outline; FTPS und SFTP mit TLS-Optionen; VSIX-Paketierung.

### Nächste sinnvolle Schritte

1. **Präprozessor besser auswerten**, mindestens `__VERSION__`-Vergleiche gegen `version` aus der
   `lpc-config.json` und `#ifdef` gegen bekannte `#define`s. Das betrifft vor allem Varianten derselben
   Funktion.
2. ~~**Ohne HomeMUD:** Vererbung über FTP auflösen.~~ Gelöst über den Mudlib-Index, den der Server
   bereitstellt ([tools/index-generator/](tools/index-generator/README.md)). Offen ist, wer ihn bei
   UNItopia betreibt und welche Bereiche mit `--exclude` ausgenommen werden.
3. **`uploadOnSave`** für Dateien im HomeMUD umsetzen.
4. **Tests** für Parser und Pfadauflösung. Die Prüfungen gegen die echte Mudlib laufen bisher nur
   als einmalige Skripte.

**Fazit:** Mit HomeMUD deckt das Plugin die Ziele aus dem Plan weitgehend ab: Vererbung, Sfuns
direkt aus dem Quelltext, Hilfetexte für Efuns und das Sichtbarkeitsmodell. Ohne HomeMUD gilt das
ebenso, sofern der Server einen Mudlib-Index bereitstellt. Offen sind vor allem
ein echter Language Server mit Syntaxprüfung, `uploadOnSave` und automatisierte Tests.
