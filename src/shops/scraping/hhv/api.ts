// HHV (hhv.de) — Custom-Backend (Turbo/Hotwire). Die Katalog-Suchseite lädt
// jedes Ergebnis als einzelnes lazy-loaded Turbo-Frame nach (Platzhalter mit
// `src="/lazy/artikel/<id>/list_entry"` steht aber bereits im initialen
// HTML-Response — das war der entscheidende Fund bei der zweiten Recon-Runde,
// nachdem ein einfacher fetch() der Katalogseite zunächst KEINE Ergebnisse
// zu enthalten schien).
//
// Ablauf:
//   1) GET /records/katalog/filter/suche-D2N2S11?term=<begriff>
//      -> enthält für jeden Treffer ein Turbo-Frame mit
//         src="/lazy/artikel/<id>/list_entry"
//   2) Für jede Artikel-ID: GET /lazy/artikel/<id>/list_entry
//      -> server-gerendertes Fragment mit Artist/Titel/Format/Preis und dem
//         Warenkorb-Button, dessen Modifier-Klasse den Lagerstatus verrät
//         (siehe transform.ts).
const PROXY_BASE = "/proxy/hhv";
const DEFAULT_FACET = "D2N2S11";
const MAX_ARTICLES = 20; // Begrenzung, um nicht zu viele Einzel-Requests zu feuern

export async function searchHhvArticleIds(query: string): Promise<string[]> {
  const url = `${PROXY_BASE}/records/katalog/filter/suche-${DEFAULT_FACET}?term=${encodeURIComponent(
    query
  )}`;
  const res = await fetch(url, { headers: { Accept: "text/html" } });
  if (!res.ok) throw new Error(`HHV search: HTTP ${res.status}`);
  const html = await res.text();
  const ids = Array.from(html.matchAll(/\/lazy\/artikel\/(\d+)\/list_entry/g)).map((m) => m[1]);
  return [...new Set(ids)].slice(0, MAX_ARTICLES);
}

export async function fetchHhvListEntry(articleId: string): Promise<string> {
  const res = await fetch(`${PROXY_BASE}/lazy/artikel/${articleId}/list_entry`, {
    headers: { Accept: "text/html" },
  });
  if (!res.ok) throw new Error(`HHV list_entry ${articleId}: HTTP ${res.status}`);
  return res.text();
}
