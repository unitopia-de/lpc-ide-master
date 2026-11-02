# Mudlib-Index-Generator für LPC-IDE-Master.
#
# Bauen (im Wurzelverzeichnis des Repositorys):
#   docker build -f tools/index-generator/Dockerfile -t myonara/lpc-ide-index:latest .
#
# Ausführen — Mudlib schreibgeschützt, Ausgabeverzeichnis beschreibbar.
# Wichtig: als Besitzer der Mudlib laufen lassen, sonst sind Verzeichnisse wie
# /secure (drwxr-x---) nicht lesbar und z. B. die Sfuns fehlen im Index.
# Durch ":ro" kann der Container die Mudlib trotzdem nicht verändern.
#   docker run --rm --user "$(stat -c '%u:%g' /pfad/zur/mud/lib)" \
#     -v /pfad/zur/mud/lib:/mudlib:ro \
#     -v /pfad/zur/mud/lib/doc/lpc-ide:/out \
#     lpc-ide-index
#
# Weitere Optionen werden angehängt, z. B.:
#   ... lpc-ide-index --lib /mudlib --out /out/index.json.gz --exclude "^/secure/(?!simul_efun/)"

# --- Stufe 1: TypeScript kompilieren ---------------------------------------
FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY src ./src
RUN npx tsc -p ./

# --- Stufe 2: nur Node und der Generator ------------------------------------
FROM node:22-alpine
WORKDIR /app
COPY --from=build /src/package.json ./package.json
COPY --from=build /src/out/analysis/lpcParser.js \
                  /src/out/analysis/mudlib.js \
                  /src/out/analysis/efunDocText.js \
                  /src/out/analysis/indexFormat.js \
                  ./out/analysis/
COPY --from=build /src/out/tools/buildIndex.js ./out/tools/
# Prüft schon beim Bauen, dass der Generator ohne VS Code lauffähig ist.
RUN node out/tools/buildIndex.js --help > /dev/null
USER node
ENTRYPOINT ["node", "/app/out/tools/buildIndex.js"]
CMD ["--lib", "/mudlib", "--out", "/out/index.json.gz"]
