import type { AvailabilityResult } from "../../../types/shop";
import type { ShopifySuggestResponse } from "./api";

// "Sold out" = available:false -> no hit. Explicit preorders additionally
// carry a "Pre order" tag (verified by recon, e.g. "LIIEK - Living In A
// Fiction LP PRE ORDER"), otherwise there is no preorder concept.
function isPreorder(p: { title: string; tags?: string[] }): boolean {
  const inTags = p.tags?.some((t) => /pre.?order/i.test(t)) ?? false;
  const inTitle = /pre.?order/i.test(p.title);
  return inTags || inTitle;
}

export function transformBisAufsMesser(raw: ShopifySuggestResponse): AvailabilityResult[] {
  const products = raw.resources?.results?.products ?? [];
  return products
    .filter((p) => p.available)
    .map((p) => ({
      shopId: "bis-aufs-messer",
      title: p.title,
      artist: p.vendor,
      format: p.type,
      price: p.price,
      currency: "EUR",
      url: p.url?.startsWith("http") ? p.url : `https://bisaufsmesser.com${p.url}`,
      status: isPreorder(p) ? ("preorder" as const) : ("in_stock" as const),
    }));
}
