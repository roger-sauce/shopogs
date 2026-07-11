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
