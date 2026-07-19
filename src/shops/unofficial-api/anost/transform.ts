import type { AvailabilityResult } from "../../../types/shop";
import type { AnostSearchResponse } from "./api";

// Pro Format gibt es ein `status`-Feld ("listed" = regulär, "pre-order" =
// Vorbestellung, Release-/Versanddatum in der Zukunft) und ein separates
// `has_available_stock`-Boolean für ausverkauft. Verifiziert per Recon
// (z.B. Carmen Villain "Memoria" LP: status "pre-order", has_available_stock
// true, release_date in der Zukunft).
export function transformAnost(raw: AnostSearchResponse): AvailabilityResult[] {
  const releases = raw.releases ?? [];
  return releases.flatMap((release) => {
    const label = release.labels ? Object.values(release.labels)[0]?.name : undefined;
    // Produkt-URL ist nicht 1:1 verifiziert (nur aus dem Slug-Muster
    // abgeleitet, das ANOST auch für Label-/Artist-Seiten nutzt: /<hex>/<slug>).
    // Bei Bedarf gegen die echte Seite gegenchecken.
    const url = `https://www.anost.net/release/${decodeURIComponent(release.slug)}`;
    return release.formats
      .filter((f) => f.has_available_stock)
      .map((f) => ({
        shopId: "anost",
        title: label ? `${release.title} (${label})` : release.title,
        format: f.format,
        price: f.price?.toFixed(2),
        currency: "EUR",
        url,
        status: f.status === "pre-order" ? ("preorder" as const) : ("in_stock" as const),
      }));
  });
}

// Sucht in der /labels-Übersichtsseite den Link, dessen Text exakt
// "<Label> [<Anzahl>]" entspricht (case-insensitive, verifiziert per Recon
// z.B. "Balmat [8]"). Gibt null zurück, wenn kein Label mit exakt diesem
// Namen gelistet ist (checkLabelAvailability in index.ts behandelt das
// dann als 0 Treffer mit Fallback-URL auf die Übersichtsseite selbst).
export function findAnostLabelEntry(html: string, label: string): { count: number; url: string } | null {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const needle = label.trim().toLowerCase();
  const links = Array.from(doc.querySelectorAll('a[href*="/label/"]'));

  for (const link of links) {
    const text = link.textContent?.trim() ?? "";
    const match = text.match(/^(.*?)\s*\[(\d+)\]$/);
    if (!match) continue;
    if (match[1].trim().toLowerCase() !== needle) continue;

    const href = link.getAttribute("href") ?? "";
    const url = href.startsWith("http") ? href : `https://www.anost.net${href.startsWith("/") ? "" : "/"}${href}`;
    return { count: parseInt(match[2], 10), url };
  }

  return null;
}
