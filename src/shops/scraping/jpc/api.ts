// JPC (jpc.de) — klassisches, server-gerendertes HTML, kein JSON-API nötig.
// Verifiziert per Recon: GET https://www.jpc.de/s/<suchbegriff mit "+"
// statt Leerzeichen> liefert die Trefferliste direkt als HTML (ohne
// Client-JS-Nachladen — ein reiner fetch() enthält bereits alle Treffer der
// ersten Ergebnisseite, ca. 20 Stück).
const PROXY_BASE = "/proxy/jpc";

export async function fetchJpcSearch(query: string): Promise<string> {
  const path = query
    .trim()
    .split(/\s+/)
    .map(encodeURIComponent)
    .join("+");
  const res = await fetch(`${PROXY_BASE}/s/${path}`, { headers: { Accept: "text/html" } });
  // Eigenheit von JPC (verifiziert): eine Suche ohne Treffer liefert nicht
  // HTTP 200, sondern HTTP 404 — mit ganz normalem HTML-Body ("Ihr
  // Suchergebnis: Die Suchanfrage lieferte keine Ergebnisse."). Das ist kein
  // Fehler, sondern eine gültige "0 Treffer"-Antwort und wird daher NICHT
  // als Error geworfen, sondern wie jede andere Antwort geparst (liefert
  // dann einfach 0 Produkt-Kacheln). Nur andere Fehlercodes (5xx etc.)
  // gelten als echter Fehler.
  if (!res.ok && res.status !== 404) {
    throw new Error(`JPC search: HTTP ${res.status}`);
  }
  return res.text();
}

// Wandelt eine Anfrage in JPCs "+"-getrennten URL-Pfad um (gleiches Muster
// wie fetchJpcSearch), für Suche UND Label-Suche gemeinsam genutzt.
function toJpcSearchPath(query: string): string {
  return query
    .trim()
    .split(/\s+/)
    .map(encodeURIComponent)
    .join("+");
}

// Für die Label-Suche ("Small Label Suche" in der UI) — ein zunächst per
// (inzwischen überholter) Recon angenommener "ctxlabel"-Parameter auf
// /jpcng/vinyl/search/index.html erwies sich bei einem echten Live-Test als
// NICHT funktionsfähig: JPC leitet diese URL serverseitig still auf die
// generische, ungefilterte Suche /s/<begriff> um (Parameter werden komplett
// verworfen) -- über den Vite-Dev-Proxy führte dieser Redirect sogar zu einem
// harten "Failed to fetch", weil der Browser dem Location-Header direkt zu
// jpc.de folgt und dort an CORS scheitert.
//
// Den tatsächlich funktionierenden Mechanismus per Live-Recon gefunden: jede
// Produktseite verlinkt ihr Label mit `/s/<Label>?searchtype=label` -- exakt
// derselbe /s/-Suchendpunkt wie die normale Suche, nur mit einem
// zusätzlichen Query-Parameter, der KEINEN Redirect auslöst und echt nach
// Label filtert (verifiziert: "Balmat" liefert "Ihre Suche ergab 2 (LPs)",
// ein Label ohne Treffer liefert dieselbe "keine Ergebnisse"-Seite wie die
// normale Suche, siehe fetchJpcSearch). Schränkt allerdings NICHT auf Vinyl
// ein (wie die normale Suche auch) -- eine spezifisch auf Vinyl begrenzte
// Label-Facette wurde in der Sidebar nicht gefunden.
export async function fetchJpcLabelSearch(label: string): Promise<string> {
  const res = await fetch(`${PROXY_BASE}/s/${toJpcSearchPath(label)}?searchtype=label`, {
    headers: { Accept: "text/html" },
  });
  // Gleiche Eigenheit wie bei der normalen Suche (siehe fetchJpcSearch): 0
  // Treffer liefert HTTP 404 mit gültigem HTML-Body, kein echter Fehler.
  if (!res.ok && res.status !== 404) {
    throw new Error(`JPC label search: HTTP ${res.status}`);
  }
  return res.text();
}

// Absprung-URL für die Anzeige -- exakt dieselbe URL, die auch gefetcht wird.
export function jpcLabelUrl(label: string): string {
  return `https://www.jpc.de/s/${toJpcSearchPath(label)}?searchtype=label`;
}
