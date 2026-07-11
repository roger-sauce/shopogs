// Soufflé Continu (soufflecontinu.com) — die Trefferliste der Such-Seite wird
// NICHT serverseitig gerendert. Die Seite lädt nur ein leeres HTML-Grundgerüst
// (<div class="cardContainer"></div>), die echten Treffer holt Client-JS erst
// per AJAX nach (siehe shop.js: `new DisplayArticles(...)` -> `backendCall()`).
// Verifiziert per Recon (XHR-Mitschnitt im Browser):
//   GET /rest-api/shop/articles/?offset=0&count=<n>&search=<begriff>
//   -> { rs: { articles: [...], pages, translations, ... } } als JSON.
const PROXY_BASE = "/proxy/soufflecontinu";

export interface SouffleContinuArticle {
  ean: string;
  artiste: string;
  titre: string;
  support: string;
  occasion: boolean;
  totalStock: number;
  lastCopy: boolean;
  backInStock: boolean;
  inSales: boolean;
  soldeRemise: number | null;
  priceHtml: string;
  productUrl: string;
  cartUrl: string;
}

export interface SouffleContinuSearchResponse {
  rs: {
    articles: SouffleContinuArticle[];
    pages: number;
    translations: Record<string, string>;
  };
}

export async function searchSouffleContinu(
  query: string
): Promise<SouffleContinuSearchResponse> {
  const url = `${PROXY_BASE}/rest-api/shop/articles/?offset=0&count=50&search=${encodeURIComponent(
    query
  )}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Soufflé Continu search: HTTP ${res.status}`);
  return res.json();
}
