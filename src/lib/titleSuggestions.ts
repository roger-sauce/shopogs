import { searchAnost } from "../shops/unofficial-api/anost/api";
import { searchSoundOhm } from "../shops/unofficial-api/soundohm/api";
import { searchBisAufsMesser } from "../shops/unofficial-api/bisaufsmesser/api";
import { searchSouffleContinu } from "../shops/unofficial-api/soufflecontinu/api";
import { fetchHardWaxSearch } from "../shops/scraping/hardwax/api";
import { transformHardWax } from "../shops/scraping/hardwax/transform";
import { fetchJpcSearch } from "../shops/scraping/jpc/api";
import { transformJpc } from "../shops/scraping/jpc/transform";

export interface TitleSuggestion {
  artist?: string;
  title: string;
}

// Liefert Vorschläge für den vollständigen Album-Titel, während der Nutzer
// nur ein Fragment eingibt (z.B. "Ambient Works"). Nutzt alle 6 "schnellen"
// Shops (nicht HHV -- das würde bei jedem Tastendruck eine eigene
// Camoufox-Session anwerfen) als Datenquelle.
export async function fetchTitleSuggestions(query: string): Promise<TitleSuggestion[]> {
  if (query.trim().length < 3) return [];

  const [anostRes, soundohmRes, bisAufsMesserRes, soufflecontinuRes, hardwaxRes, jpcRes] =
    await Promise.allSettled([
      searchAnost(query),
      searchSoundOhm(query),
      searchBisAufsMesser(query),
      searchSouffleContinu(query),
      fetchHardWaxSearch(query),
      fetchJpcSearch(query),
    ]);

  const perShop: TitleSuggestion[][] = [];

  if (anostRes.status === "fulfilled") {
    // ANOSTs Suche liefert releases[] ohne verknüpften Artist-Namen (nur
    // eine separate, unverknüpfte artists[]-Liste) -- deshalb hier bewusst
    // kein artist-Feld, statt zu raten.
    perShop.push((anostRes.value.releases ?? []).map((release) => ({ title: release.title })));
  }

  if (soundohmRes.status === "fulfilled") {
    perShop.push(
      (soundohmRes.value.result?.products ?? []).map((product) => ({
        artist: product.artist_info?.map((a) => a.name).join(", "),
        title: product.title,
      }))
    );
  }

  if (bisAufsMesserRes.status === "fulfilled") {
    perShop.push(
      (bisAufsMesserRes.value.resources?.results?.products ?? []).map((product) => ({
        artist: product.vendor,
        title: product.title,
      }))
    );
  }

  if (soufflecontinuRes.status === "fulfilled") {
    perShop.push(
      (soufflecontinuRes.value.rs?.articles ?? []).map((article) => ({
        artist: article.artiste,
        title: article.titre,
      }))
    );
  }

  // Hard Wax und JPC liefern serverseitig gerendertes HTML statt JSON --
  // nutzen dieselben Parser wie die echte Suche (transformHardWax/transformJpc).
  if (hardwaxRes.status === "fulfilled") {
    perShop.push(transformHardWax(hardwaxRes.value).map((r) => ({ artist: r.artist, title: r.title })));
  }

  if (jpcRes.status === "fulfilled") {
    perShop.push(transformJpc(jpcRes.value).map((r) => ({ artist: r.artist, title: r.title })));
  }

  // Round-Robin statt shopweise aneinanderhängen: sonst füllt ein Shop mit
  // vielen (lose gematchten) Treffern allein schon die ganze Liste, bevor
  // ein anderer Shop überhaupt drankommt (live beobachtet: "People of the
  // Moon" zeigte den korrekten JPC-Treffer nicht in der Vorschlagsliste,
  // obwohl JPC ihn bei der echten Suche fand -- er stand in der
  // Push-Reihenfolge einfach zu weit hinten). So bekommt jeder Shop
  // mindestens eine faire erste Chance auf einen Listenplatz.
  const interleaved: TitleSuggestion[] = [];
  let index = 0;
  let more = true;
  while (more) {
    more = false;
    for (const list of perShop) {
      if (index < list.length) {
        // index ist ein simpler Schleifenzähler, kein extern kontrollierter Key.
        // eslint-disable-next-line security/detect-object-injection
        interleaved.push(list[index]);
        more = true;
      }
    }
    index++;
  }

  const seen = new Set<string>();
  return interleaved
    .filter((s) => {
      const key = `${s.artist ?? ""}::${s.title}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}
