// Hard Wax (hardwax.com) — klassisches, komplett server-gerendertes HTML,
// kein JS-Framework, keine XHR-API. Verifiziert per Recon:
// GET /?find=<suchbegriff> liefert die Ergebnisliste direkt als HTML.
//
// Hard Wax listet grundsätzlich nur Artikel, die aktuell auf Lager sind —
// ein Treffer in der Suche bedeutet also "verfügbar" (siehe transform.ts).
const PROXY_BASE = "/proxy/hardwax";

export async function fetchHardWaxSearch(query: string): Promise<string> {
  const url = `${PROXY_BASE}/?find=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Accept: "text/html" } });
  if (!res.ok) throw new Error(`Hard Wax search: HTTP ${res.status}`);
  return res.text();
}
