# Browser-Sidecar: löst Bot-Schutz (JS-Challenges, TLS-/Fingerprint-Blocks)
# per Camoufox (C++-gepatchtes, anti-detect Firefox) -- jede Suche navigiert
# live durch eine eigene Session statt Cookies zu ernten und per Node-fetch
# wiederzuverwenden, siehe browserSession.js. Aktuell für HHV und Boomkat.
#
# Weder Playwrights gebündeltes Chromium (TLS-Fingerprint erkannt,
# ERR_CONNECTION_CLOSED) noch Playwrights gebündeltes Firefox (Verbindung
# klappt, aber JS-Challenges werden nicht als "echt" durchgewunken) kamen an
# HHVs Bot-Schutz vorbei. Camoufox patcht Firefox auf Quellcode-Ebene gegen
# genau solche Verhaltens-/Fingerprint-Checks.
FROM mcr.microsoft.com/playwright:v1.61.1-jammy

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
# Fester Installationspfad statt automatisch ermitteltem Home-Cache-Verzeichnis
# (~/.cache/camoufox) -- die Runtime-Fehlermeldung "not installed at
# /root/.cache/camoufox" trotz erfolgreichem 78s-Download beim Build deutet
# auf eine HOME-Diskrepanz zwischen Build- und Laufzeit-Kontext hin. Laut
# camoufox-js-Doku genau für Container empfohlen (analog zu Playwrights
# PLAYWRIGHT_BROWSERS_PATH). ENV wirkt für RUN und CMD gleichermaßen, also
# garantiert derselbe Pfad in beiden Phasen.
ENV CAMOUFOX_INSTALL_DIR=/opt/camoufox
COPY scripts/install-camoufox.js ./scripts/install-camoufox.js
RUN node scripts/install-camoufox.js
# camoufox-js' eigener Installer macht nach dem Entpacken ein `chmod -R 755`
# -- unser manuelles Skript (nur AdmZip extractAllTo) nicht, deshalb
# EACCES beim Start von camoufox-bin ohne diesen Schritt.
RUN chmod -R 755 /opt/camoufox
# Kein `npx camoufox-js fetch` mehr danach: der Befehl vergleicht die
# installierte gegen die "neueste" Version und aktualisiert ungefragt --
# genau das hat unsere manuell installierte, funktionierende v135.0.1-beta.24
# gerade wieder mit der kaputten "neuesten" v152 überschrieben. GeoIP
# brauchen wir nicht (unser Code setzt nie `geoip: true`), Addons kommen
# ggf. direkt aus dem npm-Paket selbst -- falls das fehlt, sehen wir das im
# nächsten Test als klaren neuen Fehler.
COPY src ./src

EXPOSE 3001
CMD ["node", "src/server.js"]
