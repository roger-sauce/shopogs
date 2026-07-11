// Bis Aufs Messer (bisaufsmesser.com) — läuft auf Shopify.
// Verifiziert per Recon: GET /search/suggest.json?q=<titel>&resources[type]=product
// liefert resources.results.products[] inkl. available (Boolean) und price.
// Öffentlicher Shopify-Storefront-Endpoint, kein Login nötig.
const PROXY_BASE = "/proxy/bisaufsmesser";

export interface ShopifySuggestProduct {
  title: string;
  url: string;
  price: string;
  available: boolean;
  vendor?: string;
  image?: string;
  // Shopify-Produkttyp, z.B. "Vinyl", "Tapes" — verifiziert per Recon als
  // zuverlässiges Format-Signal (fehlte vorher in unserem Type, obwohl die
  // API es liefert -> Format-Feld war bisher immer leer).
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
