import type { AvailabilityResult, AvailabilityStatus } from "../../../types/shop";

// Every parser in this file anchors on one thing: a link whose path runs
// through /releases/. That is deliberate.
//
// Before the October 2026 relaunch the markup carried semantic classes --
// li.product_item, .release__artist, .release__title -- and all three were
// gone overnight, replaced by Tailwind utilities like
// "leading-tight text-lg font-semibold truncate". Those will change again
// the next time someone touches the design. The URL shape is what the shop
// cannot rename without breaking its own links.

const STATUS_BY_AVAILABILITY: Partial<Record<string, AvailabilityStatus>> = {
  "https://schema.org/InStock": "in_stock",
  "https://schema.org/PreOrder": "preorder",
  "https://schema.org/LimitedAvailability": "last_copy",
  // Other values (e.g. OutOfStock, Discontinued) -> deliberately no entry,
  // so no hit (see below).
};

const RELEASE_PATH = /\/releases\//;

// --- Structured data ------------------------------------------------------

// The product page still carries a <script type="application/ld+json">, but
// the relaunch rewrapped it:
//
//   { "@context": ..., "@graph": [ { "@type": "ProductGroup",
//       "hasVariant": [ { "@type": "Product", "offers": ... }, ... ] } ] }
//
// Before, every format was an offer directly on the top-level object. Asking
// for `offers` up there now finds nothing -- which is what a dead adapter
// looks like from the outside: no error, no hits.
interface LdOffer {
  price?: string | number;
  priceCurrency?: string;
  availability?: string;
  url?: string;
}

interface LdProduct {
  "@type"?: string;
  name?: string;
  url?: string;
  category?: string;
  additionalProperty?: { name?: string; value?: string } | { name?: string; value?: string }[];
  offers?: LdOffer | LdOffer[];
}

interface LdNode extends LdProduct {
  "@graph"?: LdNode[];
  hasVariant?: LdProduct | LdProduct[];
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

// Collects every Product the page describes, no matter how deeply the shop
// decides to nest them next time: walk @graph, walk hasVariant, keep what
// calls itself a Product.
function collectProducts(nodes: LdNode[]): LdProduct[] {
  return nodes.flatMap((node) => {
    const nested = [...asArray(node["@graph"]), ...(asArray(node.hasVariant) as LdNode[])];
    const self = node["@type"] === "Product" ? [node] : [];
    return [...self, ...collectProducts(nested)];
  });
}

// The format now has a field of its own:
//   "additionalProperty": { "name": "Format", "value": "2LP (Black Vinyl)" }
// Richer than the old offer name ever was -- "12\" (Black Vinyl)" instead of
// "Limited Edition LP". The fallback reads the tail of the product name
// ("Burial - Untrue - CD"), which carries the same string.
function formatOf(product: LdProduct): string | undefined {
  const property = asArray(product.additionalProperty).find(
    (p) => p?.name?.toLowerCase() === "format"
  );
  if (property?.value) return property.value;

  const parts = product.name?.split(" - ") ?? [];
  return parts.length > 1 ? parts[parts.length - 1].trim() : undefined;
}

// One hit per format, not per offer.
//
// A download now arrives as a single Product named "Download" carrying
// several nameless offers -- £6.99 and £7.99 for one release, presumably
// lossy and lossless. The old markup named them (MP3/FLAC/WAV); the new one
// does not, and inventing those names back would be guessing. So the
// cheapest orderable offer per format wins, and the list says "Download"
// once instead of twice.
function cheapestOffer(offers: LdOffer[]): LdOffer | undefined {
  const orderable = offers.filter((o) => o.availability && STATUS_BY_AVAILABILITY[o.availability]);
  if (orderable.length === 0) return undefined;

  return orderable.reduce((best, offer) =>
    Number(offer.price ?? Infinity) < Number(best.price ?? Infinity) ? offer : best
  );
}

export function transformBoomkatProductPage(
  html: string,
  artist: string | undefined,
  title: string,
  productUrl: string
): AvailabilityResult[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const scripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));

  const nodes = scripts.flatMap((script) => {
    if (!script.textContent) return [];
    try {
      return [JSON.parse(script.textContent) as LdNode];
    } catch {
      // A single malformed block must not cost us the other one -- the page
      // ships two, and the breadcrumb is of no use to us anyway.
      return [];
    }
  });

  return collectProducts(nodes).flatMap((product) => {
    const offer = cheapestOffer(asArray(product.offers));
    if (!offer?.availability) return [];

    const status = STATUS_BY_AVAILABILITY[offer.availability];
    if (!status) return []; // sold out / unknown status -> no hit

    return [
      {
        shopId: "boomkat",
        title,
        artist,
        format: formatOf(product),
        price: offer.price === undefined ? undefined : Number(offer.price).toFixed(2),
        currency: offer.priceCurrency,
        url: offer.url ?? product.url ?? productUrl,
        status,
      },
    ];
  });
}

// --- Markup ---------------------------------------------------------------

/** A release as the search or an overview page names it. */
export interface BoomkatReleaseEntry {
  artist: string;
  title: string;
  url: string;
}

// The artist belongs to the same tile as the release link, but there is no
// element to hang that on any more -- so walk up a few levels and take the
// first artist link that is not itself a release link. Five levels is more
// than the current markup needs and less than the whole page.
function artistNear(link: Element): string {
  let node: Element | null = link;

  for (let depth = 0; depth < 5 && node; depth += 1, node = node.parentElement) {
    const candidate = Array.from(node.querySelectorAll('a[href^="/artists/"]')).find((a) => {
      const href = a.getAttribute("href") ?? "";
      return !RELEASE_PATH.test(href) && (a.textContent?.trim().length ?? 0) > 0;
    });
    if (candidate?.textContent) return candidate.textContent.trim();
  }

  return "";
}

// Every tile in a grid links to its release twice: once from the cover
// image, once from the title. They are told apart by text -- the image link
// wraps a <picture> and has none. Which is also why a raw count of release
// links on an artist page comes out at twice the number of records.
//
// Deliberately NOT "has no <img> inside": the rows of the keyword search
// carry their thumbnail inside the very link that holds the title, and that
// rule silently threw away every search hit.
function releaseLinksWithText(doc: Document): Element[] {
  return Array.from(doc.querySelectorAll("a[href]")).filter((a) => {
    const href = a.getAttribute("href") ?? "";
    return RELEASE_PATH.test(href) && (a.textContent?.trim().length ?? 0) > 0;
  });
}

/**
 * The keyword search (/api/search/keywords) answers with bare <li> rows:
 * artists, releases and a final link to the full search page, mixed. Only
 * the release rows are of interest here, and they identify themselves by
 * their href rather than by the "Release" label next to them -- the href is
 * what we need anyway.
 *
 * Their <h3> holds artist and title in one string, "Burial - Untrue". Split
 * at the FIRST " - ": a title may well contain another one
 * ("Dreamfear / Boy Sent From Above" does not, "Comafields / Imaginary
 * Festival" does not either, but "Untrue - Remastered" would), while an
 * artist name that contains " - " has not been seen.
 */
export function parseBoomkatKeywordResults(html: string): BoomkatReleaseEntry[] {
  const doc = new DOMParser().parseFromString(html, "text/html");

  return releaseLinksWithText(doc).flatMap((link) => {
    const href = link.getAttribute("href");
    if (!href) return [];

    const heading = link.querySelector("h3")?.textContent ?? link.textContent ?? "";
    const combined = heading.replace(/\s+/g, " ").trim();
    if (!combined) return [];

    const separator = combined.indexOf(" - ");
    const artist = separator > 0 ? combined.slice(0, separator).trim() : "";
    const title = separator > 0 ? combined.slice(separator + 3).trim() : combined;

    return [{ artist, title, url: href }];
  });
}

/**
 * The artist overview page /artists/<slug> -- unlike the keyword search it
 * lists the artist's releases in full. Artist, title and link come straight
 * out of the grid; stock is fetched separately per release page, as before.
 */
export function parseBoomkatArtistPage(html: string): BoomkatReleaseEntry[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const seen = new Set<string>();

  return releaseLinksWithText(doc).flatMap((link) => {
    const href = link.getAttribute("href");
    const title = link.textContent?.replace(/\s+/g, " ").trim();
    if (!href || !title || seen.has(href)) return [];
    seen.add(href);

    return [{ artist: artistNear(link), title, url: href }];
  });
}

// Counts the distinct releases on a label overview page (/labels/<slug>).
// Counted on the href rather than on tiles, because a release appears twice
// per tile (cover and title) and could in theory appear in several tiles --
// a Set over the release path deduplicates that back to a release count.
export function countBoomkatLabelProducts(html: string): number {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const hrefs = Array.from(doc.querySelectorAll("a[href]"))
    .map((a) => a.getAttribute("href"))
    .filter((href): href is string => Boolean(href) && RELEASE_PATH.test(href as string));
  return new Set(hrefs).size;
}
