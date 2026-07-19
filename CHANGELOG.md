# Changelog

Alle nennenswerten Änderungen an shopogs werden hier festgehalten.
Format angelehnt an [Keep a Changelog](https://keepachangelog.com/), Einträge
nach Datum statt Versionsnummer (kein SemVer-Versioning für dieses Projekt).

## 2026-07-18

### Fixed
- **Small Label Suche: drei kleine UX-Korrekturen.**
  1. Label-Suche durchsuchte bei jedem Klick sofort alle 8 Shops gemeinsam --
     jetzt wie die Album-Suche zwei getrennte Klicks (Go für die schnelle,
     Go für die "nicht ganz so schnelle" Zeile), inkl. getrennter
     "schon gesucht?"-Zustände pro Zeile.
  2. Aktivieren der Checkbox ließ einen zuvor eingetippten Artist-Namen im
     jetzt umbenannten "Small Label"-Feld stehen (musste manuell gelöscht
     werden) -- Umschalten leert jetzt Artist/Band bzw. Small Label
     automatisch.
  3. "Go to Bandcamp"/"Go to Discogs" waren in der Label-Suche unsichtbar.
     Per Live-Recon verifiziert: Discogs unterstützt `type=label` (exaktes
     Label-Filter, z.B. "Balmat" -> genau 1 Treffer), Bandcamp hat keinen
     reinen Label-Filter, aber `item_type=b` ("artists & labels") zeigt
     exakte Label-Treffer ganz oben. Beide Buttons funktionieren jetzt in
     beiden Modi.
- **JPC-Label-Suche warf "Failed to fetch".** Der ursprünglich angenommene
  `ctxlabel`-Parameter auf `/jpcng/vinyl/search/index.html` wird von JPC
  inzwischen (oder wurde nie tatsächlich) unterstützt -- die URL wird
  serverseitig still auf die generische Suche `/s/<begriff>` umgeleitet,
  Parameter komplett verworfen. Über den Vite-Dev-Proxy führte dieser
  Redirect sogar zu einem harten CORS-Fehler ("Failed to fetch"), weil der
  Browser dem Location-Header direkt zu jpc.de folgt. Per Live-Recon den
  echten Mechanismus gefunden (jede Produktseite verlinkt ihr Label mit
  `/s/<Label>?searchtype=label`): kein Redirect, korrekt gefiltert,
  verifiziert mit "Balmat" (2 Treffer) und "Blume" (0 Treffer, HTTP 404 wie
  bei der normalen Suche).
- **Souffle-Continu-Label-Suche warf HTTP 404.** Zwei Ursachen: (1) die href
  der Label-Übersichtsseite ist eine vollständige absolute URL, keine
  relative Pfadangabe -- dadurch wurde versehentlich
  `/proxy/soufflecontinu/https://www.soufflecontinu.com/...` gebaut. (2) Die
  ursprüngliche Zählmethode (`.articlePrice`-Elemente auf der
  Label-Detailseite zählen) war ohnehin nie korrekt: die Seite rendert nur
  ein gedeckeltes "Notre sélection"-Vorschau-Widget serverseitig
  (max. ~12 Einträge, unabhängig von der echten Kataloggröße -- verifiziert
  an "Souffle Continu Records" mit tatsächlich 90 Treffern). Per
  `performance.getEntriesByType("resource")` den echten Mechanismus
  gefunden: `GET /rest-api/shop/articles/?offset=0&row_count=1&label=<ID>`
  liefert die korrekte Gesamtzahl direkt im `count`-Feld, unabhängig vom
  angefragten `row_count`.

### Added
- **"Small Label Suche"** — neuer Such-Modus (Checkbox unterhalb des
  Format-Filters, mit sichtbarer Trennlinie davon abgesetzt). Aktiviert
  blendet er die Album-Titel-Felder aus und beschriftet beide
  Artist/Band-Felder als "Small Label" um. Sucht darüber, welche
  Veröffentlichungen eines Labels (z.B. "Balmat") gerade in welchem Shop
  verfügbar sind — anders als die normale Suche zeigt das Ergebnis KEINE
  Trefferliste, sondern für alle 8 Shops in einer flachen, alphabetisch
  sortierten Liste entweder die Trefferanzahl (klickbar, springt zur
  entsprechenden Shop-Seite) oder "nicht unterstützt".
  `checkLabelAvailability` implementiert für ANOST, SoundOhm, Hard Wax, JPC,
  Souffle Continu, HHV und Boomkat (HHV/Boomkat laufen wie gewohnt über den
  Browser-Sidecar). Bis Aufs Messer bleibt explizit ohne Implementierung
  ("nicht unterstützt") — per Recon verifiziert, dass der Shop keinen
  brauchbaren Label-Filter anbietet (Freitext-Suche ignoriert `vendor:`,
  `/products.json?vendor=` wird von Shopify ignoriert, einzig verfügbarer
  Collection-Filter sind generische Tags).
- "Go to Bandcamp"-Button neben "Go to Discogs" — öffnet Bandcamps
  Album-Suche (`item_type=a`) in neuem Tab, Verhalten per Live-Recon
  verifiziert. Gemeinsamer Hinweistext "Bandcamp / Discogs: Album-Titel
  sollte vollständig sein", linksbündig unter dem Bandcamp-Button.

## 2026-07-16

### Fixed
- **Titel-Vorschlag lieferte keine Treffer bei Auswahl aus der Liste.**
  `matchesQueryWords` (`src/lib/relevance.ts`) verlangte für jedes Wort der
  Suchanfrage einen `\b`-Wortgrenzen-Treffer. Tokens, die komplett von
  Nicht-Wortzeichen umgeben sind (z.B. ein alleinstehendes `-` in "Volume 1 -
  9", oder `(9CD` vor einer Klammer), haben an der Stelle gar keine
  Wortgrenze — der Match scheiterte deshalb grundsätzlich, sobald ein
  vollständiger Titel mit solchen Satzzeichen aus der Vorschlagsliste
  übernommen wurde (Beispiel: Merzbow – "Nine Studies of Ephemeral Resonance
  Volume 1 - 9 (9CD Box)"). Tokens werden jetzt vor dem Boundary-Check um
  führende/nachgestellte Satzzeichen bereinigt, reine Satzzeichen-Tokens
  fallen ganz weg.
- **CD-Box-Sets wurden nur bei "alle Formate ausgewählt" angezeigt.**
  `classifyFormat` (`src/lib/classifyFormat.ts`) nutzte `\bcds?\b` zur
  Formaterkennung. Da Ziffern selbst als Wortzeichen zählen, gibt es
  zwischen einer direkt vorangestellten Zahl und "CD" (z.B. "9CD Box", "2CD")
  keine Wortgrenze — solche Formate wurden nie als "CD" klassifiziert und
  fielen beim Filtern auf einzelne Formate raus. Ersetzt durch einen
  negativen Lookbehind `(?<![a-z])cds?\b`, der Ziffern/Satzanfang direkt vor
  "CD" zulässt, echte Fehltreffer wie "recorded" aber weiterhin blockt.
- **`browser-sidecar` crashte bei jeder Session** mit
  `UnknownProperty: Unknown property audio:seed in config`. Ursache:
  `camoufox-js` war in `sidecar/package.json` nur mit Caret gepinnt
  (`^0.11.1`) und es existierte kein `package-lock.json` — ein
  `--no-cache`-Rebuild zog dadurch unbemerkt die neu erschienene Version
  0.11.2, deren Fingerprint-Generator eine Property setzt, die das bewusst
  gepinnte alte Camoufox-Browser-Binary (v135.0.1-beta.24, siehe
  `sidecar/scripts/install-camoufox.js`) nicht kennt. Betraf HHV und Boomkat
  gleichermaßen (beide laufen über den Sidecar).

### Added
- `docker-cleanup-R.sh` / `docker-cleanup.sh` — lokaler Rebuild+Neustart
  bzw. reines Aufräumen auf dem Mac, analog zu den gleichnamigen Scripts im
  `konzert-guide`-Projekt.
- `public/robots.txt` (`Disallow: /`) und `X-Robots-Tag: noindex, nofollow`
  in `nginx.conf` — die App soll nicht von Suchmaschinen indexiert werden.
- Nicht-blockierender ESLint-Schritt in `deploy-qnap.sh` (Schritt 0b):
  läuft informativ, Report landet als Zeitstempel-Datei unter `./test/`,
  bricht den Deploy nicht ab.
- `sidecar/package-lock.json` (existierte bisher nicht).

### Changed
- `camoufox-js` in `sidecar/package.json` exakt auf `0.11.1` gepinnt (kein
  Caret mehr), `sidecar/Dockerfile` nutzt jetzt `npm ci --omit=dev` statt
  `npm install --omit=dev` für reproduzierbare Builds — verhindert, dass
  künftige `--no-cache`-Rebuilds unbemerkt neue npm-Releases ziehen.

## 2026-07-14

### Added
- **Playwright/Camoufox-Sidecar** (`sidecar/`) für Shops mit Bot-Schutz, der
  nur bei echter Browser-Navigation umgangen werden kann (HHV, Boomkat).
  Löst den alten Ansatz (Cookie-Harvest + Node-`fetch`-Replay) ab, der bei
  TLS-/Fingerprint-Checks blockiert wurde.
- **Boomkat-Adapter** (`src/shops/scraping/boomkat/`) inkl. Artist-Seiten-
  Recon (`/artists/<slug>`) für zuverlässigere Artist-only-Suche, mit
  Fallback auf die Autocomplete-API.
- Zwei-Zeilen-Suchformular in `App.tsx`: "Schnell" (normale HTTP-Suche) und
  "Nicht ganz so Schnell" (volle Camoufox-Navigation pro Suche), damit der
  Geschwindigkeitsunterschied zwischen den Shop-Gruppen sichtbar ist statt
  eine einzelne Suche unvorhersehbar lange warten zu lassen.
- Titel-Vorschlagsliste während der Eingabe (`src/lib/titleSuggestions.ts`),
  gespeist aus den 6 "schnellen" Shops.
- ESLint-Setup mit Security-Plugins (`eslint-plugin-security`,
  `eslint-plugin-no-unsanitized`), `eslint.config.js` (Flat Config).
- CSP- und weitere Security-Header in `nginx.conf`
  (`Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`).
- Zentrale Eingabe-Sanitisierung für die Such-Textfelder
  (`src/lib/inputValidation.ts`).
- `deploy-qnap.sh` — Cross-Build (amd64) auf dem Mac, Transfer + Neustart
  auf der QNAP ohne dortigen Rebuild, inkl. `tsc`/Trivy-Gates.
- Öffentliche Domain-Freischaltung (`ichmussdieseplattehaben.rogzilla.eu`)
  über NGINX Proxy Manager; Docker-Netzwerk `shared-proxy-net` verbindet
  `shopogs` und `konzert-guide`s NPM-Container projektübergreifend, damit
  NPM per Container-Name statt Host-IP:Port proxyt (behebt einen
  Docker-NAT-Hairpin-Fehler bei projektübergreifendem Routing).

### Changed
- Sidecar-Container umbenannt: `hhv-sidecar` → `browser-sidecar` (jetzt
  shop-agnostisch, da auch Boomkat drüber läuft).
- ANOST- und Bis-Aufs-Messer-Adapter auf dasselbe Relevanz-Filterverhalten
  wie die übrigen Shops angeglichen (`matchesQueryWords`).
- Ergebnisliste sortiert jetzt dynamisch: erst alle "schnellen" Shops
  alphabetisch, danach alle "langsamen" Shops alphabetisch angehängt --
  ergibt sich aus `shop.speed`/`shop.name`, kein hartkodierter Shop-Name.

## 2026-07-11

### Added
- Erste funktionsfähige Version mit mehreren Shop-Adaptern (Hard Wax, JPC,
  ANOST, Bis Aufs Messer, SoundOhm, Souffle Continu, HHV) und
  Format-Filter (Vinyl/CD/Cassette/Download).

## 2026-07-10

### Added
- Projekt-Grundgerüst (Vite + React + TypeScript), `Dockerfile`,
  `docker-compose.yml`, `nginx.conf`.
