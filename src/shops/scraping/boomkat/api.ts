// Boomkat (boomkat.com) — Spree Commerce (Rails), server-gerendertes HTML.
// Verifiziert per Live-Recon (Format hat sich seit der alten Recon geändert
// -- die Autocomplete-API liefert inzwischen KEINE separaten Artist-Treffer
// mehr, nur noch Release-Treffer direkt mit Artist(s) + Produktlink):
//   1) GET /api/autocomplete?query=<begriff> — Release-Treffer:
//      { type: "Release", value: <Titel>, url: "/products/<slug>",
//        artists: string[], ... } (JSON, ohne Stock-Info).
//   2) GET /products/<slug> — Produktseite, enthält ein
//      <script type="application/ld+json"> mit allen Formaten in einem
//      Rutsch (Name/Preis/Währung/Verfügbarkeit je Format als
//      schema.org-Offer) -- kein separater in-stock/out-of-stock-Query-Param
//      mehr nötig wie in der alten Recon, ein Seitenaufruf reicht.
//
// Läuft über den Browser-Sidecar (siehe sidecar/src/browserSession.js),
// nicht mehr über einen simplen Reverse-Proxy -- der wurde zuverlässig mit
// HTTP 403 geblockt (vermutlich TLS-/Bot-Fingerprinting, das ein einfacher
// Node-Reverse-Proxy nicht imitieren kann; Camoufox patcht Firefox genau
// dagegen). Jede Suche baut dort eine eigene Session auf, die per
// closeBoomkatSession() nach der Suche wieder geschlossen wird -- gleiches
// Muster wie bei HHV.
const PROXY_BASE = "/proxy/boomkat";

// Wandelt einen Artist-Namen in den URL-Slug der Artist-Übersichtsseite um
// (z.B. "Sees" -> "sees"). Muster für Mehrwort-Namen nicht zu 100%
// verifiziert -- falls der Slug nicht existiert, greift in index.ts der
// Fallback auf die Autocomplete-Suche.
export function slugifyArtist(artist: string): string {
  // NFD zerlegt z.B. "é" in "e" + Akzent-Zeichen -- danach reicht ein Filter
  // auf ASCII-Zeichencodes, um die Akzente wieder loszuwerden (robuster als
  // ein Unicode-Bereichs-Regex für Kombinationszeichen).
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

// Artist-Übersichtsseite -- listet (im Gegensatz zur Autocomplete-API) alle
// Releases eines Artists vollständig auf, wichtig für kurze/generische
// Artist-Namen bei reiner Artist-Suche (siehe index.ts).
export async function fetchBoomkatArtistPage(slug: string): Promise<string> {
  const res = await fetch(`${PROXY_BASE}/artists/${slug}`, { headers: { Accept: "text/html" } });
  if (!res.ok) throw new Error(`Boomkat artist page: HTTP ${res.status}`);
  return res.text();
}

// Label-Übersichtsseite für die Label-Suche ("Small Label Suche" in der UI)
// -- gleiches Grid-Markup wie die Artist-Übersichtsseite, aber unter
// /labels/<slug>. per_page=100 verifiziert per Recon, um auch mittelgroße
// Label-Kataloge auf einer einzigen Seite zu bekommen.
export async function fetchBoomkatLabelPage(slug: string): Promise<string> {
  const res = await fetch(`${PROXY_BASE}/labels/${slug}?per_page=100`, {
    headers: { Accept: "text/html" },
  });
  if (!res.ok) throw new Error(`Boomkat label page: HTTP ${res.status}`);
  return res.text();
}

// Meldet dem Sidecar, dass diese Suche abgeschlossen ist -- schließt die
// offene Camoufox-Session sofort, statt bis zum Idle-Timeout zu warten
// (siehe sidecar/src/browserSession.js). Wird von checkAvailability() immer
// per finally aufgerufen, auch bei Fehlern.
export async function closeBoomkatSession(): Promise<void> {
  try {
    await fetch(`${PROXY_BASE}/__session/close`, { method: "POST" });
  } catch (err) {
    console.warn("[boomkat] Session-Close fehlgeschlagen:", err);
  }
}
