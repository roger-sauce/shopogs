import { proxyBase } from "../../../lib/proxyBase";

// Boomkat (boomkat.com) — Rails with Turbo/Hotwire, server-rendered HTML.
//
// Rebuilt by the shop in October 2026. What that relaunch moved, verified
// live against the running site:
//
//   1) The search. GET /api/autocomplete is gone (plain 404, Rails' own
//      error page). The replacement is
//        GET /api/search/keywords?q=<term>
//      and it answers with an HTML fragment, not with JSON: one
//      <li role="option"> per hit, each with a link, a thumbnail and an
//      <h3> holding "Artist - Title". Artists, releases and a trailing
//      link to the full search share the list; the release rows are the
//      ones whose href points into /releases/.
//
//      One trap worth recording: sending `Accept: application/json` on its
//      own makes this endpoint answer HTTP 500. Anything that mentions
//      text/html is fine, including the "text/html, application/json" the
//      sidecar sends.
//
//   2) The product pages. /products/<slug> became
//        /artists/<artist>/releases/<id>/<title>
//      -- which is why counting "/products/" links now counts nothing at
//      all. The structured data survived the move but sits one level
//      deeper, see transform.ts.
//
// Runs through the browser sidecar (see sidecar/src/browserSession.js), not
// through a plain reverse proxy -- that one was reliably answered with HTTP
// 403 (TLS/bot fingerprinting a Node proxy cannot imitate; Camoufox patches
// Firefox for exactly that). The keyword path has to be listed in that
// file's ajaxPathPrefixes: a path missing there is fetched by full
// navigation, and a full document navigation to an API path is what earns a
// Cloudflare challenge page instead of an answer.
const PROXY_BASE = proxyBase("boomkat");

// Converts an artist name into the URL slug of the artist overview page
// (e.g. "Sees" -> "sees"). The pattern for multi-word names is not verified
// 100% -- if the slug does not exist, the fallback to the keyword search
// in index.ts kicks in.
export function slugifyArtist(artist: string): string {
  // NFD decomposes e.g. "é" into "e" + an accent character -- after that a
  // filter on ASCII character codes is enough to get rid of the accents again
  // (more robust than a Unicode range regex for combining characters).
  const ascii = artist
    .normalize("NFD")
    .split("")
    .filter((ch) => ch.charCodeAt(0) < 128)
    .join("");

  return ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// The keyword search. Returns raw HTML -- the parsing lives in transform.ts,
// like every other markup this adapter reads.
export async function searchBoomkatKeywords(query: string): Promise<string> {
  const url = `${PROXY_BASE}/api/search/keywords?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Accept: "text/html" } });
  if (!res.ok) throw new Error(`Boomkat keyword search: HTTP ${res.status}`);
  return res.text();
}

export async function fetchBoomkatReleasePage(releasePath: string): Promise<string> {
  const path = releasePath.startsWith("/") ? releasePath : `/${releasePath}`;
  const res = await fetch(`${PROXY_BASE}${path}`, { headers: { Accept: "text/html" } });
  if (!res.ok) throw new Error(`Boomkat release page: HTTP ${res.status}`);
  return res.text();
}

// Artist overview page -- lists (unlike the keyword search, which answers
// with five rows) all releases of an artist in full, which matters for
// short/generic artist names and for artist-only searches.
export async function fetchBoomkatArtistPage(slug: string): Promise<string> {
  const res = await fetch(`${PROXY_BASE}/artists/${slug}`, { headers: { Accept: "text/html" } });
  if (!res.ok) throw new Error(`Boomkat artist page: HTTP ${res.status}`);
  return res.text();
}

// Label overview page for the label search ("Small Label Suche" in the UI)
// -- same grid markup as the artist overview page, but under /labels/<slug>.
// per_page=100 verified by recon, so that even medium-sized label catalogues
// fit on a single page.
export async function fetchBoomkatLabelPage(slug: string): Promise<string> {
  const res = await fetch(`${PROXY_BASE}/labels/${slug}?per_page=100`, {
    headers: { Accept: "text/html" },
  });
  if (!res.ok) throw new Error(`Boomkat label page: HTTP ${res.status}`);
  return res.text();
}

// Tells the sidecar that this search is finished -- closes the open Camoufox
// session immediately instead of waiting for the idle timeout (see
// sidecar/src/browserSession.js). Always called by checkAvailability() from a
// finally block, including on errors.
export async function closeBoomkatSession(): Promise<void> {
  try {
    await fetch(`${PROXY_BASE}/__session/close`, { method: "POST" });
  } catch (err) {
    console.warn("[boomkat] Session-Close fehlgeschlagen:", err);
  }
}
