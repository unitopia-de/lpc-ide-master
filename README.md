# LPC-IDE-Master (UNItopia Edition)

VS Code Extension für die LPC-Entwicklung mit Schwerpunkt auf der UNItopia
**UNIlib** (LDMud 3.5.0/3.6.x), erweiterbar für weitere Mudlibs.

Funktionsumfang: Remote-Dateisystem über FTP/FTPS/SFTP, optionaler
lokaler Entwicklungs-MUD ("homemud") mit Datei-Sync zur Remote, Telnet-
Konsole für Magier-Befehle (`update`/`destruct`), LPC-Syntax-Highlighting
und Editor-Unterstützung (Hover, Completion, Outline, Goto-Definition,
Diagnostics, Signature-Help) für 322 LDMud-Efuns und 201 UNItopia-Sfuns.

## Beispielkonfiguration

`lpc-config.json` im Workspace-Root:

```json
{
  "dialect": "ldmud",
  "version": "3.6.8",
  "mudlib": {
    "name": "UNIlib",
    "baseDir": "/sys/unitopia",
    "simulEfunFile": "/secure/simul_efun/simul_efun.c",
    "includeDirs": [
      "/sys/include"
    ],
    "efunDefinitions": "lpc-efuns.json"
  },
  "ftp": {
    "host": "unitopia.de",
    "port": 21,
    "user": "wizard?",
    "remoteRoot": "/",
    "protocol": "ftps"
  }
}
```

Das Passwort wird **nicht** in dieser Datei abgelegt, sondern beim ersten
Verbindungsaufbau abgefragt und in der OS-Keychain (SecretStorage) gespeichert.

Die Verbindungsblöcke und Funktion für direkte Mudverbindungen kommt evtl später.


## Konfigurationsdateien

| Datei / Ort | Zweck |
| --- | --- |
| `lpc-config.json` im Workspace-Root | Dialekt, Mudlib, FTP |
| OS-Keychain (Windows Credential Manager o. ä.) | FTP-Passwort — automatisch verwaltet |
| `Strg+,` → "lpc" | VS-Code-User/Workspace-Settings (siehe unten) |

### Globale Plugin-Settings

| Setting | Default | Wirkung |
| --- | --- | --- |
| `lpc.configFile` | `"lpc-config.json"` | Anderer Dateiname für die Workspace-Konfig |
| `lpc.dialect.autoDetect` | `true` | Auto-Discovery beim Workspace-Öffnen |
| `lpc.mud.enabled` | `false` | Telnet zu remote MUD und homemud aktivieren |
| `lpc.ftp.verbose` | `false` | FTP-Protokoll-Trace in eigenem OutputChannel |
| `lpc.ftp.uploadOnSave` | `false` | *Reserviert für Phase 2.5 (noch nicht aktiv)* |
| `lpc.ftp.protocol` | `"ftps"` | *Reserviert (echtes Protokoll kommt aus lpc-config.json)* |

### Bekannte Einschränkungen / offene Punkte

- **FTP** — kein automatischer Reconnect bei Timeout, keine SSH-Key-Auth (nur Passwort)
- **DocumentSymbolProvider** — erkennt nur Funktionen mit explizitem Return-Typ
- **tmLanguage** — Heredoc-Edge-Cases, kein semantisches Highlighting für lokale Funktionen
- **Multi-Root-Workspace** — nur der erste Folder wird ausgewertet
- **uploadOnSave** — Setting existiert, Logik (Phase 2.5) folgt
- **Externer LSP-Server** (z. B. jlchmura/lpc-language-server) — Client-Stub steht, Server-Anbindung offen
- **Unit-Tests / CI / VSIX-Packaging** — noch nicht eingerichtet

## Repository

<https://github.com/unitopia-de/lpc-ide-master>