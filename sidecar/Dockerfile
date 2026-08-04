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

# Fester Installationspfad statt automatisch ermitteltem Home-Cache-Verzeichnis
# (~/.cache/camoufox) -- die Runtime-Fehlermeldung "not installed at
# /root/.cache/camoufox" trotz erfolgreichem 78s-Download beim Build deutet
# auf eine HOME-Diskrepanz zwischen Build- und Laufzeit-Kontext hin. Laut
# camoufox-js-Doku genau für Container empfohlen (analog zu Playwrights
# PLAYWRIGHT_BROWSERS_PATH). ENV wirkt für RUN und CMD gleichermaßen, also
# garantiert derselbe Pfad in beiden Phasen. Seit dem Wechsel auf pwuser ist
# das doppelt wichtig: HOME ist zur Laufzeit /home/pwuser, nicht /root.
ENV CAMOUFOX_INSTALL_DIR=/opt/camoufox

# Beide Verzeichnisse dem mitgelieferten unprivilegierten Benutzer übereignen,
# BEVOR etwas hineingeschrieben wird. Ein nachträgliches
# "chown -R /opt/camoufox" würde die entpackten rund 1,5 GB in eine zusätzliche
# Image-Schicht duplizieren -- so bleibt es bei einer leeren Verzeichnisschicht.
RUN mkdir -p /app /opt/camoufox && chown pwuser:pwuser /app /opt/camoufox

# Ab hier läuft alles als pwuser (UID 1000, im Playwright-Image enthalten):
# der Bau und die Laufzeit. Dieser Container rendert fremdes JavaScript von
# Shop-Seiten und ist damit der exponierteste Teil des Stacks -- er hat als
# root nichts zu suchen. Zusammen mit cap_drop: ALL und no-new-privileges
# im docker-compose.yml bleibt selbst bei einer Übernahme des Browsers
# praktisch nichts übrig, worauf sich aufbauen ließe.
USER pwuser
WORKDIR /app

COPY --chown=pwuser:pwuser package*.json ./
# npm ci statt npm install: nutzt ausschließlich package-lock.json, installiert
# also exakt die geprüften, gesperrten Versionen -- kein "zieht sich beim
# nächsten Build automatisch die neueste camoufox-js-Version" mehr. Genau das
# hat uns hier den Bruch eingebrockt: ein --no-cache-Rebuild zog camoufox-js
# 0.11.2 (statt der bis dahin exakt gleich gebliebenen 0.11.1), dessen neuer
# Fingerprint-Generator eine "audio:seed"-Property setzt, die unser bewusst
# gepinntes altes Camoufox-Browser-Binary (v135.0.1-beta.24, siehe
# install-camoufox.js) nicht kennt -- jede Session-Erstellung (HHV + Boomkat)
# crashte seitdem mit "UnknownProperty: Unknown property audio:seed in
# config". package-lock.json fehlte bis jetzt komplett in diesem Ordner.
RUN npm ci --omit=dev

COPY --chown=pwuser:pwuser scripts/install-camoufox.js ./scripts/install-camoufox.js
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
COPY --chown=pwuser:pwuser src ./src

EXPOSE 3001
CMD ["node", "src/server.js"]
