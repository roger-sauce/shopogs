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

// Supplies suggestions for the full album title while the user is only
// typing a fragment (e.g. "Ambient Works"). Uses all 6 "fast" shops (not
// HHV -- that would start its own Camoufox session on every keystroke) as
// the data source.
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
    // ANOST's search returns releases[] without a linked artist name (only
    // a separate, unlinked artists[] list) -- hence deliberately no artist
    // field here, instead of guessing.
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

  // Hard Wax and JPC return server-rendered HTML instead of JSON -- use the
  // same parsers as the real search (transformHardWax/transformJpc).
  if (hardwaxRes.status === "fulfilled") {
    perShop.push(transformHardWax(hardwaxRes.value).map((r) => ({ artist: r.artist, title: r.title })));
  }

  if (jpcRes.status === "fulfilled") {
    perShop.push(transformJpc(jpcRes.value).map((r) => ({ artist: r.artist, title: r.title })));
  }

  // Round-Robin instead of concatenating shop by shop: otherwise a single
  // shop with many (loosely matched) hits fills the whole list on its own
  // before another shop gets a turn at all (observed live: "People of the
  // Moon" did not show the correct JPC hit in the suggestion list, even
  // though JPC found it in the real search -- it simply sat too far back in
  // the push order). This way every shop gets at least a fair first chance
  // at a place in the list.
  const interleaved: TitleSuggestion[] = [];
  let index = 0;
  let more = true;
  while (more) {
    more = false;
    for (const list of perShop) {
      if (index < list.length) {
        // index is a simple loop counter, not an externally controlled key.
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
