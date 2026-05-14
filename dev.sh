#!/usr/bin/env bash
# Lança o Chrome com a extensão SpeedRead X carregada (unpacked) e abre a página de teste.
# Usa um perfil isolado em /tmp para não interferir no seu Chrome normal.
# Compatível com chrome-devtools-mcp / claude-in-chrome (ambos enxergam a aba aberta).

set -euo pipefail

EXT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROFILE_DIR="${SPEEDREAD_PROFILE:-/tmp/speedread-x-profile}"
TEST_URL="file://${EXT_DIR}/test.html"

CHROME_BIN="${CHROME_BIN:-}"
if [[ -z "$CHROME_BIN" ]]; then
  for candidate in \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary" \
    "/Applications/Chromium.app/Contents/MacOS/Chromium" \
    "$(command -v google-chrome || true)" \
    "$(command -v chromium || true)"; do
    if [[ -n "$candidate" && -x "$candidate" ]]; then
      CHROME_BIN="$candidate"
      break
    fi
  done
fi

if [[ -z "$CHROME_BIN" ]]; then
  echo "Chrome não encontrado. Defina CHROME_BIN=/caminho/para/chrome e tente de novo." >&2
  exit 1
fi

echo "→ Chrome:    $CHROME_BIN"
echo "→ Extension: $EXT_DIR"
echo "→ Profile:   $PROFILE_DIR"
echo "→ URL:       $TEST_URL"

exec "$CHROME_BIN" \
  --user-data-dir="$PROFILE_DIR" \
  --load-extension="$EXT_DIR" \
  --disable-extensions-except="$EXT_DIR" \
  --no-first-run \
  --no-default-browser-check \
  --remote-debugging-port=9222 \
  "$TEST_URL"
