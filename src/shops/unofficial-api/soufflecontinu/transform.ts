import type { AvailabilityResult } from "../../../types/shop";
import type { SouffleContinuArticle, SouffleContinuSearchResponse } from "./api";

function extractPrice(priceHtml: string): string | undefined {
  // priceHtml sieht z.B. so aus: '<span class="articlePrice">28.90€</span> '
  // Ziffern-Wiederholungen bewusst auf {1,6}/{1,2} begrenzt (statt [\d]+) --
  // keine reale ReDoS-Lücke bei so kurzen Preis-Strings (kein verschachteltes/
  // mehrdeutiges Backtracking). Die security/detect-unsafe-regex-Heuristik
  // zählt aber weiterhin die Quantifier-Konstrukte insgesamt -- bewusst
  // unterdrückt statt den Regex weiter zu verbiegen.
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
