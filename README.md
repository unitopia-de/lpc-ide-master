# LPC-IDE-Master (UNItopia Edition)

VS Code Extension für die LPC-Entwicklung mit Schwerpunkt auf der UNItopia
**UNIlib** (LDMud 3.5.0/3.6.x), erweiterbar für weitere Mudlibs.

> Dieses Repository ist ein **Template/Skelett** auf Basis von
> [PLUGIN_PLAN.md](PLUGIN_PLAN.md). Es enthält die Verzeichnisstruktur und
> Stubs für alle im Plan beschriebenen Komponenten. Geschäftslogik ist
> bewusst minimal gehalten und wird in den Phasen 1–4 ausgebaut.

## Komponenten im Überblick

| Bereich | Datei | Status |
| --- | --- | --- |
| Konfiguration | [src/config/lpcConfig.ts](src/config/lpcConfig.ts) | Stub: Lesen/Validieren |
| Dialekt-Management | [src/dialect/dialectManager.ts](src/dialect/dialectManager.ts) | Stub: Profile + Auto-Discovery |
| Efun-Provider | [src/dialect/efunProvider.ts](src/dialect/efunProvider.ts) | Stub: JSON-Profile |
| FTP FileSystemProvider | [src/ftp/ftpFileSystemProvider.ts](src/ftp/ftpFileSystemProvider.ts) | Stub: read/write/list |
| FTP-Client | [src/ftp/ftpClient.ts](src/ftp/ftpClient.ts) | Wrapper um `basic-ftp` |
| SecretStorage | [src/ftp/credentialsManager.ts](src/ftp/credentialsManager.ts) | Funktionsfähig |
| Remote Explorer | [src/tree/remoteExplorerProvider.ts](src/tree/remoteExplorerProvider.ts) | Lazy-Loading-Tree |
| LSP-Client | [src/lsp/client.ts](src/lsp/client.ts) | Stub (Server folgt) |
| Statusbar | [src/statusBar.ts](src/statusBar.ts) | Aktiver Dialekt |

## Erste Schritte

```powershell
npm install
npm run compile
```

Anschließend in VS Code mit **F5** eine Extension-Development-Host-Instanz
starten (Konfiguration siehe [.vscode/launch.json](.vscode/launch.json)).

## Phasenplan (aus PLUGIN_PLAN.md)

1. **Phase 1** — `lpc-config.json` und Profil-Umschaltung für UNItopia.
2. **Phase 2** — `FileSystemProvider` für FTP/SFTP inkl. SecretStorage.
3. **Phase 3** — Remote Explorer Tree in der Sidebar.
4. **Phase 4** — LSP-Feinabstimmung auf UNItopia-Header und simul_efuns.
