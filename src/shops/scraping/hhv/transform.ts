import type { AvailabilityResult, AvailabilityStatus } from "../../../types/shop";

// Besides "add_to_cart", the cart button carries a state modifier class that
// reveals which of the several button texts (all present in the HTML, shown
// and hidden via CSS) is currently visible:
//   default                -> "In den Warenkorb"  (available, in stock)
//   sold_out                -> "Ausverkauft"                -> hide
//   temp_sold_out            -> "Derzeit nicht lieferbar"     -> hide
//   coming_soon              -> "Coming Soon" (pre-order)     -> preorder
//   not_enough_bonus_coins    -> special case (bonus-coin purchase), not
//                                regularly buyable -> hide
const STATUS_BY_STATE: Partial<Record<string, AvailabilityStatus>> = {
  default: "in_stock",
  coming_soon: "preorder",
};

export function transformHhvListEntry(html: string, articleId: string): AvailabilityResult | null {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const title = doc.querySelector(".title")?.textContent?.trim();
  if (!title) return null;

  const artist = doc.querySelector(".artist")?.textContent?.trim();
  const format = doc.querySelector(".format_label .format")?.textContent?.trim();
  const priceRaw = doc.querySelector(".price")?.textContent?.trim();
  const price = priceRaw?.replace("€", "").replace("*", "").trim();

  const cartEl = doc.querySelector(".add_to_cart");
  const state = (cartEl?.className.split(/\s+/) ?? []).find((c) =>
    ["default", "sold_out", "temp_sold_out", "coming_soon", "not_enough_bonus_coins"].includes(c)
  );

  // state is already narrowed against a fixed whitelist (.find(...includes(c)))
  // above, so it can only be one of the known cart states.
  // eslint-disable-next-line security/detect-object-injection
  const status = state ? STATUS_BY_STATE[state] : undefined;
  if (!status) return null; // sold out / not regularly buyable -> no hit

  const href = doc.querySelector("a.row_1")?.getAttribute("href") ?? undefined;

  return {
    shopId: "hhv",
    title,
    artist,
    format,
    price,
    currency: "EUR",
    url:
      href
        ? href.startsWith("http")
          ? href
          : `https://www.hhv.de${href.startsWith("/") ? "" : "/"}${href}`
        : `https://www.hhv.de/lazy/artikel/${articleId}`,
    status,
  };
}

// Looks on the catalogue search page for an element with data-title whose
// value matches the searched label name exactly (case-insensitive), and
// returns the associated data-path -- that is the link to the label-filtered
// result list. According to recon, data-title/data-path can sit on the same
// element or on a nearby ancestor, so the element itself is checked first and
// then the closest ancestor carrying data-path.
export function findHhvLabelDataPath(html: string, label: string): string | null {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const needle = label.trim().toLowerCase();
  const titleEls = Array.from(doc.querySelectorAll("[data-title]"));

  for (const el of titleEls) {
    const title = el.getAttribute("data-title")?.trim().toLowerCase() ?? "";
    if (title !== needle) continue;

    const direct = el.getAttribute("data-path");
    if (direct) return direct;

    const ancestor = el.closest("[data-path]");
    if (ancestor) return ancestor.getAttribute("data-path");
  }

  return null;
}

// Reads the hit count from the label-filtered result list. Verified by recon:
// the page shows a heading in the pattern "<N> Artikel".
export function extractHhvArticleCount(html: string): number {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const match = (doc.body?.textContent ?? "").match(/(\d+)\s*Artikel/i);
  return match ? parseInt(match[1], 10) : 0;
}
