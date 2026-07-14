#!/usr/bin/env bash
#
# Baut shopogs und browser-sidecar lokal auf dem Mac (amd64 Cross-Build),
# stoppt diese zwei Services auf der QNAP UND entfernt dort die alten Images
# BEVOR die neuen tar.gz-Dateien uebertragen werden (vermeidet
# Platzprobleme/Ladefehler durch gleichzeitig alte+neue Images auf der NAS).
# Analog zu deploy-qnap.sh im konzert-guide-Projekt, nur mit 2 statt 3
# Services und ohne Build-Arg/.env-Abhaengigkeit (shopogs braucht keine).
#
# Security-Gates (aus konzert-guide uebernommen):
# - tsc --noEmit blockiert den gesamten Lauf bei TypeScript-Fehlern.
# - ESLint (Security-Plugins, siehe eslint.config.js) laeuft rein informativ,
#   blockiert NICHT -- Report landet unter ./test.
# - Trivy scannt die 2 fertigen Images (HIGH/CRITICAL), rein informativ,
#   blockiert NICHT (kein --exit-code) -- Reports landen unter ./test.
#
# Wichtig: die Image-Tags IMG_APP/IMG_SIDECAR muessen exakt dem
# Docker-Compose-Auto-Naming entsprechen (<Projektordner-Name>-<Servicename>),
# sonst baut `docker compose up -d` auf der QNAP die Images trotz geladener
# tar.gz neu, statt die frisch geladenen zu verwenden. Der Projektordner auf
# der QNAP muss also exakt "shopogs" heissen (siehe NAS_PROJECT_DIR).
#
# Ausfuehren im Projekt-Root auf dem Mac.

set -euo pipefail

# --- Konfiguration -----------------------------------------------------
# NAS_HOST/NAS_SSH_KEY 1:1 aus konzert-guide/deploy-qnap.sh uebernommen
# (gleiche QNAP). NAS_PROJECT_DIR bitte pruefen/anlegen, falls das hier der
# erste Deploy von shopogs auf diese NAS ist.
NAS_HOST="Roger@192.168.178.109"
NAS_SSH_KEY="$HOME/.ssh/id_rsa_nas"
NAS_PROJECT_DIR="/share/homes/Roger/shopogs"
TRIVY_OUT="./test"

IMG_APP="shopogs-shopogs"
IMG_SIDECAR="shopogs-browser-sidecar"

# --- 0. TypeScript-Check -- bricht bei Fehlern sofort ab -----------------
echo "== TypeScript-Check (tsc --noEmit) =="
npx tsc --noEmit

# --- 0b. ESLint -- rein informativ, blockiert den Deploy NICHT -----------
# (bewusst kein `|| exit 1` o.ae. -- Ergebnis landet nur als Report unter
# ./test, damit man's nachtraeglich anschauen kann, ohne dass ein Deploy an
# z.B. einer neuen security/detect-object-injection-Warnung scheitert.)
echo "== ESLint (informativ) =="
mkdir -p "$TRIVY_OUT"
TS_ESLINT=$(date +%Y%m%d-%H%M%S)
ESLINT_REPORT="$TRIVY_OUT/eslint-$TS_ESLINT.txt"
if npx eslint . > "$ESLINT_REPORT" 2>&1; then
  echo "== ESLint: keine Findings =="
else
  echo "== ESLint: Findings vorhanden, siehe $ESLINT_REPORT (blockiert den Deploy nicht) =="
fi

# --- Trivy-Verfuegbarkeit pruefen (graceful skip, wie im Original) ------
if command -v trivy >/dev/null 2>&1; then
  TRIVY_AVAILABLE=1
else
  TRIVY_AVAILABLE=0
  echo "WARNUNG: trivy nicht gefunden - Vulnerability-Scans werden uebersprungen."
fi

# --- 1. Images bauen (Mac, amd64 Cross-Build) ----------------------------
echo "== Baue $IMG_APP =="
docker buildx build \
  --platform linux/amd64 \
  -t "$IMG_APP" \
  -f Dockerfile \
  --load .

echo "== Baue $IMG_SIDECAR =="
docker buildx build \
  --platform linux/amd64 \
  -t "$IMG_SIDECAR" \
  -f sidecar/Dockerfile \
  --load ./sidecar

# --- 2. Trivy-Scan (informativ, blockiert nicht) --------------------------
if [ "$TRIVY_AVAILABLE" -eq 1 ]; then
  echo "== Trivy-Vulnerability-Scans (HIGH/CRITICAL) =="
  mkdir -p "$TRIVY_OUT"
  TS=$(date +%Y%m%d-%H%M%S)

  trivy image --severity HIGH,CRITICAL "$IMG_APP:latest"     > "$TRIVY_OUT/trivy-shopogs-$TS.txt"
  trivy image --severity HIGH,CRITICAL "$IMG_SIDECAR:latest" > "$TRIVY_OUT/trivy-browser-sidecar-$TS.txt"

  echo "== Trivy-Reports geschrieben nach: $TRIVY_OUT =="
  ls -la "$TRIVY_OUT"/*"$TS"*
else
  echo "== Scan uebersprungen (trivy nicht installiert). Nachholen mit: brew install trivy =="
fi

# --- 3. Images speichern (Mac) -------------------------------------------
echo "== Speichere Images als tar.gz =="
docker save "$IMG_APP:latest"     | gzip > "$IMG_APP.tar.gz"
docker save "$IMG_SIDECAR:latest" | gzip > "$IMG_SIDECAR.tar.gz"
ls -la "$IMG_APP.tar.gz" "$IMG_SIDECAR.tar.gz"

# --- 4. QNAP: shopogs/browser-sidecar stoppen, alte Images entfernen -- VOR dem Transfer ---
echo "== QNAP: shopogs/browser-sidecar stoppen, alte Images entfernen =="
ssh -i "$NAS_SSH_KEY" "$NAS_HOST" bash --login -s <<REMOTE1
set -euo pipefail
mkdir -p "$NAS_PROJECT_DIR"
cd "$NAS_PROJECT_DIR"

docker compose -f docker-compose.yml stop shopogs browser-sidecar || true
docker compose -f docker-compose.yml rm -f shopogs browser-sidecar || true

docker rmi "$IMG_APP:latest"     || true
docker rmi "$IMG_SIDECAR:latest" || true
REMOTE1

# --- 5. Transfer auf die QNAP --------------------------------------------
echo "== Transfer nach QNAP =="
rsync -av -e "ssh -i $NAS_SSH_KEY" \
  "$IMG_APP.tar.gz" \
  "$IMG_SIDECAR.tar.gz" \
  docker-compose.yml \
  "$NAS_HOST:$NAS_PROJECT_DIR/"

# --- 6. QNAP: neue Images laden, beide Services neu starten -------------
echo "== QNAP: Images laden, shopogs/browser-sidecar starten =="
ssh -i "$NAS_SSH_KEY" "$NAS_HOST" bash --login -s <<REMOTE2
set -euo pipefail
cd "$NAS_PROJECT_DIR"

docker load < "$IMG_APP.tar.gz"
docker load < "$IMG_SIDECAR.tar.gz"

docker compose -f docker-compose.yml up -d shopogs browser-sidecar
docker compose -f docker-compose.yml ps
REMOTE2

echo "== Fertig. Lokale tar.gz-Dateien aufraeumen? =="
echo "rm -f $IMG_APP.tar.gz $IMG_SIDECAR.tar.gz"
