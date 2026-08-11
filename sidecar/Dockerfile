# Browser sidecar: solves bot protection (JS challenges, TLS/fingerprint
# blocks) via Camoufox (C++-patched, anti-detect Firefox) -- every search
# navigates live through a session of its own instead of harvesting cookies
# and reusing them via Node fetch, see browserSession.js. Currently for HHV
# and Boomkat.
#
# Neither Playwright's bundled Chromium (TLS fingerprint detected,
# ERR_CONNECTION_CLOSED) nor Playwright's bundled Firefox (the connection
# works, but JS challenges are not waved through as "real") got past HHV's
# bot protection. Camoufox patches Firefox at source level against exactly
# such behaviour/fingerprint checks.
FROM mcr.microsoft.com/playwright:v1.61.1-jammy

# Fixed installation path instead of an automatically determined home cache
# directory (~/.cache/camoufox) -- the runtime error message "not installed at
# /root/.cache/camoufox" despite a successful 78s download during the build
# points to a HOME discrepancy between build and runtime context. According to
# the camoufox-js docs this is recommended precisely for containers (analogous
# to Playwright's PLAYWRIGHT_BROWSERS_PATH). ENV applies to RUN and CMD alike,
# so the same path is guaranteed in both phases. Since the switch to pwuser
# that matters twice over: at runtime HOME is /home/pwuser, not /root.
ENV CAMOUFOX_INSTALL_DIR=/opt/camoufox

# Hand both directories over to the bundled unprivileged user BEFORE anything
# is written into them. A later "chown -R /opt/camoufox" would duplicate the
# roughly 1.5 GB of unpacked files into an additional image layer -- this way
# it stays at one empty directory layer.
RUN mkdir -p /app /opt/camoufox && chown pwuser:pwuser /app /opt/camoufox

# From here on everything runs as pwuser (UID 1000, contained in the
# Playwright image): the build and the runtime. This container renders
# foreign JavaScript from shop pages and is thus the most exposed part of the
# stack -- it has no business running as root. Together with cap_drop: ALL and
# no-new-privileges in docker-compose.yml, even a takeover of the browser
# leaves practically nothing left to build on.
USER pwuser
WORKDIR /app

COPY --chown=pwuser:pwuser package*.json ./
# npm ci instead of npm install: uses package-lock.json exclusively, so it
# installs exactly the checked, locked versions -- no more "pulls the newest
# camoufox-js version automatically on the next build". That is precisely what
# landed us with the breakage here: a --no-cache rebuild pulled camoufox-js
# 0.11.2 (instead of the 0.11.1 that had stayed exactly the same until then),
# whose new fingerprint generator sets an "audio:seed" property that our
# deliberately pinned old Camoufox browser binary (v135.0.1-beta.24, see
# install-camoufox.js) does not know -- every session creation (HHV + Boomkat)
# crashed since then with "UnknownProperty: Unknown property audio:seed in
# config". Until now package-lock.json was missing entirely from this folder.
RUN npm ci --omit=dev

COPY --chown=pwuser:pwuser scripts/install-camoufox.js ./scripts/install-camoufox.js
RUN node scripts/install-camoufox.js
# camoufox-js' own installer does a `chmod -R 755` after unpacking
# -- our manual script (only AdmZip extractAllTo) does not, hence
# EACCES when starting camoufox-bin without this step.
RUN chmod -R 755 /opt/camoufox
# No more `npx camoufox-js fetch` afterwards: the command compares the
# installed against the "newest" version and updates unasked -- that is
# exactly what just overwrote our manually installed, working
# v135.0.1-beta.24 with the broken "newest" v152 again. We do not need GeoIP
# (our code never sets `geoip: true`), addons come if necessary straight from
# the npm package itself -- if that is missing, we will see it in the next
# test as a clear new error.
COPY --chown=pwuser:pwuser src ./src

EXPOSE 3001
CMD ["node", "src/server.js"]
