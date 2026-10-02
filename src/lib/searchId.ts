// One id per search, carried on every request to the browser sidecar.
//
// The sidecar runs a full browser for HHV and Boomkat, and until 02.10.2026
// it kept exactly one session per shop while the adapters managed that
// session's lifetime per search: each closes it in a finally block when it is
// done. Two searches at the same time therefore shared one browser, and
// whichever finished first tore it down under the other -- "Target page,
// context or browser has been closed", answered as HTTP 502.
//
// With an id, every search gets a browser context of its own. The header is
// the only thing the adapters have to carry for that.

export const SEARCH_ID_HEADER = "X-Search-Id";

/**
 * Characters restricted to what the sidecar accepts (letters, digits,
 * hyphen, underscore) -- it falls back to a shared context for anything else,
 * which would quietly bring the old behaviour back.
 */
export function newSearchId(): string {
  const webCrypto = globalThis.crypto;
  if (webCrypto?.randomUUID) return webCrypto.randomUUID();
  // randomUUID needs a secure context in the browser. Served over HTTPS and
  // on localhost it is there; this is for everything else, and it does not
  // have to be unguessable -- only unique among the handful of searches
  // running at the same moment.
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function sidecarHeaders(searchId: string, accept = "text/html"): Record<string, string> {
  return { Accept: accept, [SEARCH_ID_HEADER]: searchId };
}
