#!/bin/zsh
#
# Analog zu docker-cleanup-R.sh im konzert-guide-Projekt: lokaler Cleanup +
# Rebuild + Neustart auf dem Mac (kein QNAP-Transfer, siehe dafür
# deploy-qnap.sh). Baut beide Services nativ fürs Mac-Betriebssystem (kein
# --platform linux/amd64 wie beim QNAP-Cross-Build).
#
# Security-Gates (aus deploy-qnap.sh übernommen):
# - tsc --noEmit blockiert den Lauf bei TypeScript-Fehlern.
# - ESLint läuft rein informativ, blockiert NICHT -- Report landet unter ./test.
# - Trivy scannt die 2 fertigen Images (HIGH/CRITICAL), rein informativ,
#   blockiert NICHT -- Reports landen unter ./test.

set -e

echo "== Shopogs Docker Cleanup + Rebuild (lokal, Mac) =="

echo "-> TypeScript-Check (tsc --noEmit)..."
npx tsc --noEmit

echo "-> ESLint (informativ, blockiert nicht)..."
TRIVY_OUT="./test"
mkdir -p "$TRIVY_OUT"
TS_ESLINT=$(date +%Y%m%d-%H%M%S)
ESLINT_REPORT="$TRIVY_OUT/eslint-$TS_ESLINT.txt"
if npx eslint . > "$ESLINT_REPORT" 2>&1; then
  echo "   ESLint: keine Findings"
else
  echo "   ESLint: Findings vorhanden, siehe $ESLINT_REPORT (blockiert nicht)"
fi

if command -v trivy >/dev/null 2>&1; then
  TRIVY_AVAILABLE=1
else
  TRIVY_AVAILABLE=0
  echo "WARNUNG: trivy nicht gefunden - Vulnerability-Scans werden übersprungen."
fi

echo "-> Stoppe laufende Container..."
docker compose down

echo "-> Räume Build-Cache auf..."
docker builder prune -f

echo "-> Räume ungetaggte/verwaiste Images auf..."
docker image prune -f

echo "-> npm build (tsc + Vite)..."
npm run build

echo "-> Baue browser-sidecar (no-cache)..."
docker compose build --no-cache --pull browser-sidecar

echo "-> Baue shopogs (no-cache)..."
docker compose build --no-cache --pull shopogs

echo "-> Starte browser-sidecar..."
docker compose up -d browser-sidecar

echo "-> Starte shopogs..."
docker compose up -d shopogs

echo "-> Warte auf browser-sidecar (Health-Check /health)..."
READY=0
for i in $(seq 1 30); do
  if curl -s -o /dev/null -w "" http://localhost:3001/health 2>/dev/null; then
    echo "   browser-sidecar bereit nach ${i}s"
    READY=1
    break
  fi
  sleep 1
done
if [ "$READY" -eq 0 ]; then
  echo "FEHLER: browser-sidecar nach 30s nicht erreichbar, breche ab."
  exit 1
fi

echo "-> Warte auf shopogs (nginx bereit)..."
READY=0
for i in $(seq 1 30); do
  if curl -s -o /dev/null -w "" http://localhost:8090/ 2>/dev/null; then
    echo "   shopogs bereit nach ${i}s"
    READY=1
    break
  fi
  sleep 1
done
if [ "$READY" -eq 0 ]; then
  echo "FEHLER: shopogs nach 30s nicht erreichbar, breche ab."
  exit 1
fi

echo "-> Aktueller Stand:"
docker images
docker compose ps

if [ "$TRIVY_AVAILABLE" -eq 1 ]; then
  echo "-> Trivy-Vulnerability-Scans (HIGH/CRITICAL)..."
  mkdir -p "$TRIVY_OUT"
  TS=$(date +%Y%m%d-%H%M%S)

  trivy image --severity HIGH,CRITICAL shopogs-shopogs:latest         > "$TRIVY_OUT/trivy-shopogs-$TS.txt"
  trivy image --severity HIGH,CRITICAL shopogs-browser-sidecar:latest > "$TRIVY_OUT/trivy-browser-sidecar-$TS.txt"

  echo "-> Trivy-Reports geschrieben nach: $TRIVY_OUT"
  ls -la "$TRIVY_OUT"/*"$TS"*
else
  echo "-> Scan übersprungen (trivy nicht installiert). Nachholen mit: brew install trivy"
fi

echo "== Cleanup + Rebuild fertig =="
