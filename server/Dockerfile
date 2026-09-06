# The JSON API (see server/src/index.ts). Built from the project root rather
# than from server/: the shop adapters live under src/ and are imported from
# here instead of copied, so a fix to one shop lands in the web app and in the
# API at the same time.
#
# node:22-alpine rather than the frontend image's 20: there, global fetch() is
# still flagged experimental and writes a warning on every start. The adapters
# use nothing else to reach the network.
FROM node:22-alpine
RUN apk update && apk upgrade --no-cache
WORKDIR /app

# Manifests first, everything else after: the npm layer stays cached as long
# as the dependencies do not change.
#
# npm ci like the frontend image, for reproducibility. It needs a
# package-lock.json -- that appears on the first `npm install` inside server/
# and belongs in the repo afterwards.
COPY server/package*.json ./server/

# npm goes out again in the same layer, so its own bundled dependencies do not
# stay behind in the image at all.
#
# It is needed for exactly this one command; at runtime nothing calls it (see
# CMD below, which runs the tsx binary directly). It was also, by count, the
# entire attack surface this image had: of the eleven findings in the Trivy
# report of 06.09.2026 -- one of them CRITICAL, a gzip-bomb DoS in tar --
# every single one sat in npm's own node_modules (tar, pacote, sigstore,
# brace-expansion, ip-address, picomatch), and not one in ours. Code that is
# never executed cannot be exploited, but it does have to be read past in
# every report, month after month.
#
# Deleting it settles that permanently, instead of waiting for the next Node
# release to bundle a newer npm and start the next round.
#
# The check asks the filesystem, not the shell. `! command -v npm` was the
# obvious way to write it and the wrong one: npm ran in this very shell a
# moment ago, so its path sits in the shell's hash table and command -v
# answers from there -- it reported the binary as present long after the rm
# had removed it, and failed the build.
RUN cd server && npm ci --omit=dev \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
 && test ! -e /usr/local/bin/npm \
 && test ! -d /usr/local/lib/node_modules/npm

# Copied one by one instead of `COPY server ./server`. Two reasons: the
# wholesale copy writes package.json back over the tree npm ci just built, and
# it makes the image quietly depend on whatever else happens to sit in that
# folder.
COPY src ./src
COPY server/src ./server/src
COPY server/tsconfig.json ./server/tsconfig.json

# COPY keeps the permissions the files had on the host, and a directory that
# arrives owner-only stays owner-only in the image -- owned by root, because
# that is who ran the build. The process below runs as "node" and could then
# not read its own entry point. It surfaced as ERR_MODULE_NOT_FOUND, which
# reads like a missing file and is a permission instead.
#
# a+rX rather than a+rx: the capital X sets the execute bit on directories
# only, so nothing here accidentally becomes an executable.
RUN chmod -R a+rX /app/src /app/server

# Fails the build rather than the start, and deliberately as the unprivileged
# user -- as root every permission check passes and exactly the problem above
# would slip through again.
RUN su node -s /bin/sh -c '\
    test -r /app/server/src/index.ts \
 && test -r /app/server/src/dom.ts \
 && test -r /app/src/shops/index.ts \
 && test -x /app/server/node_modules/.bin/tsx'

# Does not run as root. The "node" user comes with the image, and all this
# process does is read.
USER node

EXPOSE 3002

# tsx rather than a build step ahead of time: the adapters stay exactly the
# files the web app builds from, and there is no second artefact that could
# drift away from them.
#
# The binary directly rather than "npx tsx": npx wants to write a cache, and
# this container's filesystem is read-only at runtime (see read_only in
# docker-compose.yml).
CMD ["server/node_modules/.bin/tsx", "server/src/index.ts"]
