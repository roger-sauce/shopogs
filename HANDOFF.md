# Handoff — Stand 2026-07-10

Für einen neuen Chat: dieses Dokument + `RECON.md` (Shop-spezifische Rechercheergebnisse) + `ADAPTER_HOWTO.md` (generisches Vorgehen für neue Shops) geben.

## Projekt

"Ich muss diese Platte haben" — React/Vite/TypeScript Web-App (Stil an `konzert-guide` angelehnt), Ordner `/Users/rogerhofmann/shopogs`. Prüft Verfügbarkeit von Vinyl/CD/Cassette/Download für eine Suche (Artist/Band + Album-Titel, beides optional kombinierbar) über mehrere Plattenläden, aufgeteilt in zwei Gruppen:

- **Pickup in Berlin**: Hard Wax, HHV, ANOST, Bis Aufs Messer
- **Mail Order**: SoundOhm, Souffle Continu

(Boomkat wurde entfernt — siehe unten.)

## Architektur

- Adapter-Pattern, ein Ordner pro Shop unter `src/shops/<type>/<shop-id>/` mit `api.ts` (Netzwerk-Layer), `transform.ts` (Rohdaten -> `AvailabilityResult[]`), `index.ts` (registriert `ShopAdapter`, ruft `checkAvailability(artist, title)` auf).
- `type` ist einer von `official-api` / `unofficial-api` / `scraping` (Ordnername = Type).
- Zentrale Registry: `src/shops/index.ts` (Array `shops`).
- Typen: `src/types/shop.ts` — `AvailabilityResult` hat ein `status`-Feld (`AvailabilityStatus`: `in_stock` | `preorder` | `processing` | `last_copy`), **kein** Boolean mehr. Nicht verfügbare/ausverkaufte Formate werden von den Adaptern selbst herausgefiltert, tauchen also nie als Treffer auf.
- Labels/Farben pro Status: `src/lib/availabilityStatus.ts`.
- Format-Klassifizierung + Filter-Logik: `src/lib/classifyFormat.ts` (`SELECTABLE_FORMATS`, `classifyFormat`, `matchesFormatFilter`).
- Dev-Server-Proxy für CORS-Bypass: `vite.config.ts` (`/proxy/<shop>` -> echte Domain, mit Browser-Header-Overrides). **Wichtig: Vite lädt `vite.config.ts`-Änderungen nicht per Hot-Reload — nach Änderungen `npm run dev` komplett neu starten.**
- `src/App.tsx`: die gesamte UI (Suchformular, Ergebnisliste, Landingpage-Logos) in einer Datei, inline Styles.

## Was funktioniert (Stand heute)

Alle 6 verbliebenen Shops liefern korrekte Treffer inkl. Status (Auf Lager / Vorbestellung / Wird nachbestellt / Letztes Exemplar), Format-Filter funktioniert korrekt (default: alle 4 Formate angehakt), Landingpage zeigt Shop-Logos in zwei Gruppen, Ergebnisliste zeigt Logos auch am Ende, Browser-Zurück-Button führt zur Startseite statt die Seite zu verlassen, Discogs-Checkbox öffnet Discogs-Suche in neuem Tab.

## Offenes Problem (weiter debuggen!)

**Discogs-Checkbox öffnet neuen Tab, aber der Browser-Fokus wechselt zum Discogs-Tab statt auf unserer Seite zu bleiben.** Das war explizit gewünscht ("Der focus soll auf unserer Seite bleiben").

Was schon versucht wurde (alle ohne Erfolg laut User-Test):
1. `window.open(url, "_blank", "noopener,noreferrer")` gefolgt von einem sofortigen `window.focus()`.
2. Zusätzlich verzögerte `window.focus()`-Aufrufe via `setTimeout(..., 50)` und `setTimeout(..., 300)` (Annahme: Chrome aktiviert den neuen Tab nach Skriptende, ein sofortiges `focus()` verliert das Rennen).

Code dazu liegt in `src/App.tsx`, `handleSearch`, ganz am Anfang (Kommentarblock "Discogs-Lookup synchron ... auslösen").

**Nächste Schritte zum Ausprobieren:**
- Ist das grundsätzlich per JS aus einer normalen Web-Seite überhaupt zuverlässig lösbar? Chrome behandelt per `window.open()` geöffnete Tabs (als direkte Folge einer User-Geste) bewusst als "aktivieren" — das ist eine Anti-Tabnapping-Maßnahme und evtl. gar nicht per Script überschreibbar, auch nicht verzögert.
- Alternativen, die es wert wären getestet zu werden:
  - Discogs-Link nicht automatisch bei der Suche öffnen, sondern als eigenen Button/Link anzeigen (der User klickt bewusst selbst, ggf. mit Cmd/Ctrl-Klick fürs Hintergrund-Öffnen — das funktioniert zuverlässig, ist aber ein Nutzerverhalten, keine Automatik).
  - Testen, ob ein `window.open(url, "_blank", "width=1,height=1")` (winziges Popup-Fenster statt Tab) sich anders verhält.
  - Testen, ob `rel="opener"` (Referenz behalten) + `openedWindow.blur()` + `window.focus()` zusammen zuverlässiger sind als nur `window.focus()` allein (aktuell wird `noopener` genutzt, das verhindert den Rückkanal zum neuen Fenster).
  - Ggf. einfach mit dem User klären, ob das Verhalten so überhaupt browserseitig vermeidbar ist, und falls nicht, eine der Alternativen anbieten.
- Immer erst `npm run dev` NEU STARTEN vor dem Testen (nicht nur Hot-Reload), um sicherzugehen, dass der aktuellste Code läuft.

## Kleinere offene Punkte (nicht dringend, nur zur Erinnerung)

- Der alte, nicht mehr registrierte Ordner `src/shops/scraping/boomkat/` konnte aus der Sandbox nicht gelöscht werden (Permission-Fehler) — ist tot, aber type-check-sauber gepatcht. Kann der User bei Gelegenheit selbst löschen.
- Format/Preis-Extraktion bei Hard Wax zeigt bei Releases mit Einzeltrack-Downloads mehr Zeilen (Part 1/Part 2 einzeln) — vom User als ok akzeptiert ("kann ich im Filter als Download disablen").
