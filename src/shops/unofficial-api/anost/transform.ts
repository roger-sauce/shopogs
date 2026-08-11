import type { AvailabilityResult } from "../../../types/shop";
import type { AnostSearchResponse } from "./api";

// Each format has a `status` field ("listed" = regular, "pre-order" =
// preorder, release/shipping date in the future) and a separate
// `has_available_stock` boolean for sold out. Verified by recon
// (e.g. Carmen Villain "Memoria" LP: status "pre-order", has_available_stock
// true, release_date in the future).
export function transformAnost(raw: AnostSearchResponse): AvailabilityResult[] {
  const releases = raw.releases ?? [];
  return releases.flatMap((release) => {
    const label = release.labels ? Object.values(release.labels)[0]?.name : undefined;
    // The product URL is not verified one-to-one (only derived from the slug
    // pattern that ANOST also uses for label/artist pages: /<hex>/<slug>).
    // Cross-check against the real page if needed.
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

// Searches the /labels overview page for the link whose text matches
// "<label> [<count>]" exactly (case-insensitive, verified by recon,
// e.g. "Balmat [8]"). Returns null if no label with exactly this name is
// listed (checkLabelAvailability in index.ts then treats that as 0 hits
// with a fallback URL pointing at the overview page itself).
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
