import type { AvailabilityResult, AvailabilityStatus } from "../../../types/shop";

// The product page contains a <script type="application/ld+json"> with a
// schema.org Product object -- every format (MP3/FLAC/WAV/Vinyl/...) is its
// own "Offer" with name/price/currency/availability. Considerably more
// robust than scraping CSS classes, and it delivers all formats in one go
// instead of separate in-stock/out-of-stock page requests as in the old
// (by now outdated) Recon.
interface BoomkatOffer {
  name?: string;
  price?: number;
  priceCurrency?: string;
  /** schema.org URL, e.g. "https://schema.org/InStock" */
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
  // Other values (e.g. OutOfStock, Discontinued) -> deliberately no entry,
  // so no hit (see below).
};

// "MP3 Release" -> "MP3", "FLAC Release" -> "FLAC" etc. -- "Limited Edition
// LP" has no such suffix and stays unchanged (classifyFormat recognises
// "LP" as a substring anyway).
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
    if (!status) return []; // sold out / unknown status -> no hit

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

// One entry from the artist overview page /artists/<slug> -- artist, title
// and product link straight out of the grid markup (li.product_item), no
// stock info (checkAvailability fetches that separately via the product
// page, just as it does for the autocomplete hits).
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

// Counts the distinct product links on a label overview page
// (/labels/<slug>). Counted on href rather than li.product_item, because a
// release could in theory appear several times in the grid (e.g. vinyl +
// digital as separate tiles) -- a Set over the product path deduplicates
// that back to a release count.
export function countBoomkatLabelProducts(html: string): number {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const hrefs = Array.from(doc.querySelectorAll('a[href*="/products/"]'))
    .map((a) => a.getAttribute("href"))
    .filter((href): href is string => Boolean(href));
  return new Set(hrefs).size;
}
