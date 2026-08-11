import { proxyBase } from "../../../lib/proxyBase";

// Bis Aufs Messer (bisaufsmesser.com) — runs on Shopify.
// Verified by recon: GET /search/suggest.json?q=<title>&resources[type]=product
// returns resources.results.products[] including available (boolean) and price.
// Public Shopify Storefront endpoint, no login needed.
const PROXY_BASE = proxyBase("bisaufsmesser");

export interface ShopifySuggestProduct {
  title: string;
  url: string;
  price: string;
  available: boolean;
  vendor?: string;
  image?: string;
  // Shopify product type, e.g. "Vinyl", "Tapes" — verified by recon as a
  // reliable format signal (was missing from our type before even though the
  // API returns it -> the format field was always empty until now).
  type?: string;
  tags?: string[];
}

export interface ShopifySuggestResponse {
  resources: {
    results: {
      products: ShopifySuggestProduct[];
    };
  };
}

export async function searchBisAufsMesser(query: string): Promise<ShopifySuggestResponse> {
  const url = `${PROXY_BASE}/search/suggest.json?q=${encodeURIComponent(
    query
  )}&resources[type]=product&resources[limit]=10`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Bis Aufs Messer search: HTTP ${res.status}`);
  return res.json();
}
