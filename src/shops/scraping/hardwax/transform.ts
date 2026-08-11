import type { AvailabilityResult } from "../../../types/shop";

// Hard Wax uses hashed/generated CSS class names (e.g. "co", "cq", "px")
// that can change with every deploy — which is why selection here is
// deliberately NOT done on class names, but on stable tag structure
// (article/h2) and text patterns (format + price, e.g. `LP € 23`).
//
// Correction (Bugfix): "Artist: Title" lives in the <h2> (two <span>s that
// wrap matched search terms individually in <b>, e.g.
// `<h2><span><a>...<b>Rhythm</b> & <b>Sound</b>...:</a></span>
// <span>...<b>Music</b>...</span></h2>` — textContent flattens that to
// "Rhythm & Sound w/ Paul St. Hilaire: Music A Fe Rule" anyway). The first
// <p> in the article is only the short description (e.g. "Deadly
// Dub-Stepper") — that was originally read out as the artist/title source
// by mistake, so that every hit with description text (practically all of
// them) never returned the real artist/title, or, when the description had
// no ":", even ran under a wrong title.
// Correction (5th recon round, Bugfix): do NOT pull format/price via regex
// over the entire article text any more — for releases with several formats
// (LP + download bundle + individually purchasable tracks) textContent
// concatenates everything without separators, which produced broken format
// strings like `12"MP3AIFF12"` and partly wrong prices (digits from
// neighbouring prices were matched along).
// Instead: every buy button (`a.qa`, "add to order") is ONE orderable
// format with clean, isolated content:
//   - its own textContent: `12" € 12`, `2 AIFFs € 3.5`, `AIFF € 1.75`, ...
//   - title attribute: `add "<Title>" (<Format>) to your order` — for
//     single-track downloads this holds the track title (e.g. "... Part 1"),
//     not the release title.
// Digit repetitions deliberately limited to {1,6}/{1,2} (instead of [\d]+) --
// no real ReDoS hole: (.+?) is non-greedy and runs against a fixed literal
// anchor (€), which is linear, not the nested/ambiguous backtracking of the
// classic catastrophic-backtracking patterns ((a+)+ and the like). The
// security/detect-unsafe-regex heuristic simply counts quantifier
// constructs regardless of that -- for such short, fixed button texts (e.g.
// `12" € 12`) deliberately suppressed instead of contorting the regex
// further.
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
      // No buy button found (e.g. a pure info entry) — still record it as a
      // hit, since Hard Wax only lists available articles.
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
      // For single-track downloads the title attribute holds "Artist: Track"
      // — strip the artist prefix off again, otherwise it shows up twice
      // (once as the artist field, once in the title text).
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
        // Hard Wax only lists formats that are currently deliverable — a buy
        // button here therefore means: in stock. No preorder concept
        // observed (recon: only "out of stock" per format, no preorder
        // badge).
        status: "in_stock",
      });
    }
  }

  return results;
}

// Counts the hits on a label page (/label/<slug>/). Verified by recon: hits
// sit in <article> elements just like in the normal search; a
// non-existent/empty label shows the text "No results." instead.
export function countHardWaxLabelArticles(html: string): number {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (/No results\./i.test(doc.body?.textContent ?? "")) return 0;
  return doc.querySelectorAll("article").length;
}
