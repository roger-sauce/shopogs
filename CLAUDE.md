# Arbeitsweise in diesem Projekt

## Keine Dateien ohne Zustimmung

Claude legt nichts an und ändert nichts, bevor Roger zugestimmt hat — auch
keine vermeintlich trivialen Hilfsdateien. Analysieren, erklären, den fertigen
Vorschlag hinlegen; die Freigabe kommt von Roger.

Ist sie erteilt, schreibt Claude direkt ins Arbeitsverzeichnis. Committen und
Pushen bleiben getrennte Schritte und gehören Roger.

## Git führt Roger selbst aus

Claude ruft **keine** Git-Befehle auf — kein `add`, `commit`, `push`, `reset`,
`checkout`, `stash`. Stattdessen: Dateien ändern und den fertigen Befehl zum
Kopieren danebenlegen.

Lesende Befehle (`status`, `log`, `diff`) darf Claude vorschlagen, aber
**immer mit `--no-optional-locks`**:

```bash
git --no-optional-locks status --short
```

Ohne das legt Git eine `.git/index.lock` an, die Claudes Umgebung auf diesem
Mount nicht wieder löschen kann. Sie bleibt liegen und blockiert den nächsten
Git-Aufruf von Roger.

Befehle bekommt Roger **einzeln pro Codeblock**, nicht mehrere zusammen.

**Commit-Nachrichten kurz.** Eine Betreffzeile, mehr nicht. Ausdrücklich
gewünscht am 16.08.2026, nachdem mehrzeilige Nachrichten überhandnahmen.

Branch ist **`main`**.

## Sprache

| | |
|---|---|
| Antworten im Chat | **Deutsch** |
| Code-Kommentare | **Englisch** |
| Commit-Nachrichten | **Englisch** |
| Oberfläche der Web-App | **Deutsch** |
| Oberfläche von WaxStock | **Englisch** |
| API-Fehlermeldungen | **Englisch** |
| Diese Dokumentation | **Deutsch** |

Die Kommentare waren bis zum 16.08.2026 deutsch und wurden in einem Zug
umgestellt. Deutsch geblieben ist alles, was Verhalten ist und nicht Prosa:
Texte der Web-Oberfläche, in Kommentaren zitiertes Shop-Markup wie
`"In den Warenkorb"`, die `console.log`-Meldungen im Sidecar, nach denen man
in Container-Logs greppt, und die deutschen Bezeichner dort.

Kommentare erklären das *Warum*, nicht das *Was*. Wo eine Lösung nicht
offensichtlich ist, gehört der Grund daneben. Die Kommentare in
`src/shops/**` sind das wertvollste Stück dieses Projekts — sie halten fest,
was Live-Recon an Shop-Eigenheiten zutage gefördert hat. Beim Umbauen nicht
wegkürzen.

## Wo was liegt

| | |
|---|---|
| `src/` | Web-App (React/Vite) und die Shop-Adapter |
| `src/shops/<typ>/<shop>/` | je Shop: `api.ts`, `transform.ts`, `index.ts` |
| `server/` | Express: führt dieselben Adapter serverseitig aus, liefert `/api/` |
| `sidecar/` | Camoufox-Browser für HHV und Boomkat |
| `caddy/` | TLS im Heimnetz, mkcert |
| `ios/WaxStock/` | native SwiftUI-App fürs iPhone |
| `KONTEXT-SHOPOGS.md` | Betriebswissen: Adressen, Ausrollen, Fallen — **nicht im Git** |
| `RECON.md` | Rechercheergebnisse pro Shop |
| `ADAPTER_HOWTO.md` | Vorgehen für einen neuen Shop |
| `HANDOFF.md` | **veraltet**, Stand 11.07.2026, abgelöst durch `KONTEXT-SHOPOGS.md` |

Vor Änderungen am Betrieb lohnt ein Blick in `KONTEXT-SHOPOGS.md` — dort
steht, was schon mal Zeit gekostet hat.

## Ausrollen

Änderungen an `src/`, `server/`, `sidecar/` oder den Konfigurationsdateien
brauchen auf `extern` einen Rebuild. Der Weg steht in `KONTEXT-SHOPOGS.md`.
Änderungen an `ios/` betreffen den Server nicht.
