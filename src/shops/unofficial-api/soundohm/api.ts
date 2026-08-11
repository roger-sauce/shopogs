import { proxyBase } from "../../../lib/proxyBase";

// SoundOhm (soundohm.com) — public, unauthenticated JSON search.
// Verified by recon: GET /api/quickSearch?query="<term>"
// (query string literally wrapped in double quotes, URL-encoded)
// returns result.products[] including is_in_stock (boolean).
const PROXY_BASE = proxyBase("soundohm");

export interface SoundOhmProduct {
  id: number;
  slug: string;
  title: string;
  kind: string;
  format_info?: string;
  price: string;
  is_in_stock: boolean;
  preorder: string | null;
  artist_info?: { id: number; name: string; slug: string }[];
  label_info?: { id: number; name: string; slug: string }[];
}

export interface SoundOhmSearchResponse {
  result: { products: SoundOhmProduct[] };
}

export async function searchSoundOhm(query: string): Promise<SoundOhmSearchResponse> {
  const url = `${PROXY_BASE}/api/quickSearch?query=%22${encodeURIComponent(query)}%22`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`SoundOhm search: HTTP ${res.status}`);
  return res.json();
}

// For the label search ("Small Label Suche" in the UI) — verified by
// recon: the quickSearch response for a label-name query contains
// products with label_info[].slug, which lets us resolve the actual
// label page /label/<slug>. That page lists all releases of the label
// server-rendered, one hit per ".product" element (see
// transform.ts).
export async function fetchSoundOhmLabelPage(slug: string): Promise<string> {
  const res = await fetch(`${PROXY_BASE}/label/${slug}`, { headers: { Accept: "text/html" } });
  if (!res.ok) throw new Error(`SoundOhm label page: HTTP ${res.status}`);
  return res.text();
}
