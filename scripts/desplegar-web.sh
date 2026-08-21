#!/usr/bin/env bash
# Despliega el cliente al VPS. Un script y no un comando a mano porque este
# despliegue tiene DOS trampas que ya se pisaron:
#
#   1. `npm run build` a secas deja el bundle apuntando a `localhost`: las URLs
#      de la API y de las salas entran por `VITE_API`/`VITE_SALAS` en tiempo de
#      build. Con eso subido, el ranking y las cuentas mueren por CORS y el
#      multijugador no conecta. Pasó el 2026-08-08.
#   2. Nunca se borran los `assets/` viejos: los bundles llevan hash y un
#      jugador con la página abierta sigue pidiendo el suyo.
#
# Aquí la comprobación de `localhost` es un CORTE, no un aviso: si el bundle la
# trae, no se sube nada.
set -euo pipefail

API=${VITE_API:-https://api.florin.gargurevich.dev}
SALAS=${VITE_SALAS:-wss://salas.florin.gargurevich.dev}
DESTINO=${DESTINO:-gds-vps:/opt/florin}
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

echo "── commit: $(git log --oneline -1)"
if [[ -n "$(git status --porcelain)" ]]; then
  echo "⚠  hay cambios sin commitear: subirás algo que no está en git"
fi

echo "── build con API=$API"
rm -rf apps/web/dist
VITE_API="$API" VITE_SALAS="$SALAS" npm run build --workspace @florin/web >/dev/null
JS=$(ls apps/web/dist/assets/*.js)

# El corte. Ojo con `grep`: sale con 1 cuando NO encuentra nada, y aquí no
# encontrar nada es el caso bueno — con `pipefail` eso mataba el script justo
# cuando todo estaba bien. De ahí el `|| true` dentro de las llaves.
CUANTOS=$( { grep -o "localhost" "$JS" || true; } | wc -l | tr -d ' ' )
if [[ "$CUANTOS" != "0" ]]; then
  echo "✗ ABORTADO: el bundle trae $CUANTOS 'localhost'. No se sube nada."
  exit 1
fi
{ grep -o "api\.florin\.gargurevich\.dev\|salas\.florin\.gargurevich\.dev" "$JS" || true; } | sort -u | sed 's/^/── apunta a /'

echo "── subiendo $(basename "$JS") ($(du -h "$JS" | cut -f1))"
scp -q apps/web/dist/index.html "$DESTINO/index.html"
scp -q "$JS" "$DESTINO/assets/"

SERVIDO=$(curl -s https://florin.gargurevich.dev/ | grep -o "index-[A-Za-z0-9_-]*\.js" | sort -u)
echo "── en producción: $SERVIDO"
[[ "$SERVIDO" == "$(basename "$JS")" ]] && echo "── ✓ coincide" || { echo "✗ el index servido no apunta al bundle nuevo"; exit 1; }
