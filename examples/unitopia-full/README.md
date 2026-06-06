# Voll ausgestattete UNItopia-Konfiguration

Diese Beispielkonfiguration nutzt **alle** vom Plugin unterstützten Felder.
Sie ist bewusst überdokumentiert — in einem realen Projekt reichen meist
viel weniger Felder, weil die Defaults greifen.

## Verwendung

1. Diesen Ordner als Workspace in VS Code öffnen.
2. Beim ersten FTP-/MUD-Connect wird das Passwort abgefragt und im
   OS-Schlüsselbund gespeichert (SecretStorage).

## Felder im Detail

### Top-Level

| Feld | Pflicht | Erläuterung |
|---|---|---|
| `$schema` | nein | Aktiviert JSON-Schema-Validierung im VS-Code-Editor (Auto-Completion, Fehlermarkierung). |
| `dialect` | **ja** | LPC-Treiber: `"ldmud"`, `"fluffos"` oder `"mudos"`. UNItopia nutzt `"ldmud"`. |
| `version` | nein | Treiber-Version, z.B. `"3.6.7"`. Aktuell informativ — kann später für versionsabhängige Efun-Definitionen ausgewertet werden. |

### `mudlib`

| Feld | Pflicht | Erläuterung |
|---|---|---|
| `name` | **ja** | Mudlib-Name. Wird für die Auto-Discovery genutzt: enthält der Name `"uni"`, wählt das Plugin automatisch das Profil `ldmud-unitopia`. Bei `"mg"`/`"morgen"` → `ldmud-morgengrauen`. |
| `baseDir` | **ja** | Wurzelverzeichnis der Mudlib im virtuellen MUD-Dateisystem. Wird verwendet, um `inherit`-Pfade aufzulösen. |
| `simulEfunFile` | nein | Pfad zur `simul_efun.c`. In Phase 4 wird der LSP daraus die Sfun-Liste parsen. |
| `includeDirs` | nein | Verzeichnisse, in denen `#include`-Pfade gesucht werden. Reihenfolge entspricht der Suchreihenfolge. |
| `efunDefinitions` | nein | Workspace-spezifisches Efun-/Sfun-Profil (relativ zum Workspace-Root). Wird **zusätzlich** zum eingebauten Profil geladen — siehe `lpc-efuns.json`. |

### `ftp` — Remote-Dateisystem

| Feld | Pflicht | Erläuterung |
|---|---|---|
| `host` | **ja** | Hostname/IP des FTP-/SFTP-Servers. |
| `port` | nein | Default `21` (ftp/ftps), `990` (ftps-implicit), `22` (sftp). |
| `user` | **ja** | Benutzername. Das Passwort wird **niemals** in dieser Datei gespeichert, sondern bei Bedarf abgefragt und in der OS-Keychain abgelegt. |
| `remoteRoot` | nein | Startverzeichnis für den Remote Explorer und beim "Remote-Workspace-Folder hinzufügen". Default: `mudlib.baseDir`. |
| `protocol` | nein | Eines von: `"ftp"` (plain, Default), `"ftps"` (explicit AUTH TLS), `"ftps-implicit"` (TLS ab Verbindungsbeginn), `"sftp"` (SSH-basiert). |
| `tls` | nein | Nur für `ftps`/`ftps-implicit`. Optionen für die TLS-Schicht. |
| `tls.rejectUnauthorized` | nein | Default `true` (strikte Zertifikatsprüfung). Auf `false` setzen, um selbst-signierte Zertifikate zu akzeptieren. |

**Beispiel FTPS (explicit, mit selbst-signiertem Zertifikat)**:
```json
"ftp": {
  "host": "mud.beispiel.de",
  "port": 21,
  "user": "magier",
  "protocol": "ftps",
  "tls": { "rejectUnauthorized": false }
}
```

### `mud` — Telnet-Konsole für `update`/`destruct`

| Feld | Pflicht | Erläuterung |
|---|---|---|
| `host` | **ja** | Hostname/IP des MUD-Servers. |
| `port` | nein | Default `4711` (telnet) bzw. `992` (telnets). |
| `user` | nein | Magier-Login. **Fehlt user**, wird die Login-Sequenz übersprungen — sinnvoll für homemud im Gast-Modus oder offene Test-MUDs. |
| `protocol` | nein | `"telnet"` (Default, plain TCP) oder `"telnets"` (TLS). |
| `loginPrompt` | nein | **Regex**, auf den der Client wartet, bevor der Username gesendet wird. Default: `"(Name\|Wie\\s*hei[ßs]?t\\s*du)"`. |
| `passwordPrompt` | nein | **Regex** für den Passwort-Prompt. Default: `"Passwort"`. |
| `commandPrompt` | nein | **Regex** für den Befehlsprompt — daran erkennt der Client, dass eine Antwort vollständig empfangen wurde. Default: `"^>\\s*$"`. |
| `completionMarker` | nein | Optionaler Endmarker. Wenn gesetzt, sendet das Plugin nach jedem Befehl ein zusätzliches `echo <marker>` und sammelt den Output bis zum Marker — robuster als reines Prompt-Matching, falls der MUD-Output Prompt-ähnliche Zeichen enthält. |

### `homemud` — lokales Entwicklungs-MUD im Workspace

Optional. Wenn gesetzt, kann das Plugin Dateien zwischen dem Remote-MUD
und einem lokalen MUD-Verzeichnis hin- und herkopieren — und einen
zweiten Telnet-Kanal (z.B. zu localhost) bereitstellen.

| Feld | Pflicht | Erläuterung |
|---|---|---|
| `path` | **ja** | Workspace-relativer Pfad zum lokalen MUD-Verzeichnis (z.B. `"./mud"`). |
| `libPath` | nein | Pfad zur Mudlib innerhalb von `path`. Default `"/lib"`. |
| `mud` | nein | Optionaler `mud`-Block (gleiche Felder wie oben) für eine zweite Telnet-Konsole zum localhost-MUD. |

#### Pfad-Mapping

```
Remote (lpc-ftp)                          Lokal (homemud)
lpc-ftp://host{remoteRoot}/foo/bar.c  ⇄   <ws>/{homemud.path}{homemud.libPath}/foo/bar.c
```

Mit dieser Config:

```
lpc-ftp://mud.unitopia.de/players/magier/std/room.c
                ⇄
<workspace>/mud/lib/std/room.c
```

#### Sync-Aktionen

| Wo | Aktion |
|---|---|
| Remote-Tree → Rechtsklick | **Nach homemud kopieren** (Datei oder ganzes Verzeichnis rekursiv) |
| Datei-Explorer / Editor-Tab → Rechtsklick (innerhalb von `homemud.path`) | **Zur Remote hochladen** (mit Modal-Bestätigung) |

#### Default-MUD für `update`/`destruct`

Sind beide MUDs konfiguriert, fragt das Plugin per QuickPick — **Default-Auswahl ist homemud**, weil dort entwickelt/getestet wird. Mit nur einem konfigurierten MUD entfällt die Frage.

## Was passiert beim Start

1. Plugin liest `lpc-config.json`.
2. Auto-Discovery erkennt anhand `mudlib.name="UNIlib"` → Dialekt `ldmud-unitopia`.
3. Eingebautes Profil wird geladen (~37 Symbole).
4. `mudlib.efunDefinitions` zeigt auf `lpc-efuns.json` → die dortigen Symbole werden ergänzt.
5. Statusleiste zeigt: `LPC: ldmud-unitopia (39)` (37 + 2 magier-eigene Sfuns).
6. Drei weitere Items in der Statusleiste:
   - `$(circle-slash) FTP: mud.unitopia.de` (klick → verbinden)
   - `$(circle-slash) MUD: mud.unitopia.de` (klick → MUD-Konsole anzeigen)

## Befehle, die diese Konfiguration freischaltet

| Aktion | Wo | Effekt |
|---|---|---|
| Rechtsklick auf `.c`-Datei → **Update Object** | Remote Explorer | Sendet `update <pfad>` an den MUD via Telnet. |
| Rechtsklick auf `.c`-Datei → **Destruct Object** | Remote Explorer | Modal-Bestätigung → sendet `destruct <pfad>`. |
| Klick auf MUD-Statusbar-Item | Statusleiste | OutputChannel **„LPC MUD Console"** öffnet sich. |
| Inline `$(new-file)`/`$(new-folder)` neben Verzeichnissen | Remote Explorer | Erstellt Datei/Ordner direkt via FTP. |

## Sicherheit

- Passwörter (`ftp` und `mud`) werden ausschließlich über die VS Code
  [SecretStorage API](https://code.visualstudio.com/api/references/vscode-api#SecretStorage)
  in der OS-Keychain (Credential Manager unter Windows) gespeichert.
- Diese `lpc-config.json` enthält **keine** Geheimnisse und kann bedenkenlos in
  Git eingecheckt werden.
- `telnet` ist unverschlüsselt — Passwörter gehen im Klartext über die Leitung.
  Wenn UNItopia einen TLS-Port anbietet, sollte `protocol: "telnets"` mit dem
  entsprechenden Port verwendet werden.
