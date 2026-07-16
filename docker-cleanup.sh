#!/bin/zsh
#
# Analog zu docker-cleanup.sh im konzert-guide-Projekt: schlankes Gegenstück
# zu docker-cleanup-R.sh -- stoppt nur die Container und räumt Docker-
# Altlasten auf, baut/startet aber nichts neu.

set -e

echo "== Shopogs Docker Cleanup =="

echo "-> Stoppe laufende Container..."
docker compose down

echo "-> Räume Build-Cache auf..."
docker builder prune -f

echo "-> Räume ungetaggte/verwaiste Images auf..."
docker image prune -f

echo "-> Aktueller Stand:"
docker images
docker system df

echo "== Cleanup fertig =="
