import { proxyBase } from "../../../lib/proxyBase";

// Boomkat (boomkat.com) — Spree Commerce (Rails), server-rendered HTML.
// Verified by live recon (the format has changed since the old recon -- the
// autocomplete API no longer returns separate artist hits, only release hits
// directly, with artist(s) + product link):
//   1) GET /api/autocomplete?query=<term> — release hits:
//      { type: "Release", value: <title>, url: "/products/<slug>",
//        artists: string[], ... } (JSON, without stock info).
//   2) GET /products/<slug> — product page, contains a
//      <script type="application/ld+json"> with all formats in one go
//      (name/price/currency/availability per format as a schema.org offer)
//      -- no separate in-stock/out-of-stock query param needed any more as
//      in the old recon, a single page request is enough.
//
// Runs through the browser sidecar (see sidecar/src/browserSession.js), no
// longer through a simple reverse proxy -- that one was reliably blocked with
// HTTP 403 (presumably TLS/bot fingerprinting that a plain Node reverse proxy
// cannot imitate; Camoufox patches Firefox for exactly that). Every search
// sets up its own session there, which is closed again after the search via
// closeBoomkatSession() -- same pattern as with HHV.
const PROXY_BASE = proxyBase("boomkat");

// Converts an artist name into the URL slug of the artist overview page
// (e.g. "Sees" -> "sees"). The pattern for multi-word names is not verified
// 100% -- if the slug does not exist, the fallback to the autocomplete search
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

export interface BoomkatAutocompleteEntry {
  type: string;
  value: string;
  url: string;
  artists: string[];
}

export async function autocompleteBoomkat(query: string): Promise<BoomkatAutocompleteEntry[]> {
  const url = `${PROXY_BASE}/api/autocomplete?query=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Boomkat autocomplete: HTTP ${res.status}`);
  return res.json();
}

export async function fetchBoomkatProductPage(productUrlPath: string): Promise<string> {
  const path = productUrlPath.startsWith("/") ? productUrlPath : `/${productUrlPath}`;
  const res = await fetch(`${PROXY_BASE}${path}`, { headers: { Accept: "text/html" } });
  if (!res.ok) throw new Error(`Boomkat product page: HTTP ${res.status}`);
  return res.text();
}

// Artist overview page -- lists (unlike the autocomplete API) all releases of
// an artist in full, which matters for short/generic artist names in an
// artist-only search (see index.ts).
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
