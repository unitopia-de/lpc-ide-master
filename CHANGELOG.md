# Changelog

Alle nennenswerten Änderungen an dieser Extension werden hier dokumentiert.
Format orientiert sich an [Keep a Changelog](https://keepachangelog.com/),
Versionierung folgt [SemVer](https://semver.org/lang/de/).

## 0.1.0

Erste Auslieferung als VSIX-Paket. Funktionsumfang im Detail:

### Konfiguration & Dialekt-Management
- `lpc-config.json` im Workspace-Root mit File-Watcher (Live-Reload bei Änderung).
- Strukturelle Validierung mit klaren Fehlermeldungen (Output-Channel + Statusbar).
- JSON-Schema mit Auto-Completion und Inline-Fehlermarkierung im VS-Code-Editor.
- Dialekt-Auto-Discovery anhand `mudlib.name` und Workspace-Dateien
  (`master.c`, `lpctypes.h`).
- Eingebaute Profile für `ldmud-unitopia`, `ldmud-morgengrauen`, `fluffos`.
- Workspace-spezifische Profilerweiterungen via `mudlib.efunDefinitions`.

### Remote-Dateisystem (FTP/FTPS/SFTP)
- `lpc-ftp://`-Schema mit eigenem `FileSystemProvider`:
  read, write, list, stat, mkdir, rename, delete.
- Vier Protokolle: `ftp` (plain), `ftps` (AUTH TLS), `ftps-implicit` (TLS ab Verbindung),
  `sftp` (SSH-basiert via `ssh2-sftp-client`).
- TLS-Optionen: `tls.rejectUnauthorized` für selbst-signierte Zertifikate.
- Verbindungs-Pool mit Operations-Serialisierung (löst Race Conditions
  zwischen parallelen `stat`/`readFile`-Aufrufen).
- Passwörter ausschließlich über VS Code `SecretStorage` (OS-Keychain),
  niemals in Konfig-Dateien.
- FTP-Protokoll-Trace im Output-Channel via `lpc.ftp.verbose`-Setting.

### Remote-Explorer
- TreeDataProvider in der Activity Bar mit Lazy-Loading.
- Sortierung Verzeichnisse vor Dateien, alphabetisch.
- Welcome-Views je nach Konfigurations-/Verbindungsstatus.
- Inline-Buttons: Neue Datei, Neuer Ordner, „Nach homemud kopieren".
- Kontextmenü: Update/Destruct Object, Umbenennen, Löschen (mit Modal-Bestätigung),
  Pfad kopieren, Sync-Aktionen.

### HomeMUD-Integration
- Optionaler `homemud`-Block in der Konfig (Pfad + Mudlib-Subpath).
- Bidirektionales Pfad-Mapping zwischen `lpc-ftp://` und lokalem Verzeichnis.
- Befehle „Nach homemud kopieren" und „Zur Remote hochladen" mit
  rekursiver Verzeichnis-Übertragung und Fortschrittsanzeige.

### MUD-Konsole (Telnet/Telnets, opt-in)
- Eigener TCP-/TLS-Client für `telnet` und `telnets`.
- Konfigurierbare Login-Pattern (`loginPrompt`, `passwordPrompt`, `commandPrompt`).
- Optionaler `completionMarker` für robustes Output-Sammeln.
- Login optional — `mud.user` darf weggelassen werden.
- Zwei Konsolen-Instanzen für Remote-MUD und homemud-MUD,
  jede mit eigenem Output-Channel.
- Aktivierung über Setting `lpc.mud.enabled` (Default: aus).

### Editor-Unterstützung (LSP-ähnlich, ohne externen Server)
- **Hover**: Tooltip mit Signatur und Beschreibung für 322 Driver-Efuns und
  201 UNItopia-Sfuns aus `efuns.alpha` und `simul_efun/*`.
- **Completion**: Auto-Vorschläge für Efuns, Sfuns, 16 Keywords und 14 Typen
  mit Snippet-Insertion und Parameter-Tabstops.
- **Document-Symbol-Outline**: Funktionen, `inherit`-Pfade, globale Variablen.
- **Goto-Definition**: Strg+Klick auf `inherit "..."`, `#include "..."`
  und lokale Funktionsnamen — Pfadauflösung über `baseDir`/`includeDirs`/homemud.
- **Diagnostics**: Live-Warnungen mit Debounce — `class` in LDMud (struct bevorzugt),
  ungelöste `inherit`/`#include`-Pfade.
- **Signature-Help**: Parameter-Hint mit Hervorhebung des aktiven Arguments.

### LPC-Sprachsyntax
- Vollständige TextMate-Grammatik basierend auf LDMud `etc/lpc.vim`/`lpc.xml`.
- LPC-Spezifika: `({ })` Arrays, `([ ])` Mappings, `(< >)` Multisets,
  `(: :)` Closures, `#'name` Closure-Referenzen, `'name` Symbole.
- Heredoc-Strings (`@TAG`, `@@TAG`).
- 322 Driver-Efuns als eigene Token-Klasse für Theme-Hervorhebung.
- Applied-lfuns (`create`, `init`, `heart_beat`, …) als eigene Scope.
- Preprocessor-Direktiven inklusive `#pragma`, `#warn`, `#error`.
- `language-configuration.json` mit Auto-Closing für LPC-Klammerformen,
  Folding-Marker, Block-Kommentar-Auto-Enter.

### Statusbar
- Vier Items: Dialekt + Symbol-Anzahl, FTP-Status, Remote-MUD,
  homemud (jeweils nur sichtbar wenn konfiguriert).
- Klick auf FTP-/MUD-Item: Verbinden/Trennen.

### Commands (Auswahl)
- `lpc.connect` / `lpc.disconnect` / `lpc.refreshRemote`
- `lpc.switchDialect` / `lpc.reloadConfig`
- `lpc.changePassword` / `lpc.changeMudPassword`
- `lpc.updateObject` / `lpc.destructObject` (mit Modal-Bestätigung bei destruct)
- `lpc.newFile` / `lpc.newFolder` / `lpc.renameRemote` / `lpc.deleteRemote`
- `lpc.copyToHomemud` / `lpc.uploadToRemote` / `lpc.revealHomeMud`
- `lpc.openRemoteMudConsole` / `lpc.openHomeMudConsole` / `lpc.disconnectMud`

### Mitgelieferte Beispiele
- `examples/sample-workspace/` — Minimal-Setup.
- `examples/unitopia-full/` — voll ausgestattete Konfiguration mit allen Feldern,
  ausführlich dokumentiert.

### Bekannte Einschränkungen
- FTP: kein automatischer Reconnect bei Timeout, keine SSH-Key-Auth.
- DocumentSymbolProvider erkennt nur Funktionen mit explizitem Return-Typ.
- Multi-Root-Workspace: nur der erste Folder wird ausgewertet.
- `lpc.ftp.uploadOnSave` reserviert für Phase 2.5 (noch nicht aktiv).
- Anbindung an externen LPC-Language-Server (Client-Stub steht) noch offen.
