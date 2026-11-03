# Mudlib-Index-Generator

Erzeugt eine JSON-Datei mit allem, was das Plugin LPC-IDE-Master über die Mudlib wissen
muss. Magier ohne lokale Kopie der Mudlib („homemud“) bekommen damit trotzdem geerbte
Funktionen, Sfuns, Efun-Hilfe und alle Doku-Kommentare im Editor.

Der Generator liest die Mudlib nur. Er läuft in einem Docker-Container, der die Mudlib
schreibgeschützt eingehängt bekommt, und braucht keine npm-Pakete.

## Was im Index steht

| Teil | Quelle | Inhalt |
| --- | --- | --- |
| `efuns` | `/doc/efun/efuns.alpha`, `/doc/efun/a-m`, `n-z` | Name, Signatur, Hilfe (deutsche Fassung bevorzugt) |
| `sfuns` | `/secure/simul_efun/simul_efun.c` samt Includes und inherits (`deklin.c`, `parse_com.c`) | alle öffentlichen Funktionen mit Signatur, Doku, Datei und Zeile |
| `classes` | alle `.c`-Dateien mit `/i/` im Pfad | bereits **aufgelöste** inherits (`"%room"`, Makros, relative Pfade wie der Master) und alle nicht-privaten Funktionen |
| `docs` | alle `.c`, `.h`, `.inc` | alle Doku-Kommentare im UNItopia-Format (`FUNKTION:` / `DEKLARATION:` / `BESCHREIBUNG:`), die nicht schon bei einer Klasse stehen |

Neben der Index-Datei entsteht eine kleine `.stamp`-Datei mit dem Erzeugungszeitpunkt. Das
Plugin lädt beim Verbinden nur diese paar Bytes und holt den Index nur, wenn sie sich
geändert hat.

Größe bei der UNItopia-Mudlib (39.000 Dateien ohne `OLD`-Verzeichnisse): rund **1,5 MB** gepackt (7,0 MB entpackt).

## Bauen

Im Wurzelverzeichnis dieses Repositorys:

```bash
docker build -f tools/index-generator/Dockerfile -t myonara/lpc-ide-index .
```

## Ausführen

```bash
docker run --rm \
  --user "$(stat -c '%u:%g' /pfad/zur/mud/lib)" \
  -v /pfad/zur/mud/lib:/mudlib:ro \
  -v /pfad/zur/mud/lib/doc/lpc-ide:/out \
  myonara/lpc-ide-index
```

- **`--user`** muss der Besitzer der Mudlib sein. Sonst sind Verzeichnisse mit
  eingeschränkten Rechten wie `/secure` (`drwxr-x---`) nicht lesbar, und z. B. die Sfuns
  fehlen. Der Generator warnt in diesem Fall ausdrücklich. Durch `:ro` kann der Container
  die Mudlib trotzdem nicht verändern.
- **`/out`** ist das einzige beschreibbare Verzeichnis. Liegt es wie im Beispiel unter
  `lib/doc/lpc-ide/`, können die Plugins den Index per FTP unter
  `/doc/lpc-ide/index.json.gz` laden. Das ist der Standardpfad in `lpc-config.json`
  (`mudlib.indexFile`).
- Die Datei wird zuerst unter einem temporären Namen geschrieben und dann umbenannt. Wer
  gerade per FTP liest, bekommt nie eine halbe Datei.
- Das Ausgabeverzeichnis (`lib/doc/lpc-ide/`) muss vorher existieren und dem Benutzer
  gehören, unter dem der Container läuft.

### Mit Podman (rootless)

Rootless Podman legt einen eigenen User-Namespace an. Ohne Zusatz landet jede uid im
Container auf einer fremden Unter-ID des Hosts. Das gilt auch für `node` (uid 1000), den
Standardbenutzer des Images. Der Generator meldet dann z. B. `/ (EACCES)` oder kann nicht
nach `/out` schreiben.

Abhilfe: Podman als Besitzer der Mudlib starten und **beides** angeben:

- `--userns=keep-id` bildet deine uid unverändert in den Container ab,
- `--user "$(id -u):$(id -g)"` lässt den Generator auch unter dieser uid laufen. Ohne diese
  Angabe bliebe es beim `USER node` aus dem Image.

```bash
podman run --rm \
  --userns=keep-id --user "$(id -u):$(id -g)" \
  -v /pfad/zur/mud/lib:/mudlib:ro \
  -v /pfad/zur/mud/lib/doc/lpc-ide:/out \
  myonara/lpc-ide-index
```

Woran man es erkennt: Der Generator nennt in seinen Warnungen den Benutzer, unter dem er
läuft. Steht dort `1000:1000` statt deiner uid, fehlt `--user`.

Kommt danach immer noch `EACCES`, ist meist **SELinux** aktiv (Prüfung mit `getenforce`).
Dann zusätzlich `--security-opt label=disable` angeben. Das schaltet die SELinux-Trennung
nur für diesen Container ab. Die Alternative `:z`/`:Z` an den Mounts würde alle Dateien
der Mudlib dauerhaft umlabeln und ist hier nicht zu empfehlen.

Läuft der Generator regelmäßig, etwa nachts per cron oder nach Mudlib-Updates, bleibt
der Index aktuell:

```cron
30 4 * * *  docker run --rm --user 1000:1000 -v /mud/lib:/mudlib:ro -v /mud/lib/doc/lpc-ide:/out lpc-ide-index
```

## Optionen

Optionen werden an den Aufruf angehängt. Sobald man eigene Optionen angibt, müssen
`--lib` und `--out` mit dabei sein:

```bash
docker run ... lpc-ide-index --lib /mudlib --out /out/index.json.gz --exclude "^/secure/(?!simul_efun/)"
```

| Option | Bedeutung |
| --- | --- |
| `--lib <dir>` | Wurzel der Mudlib im Container (Standard im Image: `/mudlib`) |
| `--out <datei>` | Ausgabedatei; mit Endung `.gz` gepackt (Standard im Image: `/out/index.json.gz`) |
| `--simul-efun <pfad>` | `simul_efun`-Datei als Mudlib-Pfad (Standard: `/secure/simul_efun/simul_efun.c`, sonst `/secure/simul_efun.c`) |
| `--classes <regex>` | Welche Dateien als erbbare Klassen gelten (Standard: `/i/`) |
| `--exclude <regex>` | Mudlib-Pfade überspringen, mehrfach möglich |
| `--include-dir <pfad>` | Zusätzlicher Suchpfad für `#include <...>`, mehrfach möglich |
| `--include-old` | Auch Verzeichnisse namens `OLD`/`Old` einlesen (Standard: überspringen, siehe unten) |
| `--include-w` | Auch die Magier-Verzeichnisse unter `/w` einlesen (Standard: überspringen, siehe unten) |

### Übersprungene Bereiche (`OLD`, `/w`)

**Magier-Verzeichnisse (`/w`)** liest der Generator nicht. Sie sind privat, und laut Master
dürfen Dateien aus `/w` ohnehin nur von Dateien aus `/w` geerbt werden. Ein `inherit` aus
einer anderen Datei nach `/w` gilt als nicht auflösbar.

**Ausgemusterte Verzeichnisse:** Verzeichnisse namens `OLD` oder `Old` überspringt der Generator vollständig, wie der Master,
der sie für `#include` sperrt. Dateien darunter fehlen im Index, und ein `inherit` oder
`#include` aus einer aktiven Datei dorthin gilt als nicht auflösbar. Bei UNItopia sind das
322 Verzeichnisse mit rund 10.000 Dateien.

### Was alle Magier sehen können

Der Index ist für jeden lesbar, der per FTP an `/doc/lpc-ide/` kommt. Standardmäßig
enthält er die Doku-Kommentare **aller** Dateien, also auch aus `/secure` oder aus
Domains. Soll das nicht so sein, schließt man Bereiche aus, z. B.:

```bash
--exclude "^/secure/(?!simul_efun/)"   # /secure ohne die simul_efun
```

## Ohne Docker

Mit Node.js ab Version 18 geht es auch direkt:

```bash
npm ci && npx tsc -p ./
node out/tools/buildIndex.js --lib /pfad/zur/mud/lib --out /pfad/zur/mud/lib/doc/lpc-ide/index.json.gz
```

## Hinweise

- **Docker Desktop unter Windows** ist beim Lesen von Windows-Verzeichnissen sehr langsam,
  weil jeder Dateizugriff über eine Brücke läuft. Auf einem Linux-Server mit normalem
  Bind-Mount entfällt das. Direkt unter Node dauert ein Lauf über die UNItopia-Mudlib rund
  zwei Minuten.
- Präprozessor-Bedingungen (`#if`) werden per Faustregel entschieden, nicht ausgewertet.
  Bei `#if … #else` gilt der `#else`-Zweig.
- Nicht auflösbare inherits werden gezählt und übersprungen. Bei UNItopia sind das ohne die
  `OLD`-Verzeichnisse rund 40.
