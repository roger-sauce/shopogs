import type { AvailabilityResult } from "../../../types/shop";

// Boomkat-Produktkacheln haben stabile, semantische Klassennamen
// (li.product_item, span.release__artist/__title/__label/__genre).
export function transformBoomkatArtistPage(
  html: string,
  available: boolean
): AvailabilityResult[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const items = Array.from(doc.querySelectorAll("li.product_item"));

  return items.map((item) => {
    const artist = item.querySelector(".release__artist")?.textContent?.trim();
    const title = item.querySelector(".release__title")?.textContent?.trim() ?? "";
    const label = item.querySelector(".release__label")?.textContent?.trim();
    const href = item.querySelector("a")?.getAttribute("href") ?? undefined;
    return {
      shopId: "boomkat",
      title: label ? `${title} (${label})` : title,
      artist,
      url: href
        ? href.startsWith("http")
          ? href
          : `https://boomkat.com${href}`
        : undefined,
      status: available ? "in_stock" : "preorder",
    };
  });
}
