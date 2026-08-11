import { proxyBase } from "../../../lib/proxyBase";

// HHV (hhv.de) — custom backend (Turbo/Hotwire). The catalogue search page
// loads every result as an individual lazy-loaded Turbo-Frame (but the
// placeholder with `src="/lazy/artikel/<id>/list_entry"` is already present in
// the initial HTML response — that was the decisive find during the second
// recon round, after a plain fetch() of the catalogue page appeared at first
// to contain NO results at all).
//
// Flow:
//   1) GET /records/katalog/filter/suche-D2N2S11?term=<term>
//      -> contains, for every hit, a Turbo-Frame with
//         src="/lazy/artikel/<id>/list_entry"
//   2) For every article ID: GET /lazy/artikel/<id>/list_entry
//      -> server-rendered fragment with artist/title/format/price and the
//         cart button, whose modifier class reveals the stock status
//         (see transform.ts).
const PROXY_BASE = proxyBase("hhv");
const DEFAULT_FACET = "D2N2S11";
const MAX_ARTICLES = 20; // Cap, so we do not fire off too many single requests

// Reused for the label search ("Small Label Suche" in the UI), so that the
// search URL is maintained in exactly one place.
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

// For the label search: the same catalogue search page as
// searchHhvArticleIds, but returned as raw HTML, because here (unlike in the
// artist/title search) we do not care about the individual article IDs but
// about a possibly present label filter link with data-title/data-path (see
// transform.ts).
export async function fetchHhvSearchPage(term: string): Promise<string> {
  const url = `${PROXY_BASE}/records/katalog/filter/suche-${DEFAULT_FACET}?term=${encodeURIComponent(
    term
  )}`;
  const res = await fetch(url, { headers: { Accept: "text/html" } });
  if (!res.ok) throw new Error(`HHV search page: HTTP ${res.status}`);
  return res.text();
}

// Loads any relative path URL already supplied by HHV (e.g. a data-path value
// from the search page) through the same proxy/sidecar.
export async function fetchHhvPath(path: string): Promise<string> {
  const p = path.startsWith("/") ? path : `/${path}`;
  const res = await fetch(`${PROXY_BASE}${p}`, { headers: { Accept: "text/html" } });
  if (!res.ok) throw new Error(`HHV path ${path}: HTTP ${res.status}`);
  return res.text();
}

// Tells the sidecar that this search is finished -- closes the open Camoufox
// session immediately instead of waiting for the idle timeout (see
// sidecar/src/browserSession.js). Always called by checkAvailability() from a
// finally block, including on errors. Deliberately robust: a failed close
// call must not bring down the actual search, and if need be the sidecar
// cleans up by itself via the idle timeout.
export async function closeHhvSession(): Promise<void> {
  try {
    await fetch(`${PROXY_BASE}/__session/close`, { method: "POST" });
  } catch (err) {
    console.warn("[hhv] Session-Close fehlgeschlagen:", err);
  }
}
