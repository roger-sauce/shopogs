# Handoff — Stand 2026-07-11

Für einen neuen Chat: dieses Dokument + `RECON.md` (Shop-spezifische Rechercheergebnisse, inkl. Playwright-Design-Abschnitt) + `ADAPTER_HOWTO.md` (generisches Vorgehen für neue Shops) geben.

## Projekt

"Ich muss diese Platte haben!" — React/Vite/TypeScript Web-App (Stil an `konzert-guide` angelehnt), Ordner `/Users/rogerhofmann/dev-workspace/shopogs`. Prüft Verfügbarkeit von Vinyl/CD/Cassette/Download für eine Suche (Artist/Band + Album-Titel, beides optional kombinierbar) über mehrere Plattenläden, aufgeteilt in zwei Gruppen:

- **Pickup in Berlin**: Hard Wax, HHV, ANOST, Bis Aufs Messer
- **Mail Order**: SoundOhm, Souffle Continu, JPC

(Boomkat ist aktuell entfernt, Wiederaufbau geplant — siehe "Nächster Schritt" unten.)

## Architektur

- Adapter-Pattern, ein Ordner pro Shop unter `src/shops/<type>/<shop-id>/` mit `api.ts` (Netzwerk-Layer), `transform.ts` (Rohdaten -> `AvailabilityResult[]`), `index.ts` (registriert `ShopAdapter`, ruft `checkAvailability(artist, title)` auf).
- `type` ist einer von `official-api` / `unofficial-api` / `scraping` (Ordnername = Type).
- Zentrale Registry: `src/shops/index.ts` (Array `shops`).
- Typen: `src/types/shop.ts` — `AvailabilityResult` hat ein `status`-Feld (`AvailabilityStatus`: `in_stock` | `preorder` | `processing` | `last_copy`), **kein** Boolean. Nicht verfügbare/ausverkaufte Formate werden von den Adaptern selbst herausgefiltert, tauchen also nie als Treffer auf.
- Labels/Farben pro Status: `src/lib/availabilityStatus.ts`.
- Format-Klassifizierung + Filter-Logik: `src/lib/classifyFormat.ts` (`SELECTABLE_FORMATS`, `classifyFormat`, `matchesFormatFilter`).
- Relevanzfilter gegen lose Substring-Treffer der Shop-Suchen: `src/lib/relevance.ts` (`matchesQueryWords`), genutzt bei SoundOhm, Souffle Continu, JPC.
- Dev-Server-Proxy für CORS-Bypass: `vite.config.ts` (`/proxy/<shop>` -> echte Domain, mit Browser-Header-Overrides). **Vite lädt `vite.config.ts`-Änderungen nicht per Hot-Reload — nach Änderungen `npm run dev` komplett neu starten.**
- **Docker-Setup für lokales Testen** (neu diese Session): `Dockerfile` (Multi-Stage: Node baut, `nginx:alpine` served), `nginx.conf` (Äquivalent zu Vites Dev-Proxy — ein `location /proxy/<shop>/`-Block pro Shop mit denselben Browser-Headern), `docker-compose.yml` (ein Service, Port `8090:80`), `.dockerignore`. Start: `docker compose up --build`, dann `http://localhost:8090`.
- `src/App.tsx`: die gesamte UI (Suchformular, Ergebnisliste, Landingpage-Logos) in einer Datei, inline Styles.

## Was funktioniert (Stand heute)

- Alle 6 aktiven Shops (Hard Wax, ANOST, Bis Aufs Messer, SoundOhm, Souffle Continu, JPC) liefern korrekte Treffer inkl. Status, Format-Filter funktioniert (default: alle 4 angehakt, Warnung bei 0 Formaten).
- JPC-Adapter diese Session neu gebaut und verifiziert (server-gerendertes HTML, `GET /s/<query>`). Eigenheit: JPC liefert bei 0 Treffern HTTP 404 mit normalem "keine Ergebnisse"-Body — wird in `api.ts` bewusst NICHT als Fehler behandelt.
- Landingpage + Ergebnisliste zeigen Shop-Logos in zwei Gruppen, Browser-Zurück-Button führt zur Startseite statt die Seite zu verlassen.
- "Go to Discogs"-Button (separat vom Such-Button, bewusst grau statt gold, öffnet Discogs-Suche in neuem Tab) — das alte Fokus-Problem (siehe ganz unten) ist damit gelöst, da es jetzt eine bewusste Nutzeraktion statt eines automatischen Nebeneffekts ist.
- "Neue Suche"-Button (klein, gold, in der Kopfzeile über dem Artist/Band-Feld, rechtsbündig) leert Artist/Titel/Ergebnisse in einem Klick — Fix gegen das Problem, dass Nutzer nur ein Feld ändern und dann durch das stehengebliebene andere Feld scheinbar "nichts gefunden" bekommen.
- Bugfix diese Session: SoundOhm/Souffle Continu zeigten bei falschem Artist trotzdem Treffer an (ein Fallback "zeig alles, wenn Artist-Filter 0 Treffer liefert" war zu großzügig) — entfernt, Artist-Mismatch schließt jetzt konsequent aus. Per Grep verifiziert: dieses Pattern gab's nur bei diesen zwei Shops.
- Docker-Setup gebaut und vom User erfolgreich getestet (`docker compose up --build`, läuft auf Port 8090). nginx-Proxy-Header wurden dabei an Vites Header-Set angeglichen (Sec-Fetch-*/sec-ch-ua*, explizites Leeren des `Origin`-Headers) — ein einmaliger `HTTP 502` bei Bis Aufs Messer war transient, kein Config-Fehler.

## Nächster Schritt (für morgen, explizit vereinbart)

**HHV blockt seit dem Docker-Testing strukturell** (Cookie-gated JS-Challenge — ein Server-Proxy kann kein JS ausführen, um einen gültigen Session-Cookie zu bekommen; verifiziert per direktem Cookie-Vergleich im Browser, siehe RECON.md HHV-Abschnitt). Kein Header-Fix möglich, gleiche Kategorie Problem wie Boomkats TLS-Fingerprinting (deshalb aktuell entfernt).

**Vereinbarte Lösung:** ein Playwright-Sidecar-Container (Node, passt zum bereits in Konzert-Guide genutzten Playwright-Stack — User hat explizit kein Problem mit dem Einsatz). Holt lazy/on-demand (NICHT periodisch — App wird selten genutzt, kein Hintergrund-Scheduler nötig) bei der ersten Anfrage pro Session einen frischen Session-Cookie für HHV (und später Boomkat), cached ihn mit Ablaufzeit, bedient danach normale HTTP-Requests ohne erneutes Chromium-Starten, bis der Cache abläuft.

Volles Design (Containerzahl, Rolle von nginx.conf, warum NICHT Konzert-Guides `nginx-proxy-manager` wiederverwendet wird) steht ausführlich in `RECON.md` im Abschnitt **"Playwright Session-Relay für HHV (und geplant: Boomkat) — Design, noch NICHT gebaut"**. Kurzfassung: 2 Container total (shopogs-nginx + Playwright-Sidecar), nginx leitet nur `/proxy/hhv/` (künftig auch `/proxy/boomkat/`) an den Sidecar weiter, die anderen 5 Shops bleiben unverändert.

**Noch nicht begonnen** — reine Design-Diskussion bisher, kein Code. Nächste konkrete Schritte: Sidecar-Grundgerüst (Node/Express + Playwright), Cookie-Harvesting für HHV implementieren + verifizieren, dann Boomkat nach demselben Muster wieder aufnehmen.

## Kleinere offene Punkte (nicht dringend)

- Verwaiste `.git/index.lock` ist heute einmal aufgetreten (VS Code konnte nicht committen) — aus der Sandbox nicht löschbar (Permission-Fehler beim Zugriff auf den gemounteten Ordner, bekannte Einschränkung), User hat sie manuell im Terminal gelöscht. Falls das wieder passiert: einfach `rm .git/index.lock` im Projektordner, sofern kein Git-Prozess mehr wirklich läuft.
- Alte, unregistrierte Ordner `src/shops/scraping/boomkat/` und `src/shops/scraping/soufflecontinu/` (Dead Code, durch `unofficial-api/soufflecontinu/` ersetzt) liegen noch auf der Platte, aus der Sandbox nicht löschbar — kann der User bei Gelegenheit selbst aufräumen. `boomkat/` wird beim geplanten Wiederaufbau vermutlich sowieso überschrieben.
- Format/Preis-Extraktion bei Hard Wax zeigt bei Releases mit Einzeltrack-Downloads mehr Zeilen (Part 1/Part 2 einzeln) — vom User als ok akzeptiert ("kann ich im Filter als Download disablen").
- Das alte Discogs-Fokus-Problem (aus dem letzten Handoff) ist gelöst — nicht mehr relevant, nur der Vollständigkeit halber erwähnt falls in alten Notizen noch referenziert.
