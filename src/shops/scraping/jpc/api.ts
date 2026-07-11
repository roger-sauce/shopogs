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
