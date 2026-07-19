import type { AvailabilityResult } from "../../../types/shop";

// Hard Wax nutzt gehashte/generierte CSS-Klassennamen (z.B. "co", "cq", "px"),
// die sich mit jedem Deploy ändern können — deshalb wird hier bewusst NICHT
// auf Klassennamen selektiert, sondern auf stabile Tag-Struktur (article/h2)
// und Text-Muster (Format + Preis, z.B. `LP € 23`).
//
// Korrektur (Bugfix): "Artist: Titel" steht im <h2> (zwei <span>s, die
// gematchte Suchbegriffe einzeln in <b> wrappen, z.B.
// `<h2><span><a>...<b>Rhythm</b> & <b>Sound</b>...:</a></span>
// <span>...<b>Music</b>...</span></h2>` — textContent flacht das trotzdem zu
// "Rhythm & Sound w/ Paul St. Hilaire: Music A Fe Rule" ab). Der erste <p> im
// Artikel ist nur die Kurzbeschreibung (z.B. "Deadly Dub-Stepper") — das
// wurde ursprünglich fälschlich als Artist/Titel-Quelle ausgelesen, wodurch
// jeder Treffer mit Beschreibungstext (praktisch alle) nie den echten
// Artist/Titel lieferte bzw. bei fehlendem ":" in der Beschreibung sogar
// unter falschem Titel lief.
// Korrektur (5. Recon-Runde, Bugfix): Format/Preis NICHT mehr per Regex über
// den gesamten Artikel-Text ziehen — bei Releases mit mehreren Formaten (LP +
// Download-Bundle + einzeln kaufbare Tracks) hängt textContent alles ohne
// Trennzeichen aneinander, das ergab kaputte Format-Strings wie
// `12"MP3AIFF12"` und teils falsche Preise (Ziffern aus benachbarten Preisen
// wurden mitgematcht).
// Stattdessen: jeder Kaufen-Button (`a.qa`, "add to order") ist EIN
// bestellbares Format mit sauberem, isoliertem Inhalt:
//   - eigener textContent: `12" € 12`, `2 AIFFs € 3.5`, `AIFF € 1.75`, ...
//   - title-Attribut: `add "<Titel>" (<Format>) to your order` — bei
//     Einzeltrack-Downloads steht hier der Track-Titel (z.B. "... Part 1"),
//     nicht der Release-Titel.
// Ziffern-Wiederholungen bewusst auf {1,6}/{1,2} begrenzt (statt [\d]+) --
// keine reale ReDoS-Lücke: (.+?) ist nicht-gierig und läuft gegen einen
// festen Literal-Anker (€), das ist linear, kein verschachteltes/mehrdeutiges
// Backtracking wie bei klassischen catastrophic-backtracking-Mustern
// ((a+)+ o.ä.). Die security/detect-unsafe-regex-Heuristik zählt aber
// schlicht Quantifier-Konstrukte, unabhängig davon -- bei so kurzen, festen
// Button-Texten (z.B. `12" € 12`) bewusst unterdrückt statt den Regex weiter
// zu verbiegen.
// eslint-disable-next-line security/detect-unsafe-regex
const BUY_BUTTON_RE = /^(.+?)\s*€\s*(\d{1,6}(?:[.,]\d{1,2})?)$/;
const BUY_BUTTON_TITLE_RE = /^add\s+[“"](.+)[”"]\s*\(/;

export function transformHardWax(html: string): AvailabilityResult[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const articles = Array.from(doc.querySelectorAll("article"));
  const results: AvailabilityResult[] = [];

  for (const article of articles) {
    const artistTitle = article.querySelector("h2")?.textContent?.trim() ?? "";
    const separatorIdx = artistTitle.indexOf(":");
    const artist = separatorIdx >= 0 ? artistTitle.slice(0, separatorIdx).trim() : undefined;
    const releaseTitle = separatorIdx >= 0 ? artistTitle.slice(separatorIdx + 1).trim() : artistTitle;
    if (!releaseTitle) continue;

    const href = article.querySelector("a")?.getAttribute("href") ?? undefined;
    const url = href
      ? href.startsWith("http")
        ? href
        : `https://hardwax.com${href.startsWith("/") ? "" : "/"}${href}`
      : undefined;

    const buyButtons = Array.from(article.querySelectorAll("a.qa"));

    if (buyButtons.length === 0) {
      // Kein Kaufen-Button gefunden (z.B. reiner Info-Eintrag) — trotzdem als
      // Treffer aufnehmen, da Hard Wax nur verfügbare Artikel listet.
      results.push({ shopId: "hard-wax", title: releaseTitle, artist, url, status: "in_stock" });
      continue;
    }

    for (const btn of buyButtons) {
      const btnText = btn.textContent?.trim() ?? "";
      const priceMatch = btnText.match(BUY_BUTTON_RE);
      if (!priceMatch) continue;

      const titleAttr = btn.getAttribute("title") ?? "";
      const titleMatch = titleAttr.match(BUY_BUTTON_TITLE_RE);
      const rawItemTitle = titleMatch ? titleMatch[1] : releaseTitle;
      // Bei Einzeltrack-Downloads steht im title-Attribut "Artist: Track" —
      // den Artist-Präfix wieder abschneiden, sonst taucht er doppelt auf
      // (einmal als artist-Feld, einmal im title-Text).
      const itemTitle =
        artist && rawItemTitle.startsWith(`${artist}:`)
          ? rawItemTitle.slice(artist.length + 1).trim()
          : rawItemTitle;

      results.push({
        shopId: "hard-wax",
        title: itemTitle,
        artist,
        format: priceMatch[1].trim(),
        price: priceMatch[2],
        currency: "EUR",
        url,
        // Hard Wax listet nur Formate, die gerade lieferbar sind — ein
        // Kaufen-Button hier bedeutet also: auf Lager. Kein Preorder-Konzept
        // beobachtet (Recon: nur "out of stock" pro Format, kein Vorbestell-
        // Badge).
        status: "in_stock",
      });
    }
  }

  return results;
}

// Zählt die Treffer auf einer Label-Seite (/label/<slug>/). Verifiziert per
// Recon: Treffer stecken wie in der normalen Suche in <article>-Elementen;
// ein nicht existierendes/leeres Label zeigt stattdessen den Text
// "No results." an.
export function countHardWaxLabelArticles(html: string): number {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (/No results\./i.test(doc.body?.textContent ?? "")) return 0;
  return doc.querySelectorAll("article").length;
}
