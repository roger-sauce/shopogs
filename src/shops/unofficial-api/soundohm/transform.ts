import type { AvailabilityResult, AvailabilityStatus } from "../../../types/shop";
import type { SoundOhmSearchResponse } from "./api";

// `preorder` ist meist null (regulär auf Lager). Verifiziert per Recon:
// preorder:"stocking" -> Produktseite zeigt wörtlich "In process of
// stocking" (bestellbar, aber Lieferzeit ungewiss, kann Wochen/Monate
// dauern). Andere, nicht-null Preorder-Werte behandeln wir konservativ als
// echte Vorbestellung.
function statusFor(preorder: string | null): AvailabilityStatus {
  if (preorder === "stocking") return "processing";
  if (preorder) return "preorder";
  return "in_stock";
}

export function transformSoundOhm(raw: SoundOhmSearchResponse): AvailabilityResult[] {
  const products = raw.result?.products ?? [];
  return products
    .filter((p) => p.is_in_stock)
    .map((p) => ({
      shopId: "soundohm",
      title: p.title,
      artist: p.artist_info?.map((a) => a.name).join(", "),
      format: p.format_info ?? p.kind,
      price: p.price,
      currency: "EUR",
      // Produkt-URL-Muster verifiziert: /product/<slug> (z.B.
      // /product/thresholds-lp-clear), stimmt exakt mit slug aus der API.
      url: `https://www.soundohm.com/product/${p.slug}`,
      status: statusFor(p.preorder),
    }));
}

// Zählt die Treffer auf einer Label-Übersichtsseite (/label/<slug>).
// Verifiziert per Recon: jedes gelistete Release steckt in einem Element
// mit der Klasse "product" (gleiches Markup-Muster wie die normale
// Suchergebnisliste).
export function countSoundOhmLabelProducts(html: string): number {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.querySelectorAll(".product").length;
}
