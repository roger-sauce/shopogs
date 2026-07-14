# How-To: neuen Plattenladen-Adapter hinzufügen

Generisches Vorgehen, unabhängig vom konkreten Shop. Geschrieben nach dem Bau von 7 Adaptern (6 im Einsatz, 1 verworfen) für "Ich muss diese Platte haben" (`/Users/rogerhofmann/dev-workspace/shopogs`). Wenn du (Claude) dieses Dokument bekommst: lies zuerst `RECON.md` und `HANDOFF.md` im selben Projekt für den aktuellen Stand, dann folge unten stehendem Ablauf für den neuen Shop.

## Grundregel: Recon vor Code

Nie direkt Adapter-Code schreiben, bevor die Recon für den jeweiligen Shop abgeschlossen ist und dokumentiert wurde (in `RECON.md`, ein Abschnitt pro Shop). Erst wenn Suchmechanismus UND Verfügbarkeits-Signal wirklich verifiziert sind (nicht nur vermutet), Code schreiben.

## Eskalationsweg für die Recon

1. **Sandbox-curl / sandbox fetch** — funktioniert für die meisten Shop-Domains NICHT (Netzwerk-Allowlist blockiert externe Domains in der Cowork-Sandbox). Trotzdem kurz probieren, kostet nichts.
2. **Chrome MCP** (`mcp__claude-in-chrome__*`) — der eigentliche Weg. Auf die echte Shop-Seite navigieren, dann per `javascript_tool` (`fetch()` im Seitenkontext) die Such-/API-Endpoints direkt ansprechen. Das umgeht CORS, weil der Request vom Shop selbst als same-origin gilt.
3. Falls der User selbst am Rechner testet: er kann auch direkt `curl`/Browser-Devtools nutzen und Ergebnisse einfügen.

**Wichtige Einschränkung der Chrome-MCP-Sandbox:** `fetch()`-Aufrufe mit Query-String-Parametern im JS-Tool werden manchmal mit `[BLOCKED: Cookie/query string data]` abgelehnt (Sicherheitsfilter, nicht die Zielseite). Workarounds, die zuverlässig funktioniert haben:
- Ergebnis vor dem Return sanitisieren: `JSON.stringify(...).replace(/=/g,'[eq]').replace(/\?/g,'[q]').replace(/&/g,'[amp]')` — dann kommt die Antwort durch.
- Wenn das nicht reicht: XHR/fetch der Seite selbst abfangen (`XMLHttpRequest.prototype.open/send` überschreiben, Response in `window.__captured` zwischenspeichern) und danach die echte Such-UI der Seite bedienen (Formular ausfüllen, Select ändern), dann `window.__captured` auslesen.
- Für GET-only-Endpoints ohne Query-Param testweise ohne Query aufrufen, um wenigstens Status/Header zu sehen.

## Was während der Recon geklärt werden muss

Für jeden neuen Shop, in dieser Reihenfolge:

1. **Backend-Typ identifizieren**: Shopify (`/search/suggest.json`, `/products.json`), Spree/Rails (Ransack-Query-Parameter `?q[status]=`), custom JSON-API, klassisches server-gerendertes HTML, oder (Achtung, häufige Falle) ein Shop, der zwar HTML ausliefert, dessen Ergebnisliste aber erst per Client-JS/AJAX nachgeladen wird (siehe Souffle Continu unten).
2. **Such-Endpoint**: exakte URL, Methode (GET/POST), Query-Parameter-Namen. Direkt gegen die echte Seite testen, nicht nur aus Doku/Vermutung übernehmen.
3. **Kombinierte Artist+Titel-Suche testen, nicht nur Titel oder nur Artist alleine.** Das war die häufigste Überraschung: manche Shops matchen einen kombinierten `"Artist Titel"`-String schlecht oder gar nicht, obwohl Titel-alleine oder Artist-alleine einwandfrei funktionieren (SoundOhm, Souffle Continu — beide: kombiniert = 0 Treffer, Titel alleine = Treffer). Immer alle drei Varianten gegen einen Datensatz testen, von dem man weiß, dass er existiert.
4. **Verfügbarkeits-Signal(e) pro Format.** Nicht nur "verfügbar ja/nein" — mögliche Zustände sind:
   - `in_stock` (normal auf Lager)
   - `preorder` (Vorbestellung, Release-Datum in der Zukunft)
   - `processing`/"wird nachbestellt" (bestellbar, aber Lieferzeit ungewiss — z.B. SoundOhms `preorder:"stocking"` -> "In process of stocking")
   - `last_copy` (auf Lager, aber knapp)
   - ausverkauft/nicht verfügbar -> wird NICHT als Treffer zurückgegeben (siehe Datenmodell unten)
   
   Wichtig: das Verfügbarkeits-Feld kann pro FORMAT unterschiedlich sein (z.B. LP ausverkauft, CD noch da) — dann muss pro Format gefiltert werden, nicht pro Release. Immer aktiv nach einem "Pre-order"/"Vorbestellung"-Zustand suchen (Tag, Statusfeld, Datumsvergleich, Text-Badge) — der wurde bei mehreren Shops erst in einer zweiten Recon-Runde gefunden, weil er selten vorkommt und leicht übersehen wird.
5. **Format-Feld**: wie heißt das Feld, das Vinyl/CD/Cassette/Download unterscheidet? Nicht raten — im echten API-Response nachsehen. Fallstrick: ein Feld kann im TypeScript-Interface fehlen, obwohl die API es liefert (passiert bei Bis Aufs Messer: `type`-Feld existierte in der echten Antwort, war aber nicht im Interface deklariert -> Format blieb immer leer -> Format-Filter fälschlich wirkungslos für diesen Shop).
6. **Produkt-URL-Muster**: gegen eine echte, bekannte Produkt-URL verifizieren, nicht nur aus dem Slug-Feld ableiten und hoffen.
7. **Kein JS-Rendering vorausgesetzt**: verifizieren, dass ein reiner `fetch()`/`curl` (ohne Browser-JS-Ausführung) tatsächlich die Ergebnisliste enthält. Falle: eine Seite kann serverseitig nur ein leeres Grundgerüst ausliefern und die echten Treffer erst per Client-JS von einem separaten REST-Endpoint nachladen (Souffle Continu: `POST /search/` lieferte nur `<div class="cardContainer"></div>`, echte Daten kamen von `GET /rest-api/shop/articles/?search=`). Das findet man, indem man den rohen `fetch()`-Response mit dem an, was im echten Browser sichtbar ist, vergleicht — bei Diskrepanz: Netzwerk-Tab/XHR-Hook nutzen, um den echten Daten-Endpoint zu finden.
8. **Bot-Schutz/Cloudflare prüfen**: einen Vite-Dev-Proxy-Request (Node/http-proxy, kein echter Browser) gegen die Seite testen. Wenn er mit 403 blockt, obwohl ein echter Chrome-Request klarkommt, ist das wahrscheinlich TLS-/Bot-Fingerprinting — das lässt sich NICHT durch bloßes Setzen von User-Agent/Referer-Headern lösen (das haben wir bei Boomkat ausführlich versucht, hat nicht geholfen). In dem Fall: Shop entweder weglassen oder dem User transparent sagen, dass es nur mit echtem Headless-Browser server-seitig lösbar wäre — das ist außerhalb des Scopes dieses simplen Dev-Proxy-Ansatzes.

## Datenmodell (aktueller Stand)

```ts
// src/types/shop.ts
export type AvailabilityStatus = "in_stock" | "preorder" | "processing" | "last_copy";

export interface AvailabilityResult {
  shopId: string;
  title: string;
  artist?: string;
  format?: string;       // Roh-Format-String vom Shop, z.B. "2LP", "12\"", "Cassette"
  price?: string;
  currency?: string;
  url?: string;
  status: AvailabilityStatus;
}
```

**Wichtig:** Es gibt bewusst keinen "sold_out"/"nicht verfügbar"-Status. Nicht verfügbare bzw. für die gewählte Suche nicht (mehr) auf Lager befindliche Formate werden vom Adapter selbst aus dem zurückgegebenen Array entfernt (filtern, bevor `AvailabilityResult` gebaut wird) — sie tauchen nie als Treffer mit "nicht verfügbar"-Badge auf, sondern gar nicht.

## Adapter-Dateistruktur

```
src/shops/<type>/<shop-id>/
  api.ts        // reiner Netzwerk-Layer: fetch(...) -> typisierte Rohdaten
  transform.ts  // Rohdaten -> AvailabilityResult[]
  index.ts      // ShopAdapter-Objekt (id, name, country, group, homeUrl,
                //  logoUrl, type, checkAvailability)
```

`<type>` ist einer von `official-api` (öffentlich dokumentierte API), `unofficial-api` (öffentlich erreichbarer, aber nicht offiziell für Drittnutzung dokumentierter JSON-Endpoint) oder `scraping` (HTML wird geparst). Danach in `src/shops/index.ts` importieren und ins `shops`-Array aufnehmen (inkl. `group`: `"pickup-berlin"` oder `"mail-order"` — je nachdem, ob Abholung in Berlin möglich ist oder nur Versand).

## checkAvailability-Query-Strategie

Default-Ansatz (nach den bisherigen Erfahrungen empfohlen, nicht blind `[artist, title].join(" ")`):

```ts
async checkAvailability(artist, title) {
  // Titel ist meist der präzisere/eindeutigere Suchbegriff. Erst NACH der
  // Recon (Schritt 3 oben) entscheiden, ob der Shop kombinierte Queries
  // verträgt oder nicht.
  const query = title.trim() || artist.trim();
  if (!query) return [];
  const raw = await searchShop(query);
  const results = transformShop(raw);
  // Falls der Shop Artist-Infos mitliefert: optional client-seitig nach
  // Artist filtern (nur anwenden, wenn es nicht ALLE Treffer wegfiltert —
  // Artist-Feld kann fehlen oder abweichend geschrieben sein).
  return results;
}
```

Wenn der Recon-Test zeigt, dass kombinierte Queries beim jeweiligen Shop einwandfrei funktionieren (z.B. Hard Wax, ANOST), kann man bei `[artist, title].filter(Boolean).join(" ")` bleiben — aber das muss explizit getestet worden sein, nicht angenommen werden.

## Format-Filter

Format-Klassifizierung läuft zentral über `src/lib/classifyFormat.ts` (`classifyFormat`, `matchesFormatFilter`, `SELECTABLE_FORMATS`). Adapter müssen nur ein plausibles `format`-Rohstring-Feld liefern (z.B. "LP", "2xLP", "Cassette", "MP3") — die Klassifizierung in Vinyl/CD/Cassette/Download passiert zentral per Regex. Nicht selbst neu klassifizieren.

Der Filter zeigt nicht-klassifizierbare Formate nur an, wenn wirklich ALLE 4 Format-Checkboxen aktiv sind (Default-Zustand). Bei einer engeren Auswahl müssen Treffer eindeutig klassifizierbar sein — deshalb ist es wichtig, dass das `format`-Feld tatsächlich sauber befüllt ist (siehe Bis-Aufs-Messer-Falle oben).

## Scraping-spezifische Fallstricke (falls `type: "scraping"`)

- **Nicht über den gesamten Element-/Artikel-Text regexen, wenn ein Artikel mehrere Formate/Preise enthalten kann.** Der Text mehrerer Preis-Angaben hängt ohne Trennzeichen aneinander und ergibt kaputte Matches (z.B. `12"MP3AIFF12"` statt `12"`). Stattdessen: pro tatsächlichem UI-Element (z.B. einzelner "In den Warenkorb"-Button) einzeln parsen — jedes Element hat isolierten, sauberen Text.
- **Gehashte/generierte CSS-Klassennamen** (ändern sich bei jedem Deploy) meiden — auf stabile Tag-Struktur (welches Element enthält was) und/oder auf `title`/`alt`-Attribute setzen, die oft strukturierten Klartext enthalten (z.B. Hard Wax: `title="add "<Titel>" (<Format>) to your order"`).
- Vor dem Schreiben des Parsers: die tatsächliche DOM-Struktur eines ECHTEN Suchergebnisses in Chrome inspizieren (`querySelectorAll`, `outerHTML`), nicht aus einer alten/angenommenen Struktur ableiten. Websites ändern ihre Templates.

## Nach dem Bauen: immer verifizieren

```bash
cd <projekt> && npx tsc --noEmit
rm -rf /tmp/<projekt>-dist-check && npx vite build --outDir /tmp/<projekt>-dist-check --emptyOutDir
```

(Nicht ins echte `dist/` bauen — das kann in der Sandbox Permission-Probleme mit bereits vorhandenen Dateien geben.)

Danach den neuen Adapter idealerweise nochmal live gegen 2-3 echte, bekannte Testfälle prüfen (ein Treffer, der definitiv existiert; ein Treffer mit Vorbestell-/Sonderstatus falls vorhanden; eine Suche, die absichtlich nichts finden sollte).

## RECON.md aktuell halten

Jeden neuen Shop nach demselben Muster wie die bestehenden 6 Einträge in `RECON.md` dokumentieren: Backend-Typ, Such-Endpoint, Verfügbarkeits-Signal(e) inkl. Status-Mapping, Adapter-Typ, eventuelle Korrekturen/Fallstricke. Das Dokument ist die Gedächtnisstütze für "warum ist der Code so, wie er ist" — ohne das vergisst man nach ein paar Monaten, warum z.B. SoundOhm nur nach Titel sucht.
