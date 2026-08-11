import { proxyBase } from "../../../lib/proxyBase";

// Soufflé Continu (soufflecontinu.com) — the result list of the search page is
// NOT rendered server-side. The page only loads an empty HTML skeleton
// (<div class="cardContainer"></div>), the actual hits are fetched by client JS
// via AJAX afterwards (see shop.js: `new DisplayArticles(...)` -> `backendCall()`).
// Verified by recon (XHR capture in the browser):
//   GET /rest-api/shop/articles/?offset=0&count=<n>&search=<term>
//   -> { rs: { articles: [...], pages, translations, ... } } as JSON.
const PROXY_BASE = proxyBase("soufflecontinu");

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

// For the label search ("Small Label Suche" in the UI) — verified by
// recon: there is no label search field, but there is an alphabetical
// label index under /labels/<letter>/ (server-rendered HTML, one
// letter per page, labels starting with a digit live under "0"). Each entry is
// a link to the actual label detail page /label/<id>-<slug>/, which
// in turn lists all releases of the label (see transform.ts).
export async function fetchSouffleContinuLabelsIndex(letter: string): Promise<string> {
  const res = await fetch(`${PROXY_BASE}/labels/${letter}/`, { headers: { Accept: "text/html" } });
  if (!res.ok) throw new Error(`Soufflé Continu labels index: HTTP ${res.status}`);
  return res.text();
}

// Live recon correction (the original assumption below was wrong): the
// label detail page (/label/<id>-<slug>/) does NOT render its result list
// server-side and NOT completely via the initially discovered
// "renderSelectionCards([...])" script -- the latter is only a capped
// "Notre sélection" preview widget (for "Souffle Continu Records", a
// label with a demonstrable 90 hits, that script still contained only 12
// entries). The real, complete result list is fetched by the page via
// XHR, as demonstrated by performance.getEntriesByType("resource"):
//   GET /rest-api/shop/articles/?offset=0&row_count=<n>&label=<numeric ID>
//   -> { rs: { count, articles: [...], ... } } -- "count" is the REAL
//   total, independent of the requested row_count (verified with
//   row_count=1: "count":90 despite only 1 article returned). Exactly
//   the same endpoint pattern as searchSouffleContinu above, just with "label="
//   instead of "search=" as the filter parameter.
export interface SouffleContinuLabelArticlesResponse {
  rs: { count: number };
}

export async function fetchSouffleContinuLabelArticleCount(labelId: string): Promise<number> {
  const url = `${PROXY_BASE}/rest-api/shop/articles/?offset=0&row_count=1&label=${encodeURIComponent(
    labelId
  )}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Soufflé Continu label article count: HTTP ${res.status}`);
  const data: SouffleContinuLabelArticlesResponse = await res.json();
  return data.rs?.count ?? 0;
}
