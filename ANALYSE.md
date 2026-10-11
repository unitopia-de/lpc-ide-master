# Analyse: LPC-IDE-Master (UNItopia Edition)

Stand der Analyse: 2026-10-11 · Branch `master` · letzter Commit `cba287b` („consisntency delivery“)

## 1. Überblick

| Eigenschaft | Wert |
| --- | --- |
| Paketname | `lpc-ide-master` |
| Anzeigename | LPC-IDE-Master (UNItopia Edition) |
| Version | 0.1.0 |
| Publisher | `unitopia-de` |
| Lizenz | MIT (`LICENSE` noch nicht eingecheckt) |
| VS-Code-Version | `^1.85.0` |
| Sprache | TypeScript (strict), ca. 3.350 Zeilen in 23 Dateien unter `src/` |
| Laufzeit-Abhängigkeiten | `basic-ftp`, `ssh2-sftp-client`, `vscode-languageclient` (derzeit ungenutzt) |
| Einstiegspunkt | `out/extension.js` (kompiliert aus [src/extension.ts](src/extension.ts)) |

Die Extension ist eine Entwicklungsumgebung für LPC (die Sprache von LP-MUDs), mit Schwerpunkt
auf der UNItopia-Mudlib (LDMud 3.5/3.6). Sie kombiniert vier Bereiche:

1. **Sprachunterstützung** – Syntax-Highlighting und eigene Editor-Provider (ohne externen Language Server)
2. **Remote-Dateisystem** – Mudlib-Dateien per FTP/FTPS/SFTP direkt im Editor bearbeiten (`lpc-ftp://`)
3. **HomeMUD** – ein lokales Entwicklungs-MUD mit Datei-Abgleich zum Remote-MUD
4. **MUD-Konsole** – Telnet-Verbindung, um Magier-Befehle (`update`, `destruct`) abzusetzen

## 2. Build- und Qualitätsstatus

| Prüfung | Ergebnis |
| --- | --- |
| `tsc -p ./ --noEmit` | ✅ fehlerfrei |
| `eslint src --ext ts` | ⚠️ 0 Fehler, 72 Warnungen (fast nur die `curly`-Regel; 69 mit `--fix` automatisch behebbar) |
| Unit-Tests | ❌ keine vorhanden |
| CI | ❌ keine eingerichtet |
| VSIX-Paketierung | `.vscodeignore` ist vorbereitet (uncommittete Änderung), `@vscode/vsce` ist aber keine devDependency |
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
│   ├── mudClient.ts             Eigener Telnet/TLS-Client mit Login-Ablauf
│   └── mudConsole.ts            Output-Channel + Lebenszyklus je Konsole
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
4. Dateisystem-Provider, Baumansicht, zwei MUD-Konsolen (remote, homemud), Statusleiste, Editor-Provider und Befehle werden registriert.
5. Context-Keys (`lpc.hasFtpConfig`, `lpc.ftpConnected`, `lpc.hasHomeMud`) steuern, welche Menüs und Willkommensansichten erscheinen.

## 4. Funktionsumfang im Detail

### 4.1 Sprachunterstützung

- **Sprache `lpc`** für die Endungen `.c`, `.h`, `.lpc`, `.inc`, `.d`
- **Hover** – Signatur und Beschreibung von Efuns/Sfuns aus dem aktiven Profil
- **Completion** – Efuns, Sfuns, Keywords und Typen, mit Snippet-Platzhaltern für Parameter
- **Outline** – Funktionen, `inherit`-Pfade, globale Variablen
- **Goto-Definition** – auf `inherit "..."`, `#include "..."` und lokale Funktionen; Pfade werden über `baseDir`, `includeDirs` und den HomeMUD aufgelöst
- **Diagnostics** (mit 400 ms Verzögerung) – Warnung bei `class` unter LDMud, nicht auflösbare `inherit`-/`#include`-Pfade; funktioniert für `file://` und `lpc-ftp://`
- **Signature-Help** – Parameterhinweis mit Hervorhebung des aktuellen Arguments

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
Pfad kopieren, Update/Destruct Object, „Nach homemud kopieren“.

### 4.4 HomeMUD

Pfad-Mapping zwischen Remote und lokalem Verzeichnis:

```
remoteRoot = ftp.remoteRoot ?? mudlib.baseDir ?? "/"
localRoot  = <workspace>/<homemud.path>/<homemud.libPath ?? "/lib">
```

`lpc-ftp://host/<remoteRoot>/foo/bar.c` entspricht also `<localRoot>/foo/bar.c`. Dateien und ganze
Verzeichnisse lassen sich in beide Richtungen rekursiv kopieren (mit Fortschrittsanzeige, ohne `.git` und `node_modules`).

### 4.5 MUD-Konsole (Telnet)

- Standardmäßig **aus**; wird über das Setting `lpc.mud.enabled` eingeschaltet
- Eigener TCP-/TLS-Client (`telnet` / `telnets`) mit einstellbaren Prompt-Mustern (Login, Passwort, Befehl) und optionalem `completionMarker`
- Zwei getrennte Konsolen: **remote** und **homemud**, jede mit eigenem Output-Channel
- `update` und `destruct` werden standardmäßig auf dem HomeMUD ausgeführt, falls er konfiguriert ist; sonst auf dem Remote-MUD

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

Ein VSIX-Paket erstellen (vsce muss erst installiert werden):

```bash
npx @vscode/vsce package
code --install-extension lpc-ide-master-0.1.0.vsix
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

Pflichtfelder: `dialect` (`ldmud` | `fluffos` | `mudos`), `mudlib.name`, `mudlib.baseDir`.
Wenn ein `ftp`-Block da ist, ist `ftp.host` Pflicht und `ftp.user` wird zum Verbinden gebraucht.
Optional sind die Blöcke `mud` (Telnet) und `homemud` (`path`, `libPath`, `mud`).
Eine vollständige, kommentierte Vorlage steht in [examples/unitopia-full/](examples/unitopia-full/).

Die Datei wird überwacht; Änderungen werden sofort neu geladen.

### 5.3 Typischer Arbeitsablauf

1. Workspace mit `lpc-config.json` öffnen → das Plugin aktiviert sich.
2. Im Bereich **Remote MUD** auf **Verbinden** klicken (oder `LPC: Mit MUD verbinden`).
3. Beim ersten Mal das FTP-Passwort eingeben; es wird in der OS-Keychain gespeichert.
4. Wählen, ob das Remote-Verzeichnis als Workspace-Ordner eingebunden werden soll oder nur im Baum erscheint.
5. Dateien öffnen, bearbeiten und speichern; Speichern schreibt direkt auf den Server.
6. Optional mit `lpc.mud.enabled = true` und einem `mud`-Block: Rechtsklick auf eine Datei → **Update Object**.
7. Optional mit HomeMUD: Dateien per **Nach homemud kopieren** holen, lokal testen und per **Zur Remote hochladen** (Rechtsklick im Explorer oder Editor-Tab) zurückspielen.

### 5.4 Befehle (Befehlspalette)

| Befehl | Funktion |
| --- | --- |
| `LPC: Mit MUD verbinden` / `LPC: Verbindung trennen` | FTP-Verbindung auf- bzw. abbauen |
| `LPC: Remote-Baum aktualisieren` | Remote Explorer neu laden |
| `LPC: Dialekt wechseln` | Profil manuell wählen |
| `LPC: lpc-config.json neu laden` | Konfiguration neu einlesen |
| `LPC: FTP-Passwort ändern` / `LPC: MUD-Passwort ändern` | Gespeichertes Passwort ersetzen |
| `LPC: Remote-MUD-Konsole anzeigen` / `LPC: HomeMUD-Konsole anzeigen` | Telnet-Ausgabe anzeigen |
| `LPC: MUD-Konsole trennen` | Telnet-Verbindung beenden |
| `LPC: HomeMUD im Explorer öffnen` | Lokales HomeMUD-Verzeichnis im Explorer anzeigen |
| Kontextmenü | Neue Datei/Ordner, Umbenennen, Löschen, Pfad kopieren, Update/Destruct Object, Nach homemud kopieren, Zur Remote hochladen |

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

1. **Anzahl der Efuns/Sfuns – behoben:** README und CHANGELOG versprechen Hover/Completion für „322 LDMud-Efuns und 201 UNItopia-Sfuns“. Das eingebaute Profil enthielt ursprünglich nur 33 Efuns und 4 Sfuns. Die vollständigen Daten lagen nur im Workspace `C:\_M\mud\lpc-efuns.json`. Sie wurden als [resources/profiles/ldmud-unitopia.json](resources/profiles/ldmud-unitopia.json) ins Plugin übernommen (322 Efuns, 201 Sfuns). Drei alte Einträge ohne Bezug zu UNItopia (`members`, `SetProp`, `QueryProp`) sind dabei entfallen. Offen bleibt: Die Efuns haben noch keine Beschreibungstexte, bei den Sfuns haben 137 von 201 eine. Die Profile für MorgenGrauen und FluffOS enthalten weiterhin nur je 2 Efuns.
2. **Standard-Protokoll:** Im Code ist der Default `ftp` (unverschlüsselt, [connectionManager.ts:93](src/ftp/connectionManager.ts#L93)), Setting und README legen `ftps` nahe. Wer `protocol` weglässt, überträgt das Passwort im Klartext.
3. **`mudos`** wird als Dialekt akzeptiert, es gibt dafür aber weder ein Profil noch eine Erkennung.
4. **`simulEfunFile`** und **`version`** werden gelesen, aber nicht ausgewertet (laut Plan für Phase 4 vorgesehen).

### 6.2 Funktionale Lücken

- Kein automatischer Reconnect, wenn die FTP-Verbindung abbricht; keine SSH-Key-Anmeldung bei SFTP.
- `FileSystemProvider.watch()` macht nichts – Änderungen auf dem Server, die nicht aus VS Code kommen, werden nicht bemerkt.
- `uploadOnSave` existiert nur als Setting.
- Bei Multi-Root-Workspaces wird nur der erste Ordner berücksichtigt.
- Die Auto-Erkennung ordnet jede `master.c`/`lpctypes.h` dem UNItopia-Profil zu, auch bei anderen LDMud-Mudlibs.
- Die Outline erkennt nur Funktionen mit ausdrücklichem Rückgabetyp.
- [src/lsp/client.ts](src/lsp/client.ts) ist nur ein Platzhalter; `vscode-languageclient` wird mitgeliefert, aber nicht genutzt.

### 6.3 Aktivierung und Konflikte

- Es gibt kein `onLanguage:lpc`-Aktivierungsereignis. Ohne `lpc-config.json` im Workspace funktioniert nur das Syntax-Highlighting; Hover, Completion und Diagnostics bleiben aus.
- Die Endungen `.c` und `.h` überschneiden sich mit der C/C++-Unterstützung von VS Code. Je nach installierten Extensions muss der Sprachmodus manuell auf LPC gestellt oder über `files.associations` festgelegt werden.

### 6.4 Vor einer Veröffentlichung im Marketplace

- `LICENSE` und `examples/syntax-showcase/` committen; die Änderungen an `.vscodeignore` übernehmen.
- Prüfen, ob die Repository-URL `github.com/unitopia-de/lpc-ide-master` und der Publisher `unitopia-de` tatsächlich existieren.
- `@vscode/vsce` als devDependency und ein `package`-Skript ergänzen.
- ESLint-Warnungen mit `npx eslint src --ext ts --fix` beheben.
- Mindestens einfache Tests ergänzen, z. B. für die Konfigurationsprüfung (`validate`) und das HomeMUD-Pfad-Mapping.
- `README_old.md` löschen oder archivieren.

## 7. Einordnung des Entwicklungsstands

Gemessen am Phasenplan in [PLUGIN_PLAN.md](PLUGIN_PLAN.md):

| Phase | Inhalt | Stand |
| --- | --- | --- |
| 1 | `lpc-config.json`, Profil-Umschaltung | ✅ umgesetzt (UNItopia-Profil vollständig, MorgenGrauen/FluffOS nur Platzhalter) |
| 2 | FileSystemProvider FTP/SFTP + SecretStorage | ✅ umgesetzt (ohne Reconnect und ohne Upload beim Speichern) |
| 3 | Remote-Explorer-Baum | ✅ umgesetzt, dazu HomeMUD und Telnet-Konsole |
| 4 | LSP-Feinabstimmung, simul_efun-Parsing | 🟡 Teilweise: eigene Provider ohne Server; simul_efun-Parsing fehlt |

**Fazit:** Die Extension ist als Version 0.1.0 funktional weitgehend vollständig und kompiliert ohne
Fehler. Der Code ist klar in Module gegliedert und durchgehend auf Deutsch kommentiert. Das
UNItopia-Profil enthält jetzt alle 523 Efuns und Sfuns. Vor einer Veröffentlichung sollten noch das
unverschlüsselte Standard-Protokoll, die fehlenden Tests und die Paketierungsschritte erledigt
werden. Außerdem fehlen bei den Efuns noch die Beschreibungstexte.
