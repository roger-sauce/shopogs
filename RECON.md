# Recon: Plattenladen-Verfügbarkeits-Checker

Stand: 2026-07-11

Ziel: Für jeden Shop klären, wie sich Verfügbarkeit von Vinyl/CD/Tape/Download programmatisch abfragen lässt — ohne Login, möglichst ohne JS-Rendering, um Adapter im Stil von Konzert-Guide (`src/stations/{official-api,unofficial-api,scraping}/<shop>/{api.ts,index.ts,transform.ts}`) zu bauen.

Eskalationsweg pro Shop: (1) Sandbox-curl → (2) curl vom eigenen Mac → (3) Chrome MCP (Netzwerk-Requests + JS-Fetch im Seitenkontext). Sandbox-curl war für alle Ziel-Domains durch die Netzwerk-Allowlist blockiert, daher lief die eigentliche Recon über Chrome.

## Shops (Berlin)

### Hard Wax — hardwax.com
- **Backend:** klassisches, komplett server-gerendertes HTML, kein JS-Framework, keine XHR-API.
- **Suche:** `GET https://hardwax.com/?find=<suchbegriff>` — einfacher Query-Parameter, direkt als HTML-Ergebnisliste. Kombinierte "Artist Titel"-Queries funktionieren hier (anders als bei SoundOhm/Souffle Continu) problemlos, auch mit Sonderzeichen wie "&"/"/" im Artist-Namen.
- **Verfügbarkeit:** Hard Wax listet grundsätzlich nur Artikel, die aktuell auf Lager sind. Sobald ausverkauft, verschwindet der Titel aus Suche/Katalog (bestätigt durch separate `/back-in-stock/`-Seite für Rückkehrer). → Treffer in der Suche = verfügbar, kein Treffer = nicht (mehr) im Sortiment.
- **Korrektur (4. Recon-Runde, Bugfix):** "Artist: Titel" steht im `<h2>` des Artikels, nicht im ersten `<p>` (das ist nur die Kurzbeschreibung, z.B. "Deadly Dub-Stepper"). Der Adapter las ursprünglich fälschlich den `<p>`-Text als Artist/Titel — dadurch wurden Treffer mit Beschreibungstext unter falschem Titel geführt statt unter dem echten (z.B. "Rhythm & Sound w/ Paul St. Hilaire: Music A Fe Rule" tauchte gar nicht als solches auf). Fix: Selektor auf `h2` geändert.
- **Korrektur (5. Recon-Runde, Bugfix):** Format/Preis wurden per Regex über den gesamten Artikel-Text gezogen — bei Releases mit mehreren Formaten (LP + Download-Bundle + einzeln kaufbare Tracks) hängt `textContent` alles ohne Trennzeichen aneinander, das ergab kaputte Format-Strings wie `12"MP3AIFF12"` und teils falsche Preise. Fix: jeder Kaufen-Button (`a.qa`) einzeln auswerten — eigener `textContent` ist sauber (`12" € 12`, `2 AIFFs € 3.5`, `AIFF € 1.75`, ...), das `title`-Attribut liefert bei Einzeltrack-Downloads sogar den Track-Titel (z.B. "... Part 1") statt nur den Release-Titel.
- **Adapter-Typ:** `scraping` (simples HTML-Parsing der Ergebnisliste).

### HHV — hhv.de
- **Backend:** Custom-Backend, Turbo/Hotwire (kein Shopify — `/products.json` liefert 404).
- **Korrektur nach zweiter Recon-Runde:** Die Katalog-Suchseite (`/records/katalog/filter/suche-<facet-hash>?term=<begriff>`) lädt Ergebnisse NICHT komplett server-gerendert aus — ein einfacher `fetch()` der Seite enthält zunächst keine Produktdaten. Jedes Ergebnis ist ein einzelnes lazy-loaded Turbo-Frame. Der entscheidende Fund: die Platzhalter-Frames mit `src="/lazy/artikel/<id>/list_entry"` stehen bereits im initialen HTML — die Artikel-IDs lassen sich also direkt aus der ersten Antwort extrahieren (Regex `/lazy/artikel/(\d+)/list_entry`), ganz ohne Headless-Browser.
- **Zweischritt-Ablauf:**
  1. `GET /records/katalog/filter/suche-D2N2S11?term=<begriff>` → Artikel-IDs per Regex extrahieren.
  2. Pro Artikel-ID: `GET /lazy/artikel/<id>/list_entry` → server-gerendertes Fragment mit `.artist`, `.title`, `.format_label .format`, `.price`.
- **Verfügbarkeit:** Der Warenkorb-Button (`.add_to_cart`) trägt eine Zustands-Modifier-Klasse: `default` (verfügbar), `sold_out`, `temp_sold_out`, `coming_soon`, `not_enough_bonus_coins`. Sauber auslesbar ohne CSS-Auswertung.
- **Adapter-Typ:** `scraping`, aber vollständig curl-fähig (kein JS-Rendering/Headless-Browser nötig) — nur zweistufig (Such-Request + N Einzel-Requests pro Treffer).
- **NEU — Bot-Schutz seit Docker-Testing (2026-07-11):** Die Katalog-Suche blockt inzwischen zuverlässig mit einer Cookie-gated JS-Challenge (HTTP 200, aber nur obfuskiertes JS statt echtem HTML, ~1.9 KB, kein `/lazy/artikel/`-Treffer). Verifiziert per direktem Vergleich im echten Browser: derselbe `fetch()` auf hhv.de MIT den vom vorherigen Seitenbesuch vorhandenen Cookies liefert echten Content (200, ~1.3 MB HTML), derselbe Request mit `credentials: "omit"` (also cookielos, wie ein Server-Proxy es tut) liefert nur die Challenge-Seite. Betrifft gleichermaßen Vites Dev-Proxy UND den nginx-Proxy im Docker-Setup — kein Config-/Header-Problem, sondern strukturell: ein Reverse-Proxy kann kein JS ausführen, um die Challenge zu lösen und einen gültigen Session-Cookie zu bekommen. Gleiche Kategorie Problem wie Boomkats TLS-Fingerprinting (siehe unten), nur über einen anderen Mechanismus (Cookie/JS-Challenge statt TLS-Handshake).
  - **Status:** bewusst nicht behoben. Für später denkbar: ein Headless-Browser (z.B. Playwright) im Backend, der die Challenge einmalig löst und den Session-Cookie an den Proxy weiterreicht — deutlich aufwändiger als ein Header-Fix, eigenes Teilprojekt. Bis dahin liefert die Such-Anfrage einfach 0 Artikel-IDs (kein Fehler, da die Challenge-Seite technisch ein valides HTTP-200-HTML ist, nur ohne `/lazy/artikel/`-Treffer) — HHV taucht also aktuell nie mit echten Treffern auf, aber auch nicht mit einer Fehlermeldung.

### ANOST — anost.net (Achtung: **nicht** anost.de — das ist eine geparkte Verkaufsdomain)
- **Backend:** SPA (Vue.js), aber Daten kommen über öffentliche, unauthentifizierte JSON-API.
- **Suche:** `GET /api/public/search?query=<suchbegriff>`.
- **Verfügbarkeit:** Boolean-Feld pro Format: `formats[].has_available_stock` (true/false) — steuert, ob das Format überhaupt als Treffer zählt.
- **Status (3. Recon-Runde):** `formats[].status` ist fast immer `"listed"` (regulär), verifiziert aber auch `"pre-order"` (z.B. Carmen Villain "Memoria" LP: `status:"pre-order"`, `has_available_stock:true`, `release_date` in der Zukunft). → `status:"pre-order"` = Vorbestellung, sonst `"listed"` = auf Lager.
- **Adapter-Typ:** `unofficial-api`.

### Bis Aufs Messer — bisaufsmesser.com
- **Backend:** Shopify.
- **Suche:** `GET /search/suggest.json?q=<titel>&resources[type]=product` (liefert Treffer direkt inkl. Stock-Flag) oder `GET /products.json?limit=250` zum Durchpaginieren.
- **Verfügbarkeit:** `available` (Boolean) im Suggest-Response — `false` = "Ausverkauft" → kein Treffer.
- **Format (3. Recon-Runde, Bugfix):** Das Feld `type` (Shopify-Produkttyp, z.B. `"Vinyl"`, `"Tapes"`) liefert das Format — das fehlte bisher im Adapter komplett, weshalb `format` immer leer war und Treffer den Format-Filter fälschlich immer bestanden (z.B. eine Kassette tauchte auch bei aktivem "Vinyl"-Filter auf).
- **Vorbestellung:** kein separates API-Feld, aber ein `tags`-Eintrag `"Pre order"` bzw. Titel-Suffix "PRE ORDER" bei echten Vorbestellungen (verifiziert: "LIIEK - Living In A Fiction LP PRE ORDER", tags enthält "Pre order").
- **Adapter-Typ:** `unofficial-api` (öffentliche Shopify-Storefront-Endpoints, kein Login nötig).

## Zusätzliche Shops (International)

### Boomkat — boomkat.com — **entfernt aus der Shop-Liste, Revival geplant**
- **Backend:** Spree Commerce (Rails).
- **Suche:** `GET /api/autocomplete?query=<titel>` liefert Artist-/Release-Treffer mit URL-Slug.
- Blockt Requests über den Vite-Dev-Proxy zuverlässig mit HTTP 403, auch mit vollständigem Browser-Header-Set (User-Agent, Accept-Language, sec-fetch-*, sec-ch-ua). Ein direkter Vergleich zeigt: ein echter Chrome-Request geht anstandslos durch (200), der Proxy-Request wird geblockt — spricht für TLS-/Bot-Fingerprinting (z.B. Cloudflare), das ein simpler Node-Reverse-Proxy grundsätzlich nicht imitieren kann. Ohne echten (Headless-)Browser server-seitig nicht lösbar → Shop bewusst aus der App entfernt.
- **Update (2026-07-11):** User möchte Boomkat wieder einbauen, sobald die für HHV geplante Playwright-Session-Relay-Lösung (siehe eigener Abschnitt unten) steht — ein echter Chromium-Prozess hat einen echten Browser-TLS-Stack, sollte also auch dieses Fingerprinting-Problem lösen (gleicher Fix-Mechanismus wie bei HHVs Cookie-Challenge, nur anderes Blockade-Verfahren beim Shop). Alte, unregistrierte Adapter-Dateien liegen noch unter `src/shops/scraping/boomkat/` (aus der Sandbox nicht löschbar, Permission-Fehler) — beim Wiederaufbau vermutlich einfach überschreiben/neu aufsetzen.

### SoundOhm — soundohm.com
- **Backend:** Custom, mit öffentlicher JSON-API.
- **Suche:** `GET /api/quickSearch?query="<suchbegriff>"` (Query-String in doppelten Anführungszeichen, URL-encoded).
- **Verfügbarkeit:** Boolean-Feld `is_in_stock` pro Produkt — `false` = ausverkauft → kein Treffer.
- **Status (3. Recon-Runde):** zusätzliches Feld `preorder` (meist `null`). Verifiziert: `preorder:"stocking"` → Produktseite zeigt wörtlich **"In process of stocking"** (bestellbar, aber Lieferzeit ungewiss, kann Wochen/Monate dauern). `preorder:null` bei `is_in_stock:true` = regulär auf Lager. Andere, nicht-null Preorder-Werte werden konservativ als echte Vorbestellung behandelt.
- **Korrektur (2. Recon-Runde):** die quoted-phrase-Suche matcht nur Titel/Katalog-Felder, NICHT den Artist-Namen (getestet: `"Andrew Anderson"` alleine → 0 Treffer, obwohl der Artist existiert; `"Thresholds"` alleine findet die Platte korrekt). Ein kombinierter "Artist Titel"-String schlägt deshalb fast immer fehl. Adapter sucht daher bevorzugt nur nach dem Titel.
- **Korrektur (6. Recon-Runde, Bugfix):** die Suche matcht lose per Substring statt nach ganzen Wörtern — Suche nach "Memoria" (Carmen Villain) lieferte auch "Memorial", "In Memoriam" usw., weil "Memoria" literal in "Memorial" enthalten ist. Fix: clientseitiger Wortgrenzen-Filter (`src/lib/relevance.ts`, `matchesQueryWords`) — jedes Query-Wort muss als GANZES Wort im Ergebnis-Titel vorkommen. Erlaubt weiterhin Mehrwort-Fragment-Suche, verhindert aber Substring-Fehltreffer. Gleiches Problem und gleicher Fix bei Souffle Continu.
- **Adapter-Typ:** `unofficial-api`.

### Soufflé Continu — soufflecontinu.com
- **Korrektur (2. Recon-Runde):** `POST /search/` liefert nur ein leeres HTML-Grundgerüst (`<div class="cardContainer"></div>`) — die Trefferliste wird NICHT serverseitig gerendert, sondern erst per Client-JS nachgeladen (siehe `shop.js`: `DisplayArticles.backendCall()`). Reines HTML-Scraping der `/search/`-Antwort funktioniert daher nicht und lieferte in der Praxis Fehltreffer (leerer Wrapper wurde als 1 Treffer geparst).
- **Backend:** Custom PHP-Shop mit öffentlicher JSON-REST-API für die Ergebnisliste selbst.
- **Suche:** `GET /rest-api/shop/articles/?offset=0&count=<n>&search=<suchbegriff>` → `{ rs: { articles: [...], pages, translations } }`.
  - Artikel-Felder: `ean`, `artiste`, `titre`, `support`, `totalStock`, `lastCopy`, `backInStock`, `inSales`, `priceHtml`, `productUrl` (bereits absolute URL), `cartUrl`.
  - **Wichtig:** kombinierter "Artist Titel"-String matcht schlecht (getestet: "Nurse With Wound Alice The Goon" → 0 Treffer, obwohl Platte existiert). Nur der Titel alleine ("Alice The Goon") findet sie korrekt — gleiches Muster wie bei SoundOhm.
- **Verfügbarkeit:** `totalStock > 0`. Zusatz-Badges `lastCopy` (knapper Bestand, aber kaufbar) und `backInStock` (wieder da).
- **Korrektur (6. Recon-Runde, Bugfix):** wie bei SoundOhm matcht die Suche lose per Substring statt nach ganzen Wörtern ("Memoria" fand auch "In Memoriam" usw.) — gleicher Fix: Wortgrenzen-Filter `matchesQueryWords` aus `src/lib/relevance.ts`.
- **Adapter-Typ:** `unofficial-api` (nicht mehr `scraping`).

### JPC — jpc.de
- **Backend:** klassisches, komplett server-gerendertes HTML, kein JS-Nachladen.
- **Suche:** Das Suchformular sendet zwar `POST /jpcng/home/search` (Feld `fastsearch`), landet aber auf einer sauber per GET abrufbaren URL: `GET /s/<suchbegriff mit "+" statt Leerzeichen>`. Ein reiner `fetch()` ohne JS liefert bereits die volle Trefferliste der ersten Seite (bis zu ~20 von insgesamt bis zu 27 Treffern) — kein AJAX-Nachladetrick wie bei Souffle Continu. Ein alter xajax-Endpunkt (`/jpcng/xajax.php?...xjxfun=incSearch...`) existiert zusätzlich, ist aber nur für die kleine Autocomplete-Dropdown-Liste gedacht, nicht für die volle Trefferliste — bewusst nicht verwendet.
- **Treffer-Elemente:** `[id^="result-searchng-product-"]`. Felder: `.by` (Artist), `.title` (Titel), `.availability` (Verfügbarkeitstext — enthält einen verschachtelten `<button class="open-help-layer">`, der vor dem Textauslesen entfernt werden muss), `.medium` (Format, z.B. `"3 CDs"`, `"LP"`, `"Single 12\""`), `.price` (z.B. `"EUR 24,99* Aktueller Preis: EUR 24,99"`), `h3 a[href]` (relative Produkt-URL, z.B. `/jpcng/poprock/detail/-/art/.../hnum/12390187`).
- **Verfügbarkeit:** Die Sidebar-Facette `#filter_availability` zeigt bei einer Testsuche exakt: `"Artikel am Lager (8)"`, `"innerhalb von 3 Tagen (3)"`, `"innerhalb einer Woche (1)"`, `"innerhalb von 1-2 Wochen (8)"`, `"innerhalb von 2-3 Wochen (3)"`, `"innerhalb von 4 Wochen (4)"` — Summe = 27 = exakt die gemeldete Gesamttrefferzahl. Wie bei Hard Wax gibt es also **keinen echten "nicht verfügbar"-Zustand** in der Suche selbst; jeder Treffer ist bestellbar. Mapping: Text enthält `"am Lager"` → `in_stock`; alle `"lieferbar innerhalb..."`-Varianten → `processing` (keine gesonderte "Vorbestellung"-Formulierung gefunden).
- **Query-Verhalten:** kombinierte "Artist Titel"-Suche funktioniert im Grundsatz (anders als SoundOhm/Souffle Continu), matcht aber eher großzügig/OR-artig über einzelne Wörter (getestet: "Aphex Twin Selected Ambient Works" brachte u.a. auch "Byul.org – Selected Tracks For Nacht Dämonen" — nur weil "Selected" vorkommt). Deshalb zusätzlich `matchesQueryWords` gegen Artist+Titel kombiniert angewendet (Wortgrenzen-Filter, siehe `src/lib/relevance.ts`).
- **Nebenfund (allgemeiner Bugfix):** `classifyFormat` erkannte pluralisierte CD-Formate wie `"3 CDs"` nicht (`\bcd\b` hat keine Wortgrenze zwischen "d" und "s"). Fix: Regex auf `\bcds?\b` erweitert — betrifft potenziell auch andere Shops mit Mengenangaben im Format-Feld.
- **Adapter-Typ:** `scraping`.

## Zusammenfassung: Adapter-Typen

| Shop | Domain | Backend | Zugriff | Adapter-Typ |
|---|---|---|---|---|
| Hard Wax | hardwax.com | Custom HTML | `?find=` Query | scraping |
| HHV | hhv.de | Custom | `?term=` Query | scraping |
| ANOST | anost.net | Vue SPA | `/api/public/search` | unofficial-api |
| Bis Aufs Messer | bisaufsmesser.com | Shopify | `/search/suggest.json` | unofficial-api |
| SoundOhm | soundohm.com | Custom | `/api/quickSearch` | unofficial-api |
| Soufflé Continu | soufflecontinu.com | Custom PHP | `/rest-api/shop/articles/?search=` | unofficial-api |
| JPC | jpc.de | Custom HTML | `/s/<query>` | scraping |

(Boomkat wurde entfernt, siehe oben.)

## Status-Modell

Jeder Treffer bekommt einen von 4 Status-Werten (`AvailabilityStatus` in `types/shop.ts`). Nicht verfügbare/ausverkaufte Formate werden von den Adaptern gar nicht erst zurückgegeben — es gibt also keinen "sold_out"-Status.

| Status | Label (UI) | Bedeutung |
|---|---|---|
| `in_stock` | Auf Lager | sofort lieferbar |
| `preorder` | Vorbestellung | Release/Versand liegt in der Zukunft |
| `processing` | Wird nachbestellt (Lieferzeit ungewiss) | bestellbar, aber (noch) nicht auf Lager |
| `last_copy` | Letztes Exemplar | auf Lager, aber nur noch (ein) letztes Stück |

Mapping pro Shop:

| Shop | Signal | in_stock | preorder | processing | ausblenden |
|---|---|---|---|---|---|
| Hard Wax | nur in-stock Formate gelistet | immer (kein Preorder beobachtet) | – | – | fehlender Preis-Treffer |
| HHV | `.add_to_cart` Zustandsklasse | `default` | `coming_soon` | – | `sold_out`, `temp_sold_out`, `not_enough_bonus_coins` |
| ANOST | `formats[].status` + `has_available_stock` | `status:"listed"` | `status:"pre-order"` | – | `has_available_stock:false` |
| Bis Aufs Messer | `available` + `tags`/Titel | `available:true`, kein Pre-order-Tag | `tags`/Titel enthält "Pre order" | – | `available:false` |
| SoundOhm | `is_in_stock` + `preorder` | `preorder:null` | `preorder` gesetzt (≠ "stocking") | `preorder:"stocking"` | `is_in_stock:false` |
| Soufflé Continu | `totalStock` + `lastCopy` | `totalStock>0`, `lastCopy:false` | – | – | `totalStock<=0` (→ `last_copy` wenn `lastCopy:true`) |
| JPC | `.availability`-Text | enthält "am Lager" | – | alle "lieferbar innerhalb..."-Varianten | kein echter "nicht verfügbar"-Zustand in der Suche |

## Docker-Setup (lokales Testen)

Analog zum Konzert-Guide-Ansatz gebaut, siehe `Dockerfile`, `nginx.conf`, `docker-compose.yml`, `.dockerignore`. Multi-Stage-Build (Node baut die Vite-App, `nginx:alpine` served `dist/` + reicht `/proxy/<shop>/`-Pfade an die echten Shop-Domains weiter — das Äquivalent zu Vites Dev-Proxy, der außerhalb von `npm run dev` nicht existiert). Start: `docker compose up --build`, App dann unter `http://localhost:8090`.

**Wichtige Lektion aus dem ersten Docker-Test:** `nginx.conf` brauchte zusätzlich zu User-Agent/Referer/Accept-Language noch die Sec-Fetch-*/sec-ch-ua*-Header UND eine explizite Leerung des `Origin`-Headers (der Browser schickt bei einem Fetch auf `localhost:8090` automatisch `Origin: http://localhost:8090` mit, was für die Shops wie eine fremde Seite aussieht — Vite unterdrückt das per `removeHeader("origin")`, nginx tat es bis dahin nicht). Beides jetzt für alle Shops in `nginx.conf` nachgezogen. Ein einmaliger `HTTP 502` bei Bis Aufs Messer im ersten Test war einmalig/transient, kein Config-Fehler.

## Playwright Session-Relay für HHV (und geplant: Boomkat) — Design, noch NICHT gebaut

Ausgangslage: HHV verlangt seit dem Docker-Testing (2026-07-11) einen gültigen Session-Cookie, den nur ein echter Browser durch Lösen einer JS-Challenge bekommt (siehe HHV-Abschnitt oben). Boomkat blockt strukturell ähnlich (TLS-/Bot-Fingerprinting, siehe eigener Abschnitt). Beides ist mit reinem Header-Spoofing über nginx/Vite nicht lösbar.

**Vereinbartes Design (2026-07-11), Kernpunkte:**
- Ein zweiter Docker-Container (Node + Playwright, passt zum bereits in Konzert-Guide verwendeten Playwright-Stack) übernimmt NUR HHV und Boomkat. Die anderen 5 Shops bleiben unverändert direkt bei nginx.
- **Lazy/on-demand statt periodisch:** Da die App selten genutzt wird ("Luxus-Spielerei für Kumpels"), kein Hintergrund-Scheduler. Der Sidecar hält einen In-Memory-Cache (Cookie-Wert + Ablaufzeitpunkt) pro Shop. Erste Suchanfrage einer Session ohne (noch) gültigen Cookie → Playwright startet einmalig, navigiert echt zur Shop-Seite, löst die Challenge ab, liest den Cookie aus, cached ihn (z.B. 1–2h Gültigkeit, muss sich in der Praxis noch zeigen), fährt Chromium wieder runter. Folge-Requests nutzen den gecachten Cookie ganz normal per HTTP, ohne erneut Chromium zu starten. Läuft der Cache ab, wird beim nächsten Request automatisch neu geholt (reaktiv, kein fester Zeitplan).
- Architektonisch übernimmt der Sidecar die Rolle, die aktuell `nginx.conf`s `/proxy/hhv/`-Block spielt (künftig auch `/proxy/boomkat/`) — nginx leitet diese zwei Pfade an den neuen Container weiter statt direkt an die Shop-Domain.
- **Containerzahl bewusst bei 2 gehalten:** shopogs-Container (nginx: App + die 5 "einfachen" Shop-Proxys) + Playwright-Sidecar. Kein dritter Container.
- **Konzert-Guides `nginx-proxy-manager` (NPM) bewusst NICHT wiederverwendet** für die Shop-Proxy-Logik: NPM macht bei Konzert-Guide reines Domain-/TLS-Routing zwischen mehreren Projekten, kein Shop-spezifisches Header-Spoofing/Pfad-Rewriting — das soll weiterhin versioniert in `nginx.conf` im Repo liegen, nicht in NPMs Admin-UI/SQLite-DB verstreut. NPM käme höchstens später als zusätzliche Tür VOR den shopogs-nginx-Container, falls die App mal über localhost hinaus erreichbar sein soll (analog zu Konzert-Guide intern/extern) — für lokales Testen unnötig.
- Playwright-Erkennung als Risiko: falls HHV/Boomkat anfangen, Headless-Chromium selbst zu erkennen, ist das ein Wettrüsten ohne Enddatum — bewusst in Kauf genommen, da beide Shops dem User wichtig sind.

**Nächste Schritte (für den Chat morgen):** Sidecar-Grundgerüst bauen (kleiner Node/Express-Service mit Playwright), Cookie-Harvesting für HHV implementieren und verifizieren (Ziel: `/proxy/hhv/records/katalog/filter/...` liefert über den Sidecar echten Content statt Challenge-Seite), danach optional Boomkat nach demselben Muster wieder aufnehmen, `nginx.conf` + `docker-compose.yml` entsprechend erweitern, `shops/index.ts` ggf. Boomkat wieder registrieren.

## UI-Anforderungen (Notiz für Frontend)

- Eingabefelder: **Artist/Band** und **Album-Titel** (getrennte Felder).
- Format-Filter: **All, Vinyl, CD, Cassette, Download**.

## Offene Punkte / Nächste Schritte

- **Sofort nächster Schritt:** Playwright-Session-Relay-Sidecar für HHV bauen (Design siehe eigener Abschnitt oben), danach Boomkat nach demselben Muster wieder aufnehmen.
- Soufflé Continu: verifizieren, wie explizit ausverkaufte Titel markiert sind (Badge-Text, oder komplett ausgeblendet).
- HHV: Facet-Hash-Encoding (`D2N2S11` etc.) ggf. weiter reverse-engineeren, falls Format-Filter direkt in der URL statt clientseitig gebraucht wird.
- Rate-Limiting / robots.txt / ToS pro Shop noch nicht geprüft — vor Produktivbetrieb sinnvoll gegenzuchecken.
- Alte, unregistrierte Ordner `src/shops/scraping/boomkat/` (wird beim Wiederaufbau vermutlich überschrieben) und `src/shops/scraping/soufflecontinu/` (Dead Code, durch `unofficial-api/soufflecontinu/` ersetzt) liegen noch auf der Platte — aus der Sandbox nicht löschbar (Permission-Fehler), können vom User bei Gelegenheit selbst entfernt werden.
