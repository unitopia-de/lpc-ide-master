# Changelog

Alle nennenswerten Änderungen an dieser Extension werden hier dokumentiert.
Format orientiert sich an [Keep a Changelog](https://keepachangelog.com/),
Versionierung folgt [SemVer](https://semver.org/lang/de/).

## [Unreleased]

## 0.2.8 – MUD-Terminal statt Ausgabefenster

### Hinzugefügt
- Die MUD-Verbindung läuft jetzt in einem VS-Code-Terminal: direkt tippen, Enter schickt die Zeile ab. Zeilenbearbeitung mit ← → Pos1 Ende, Rücktaste, Entf; ↑ ↓ für frühere Eingaben; Strg+C verwirft die Zeile. Farben des MUD werden angezeigt.
- Telnet-Optionen: Schaltet das MUD das Echo ab (Passwortabfrage), bleibt die Eingabe unsichtbar und kommt nicht in den Verlauf. Andere Optionen lehnt der Client ab.
- Nach einem Verbindungsabbruch verbindet Enter im Terminal neu.

### Entfernt
- Automatisches Login. Man loggt sich im Terminal selbst ein. Die Felder `user`, `loginPrompt`, `passwordPrompt`, `commandPrompt` und `completionMarker` im `mud`-Block werden ignoriert. Früher gespeicherte MUD-Passwörter entfernt das Plugin beim Start aus dem Schlüsselbund.
- Befehl **LPC: MUD-Passwort ändern**.
- **Update Object** und **Destruct Object** im Remote Explorer. Bei UNItopia heißen diese Befehle anders; man tippt sie jetzt im Terminal.
- Die Ausgabefenster „LPC MUD Console (remote/homemud)“.

### Geändert
- Befehle heißen jetzt **LPC: Remote-MUD-Terminal öffnen**, **LPC: HomeMUD-Terminal öffnen** und **LPC: MUD-Terminal trennen**.

## 0.2.7 – Fehlende Remote-Dateien ohne Fehlermeldung, TLS-Info in der MUD-Konsole

### Hinzugefügt
- MUD-Konsole: Bei `telnets` steht nach dem TLS-Aufbau eine Zeile mit TLS-Version und Zertifikatsstatus. So sieht man, ob die Verbindung steht und nur die Begrüßung des MUD ausbleibt.

### Behoben
- Fehlende Dateien auf dem Server (FTP 550) meldet das Dateisystem jetzt als „nicht gefunden“ statt als „nicht verfügbar“, ohne Stacktrace im Ausgabefenster. VS Code fragt im `lpc-ftp`-Ordner z. B. nach `.vscode/settings.json`, das erzeugte bisher vier Fehlermeldungen beim Start.

## 0.2.6 – MUD-Konsole verbindet beim Öffnen

### Behoben
- **LPC: Remote-/HomeMUD-Konsole anzeigen** und der Klick auf den MUD-Eintrag in der Statusleiste bauen jetzt die Verbindung auf. Bisher öffnete sich nur ein leeres Ausgabefenster, verbunden wurde erst bei Update/Destruct. Fehlt die Konfiguration oder ist `lpc.mud.enabled` aus, steht ein Hinweis im Fenster.
- README: Ports für `telnets` ergänzt (UNItopia 992, Orbit 9988).

## 0.2.5 – Veröffentlichung im VS Code Marketplace (Publisher myonara)

### Geändert
- Publisher ist jetzt `myonara`, die Extension-ID lautet `myonara.lpc-ide-master`. Das Plugin ist im VS Code Marketplace erhältlich. Wer bisher eine selbst gebaute Version unter `unitopia-de` nutzt, deinstalliert diese vorher. FTP-Passwörter müssen einmal neu eingegeben werden.
- README: Installation aus dem Marketplace als Standardweg, Selbstbauen als Alternative.
- Index-Generator überspringt die Magier-Verzeichnisse unter `/w` samt allen Dateien darunter (abschaltbar mit `--include-w`). Pfade darunter gelten auch bei `inherit`/`#include` als nicht vorhanden.

## 0.2.4 – Anzeige des Mudlib-Index, Generator für Podman

### Hinzugefügt
- Statusleiste: Der Tooltip des LPC-Eintrags zeigt Stand, Herkunft und Umfang des Mudlib-Index. Während des Abgleichs mit dem Server erscheint `$(sync~spin) LPC: Mudlib-Index …`.
- Ausgabefenster: Auch ein unveränderter Index wird gemeldet (`Mudlib-Index ist aktuell …`), ebenso der Beginn eines Downloads.

### Geändert
- Index-Generator: Bei nicht beschreibbarem Ausgabeverzeichnis klare Fehlermeldung mit Benutzer und Abhilfe statt Stacktrace (Exit-Code 4).
- Index-Generator: Für rootless Podman lautet die Empfehlung jetzt `--userns=keep-id --user "$(id -u):$(id -g)"`. Ohne `--user` läuft der Generator als `node` (uid 1000) aus dem Image und kann nicht nach `/out` schreiben.
- Index-Generator: Anleitung und Warnung für rootless Podman (bei SELinux zusätzlich `--security-opt label=disable`).
- Index-Generator überspringt Verzeichnisse namens `OLD`/`Old` samt allen Dateien darunter, wie der Master (abschaltbar mit `--include-old`). Bei UNItopia: 322 Verzeichnisse, rund 10.000 Dateien weniger; nicht auflösbare inherits sinken von 104 auf 41.
- Index-Generator bricht ab (Exit-Code 3), wenn keine einzige Quelldatei lesbar ist, statt einen vorhandenen Index durch einen leeren zu ersetzen.

## 0.2.3 – Mudlib-Index vom Server für Inherits, Sfuns und Doku

### Hinzugefügt
- Mudlib-Index: Ein Generator ([tools/index-generator/](tools/index-generator/README.md), Docker-Image) erzeugt aus einer schreibgeschützt eingehängten Mudlib eine JSON-Datei mit Efuns, Sfuns, erbbaren Klassen (mit aufgelösten inherits) und allen Doku-Kommentaren (`FUNKTION:`). Das Plugin lädt sie per FTP (`mudlib.indexFile`, Standard `/doc/lpc-ide/index.json.gz`), nur wenn sich die `.stamp`-Datei geändert hat, und speichert sie lokal zwischen.
- Ohne homemud: geerbte Funktionen, Sfuns und Efun-Hilfe aus dem Mudlib-Index.
- Hover und Strg+Klick auf sonst unbekannte Namen zeigen passende Doku-Kommentare aus der ganzen Mudlib.
- Befehl **LPC: Mudlib-Index neu laden**.

### Geändert
- `inherit "%name"` und `#include <datei>` werden wie im UNItopia-Master vom Verzeichnis der Datei aufwärts gesucht (domain-eigene `i/`- und `sys/`-Verzeichnisse). Dadurch werden u. a. Makros aus domain-eigenen Headern aufgelöst.
- Pfadauflösung, Vererbung und simul_efun liegen in einem Modul ohne VS-Code-Abhängigkeit (`src/analysis/mudlib.ts`), das Plugin und Generator gemeinsam nutzen.

## 0.2.2 – homemud für Inherits, Sfuns und Efun-Doku nutzen

### Hinzugefügt
- Mit homemud: geerbte Funktionen über die ganze `inherit`-Kette in Completion, Hover, Goto-Definition und Parameterhilfe – inklusive `"%name"` (→ `/i/name.c`), Makros aus `#define`s und Verkettungen. Doku aus UNItopia-Kommentaren (`FUNKTION:`/`BESCHREIBUNG:`).
- Mit homemud: Efun-Hilfe aus `doc/efun/` (deutsche Fassung bevorzugt) in Hover, Completion und Parameterhilfe.
- Mit homemud: Sfuns werden direkt aus `mudlib.simulEfunFile` samt Includes und inherits gelesen und bei Änderungen neu geladen. Strg+Klick auf eine Sfun springt in die `simul_efun`.
- Completion, Hover und Parameterhilfe kennen die Funktionen der eigenen Datei.

### Geändert
- Sfun-Liste des eingebauten Profils `ldmud-unitopia` neu aus `/secure/simul_efun/simul_efun.c` samt Includes, `deklin.c` und `parse_com.c` erzeugt: 229 statt 201 Sfuns, 123 mit Beschreibung. Neu sind u. a. die Artikel- und Pronomen-Funktionen aus `deklin.c` (`Wer`, `Dem`, `Ein`, `Sein` …) und `query_pc_*` aus `parse_com.c`. Entfernt wurden 14 Einträge, die keine Sfuns sind (`create`, `reset`, `query_dativ` u. a.).

### Behoben
- Outline: `inherit`-Einträge hatten keinen Namen; Funktionen wie `string *foo()` und Funktionen ohne Rückgabetyp fehlten; lokale Variablen erschienen als globale.
- Diagnostics meldeten `inherit "%room"` fälschlich als nicht auflösbar.

## 0.2.1

### Entfernt
- Ungenutzte Abhängigkeit `vscode-languageclient` (wird erst für einen externen Language Server gebraucht). Das VSIX schrumpft dadurch von 461 auf 271 Dateien, und die einzige Laufzeit-Schwachstelle (`minimatch`) entfällt.

## 0.2.0

### Hinzugefügt
- HomeMUD: Befehle „Von Remote herunterladen“ und „Mit Remote vergleichen“ (Diff-Ansicht) im Explorer- und Editor-Tab-Kontextmenü.
- Option `ftp.allowSeparateTransferHost` in `lpc-config.json` für Server, die per PASV eine andere Daten-IP melden.

### Geändert
- Standard-Protokoll für `ftp.protocol` ist jetzt `ftps` statt unverschlüsseltem `ftp`.
- Eingebautes Profil `ldmud-unitopia` enthält jetzt alle 322 Efuns und 201 Sfuns.
- `basic-ftp` von 5.3.1 auf 6.2.3 aktualisiert (fest gepinnt). Bessere TLS-Session-Wiederaufnahme für FTPS, robustere Timeouts. Weicht die PASV-Daten-IP von der Server-IP ab, bricht die Verbindung jetzt standardmäßig ab (siehe `ftp.allowSeparateTransferHost`).

### Entfernt
- Dialekt `mudos` (gab weder Profil noch Erkennung).

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
