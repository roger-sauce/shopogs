import { searchAnost } from "../shops/unofficial-api/anost/api";
import { searchSoundOhm } from "../shops/unofficial-api/soundohm/api";

export interface TitleSuggestion {
  artist?: string;
  title: string;
}

// Liefert Vorschläge für den vollständigen Album-Titel, während der Nutzer
// nur ein Fragment eingibt (z.B. "Ambient Works"). Nutzt die beiden
// schnellen, öffentlichen JSON-Such-APIs (ANOST + SoundOhm) als
// Datenquelle — nicht alle 7 Shops, um die Eingabe nicht zu verlangsamen.
export async function fetchTitleSuggestions(query: string): Promise<TitleSuggestion[]> {
  if (query.trim().length < 3) return [];

  const [anostRes, soundohmRes] = await Promise.allSettled([
    searchAnost(query),
    searchSoundOhm(query),
  ]);

  const suggestions: TitleSuggestion[] = [];

  if (anostRes.status === "fulfilled") {
    for (const release of anostRes.value.releases ?? []) {
      suggestions.push({ title: release.title });
    }
  }

  if (soundohmRes.status === "fulfilled") {
    for (const product of soundohmRes.value.result?.products ?? []) {
      suggestions.push({
        artist: product.artist_info?.map((a) => a.name).join(", "),
        title: product.title,
      });
    }
  }

  const seen = new Set<string>();
  return suggestions
    .filter((s) => {
      const key = `${s.artist ?? ""}::${s.title}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}
