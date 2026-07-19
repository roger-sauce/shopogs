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

// Für die Label-Suche ("Small Label Suche" in der UI) — Hard Wax hat eine
// eigene Label-Seite unter /label/<slug>/, URL-Muster analog zu den anderen
// klassischen server-gerendertes-HTML-Shops (JPC/Souffle Continu). Ein nicht
// existierendes Label liefert (wie bei JPC) eine gültige "keine Treffer"-
// Antwort statt eines echten Fehlers -- daher wird 404 hier bewusst NICHT
// als Error behandelt, sondern wie jede andere Antwort weitergereicht (siehe
// transform.ts, das die "No results."-Meldung erkennt).
export async function fetchHardWaxLabelPage(slug: string): Promise<string> {
  const res = await fetch(`${PROXY_BASE}/label/${slug}/`, { headers: { Accept: "text/html" } });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Hard Wax label page: HTTP ${res.status}`);
  }
  return res.text();
}

// Wandelt einen Label-Namen in den URL-Slug der Label-Seite um (z.B. "Balmat"
// -> "balmat"). Gleiches Muster wie Boomkats slugifyArtist.
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
