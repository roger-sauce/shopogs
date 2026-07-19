// ANOST (anost.net) — öffentliche, unauthentifizierte JSON-Suche.
// Verifiziert per Recon: GET /api/public/search?query=<begriff>
// liefert artists[] und releases[] inkl. formats[].has_available_stock.
//
// Im Dev-Server läuft das über den Vite-Proxy (siehe vite.config.ts), da
// anost.net keine CORS-Header für Browser-Fetches sendet.
const PROXY_BASE = "/proxy/anost";

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

// Für die Label-Suche ("Small Label Suche" in der UI) — verifiziert per
// Recon: /labels listet ALLE Labels alphabetisch server-gerendert als
// einzelne Links "<Name> [<Anzahl>]" (z.B. "Balmat [8]" ->
// /label/8B2D/balmat). Kein separates JSON-API dafür nötig, ein einziger
// Seitenaufruf reicht (siehe transform.ts für den Parser).
export async function fetchAnostLabelsPage(): Promise<string> {
  const res = await fetch(`${PROXY_BASE}/labels`, { headers: { Accept: "text/html" } });
  if (!res.ok) throw new Error(`ANOST labels page: HTTP ${res.status}`);
  return res.text();
}
