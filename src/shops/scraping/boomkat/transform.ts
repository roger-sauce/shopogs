import type { AvailabilityResult, AvailabilityStatus } from "../../../types/shop";

// Die Produktseite enthält ein <script type="application/ld+json"> mit
// einem schema.org-Product-Objekt -- jedes Format (MP3/FLAC/WAV/Vinyl/...)
// ist ein eigenes "Offer" mit Name/Preis/Währung/Verfügbarkeit. Deutlich
// robuster als CSS-Klassen zu scrapen, und liefert alle Formate in einem
// Rutsch statt separater in-stock/out-of-stock-Seitenaufrufe wie in der
// alten (inzwischen überholten) Recon.
interface BoomkatOffer {
  name?: string;
  price?: number;
  priceCurrency?: string;
  /** schema.org-URL, z.B. "https://schema.org/InStock" */
  availability?: string;
  url?: string;
}

interface BoomkatProductJsonLd {
  name?: string;
  url?: string;
  offers?: BoomkatOffer[];
}

const STATUS_BY_AVAILABILITY: Partial<Record<string, AvailabilityStatus>> = {
  "https://schema.org/InStock": "in_stock",
  "https://schema.org/PreOrder": "preorder",
  "https://schema.org/LimitedAvailability": "last_copy",
  // Andere Werte (z.B. OutOfStock, Discontinued) -> bewusst kein Eintrag,
  // also kein Treffer (siehe unten).
};

// "MP3 Release" -> "MP3", "FLAC Release" -> "FLAC" usw. -- "Limited Edition
// LP" hat keinen solchen Suffix und bleibt unverändert (classifyFormat
// erkennt "LP" als Teilstring ohnehin).
function cleanFormatName(name: string | undefined): string | undefined {
  return name?.replace(/\s+Release$/i, "").trim();
}

export function transformBoomkatProductPage(
  html: string,
  artist: string | undefined,
  title: string,
  productUrl: string
): AvailabilityResult[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const scriptEl = doc.querySelector('script[type="application/ld+json"]');
  if (!scriptEl?.textContent) return [];

  let data: BoomkatProductJsonLd;
  try {
    data = JSON.parse(scriptEl.textContent);
  } catch {
    return [];
  }

  const offers = data.offers ?? [];
  return offers.flatMap((offer) => {
    const status = offer.availability ? STATUS_BY_AVAILABILITY[offer.availability] : undefined;
    if (!status) return []; // ausverkauft / unbekannter Status -> kein Treffer

    return [
      {
        shopId: "boomkat",
        title,
        artist,
        format: cleanFormatName(offer.name),
        price: offer.price?.toFixed(2),
        currency: offer.priceCurrency,
        url: offer.url ?? productUrl,
        status,
      },
    ];
  });
}

// Ein Eintrag aus der Artist-Übersichtsseite /artists/<slug> -- Artist,
// Titel und Produktlink direkt aus dem Grid-Markup (li.product_item),
// keine Stock-Info (die holt sich checkAvailability separat über die
// Produktseite, wie bei den Autocomplete-Treffern auch).
export interface BoomkatArtistPageEntry {
  artist: string;
  title: string;
  url: string;
}

export function parseBoomkatArtistPage(html: string): BoomkatArtistPageEntry[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const items = Array.from(doc.querySelectorAll("li.product_item"));

  return items.flatMap((li) => {
    const link = li.querySelector<HTMLAnchorElement>("a[href^='/products/']");
    const artistEl = li.querySelector(".release__artist");
    const titleEl = li.querySelector(".release__title");
    const href = link?.getAttribute("href");
    if (!href || !artistEl?.textContent || !titleEl?.textContent) return [];

    return [
      {
        artist: artistEl.textContent.trim(),
        title: titleEl.textContent.trim(),
        url: href,
      },
    ];
  });
}
