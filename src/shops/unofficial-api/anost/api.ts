import { proxyBase } from "../../../lib/proxyBase";

// ANOST (anost.net) — public, unauthenticated JSON search.
// Verified by recon: GET /api/public/search?query=<term>
// returns artists[] and releases[] including formats[].has_available_stock.
//
// On the dev server this runs through the Vite proxy (see vite.config.ts),
// because anost.net sends no CORS headers for browser fetches.
const PROXY_BASE = proxyBase("anost");

export interface AnostFormat {
  format: string;
  price: number;
  status: string;
  has_available_stock: boolean;
  uuid_release_format: string;
}

export interface AnostRelease {
  slug: string;
  title: string;
  edition?: string;
  labels?: Record<string, { name: string; slug: string }>;
  formats: AnostFormat[];
}

export interface AnostSearchResponse {
  artists: { name: string; slug: string; count: number }[] | null;
  releases: AnostRelease[];
}

export async function searchAnost(query: string): Promise<AnostSearchResponse> {
  const url = `${PROXY_BASE}/api/public/search?query=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`ANOST search: HTTP ${res.status}`);
  return res.json();
}

// For the label search ("Small Label Suche" in the UI) — verified by
// recon: /labels lists ALL labels alphabetically, server-rendered, as
// individual links "<name> [<count>]" (e.g. "Balmat [8]" ->
// /label/8B2D/balmat). No separate JSON API needed for this, a single
// page request is enough (see transform.ts for the parser).
export async function fetchAnostLabelsPage(): Promise<string> {
  const res = await fetch(`${PROXY_BASE}/labels`, { headers: { Accept: "text/html" } });
  if (!res.ok) throw new Error(`ANOST labels page: HTTP ${res.status}`);
  return res.text();
}
