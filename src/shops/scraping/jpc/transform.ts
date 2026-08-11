import type { AvailabilityResult, AvailabilityStatus } from "../../../types/shop";

// Verified by recon: every search result is an element with
// id="result-searchng-product-<id>". Relevant child elements (stable class
// names, no hash muddle like with Hard Wax):
//   .by           -> artist
//   .title        -> title
//   .availability -> availability text (additionally contains an info
//                    button, which is removed before reading the text)
//   .medium       -> format, e.g. "3 CDs", "LP", "Single 12\"", "Buch"
//   .price        -> price, e.g. "EUR 24,99* Aktueller Preis: EUR 24,99"
//   h3 a[href]    -> link to the product page (relative)
//
// The availability filter of the search itself (read out of the sidebar)
// shows: results are exclusively "Artikel am Lager" or "lieferbar innerhalb
// von X Tagen/Wochen" — so JPC, like Hard Wax, only lists orderable
// articles in the search. There are no "sold out" hits.
function statusFor(availText: string | null): AvailabilityStatus {
  if (!availText) return "processing";
  if (availText.toLowerCase().includes("am lager")) return "in_stock";
  // "lieferbar innerhalb von 3 Tagen/einer Woche/1-2 Wochen/..." — orderable,
  // but not immediately in stock.
  return "processing";
}

function extractPrice(priceText: string): string | undefined {
  const match = priceText.match(/EUR\s*([\d.,]+)/);
  return match ? match[1].replace(",", ".") : undefined;
}

export function transformJpc(html: string): AvailabilityResult[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const cards = Array.from(doc.querySelectorAll('[id^="result-searchng-product-"]'));

  const results: AvailabilityResult[] = [];

  for (const card of cards) {
    const title = card.querySelector(".title")?.textContent?.trim();
    if (!title) continue;

    const artist = card.querySelector(".by")?.textContent?.trim();

    const availEl = card.querySelector(".availability");
    let availText: string | null = null;
    if (availEl) {
      const clone = availEl.cloneNode(true) as HTMLElement;
      clone.querySelectorAll("button").forEach((b) => b.remove());
      availText = clone.textContent?.replace(/\s+/g, " ").trim() ?? null;
    }

    const format = card.querySelector(".medium")?.textContent?.replace(/\s+/g, " ").trim();
    const priceText = card.querySelector(".price")?.textContent?.replace(/\s+/g, " ").trim();
    const price = priceText ? extractPrice(priceText) : undefined;

    const href = card.querySelector("h3 a")?.getAttribute("href") ?? undefined;
    const url = href
      ? href.startsWith("http")
        ? href
        : `https://www.jpc.de${href.startsWith("/") ? "" : "/"}${href}`
      : undefined;

    results.push({
      shopId: "jpc",
      title,
      artist,
      format,
      price,
      currency: "EUR",
      url,
      status: statusFor(availText),
    });
  }

  return results;
}

// Reads the hit count from the label-filtered search page. Verified by
// Recon: above the results the page literally shows
// "Ihre Suche ergab <N> Treffer", even when N = 0.
export function extractJpcLabelCount(html: string): number {
  const match = html.match(/Ihre Suche ergab\s*(\d+)/i);
  return match ? parseInt(match[1], 10) : 0;
}
