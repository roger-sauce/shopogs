// SoundOhm (soundohm.com) — öffentliche, unauthentifizierte JSON-Suche.
// Verifiziert per Recon: GET /api/quickSearch?query="<begriff>"
// (Query-String literal in doppelten Anführungszeichen, URL-encoded)
// liefert result.products[] inkl. is_in_stock (Boolean).
const PROXY_BASE = "/proxy/soundohm";

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
