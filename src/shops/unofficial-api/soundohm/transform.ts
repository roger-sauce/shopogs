import type { AvailabilityResult, AvailabilityStatus } from "../../../types/shop";
import type { SoundOhmSearchResponse } from "./api";

// `preorder` is usually null (regularly in stock). Verified by recon:
// preorder:"stocking" -> the product page literally shows "In process of
// stocking" (orderable, but delivery time uncertain, can take weeks or
// months). Other, non-null preorder values we treat conservatively as a
// real preorder.
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
      // Product URL pattern verified: /product/<slug> (e.g.
      // /product/thresholds-lp-clear), matches the slug from the API exactly.
      url: `https://www.soundohm.com/product/${p.slug}`,
      status: statusFor(p.preorder),
    }));
}

// Counts the hits on a label index page (/label/<slug>).
// Verified by recon: every listed release sits in an element
// with the class "product" (same markup pattern as the normal
// search result list).
export function countSoundOhmLabelProducts(html: string): number {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.querySelectorAll(".product").length;
}
