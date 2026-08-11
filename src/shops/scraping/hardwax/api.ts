import { proxyBase } from "../../../lib/proxyBase";

// Hard Wax (hardwax.com) — classic, fully server-rendered HTML, no JS
// framework, no XHR API. Verified by recon:
// GET /?find=<search term> returns the result list directly as HTML.
//
// Hard Wax generally only lists articles that are currently in stock — a
// hit in the search therefore means "available" (see transform.ts).
const PROXY_BASE = proxyBase("hardwax");

export async function fetchHardWaxSearch(query: string): Promise<string> {
  const url = `${PROXY_BASE}/?find=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Accept: "text/html" } });
  if (!res.ok) throw new Error(`Hard Wax search: HTTP ${res.status}`);
  return res.text();
}

// For the label search ("Small Label Suche" in the UI) — Hard Wax has its
// own label page at /label/<slug>/, URL pattern analogous to the other
// classic server-rendered-HTML shops (JPC/Souffle Continu). A label that
// does not exist returns (as with JPC) a valid "no hits" response instead
// of a real error -- which is why a 404 is deliberately NOT treated as an
// error here, but passed on like any other response (see transform.ts,
// which detects the "No results." message).
export async function fetchHardWaxLabelPage(slug: string): Promise<string> {
  const res = await fetch(`${PROXY_BASE}/label/${slug}/`, { headers: { Accept: "text/html" } });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Hard Wax label page: HTTP ${res.status}`);
  }
  return res.text();
}

// Converts a label name into the URL slug of the label page (e.g. "Balmat"
// -> "balmat"). Same pattern as Boomkat's slugifyArtist.
export function slugifyHardWaxLabel(label: string): string {
  const ascii = label
    .normalize("NFD")
    .split("")
    .filter((ch) => ch.charCodeAt(0) < 128)
    .join("");

  return ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
