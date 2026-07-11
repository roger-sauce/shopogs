// Boomkat (boomkat.com) — Spree Commerce (Rails), server-gerendertes HTML.
// Verifiziert per Recon:
//   1) GET /api/autocomplete?query=<begriff> — Artist-/Release-Treffer mit
//      URL-Slug (JSON, aber ohne Stock-Info).
//   2) GET /artists/<artist-slug>?q[status]=in-stock — Ransack-Style
//      Query-Param filtert serverseitig auf Lagerbestand.
const PROXY_BASE = "/proxy/boomkat";

export interface BoomkatAutocompleteEntry {
  type: "Artist" | "Release";
  value: string;
  url: string;
}

export async function autocompleteBoomkat(query: string): Promise<BoomkatAutocompleteEntry[]> {
  const url = `${PROXY_BASE}/api/autocomplete?query=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Boomkat autocomplete: HTTP ${res.status}`);
  return res.json();
}

/** status: "in-stock" | "out-of-stock" | "pre-order" */
export async function fetchBoomkatArtistPage(
  artistSlugPath: string,
  status?: string
): Promise<string> {
  const qs = status ? `?q[status]=${encodeURIComponent(status)}` : "";
  const path = artistSlugPath.startsWith("/") ? artistSlugPath : `/${artistSlugPath}`;
  const res = await fetch(`${PROXY_BASE}${path}${qs}`, { headers: { Accept: "text/html" } });
  if (!res.ok) throw new Error(`Boomkat artist page: HTTP ${res.status}`);
  return res.text();
}
