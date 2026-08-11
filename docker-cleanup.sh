#!/bin/zsh
#
# Analogous to docker-cleanup.sh in the konzert-guide project: the slim
# counterpart to docker-cleanup-R.sh -- only stops the containers and clears
# out Docker leftovers, but does not rebuild or restart anything.

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
