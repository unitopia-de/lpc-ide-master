# LPC-IDE-Master (UNItopia Edition)

VS Code Extension für die LPC-Entwicklung mit Schwerpunkt auf der UNItopia
**UNIlib** (LDMud 3.5.0/3.6.x), erweiterbar für weitere Mudlibs.

## Funktionsumfang

* Remote-Dateisystem über FTP/FTPS/SFTP – Mudlib-Dateien direkt im Editor bearbeiten
* Remote Explorer in der Seitenleiste mit Neu, Umbenennen, Löschen, Pfad kopieren
* Optionaler lokaler Entwicklungs-MUD („homemud“) mit Herunterladen, Hochladen und Vergleichen
* MUD-Terminal (Telnet/TLS) direkt in VS Code, standardmäßig aus
* LPC-Syntax-Highlighting und Editor-Unterstützung (Hover, Completion, Outline,
  Goto-Definition, Diagnostics, Signature-Help) für 322 LDMud-Efuns und 229 UNItopia-Sfuns
* Mit homemud zusätzlich: geerbte Funktionen über die ganze `inherit`-Kette, Efun-Hilfe aus
  `doc/efun` und Sfuns direkt aus der `simul_efun`

## Installation

### Aus dem VS Code Marketplace (empfohlen)

Das Plugin steht im Marketplace unter
[myonara.lpc-ide-master](https://marketplace.visualstudio.com/items?itemName=myonara.lpc-ide-master).

1. VS Code öffnen und die Ansicht **Extensions** aufrufen (`Strg+Shift+X`).
2. Nach **LPC-IDE-Master** suchen.
3. Bei **LPC-IDE-Master (UNItopia Edition)** von **myonara** auf **Install** klicken.

Alternativ in der Kommandozeile:

```bash
code --install-extension myonara.lpc-ide-master
```

Updates installiert VS Code dann automatisch.

> **Arbeitest du mit VS-Code-Profilen?** Die Extension wird nur in das gerade aktive Profil
> installiert. Taucht sie in einem anderen Fenster nicht auf, installiere sie dort ebenfalls
> oder nutze `code --install-extension myonara.lpc-ide-master --profile <Profilname>`.

> **Umstieg von einer selbst gebauten Version:** Frühere `.vsix`-Dateien liefen unter dem
> Publisher `unitopia-de`, also als andere Extension. Deinstalliere **vorher** die alte
> Version, sonst sind alle Befehle doppelt vorhanden. Deine `lpc-config.json` und die
> Einstellungen bleiben erhalten. Die FTP-Zugangsdaten musst du einmal neu eingeben, und der
> Mudlib-Index wird einmal neu geladen.

### Selbst bauen (für Entwicklung oder Vorabversionen)

Wer am Plugin mitentwickeln oder einen Stand vor der nächsten Veröffentlichung nutzen
möchte, baut es selbst als `.vsix`-Datei und installiert diese Datei in VS Code.

#### Voraussetzungen

| Programm | Version | Prüfen mit |
| --- | --- | --- |
| [Git](https://git-scm.com/) | beliebig | `git --version` |
| [Node.js](https://nodejs.org/) (inkl. npm) | **22 oder neuer** | `node --version` |
| [VS Code](https://code.visualstudio.com/) | 1.85 oder neuer | Hilfe → Info |

#### 1. Repository klonen

Wechsle in ein Verzeichnis deiner Wahl, z. B. `C:\Projekte`, und klone das Repository:

```bash
git clone https://github.com/unitopia-de/lpc-ide-master.git
cd lpc-ide-master
```

#### 2. VSIX-Datei erstellen

```bash
npm install
npm run package
```

Danach liegt im Verzeichnis `lpc-ide-master` die Datei **`lpc-ide-master-<version>.vsix`**,
z. B. `lpc-ide-master-0.2.12.vsix`.

> Die Warnung von `vsce`, die Extension bestehe aus vielen Dateien und solle gebündelt werden,
> ist harmlos. Meldungen von `npm install` zu `cpu-features` oder `node-gyp` ebenfalls –
> das ist eine optionale Beschleunigung der SSH-Bibliothek, die ohne C++-Compiler entfällt.

#### 3. In VS Code installieren

1. VS Code öffnen und die Ansicht **Extensions** aufrufen (`Strg+Shift+X`).
2. Oben rechts in der Extensions-Ansicht auf **`…`** (Weitere Aktionen) klicken.
3. **„Install from VSIX…“** („Aus VSIX installieren…“) wählen.
4. Die Datei `lpc-ide-master-<version>.vsix` aus Schritt 2 auswählen.
5. Wenn VS Code dazu auffordert, das Fenster neu laden.

Unter **Installed** erscheint jetzt **LPC-IDE-Master (UNItopia Edition)**.

> **Arbeitest du mit VS-Code-Profilen?** Die Extension wird nur in das gerade aktive Profil
> installiert. Taucht sie in einem anderen Fenster nicht auf, wiederhole Schritt 3 dort
> oder nutze in der Kommandozeile
> `code --install-extension lpc-ide-master-<version>.vsix --profile <Profilname>`.

#### Selbst gebaute Version aktualisieren

```bash
cd lpc-ide-master
git pull
npm install
npm run package
```

Anschließend Schritt 3 mit der neuen `.vsix`-Datei wiederholen. Die alte Version wird dabei ersetzt.

Die selbst gebaute Version hat dieselbe ID wie die aus dem Marketplace (`myonara.lpc-ide-master`)
und ersetzt sie. Erscheint im Marketplace eine neuere Version, installiert VS Code diese beim
nächsten automatischen Update wieder darüber.

## Konfiguration

Das Plugin wird über eine Datei **`lpc-config.json`** gesteuert. Sie liegt im
Wurzelverzeichnis des Ordners, den du in VS Code öffnest (**Datei → Ordner öffnen…**).
Dieser Ordner ist dein Arbeits-Workspace. Er ist unabhängig vom geklonten Plugin-Repository.

Sobald VS Code eine `lpc-config.json` im geöffneten Ordner findet, wird das Plugin aktiv.
Änderungen an der Datei werden sofort übernommen. Beim Bearbeiten hilft VS Code mit
Autovervollständigung und Fehlermarkierung.

Die Datei enthält **keine Passwörter**. Das FTP-Passwort wird beim ersten Verbinden
abgefragt und im Schlüsselbund des Betriebssystems gespeichert
(unter Windows in der Anmeldeinformationsverwaltung).

### Variante A: Ohne homemud (nur Remote-MUD)

Du bearbeitest die Dateien direkt auf dem MUD-Server.

```
MeinMUD/                   ← diesen Ordner in VS Code öffnen
└── lpc-config.json
```

`lpc-config.json`:

```json
{
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
    "user": "deinmagiername",
    "remoteRoot": "/",
    "protocol": "ftps"
  }
}
```

Anpassen musst du mindestens `ftp.user`. Mit `remoteRoot` legst du fest, welches
Verzeichnis der Remote Explorer als Startpunkt zeigt, z. B. `"/w/deinmagiername"`.

**Erste Verbindung:**

1. In der linken Leiste das Symbol **Remote MUD** anklicken.
2. **Verbinden** wählen und das FTP-Passwort eingeben.
3. Auswählen, ob das Remote-Verzeichnis zusätzlich als Workspace-Ordner eingebunden
   werden soll („Hinzufügen“) oder nur im Remote Explorer erscheint („Nur Tree zeigen“).
4. Dateien öffnen, bearbeiten, speichern – das Speichern schreibt direkt auf den Server.

### Variante B: Mit homemud (lokales Entwicklungs-MUD)

Du hast eine lokale Kopie der Mudlib, z. B. für einen eigenen LDMud-Testtreiber.
Dateien holst du vom Server, entwickelst und testest lokal und lädst sie danach wieder hoch.

```
MeinMUD/                   ← diesen Ordner in VS Code öffnen
├── lpc-config.json
└── lib/                   ← lokale Mudlib (homemud.path + homemud.libPath)
    ├── secure/
    ├── std/
    └── ...
```

`lpc-config.json` – wie Variante A, ergänzt um den Block `homemud`:

```json
{
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
    "user": "deinmagiername",
    "remoteRoot": "/",
    "protocol": "ftps"
  },
  "homemud": {
    "path": "./",
    "libPath": "/lib"
  }
}
```

| Feld | Bedeutung |
| --- | --- |
| `homemud.path` | Verzeichnis des lokalen MUD, relativ zum geöffneten Ordner. `"./"` = der Ordner selbst. |
| `homemud.libPath` | Mudlib-Verzeichnis innerhalb von `path`. Standard `"/lib"`. |

**So werden die Pfade zugeordnet:** Alles unterhalb von `ftp.remoteRoot` auf dem Server
entspricht 1:1 dem Verzeichnis `<path>/<libPath>` im geöffneten Ordner. Mit der Konfiguration oben:

```
lpc-ftp://unitopia.de/std/room.c   ⇄   MeinMUD/lib/std/room.c
```

**Abgleich per Rechtsklick:**

| Wo | Befehl | Wirkung |
| --- | --- | --- |
| Remote Explorer | **Nach homemud kopieren** | Datei oder Verzeichnis vom Server ins homemud holen |
| Explorer oder Editor-Tab (Datei im homemud) | **Zur Remote hochladen** | Lokale Datei bzw. Verzeichnis auf den Server schreiben |
| Explorer oder Editor-Tab (Datei im homemud) | **Von Remote herunterladen** | Lokale Datei bzw. Verzeichnis mit dem Stand vom Server überschreiben |
| Explorer oder Editor-Tab (Datei im homemud) | **Mit Remote vergleichen** | Diff-Ansicht: links Server, rechts lokal |

Vor dem Überschreiben fragt das Plugin jeweils nach.

**Was das homemud zusätzlich im Editor bringt:** Weil die Mudlib lokal vorliegt, kann das Plugin
sie lesen, ohne den Server zu fragen:

| Funktion | Beispiel |
| --- | --- |
| **Geerbte Funktionen** in Vorschlägen, Hover, Strg+Klick und Parameterhilfe – über die ganze `inherit`-Kette, auch bei `inherit "%room";` und Makros wie `inherit CPR;` | In einem Raum zeigt `set_sh…` die Funktion `set_short` aus `/i/item/description.c` samt Beschreibung |
| **Efun-Hilfe** aus `lib/doc/efun/` (deutsche Fassung bevorzugt) | Hover über `allocate` zeigt Synopsis, Beschreibung und Beispiele |
| **Sfuns direkt aus der `simul_efun`** statt aus einer festen Liste – neue Sfuns sind sofort bekannt | Strg+Klick auf `file_path` springt nach `/secure/simul_efun/paths.inc` |

Welche Datei als `simul_efun` gelesen wird, legt `mudlib.simulEfunFile` fest, z. B.
`"/secure/simul_efun/simul_efun.c"`. Wie viele Sfuns gefunden wurden, steht im Ausgabefenster
**LPC-IDE-Master**.

### Optional: MUD-Terminal

Ein Terminal in VS Code, in dem du wie in einem MUD-Client arbeitest. Standardmäßig
ausgeschaltet. Zum Einschalten in den VS-Code-Einstellungen (`Strg+,`) nach
`lpc.mud.enabled` suchen und aktivieren. Dann in der `lpc-config.json` einen Block
`mud` (Remote-MUD) und/oder `homemud.mud` (lokales MUD) ergänzen, z. B. für UNItopia:

```json
"mud": {
  "host": "unitopia.de",
  "port": 992,
  "protocol": "telnets"
}
```
Oder für Orbit:
```json
"mud": {
  "host": "unitopia.de",
  "port": 9988,
  "protocol": "telnets"
}
```

| MUD | `telnets` (verschlüsselt) | `telnet` |
| --- | --- | --- |
| UNItopia | Port **992** (Standard bei `telnets`) | Port 3333 |
| Orbit | Port **9988** | Port **9876** |

**LPC: Remote-MUD-Terminal öffnen** (oder ein Klick auf den MUD-Eintrag in der Statusleiste)
öffnet einen Terminal-Tab und verbindet. Einloggen tust du dich dort selbst, mit Name und
Passwort wie in jedem MUD-Client. Das Plugin speichert keine MUD-Passwörter.

| Taste | Wirkung |
| --- | --- |
| Enter | Zeile ans MUD schicken; nach einem Verbindungsabbruch neu verbinden |
| ← → Pos1 Ende, Rücktaste, Entf | Zeile bearbeiten |
| ↑ ↓ | frühere Eingaben (Passwörter werden nicht gemerkt) |
| Strg+C | Zeile verwerfen |

Fragt das MUD nach dem Passwort, bleibt die Eingabe unsichtbar. Farben des MUD werden
angezeigt. **LPC: MUD-Terminal trennen** oder das Schließen des Terminal-Tabs beendet die
Verbindung.

Erscheint nach `[TLS aufgebaut …]` keine Begrüßung, stimmt meist der Port nicht.

> `telnet` ist unverschlüsselt – das MUD-Passwort geht im Klartext über die Leitung.

### Mudlib-Index vom Server (ohne homemud)

Stellt der MUD-Betreiber einen **Mudlib-Index** bereit, bekommen auch Magier ohne homemud
geerbte Funktionen, Sfuns, Efun-Hilfe und alle Doku-Kommentare (`FUNKTION:`) im Editor. Der
Index wird auf dem Server von einem Generator erzeugt, siehe
[tools/index-generator/](tools/index-generator/README.md).

- **Wo:** `mudlib.indexFile` in der `lpc-config.json`, Standard `/doc/lpc-ide/index.json.gz`.
- **Wann geladen:** Sobald eine FTP-Verbindung besteht, liest das Plugin eine winzige
  `.stamp`-Datei daneben. Nur wenn sie sich geändert hat, lädt es den Index (rund 1,6 MB) und
  legt ihn lokal ab. Ohne Verbindung wird die lokale Kopie benutzt. Es gibt keine
  regelmäßigen Abfragen.
- **Mit homemud** liest das Plugin Vererbung, Sfuns und Efun-Hilfe weiterhin live aus der
  lokalen Mudlib. Aus dem Index kommen dann nur die Doku-Kommentare außerhalb der
  Vererbung, sofern die Datei auch im homemud liegt.
- **Von Hand aktualisieren:** Befehl **LPC: Mudlib-Index neu laden** (`Strg+Shift+P`).
- **Wo man es sieht:** Der Tooltip des LPC-Eintrags in der Statusleiste zeigt Stand und Herkunft
  des Index. Während des Abgleichs dreht sich dort ein Symbol. Im Ausgabefenster
  **LPC-IDE-Master** steht bei jedem Abgleich, ob der Index aktuell war oder neu geladen wurde.

Doku-Kommentare außerhalb der Vererbung erscheinen beim Hover über einen sonst unbekannten
Namen. Strg+Klick springt zur Fundstelle.

**Hover und Strg+Klick bei `ob->fun()` und `ob.fun()`:** Das Plugin weiß meist nicht, welches
Objekt `ob` ist. Es sucht den Namen deshalb in allen Klassen (`/i/…`) des Mudlib-Index:

- **Hover** zeigt bis zu drei Treffer mit Kommentar, ausführlich dokumentierte und solche aus
  der Kern-Mudlib zuerst.
- **Strg+Klick** listet alle Fundstellen in derselben Reihenfolge, dazu passende Doku-Blöcke.
  VS Code zeigt sie als Vorschau-Liste, aus der du die richtige Datei wählst.

Steht das Ziel als Pfad da, etwa `"/i/room"->add_v_item()`, kommen Hover und Sprungziel genau
aus diesem Objekt bzw. seiner `inherit`-Kette. Bei `this_object()->fun()` gilt die eigene Datei.

### Weitere Felder in `lpc-config.json`

| Feld | Standard | Bedeutung |
| --- | --- | --- |
| `ftp.protocol` | `"ftps"` | `"ftp"` (unverschlüsselt), `"ftps"`, `"ftps-implicit"` oder `"sftp"` |
| `ftp.port` | 21 / 990 / 22 | je nach Protokoll |
| `ftp.tls.rejectUnauthorized` | `true` | `false` akzeptiert selbst-signierte Zertifikate |
| `ftp.allowSeparateTransferHost` | `false` | `true`, wenn der Server für Dateiübertragungen eine andere IP meldet (Fehler „PASV returned another host“) |
| `mudlib.efunDefinitions` | – | Eigene JSON-Datei mit zusätzlichen Efuns/Sfuns, ergänzt das eingebaute Profil |
| `mudlib.indexFile` | `"/doc/lpc-ide/index.json.gz"` | Mudlib-Index (siehe oben) |

## VS-Code-Einstellungen

Erreichbar über `Strg+,` → Suche „lpc“.

| Setting | Default | Wirkung |
| --- | --- | --- |
| `lpc.configFile` | `"lpc-config.json"` | Anderer Dateiname für die Workspace-Konfiguration |
| `lpc.dialect.autoDetect` | `true` | Dialekt beim Öffnen automatisch erkennen |
| `lpc.mud.enabled` | `false` | Telnet zu Remote-MUD und homemud aktivieren |
| `lpc.ftp.verbose` | `false` | FTP-Protokoll-Mitschnitt im Ausgabefenster „LPC FTP Trace“ |
| `lpc.ftp.uploadOnSave` | `false` | *Reserviert, noch ohne Funktion* |
| `lpc.ftp.protocol` | `"ftps"` | *Reserviert, das Protokoll kommt aus `lpc-config.json`* |

## Tipps und Fehlersuche

- **Plugin reagiert nicht:** Liegt die `lpc-config.json` direkt im geöffneten Ordner?
  Fehler in der Datei stehen im Ausgabefenster (`Strg+Shift+U`) unter **LPC-IDE-Master**.
- **`.c`-Dateien werden als C statt LPC angezeigt:** Unten rechts in der Statusleiste auf
  den Sprachmodus klicken und **LPC** wählen. Dauerhaft geht es über die Einstellung
  `"files.associations": { "*.c": "lpc", "*.h": "lpc" }` in den Workspace-Einstellungen.
- **Falsches Passwort gespeichert:** Befehl **LPC: FTP-Passwort ändern** (`Strg+Shift+P`).
- **Verbindungsprobleme:** `lpc.ftp.verbose` einschalten und den Mitschnitt prüfen.

## Bekannte Einschränkungen

- **FTP** – kein automatischer Reconnect bei Timeout, keine SSH-Key-Anmeldung (nur Passwort)
- **Präprozessor** – `#if`-Bedingungen werden nicht ausgewertet; bei `#if … #else` gilt der `#else`-Zweig
- **Ohne homemud und ohne Mudlib-Index** – keine geerbten Funktionen, keine Efun-Hilfe, Sfuns nur aus der mitgelieferten Liste
- **Mudlib-Index** – Stand vom Zeitpunkt der Erzeugung; Makros in `inherit` werden ohne homemud nur aufgelöst, wenn sie in der Datei selbst definiert sind
- **Syntax-Highlighting** – Sonderfälle bei Heredocs, kein semantisches Highlighting für lokale Funktionen
- **Multi-Root-Workspace** – nur der erste Ordner wird ausgewertet
- **uploadOnSave** – Setting existiert, Funktion folgt
- **Externer LSP-Server** – Client-Grundgerüst vorhanden, Anbindung offen
- **Unit-Tests / CI** – noch nicht eingerichtet

## Entwicklung

Zum Weiterentwickeln das Repository in VS Code öffnen, `npm install` ausführen und mit
**F5** einen Extension Development Host starten. `npm run watch` kompiliert bei jeder Änderung neu.

## Repository

<https://github.com/unitopia-de/lpc-ide-master>
