import { proxyBase } from "../../../lib/proxyBase";

// JPC (jpc.de) — classic, server-rendered HTML, no JSON API needed.
// Verified by recon: GET https://www.jpc.de/s/<search term with "+" instead
// of spaces> returns the hit list directly as HTML (without client-side JS
// reloading — a plain fetch() already contains all hits of the first result
// page, about 20 of them).
const PROXY_BASE = proxyBase("jpc");

export async function fetchJpcSearch(query: string): Promise<string> {
  const path = query
    .trim()
    .split(/\s+/)
    .map(encodeURIComponent)
    .join("+");
  const res = await fetch(`${PROXY_BASE}/s/${path}`, { headers: { Accept: "text/html" } });
  // Quirk of JPC (verified): a search without hits does not return HTTP 200
  // but HTTP 404 — with a perfectly normal HTML body ("Ihr Suchergebnis:
  // Die Suchanfrage lieferte keine Ergebnisse."). That is not an error but
  // a valid "0 hits" response and is therefore NOT thrown as an error, but
  // parsed like any other response (which then simply yields 0 product
  // tiles). Only other error codes (5xx etc.) count as a real error.
  if (!res.ok && res.status !== 404) {
    throw new Error(`JPC search: HTTP ${res.status}`);
  }
  return res.text();
}

// Converts a query into JPC's "+"-separated URL path (same pattern as
// fetchJpcSearch), shared by the search AND the label search.
function toJpcSearchPath(query: string): string {
  return query
    .trim()
    .split(/\s+/)
    .map(encodeURIComponent)
    .join("+");
}

// For the label search ("Small Label Suche" in the UI) — a "ctxlabel"
// parameter on /jpcng/vinyl/search/index.html, initially assumed from
// (by now outdated) recon, turned out NOT to work in a real live test: JPC
// silently redirects this URL server-side to the generic, unfiltered search
// /s/<term> (parameters are discarded completely) -- through the Vite dev
// proxy this redirect even led to a hard "Failed to fetch", because the
// browser follows the Location header straight to jpc.de and fails on CORS
// there.
//
// Found the mechanism that actually works by live recon: every product page
// links its label with `/s/<Label>?searchtype=label` -- exactly the same
// /s/ search endpoint as the normal search, only with an additional query
// parameter that triggers NO redirect and really filters by label
// (verified: "Balmat" returns "Ihre Suche ergab 2 (LPs)", a label without
// hits returns the same "no results" page as the normal search, see
// fetchJpcSearch). It does however NOT restrict to vinyl (just like the
// normal search) -- a label facet specifically limited to vinyl was not
// found in the sidebar.
export async function fetchJpcLabelSearch(label: string): Promise<string> {
  const res = await fetch(`${PROXY_BASE}/s/${toJpcSearchPath(label)}?searchtype=label`, {
    headers: { Accept: "text/html" },
  });
  // Same quirk as with the normal search (see fetchJpcSearch): 0 hits
  // returns HTTP 404 with a valid HTML body, not a real error.
  if (!res.ok && res.status !== 404) {
    throw new Error(`JPC label search: HTTP ${res.status}`);
  }
  return res.text();
}

// Jump-off URL for display -- exactly the same URL that is fetched too.
export function jpcLabelUrl(label: string): string {
  return `https://www.jpc.de/s/${toJpcSearchPath(label)}?searchtype=label`;
}
