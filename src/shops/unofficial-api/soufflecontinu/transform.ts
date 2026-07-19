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

export interface SouffleContinuLabelEntry {
  /** Numerische Label-ID aus der href, z.B. "4249" bei "/label/4249-blume/" -- wird für fetchSouffleContinuLabelArticleCount gebraucht (siehe api.ts). */
  id: string;
  /** href der Label-Detailseite, wie im Markup vorgefunden (kann absolut oder relativ sein). */
  href: string;
}

// Sucht in der alphabetischen Label-Übersichtsseite den Link, dessen Text
// exakt dem gesuchten Label-Namen entspricht (case-insensitive), und gibt
// dessen href + numerische ID zurück. null, wenn das Label auf dieser
// Buchstaben-Seite nicht gelistet ist, oder die href nicht dem erwarteten
// "/label/<id>-<slug>/"-Muster entspricht.
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
