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

// Für die Label-Suche ("Small Label Suche" in der UI) — verifiziert per
// Recon: es gibt kein Label-Suchfeld, dafür eine alphabetische
// Label-Übersicht unter /labels/<buchstabe>/ (server-gerendertes HTML, ein
// Buchstabe pro Seite, Ziffern-Labels laufen unter "0"). Jeder Eintrag ist
// ein Link auf die eigentliche Label-Detailseite /label/<id>-<slug>/, die
// wiederum alle Releases des Labels auflistet (siehe transform.ts).
export async function fetchSouffleContinuLabelsIndex(letter: string): Promise<string> {
  const res = await fetch(`${PROXY_BASE}/labels/${letter}/`, { headers: { Accept: "text/html" } });
  if (!res.ok) throw new Error(`Soufflé Continu labels index: HTTP ${res.status}`);
  return res.text();
}

// Live-Recon-Korrektur (die ursprüngliche Annahme unten war falsch): die
// Label-Detailseite (/label/<id>-<slug>/) rendert ihre Trefferliste NICHT
// serverseitig und NICHT komplett über das anfangs gefundene
// "renderSelectionCards([...])"-Script -- letzteres ist nur ein gedeckeltes
// "Notre sélection"-Vorschau-Widget (bei "Souffle Continu Records", einem
// Label mit nachweislich 90 Treffern, enthielt dieses Script trotzdem nur 12
// Einträge). Die echte, vollständige Trefferliste holt die Seite per
// performance.getEntriesByType("resource") nachweislich per XHR nach:
//   GET /rest-api/shop/articles/?offset=0&row_count=<n>&label=<numerische ID>
//   -> { rs: { count, articles: [...], ... } } -- "count" ist die ECHTE
//   Gesamtzahl, unabhängig vom angefragten row_count (mit row_count=1
//   verifiziert: "count":90 trotz nur 1 zurückgegebenem Artikel). Exakt
//   dasselbe Endpoint-Muster wie searchSouffleContinu oben, nur mit "label="
//   statt "search=" als Filter-Parameter.
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
