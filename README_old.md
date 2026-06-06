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

Eine voll ausgestattete Variante mit allen Feldern (inkl. `homemud` und
`mud`-Telnet-Block) liegt unter
[examples/unitopia-full/](examples/unitopia-full/).

## Features

| Bereich | Quelle | Status |
| --- | --- | --- |
| Konfiguration mit File-Watcher und Validierung | [src/config/lpcConfig.ts](src/config/lpcConfig.ts) | ✅ |
| Dialekt-Management + Auto-Discovery | [src/dialect/dialectManager.ts](src/dialect/dialectManager.ts) | ✅ |
| Efun/Sfun-Provider (eingebaute Profile + Workspace-Profile) | [src/dialect/efunProvider.ts](src/dialect/efunProvider.ts) | ✅ |
| FTP/FTPS/SFTP-Backends | [src/ftp/ftpBackend.ts](src/ftp/ftpBackend.ts), [src/ftp/sftpBackend.ts](src/ftp/sftpBackend.ts) | ✅ |
| Verbindungs-Pool (serialisierte FTP-Operationen) | [src/ftp/connectionManager.ts](src/ftp/connectionManager.ts) | ✅ |
| `lpc-ftp://` FileSystemProvider (read/write/list/mkdir/rename/delete) | [src/ftp/ftpFileSystemProvider.ts](src/ftp/ftpFileSystemProvider.ts) | ✅ |
| SecretStorage für FTP- und MUD-Passwörter | [src/ftp/credentialsManager.ts](src/ftp/credentialsManager.ts) | ✅ |
| Remote-Explorer-Tree (Lazy-Loading, Sortierung, Welcome-View) | [src/tree/remoteExplorerProvider.ts](src/tree/remoteExplorerProvider.ts) | ✅ |
| HomeMUD-Service: Pfad-Mapping + Sync remote ⇄ lokal | [src/homemud/homeMudService.ts](src/homemud/homeMudService.ts) | ✅ |
| MUD-Konsole (Telnet/Telnets, Login-Pattern, OutputChannel) | [src/mud/mudClient.ts](src/mud/mudClient.ts), [src/mud/mudConsole.ts](src/mud/mudConsole.ts) | ✅ (opt-in) |
| Statusbar-Items (Dialekt, FTP, MUD, homemud) | [src/statusBar.ts](src/statusBar.ts) | ✅ |
| LSP-Client-Stub (für späteren externen LPC-Server) | [src/lsp/client.ts](src/lsp/client.ts) | 🚧 |
| Hover, Completion, Document-Symbol-Outline | [src/providers/](src/providers/) | ✅ |
| Goto-Definition (inherit/include/lokale Funktionen) | [src/providers/definitionProvider.ts](src/providers/definitionProvider.ts) | ✅ |
| Diagnostics (`class` vs. `struct`, ungelöste Pfade) | [src/providers/diagnosticProvider.ts](src/providers/diagnosticProvider.ts) | ✅ |
| Signature-Help mit aktivem Parameter | [src/providers/signatureHelpProvider.ts](src/providers/signatureHelpProvider.ts) | ✅ |
| LPC-Grammatik mit 322 Efuns + LPC-Klammer-Formen | [syntaxes/lpc.tmLanguage.json](syntaxes/lpc.tmLanguage.json) | ✅ |

## Erste Schritte

```powershell
npm install
npm run compile
```

Anschließend in VS Code mit **F5** eine Extension-Development-Host-Instanz
starten (Konfiguration siehe [.vscode/launch.json](.vscode/launch.json)).
Im neuen Fenster den eigenen MUD-Workspace oder
[examples/unitopia-full/](examples/unitopia-full/) öffnen.

## Konfigurationsdateien

| Datei / Ort | Zweck |
| --- | --- |
| `lpc-config.json` im Workspace-Root | Dialekt, Mudlib, FTP, optional Telnet, optional homemud |
| OS-Keychain (Windows Credential Manager o. ä.) | Passwörter für FTP und MUD — automatisch verwaltet |
| `Strg+,` → "lpc" | VS-Code-User/Workspace-Settings (siehe unten) |

### Globale Plugin-Settings

| Setting | Default | Wirkung |
| --- | --- | --- |
| `lpc.configFile` | `"lpc-config.json"` | Anderer Dateiname für die Workspace-Konfig |
| `lpc.dialect.autoDetect` | `true` | Auto-Discovery beim Workspace-Öffnen |
| `lpc.mud.enabled` | `false` | Telnet zu remote MUD und homemud aktivieren |
| `lpc.ftp.verbose` | `false` | FTP-Protokoll-Trace in eigenem OutputChannel |
| `lpc.ftp.uploadOnSave` | `false` | *Reserviert für Phase 2.5 (noch nicht aktiv)* |
| `lpc.ftp.protocol` | `"ftp"` | *Reserviert (echtes Protokoll kommt aus lpc-config.json)* |

## Phasenplan-Status

Stand bezogen auf den ursprünglichen [PLUGIN_PLAN.md](PLUGIN_PLAN.md):

1. **Phase 1 — lpc-config.json + Profil-Umschaltung** ✅
2. **Phase 2 — FileSystemProvider für FTP/FTPS/SFTP + SecretStorage** ✅
3. **Phase 3 — Remote Explorer Tree + Telnet-Konsole** ✅
4. **Phase 3.5 — HomeMUD-Integration (Pfad-Mapping + Sync)** ✅
5. **Phase 4 — LSP-Provider** ✅ (alle Provider intern; externer LSP-Server-Anbindung weiterhin Stub)

### Bekannte Einschränkungen / offene Punkte

- **FTP** — kein automatischer Reconnect bei Timeout, keine SSH-Key-Auth (nur Passwort)
- **Telnet** — Pattern-Login ist Heuristik; kann bei langem MOTD versagen
- **HomeMUD-Sync** — sequenziell, kein Diff/Merge vor Überschreiben, kein Auto-Sync
- **DocumentSymbolProvider** — erkennt nur Funktionen mit explizitem Return-Typ
- **tmLanguage** — Heredoc-Edge-Cases, kein semantisches Highlighting für lokale Funktionen
- **Multi-Root-Workspace** — nur der erste Folder wird ausgewertet
- **uploadOnSave** — Setting existiert, Logik (Phase 2.5) folgt
- **Externer LSP-Server** (z. B. jlchmura/lpc-language-server) — Client-Stub steht, Server-Anbindung offen
- **Unit-Tests / CI / VSIX-Packaging** — noch nicht eingerichtet

## Verzeichnisstruktur

```
lpc_ftp_uni_plugin/
├── src/                       Extension-TypeScript-Code
│   ├── config/                lpc-config.json Service + Validierung
│   ├── dialect/               Dialekt-Manager, Efun-Provider
│   ├── ftp/                   Backends, FileSystemProvider, Connection-Pool
│   ├── homemud/               Pfad-Mapping + Sync remote ⇄ lokal
│   ├── mud/                   Telnet-Client + Konsole
│   ├── tree/                  Remote-Explorer-TreeDataProvider
│   ├── providers/             Hover/Completion/Symbols/Definition/Diagnostics/Signature
│   ├── lsp/                   Client-Stub für späteren externen LSP-Server
│   ├── commands/              Command-Registrierung
│   ├── statusBar.ts           Vier Statusleisten-Items
│   └── extension.ts           Entry Point: activate()/deactivate()
├── resources/profiles/        Eingebaute Dialekt-Profile (Efun-/Sfun-JSONs)
├── schemas/                   JSON-Schema für lpc-config.json
├── syntaxes/                  TextMate-Grammatik für LPC
├── examples/
│   ├── sample-workspace/      Minimal-Beispiel
│   └── unitopia-full/         Voll ausgestattetes Beispiel mit allen Feldern
├── language-configuration.json
└── package.json
```
