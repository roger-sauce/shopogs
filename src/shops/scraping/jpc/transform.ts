import type { AvailabilityResult, AvailabilityStatus } from "../../../types/shop";

// Verifiziert per Recon: jedes Suchergebnis ist ein Element mit
// id="result-searchng-product-<id>". Relevante Kind-Elemente (stabile
// Klassennamen, kein Hash-Wirrwarr wie bei Hard Wax):
//   .by           -> Artist
//   .title        -> Titel
//   .availability -> Verfügbarkeitstext (enthält zusätzlich einen
//                    Info-Button, der vor dem Textauslesen entfernt wird)
//   .medium       -> Format, z.B. "3 CDs", "LP", "Single 12\"", "Buch"
//   .price        -> Preis, z.B. "EUR 24,99* Aktueller Preis: EUR 24,99"
//   h3 a[href]    -> Link zur Produktseite (relativ)
//
// Verfügbarkeits-Filter der Suche selbst (aus der Sidebar ausgelesen)
// zeigt: Ergebnisse sind ausschließlich "Artikel am Lager" oder "lieferbar
// innerhalb von X Tagen/Wochen" — JPC listet also, wie Hard Wax, nur
// bestellbare Artikel in der Suche. Es gibt keine "ausverkauft"-Treffer.
function statusFor(availText: string | null): AvailabilityStatus {
  if (!availText) return "processing";
  if (availText.toLowerCase().includes("am lager")) return "in_stock";
  // "lieferbar innerhalb von 3 Tagen/einer Woche/1-2 Wochen/..." — bestellbar,
  // aber nicht sofort auf Lager.
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
