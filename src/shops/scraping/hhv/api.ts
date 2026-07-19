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

// Für die Label-Suche ("Small Label Suche" in der UI) wiederverwendet, damit
// die Such-URL an genau einer Stelle gepflegt wird.
export const HHV_SEARCH_FACET = DEFAULT_FACET;

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

// Für die Label-Suche: dieselbe Katalog-Suchseite wie searchHhvArticleIds,
// aber als rohes HTML zurückgegeben, weil hier (anders als bei der
// Artist/Titel-Suche) nicht die einzelnen Artikel-IDs interessieren, sondern
// ein evtl. vorhandener Label-Filter-Link mit data-title/data-path (siehe
// transform.ts).
export async function fetchHhvSearchPage(term: string): Promise<string> {
  const url = `${PROXY_BASE}/records/katalog/filter/suche-${DEFAULT_FACET}?term=${encodeURIComponent(
    term
  )}`;
  const res = await fetch(url, { headers: { Accept: "text/html" } });
  if (!res.ok) throw new Error(`HHV search page: HTTP ${res.status}`);
  return res.text();
}

// Lädt eine beliebige, bereits von HHV gelieferte relative Pfad-URL (z.B.
// einen data-path-Wert aus der Suchseite) über den gleichen Proxy/Sidecar.
export async function fetchHhvPath(path: string): Promise<string> {
  const p = path.startsWith("/") ? path : `/${path}`;
  const res = await fetch(`${PROXY_BASE}${p}`, { headers: { Accept: "text/html" } });
  if (!res.ok) throw new Error(`HHV path ${path}: HTTP ${res.status}`);
  return res.text();
}

// Meldet dem Sidecar, dass diese Suche abgeschlossen ist -- schließt die
// offene Camoufox-Session sofort, statt bis zum Idle-Timeout zu warten
// (siehe sidecar/src/browserSession.js). Wird von checkAvailability() immer
// per finally aufgerufen, auch bei Fehlern. Absichtlich robust: ein
// fehlgeschlagener Close-Call darf die eigentliche Suche nicht zum Absturz
// bringen, der Sidecar räumt notfalls per Idle-Timeout selbst auf.
export async function closeHhvSession(): Promise<void> {
  try {
    await fetch(`${PROXY_BASE}/__session/close`, { method: "POST" });
  } catch (err) {
    console.warn("[hhv] Session-Close fehlgeschlagen:", err);
  }
}
