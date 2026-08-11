import type { AvailabilityResult } from "../../../types/shop";
import type { SouffleContinuArticle, SouffleContinuSearchResponse } from "./api";

function extractPrice(priceHtml: string): string | undefined {
  // priceHtml looks e.g. like this: '<span class="articlePrice">28.90€</span> '
  // Digit repetitions deliberately capped at {1,6}/{1,2} (instead of [\d]+) --
  // no real ReDoS hole with price strings this short (no nested/ambiguous
  // backtracking). The security/detect-unsafe-regex heuristic however still
  // counts the quantifier constructs in total -- deliberately suppressed
  // instead of contorting the regex any further.
  // eslint-disable-next-line security/detect-unsafe-regex
  const match = priceHtml.match(/(\d{1,6}(?:[.,]\d{1,2})?)\s*€/);
  return match ? match[1] : undefined;
}

export function transformSouffleContinu(
  raw: SouffleContinuSearchResponse
): AvailabilityResult[] {
  const articles = raw.rs?.articles ?? [];
  return articles
    .filter((a: SouffleContinuArticle) => a.totalStock > 0)
    .map((a) => ({
      shopId: "souffle-continu",
      title: a.titre,
      artist: a.artiste,
      format: a.support,
      price: extractPrice(a.priceHtml),
      currency: "EUR",
      url: a.productUrl,
      status: a.lastCopy ? ("last_copy" as const) : ("in_stock" as const),
    }));
}

export interface SouffleContinuLabelEntry {
  /** Numeric label ID from the href, e.g. "4249" in "/label/4249-blume/" -- needed for fetchSouffleContinuLabelArticleCount (see api.ts). */
  id: string;
  /** href of the label detail page, as found in the markup (can be absolute or relative). */
  href: string;
}

// Looks in the alphabetical label overview page for the link whose text
// matches the searched label name exactly (case-insensitive), and returns
// its href + numeric ID. null when the label is not listed on this letter
// page, or when the href does not match the expected "/label/<id>-<slug>/"
// pattern.
export function findSouffleContinuLabelEntry(html: string, label: string): SouffleContinuLabelEntry | null {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const needle = label.trim().toLowerCase();
  const links = Array.from(doc.querySelectorAll('a[href*="/label/"]'));

  for (const link of links) {
    const text = link.textContent?.trim().toLowerCase() ?? "";
    if (text !== needle) continue;

    const href = link.getAttribute("href");
    if (!href) continue;
    const idMatch = href.match(/\/label\/(\d+)-/);
    if (!idMatch) continue;

    return { id: idMatch[1], href };
  }

  return null;
}
