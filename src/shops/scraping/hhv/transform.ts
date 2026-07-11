import type { AvailabilityResult, AvailabilityStatus } from "../../../types/shop";

// Der Warenkorb-Button trägt neben "add_to_cart" eine Zustands-Modifier-Klasse,
// die verrät, welcher der mehreren (alle im HTML vorhandenen, per CSS
// ein-/ausgeblendeten) Button-Texte aktuell sichtbar ist:
//   default                -> "In den Warenkorb"  (verfügbar, auf Lager)
//   sold_out                -> "Ausverkauft"                -> ausblenden
//   temp_sold_out            -> "Derzeit nicht lieferbar"     -> ausblenden
//   coming_soon              -> "Coming Soon" (Vorbestellung) -> preorder
//   not_enough_bonus_coins    -> Sonderfall (Bonus-Coins-Kauf), nicht regulär
//                                kaufbar -> ausblenden
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

  const status = state ? STATUS_BY_STATE[state] : undefined;
  if (!status) return null; // ausverkauft / nicht regulär kaufbar -> kein Treffer

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
