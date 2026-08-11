export type Format = "All" | "Vinyl" | "CD" | "Cassette" | "Download";
/** Format values selectable individually as a checkbox (without "All"). */
export type SelectableFormat = Exclude<Format, "All">;

export type ShopGroup = "pickup-berlin" | "mail-order";

/**
 * fast – normal HTTP search (nginx proxy with header spoofing), result
 *        typically in < 1s.
 * slow – every search navigates live through a Camoufox browser (see
 *        sidecar/), because the shop's bot protection cannot be bypassed
 *        with simple HTTP requests (e.g. HHV: the cookie is bound to the
 *        TLS fingerprint of the connection that fetched it).
 *        Considerably slower (browser startup + solving the challenge).
 */
export type ShopSpeed = "fast" | "slow";

/**
 * All statuses a hit can have, IF it is orderable at all. Sold out /
 * unavailable formats are not returned as hits by the adapters in the
 * first place (see checkAvailability) — so there is deliberately no
 * "sold_out" status here.
 *
 *   in_stock   – normally in stock / ships immediately
 *   preorder   – pre-order, release/shipping lies in the future
 *   processing – orderable, but not (yet) in stock; delivery time
 *                uncertain (e.g. SoundOhm's "in process of stocking")
 *   last_copy  – in stock, but only (one) last copy left
 */
export type AvailabilityStatus = "in_stock" | "preorder" | "processing" | "last_copy";

export interface AvailabilityResult {
  /** ID of the shop adapter, e.g. "hard-wax" */
  shopId: string;
  /** Display name of the title, as supplied by the shop */
  title: string;
  /** Artist/band, if supplied separately by the shop */
  artist?: string;
  /** Format label as supplied by the shop, e.g. "2LP", "CD", "Cassette" */
  format?: string;
  price?: string;
  currency?: string;
  /** Direct link to the product/search result in the shop */
  url?: string;
  status: AvailabilityStatus;
}

/**
 * Result of a label search (see checkLabelAvailability) -- unlike the normal
 * artist/title search, the hit list itself is NOT displayed here (for large
 * labels it can run into four digits), only the number of hits per shop plus
 * a jump-off link to the shop's own corresponding page -- the user verifies
 * and browses further there.
 *
 *   supported: false -- the shop has no usable way to search/filter by
 *              label (see Recon: Bis Aufs Messer). count/url then do not
 *              exist in the first place.
 *   supported: true, count: 0 -- the shop supports label search, but does
 *              not carry this label (e.g. Souffle Continu for most small
 *              US labels). url in this case points at the next best
 *              overview page (e.g. the alphabetical label directory), not
 *              at a 404 detail page.
 */
export type LabelSearchResult =
  | { supported: false }
  | { supported: true; count: number; url: string };

export interface ShopAdapter {
  /** e.g. "hard-wax" */
  id: string;
  /** e.g. "Hard Wax" */
  name: string;
  /** Country of the shop, e.g. "DE", "FR", "GB", "IT" */
  country: string;
  /** "pickup-berlin" for the 4 Berlin shops, "mail-order" for the rest */
  group: ShopGroup;
  /** "fast" (normal HTTP search) or "slow" (full Camoufox browser navigation per search) */
  speed: ShopSpeed;
  /** Homepage URL, also the fallback link if a hit has no URL of its own */
  homeUrl: string;
  /** Path to a logo under /public/logos/ (optional, as long as there is none) */
  logoUrl?: string;
  /**
   * official-api    – publicly documented API
   * unofficial-api   – publicly reachable JSON endpoints that are not
   *                    officially documented for third-party use
   * scraping         – HTML result pages are parsed
   */
  type: "official-api" | "unofficial-api" | "scraping";
  /**
   * Searches for a title in the shop and returns all hits found together
   * with their availability status. `format` is a hint filter, not every
   * adapter can apply it server-side — when in doubt, filter again on the
   * client.
   */
  checkAvailability: (
    artist: string,
    title: string,
    format?: Format
  ) => Promise<AvailabilityResult[]>;
  /**
   * Label search (see "Small Label Suche" in the UI) -- optional, because
   * not every shop offers a usable way to search/filter by label (see
   * Recon: Bis Aufs Messer has no such function at all, there this field
   * simply stays undefined -- the UI then shows "nicht unterstützt",
   * entirely without extra error handling).
   */
  checkLabelAvailability?: (label: string) => Promise<LabelSearchResult>;
}
