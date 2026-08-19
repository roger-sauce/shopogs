import { searchAnost } from "../shops/unofficial-api/anost/api";
import { searchSoundOhm } from "../shops/unofficial-api/soundohm/api";
import { searchBisAufsMesser } from "../shops/unofficial-api/bisaufsmesser/api";
import { searchSouffleContinu } from "../shops/unofficial-api/soufflecontinu/api";
import { fetchHardWaxSearch } from "../shops/scraping/hardwax/api";
import { transformHardWax } from "../shops/scraping/hardwax/transform";
import { fetchJpcSearch } from "../shops/scraping/jpc/api";
import { transformJpc } from "../shops/scraping/jpc/transform";
import { classifyFormat, SELECTABLE_FORMATS } from "./classifyFormat";
import type { SelectableFormat } from "../types/shop";

export interface TitleSuggestion {
  artist?: string;
  title: string;
  /** The shop's own wording for the carrier, e.g. "2LP", "3 CDs", "Tapes". */
  format?: string;
}

/**
 * What a shop answered, before it is known which formats are wanted.
 *
 * Carries every format the entry offers, not one: an ANOST release lists LP
 * and CD side by side, and which of them makes it into the suggestion depends
 * on what the user has ticked.
 */
interface Candidate {
  artist?: string;
  title: string;
  formats: string[];
}

/**
 * Whether an entry belongs in the list at all.
 *
 * Deliberately stricter than `matchesFormatFilter`, which shows an
 * unclassifiable format when all four boxes are ticked -- when in doubt,
 * show it. That rule is right for search results, where everything came from
 * a record shop's stock, and wrong here: JPC is a general mail-order house
 * that also sells books and DVDs, and its search answered "Homogenic" with a
 * dissertation on elastostatics and a textbook on homogeneous catalysis. A
 * format that classifies into none of the four is not a record, so it goes.
 *
 * The earlier attempt filtered these by relevance instead -- every word of
 * the query had to occur in the title. That removed the books, and with them
 * the whole point of the list: a mistyped "Homogenik" would have thrown away
 * the very suggestion that repairs it.
 */
function wantedFormat(raw: string | undefined, selected: SelectableFormat[]): boolean {
  const classified = classifyFormat(raw);
  if (classified === undefined) return false;
  return selected.includes(classified);
}

// Supplies suggestions for the full album title while the user is only
// typing a fragment (e.g. "Ambient Works"). Uses all 6 "fast" shops (not
// HHV -- that would start its own Camoufox session on every keystroke) as
// the data source.
//
// `formats` mirrors the tick boxes in the interface, so the suggestions talk
// about the same records the search would. An empty selection is read as all
// four rather than as nothing: the search warns about it separately, and a
// suggestion list that goes blank would only look broken.
export async function fetchTitleSuggestions(
  query: string,
  formats: SelectableFormat[] = SELECTABLE_FORMATS
): Promise<TitleSuggestion[]> {
  if (query.trim().length < 3) return [];
  const selected = formats.length > 0 ? formats : SELECTABLE_FORMATS;

  const [anostRes, soundohmRes, bisAufsMesserRes, soufflecontinuRes, hardwaxRes, jpcRes] =
    await Promise.allSettled([
      searchAnost(query),
      searchSoundOhm(query),
      searchBisAufsMesser(query),
      searchSouffleContinu(query),
      fetchHardWaxSearch(query),
      fetchJpcSearch(query),
    ]);

  const perShop: Candidate[][] = [];

  if (anostRes.status === "fulfilled") {
    // ANOST's search returns releases[] without a linked artist name (only
    // a separate, unlinked artists[] list) -- hence deliberately no artist
    // field here, instead of guessing.
    //
    // One release lists all its carriers at once, so all of them are kept
    // and the choice is made further down.
    perShop.push(
      (anostRes.value.releases ?? []).map((release) => ({
        title: release.title,
        formats: (release.formats ?? []).map((f) => f.format),
      }))
    );
  }

  if (soundohmRes.status === "fulfilled") {
    perShop.push(
      (soundohmRes.value.result?.products ?? []).map((product) => ({
        artist: product.artist_info?.map((a) => a.name).join(", "),
        title: product.title,
        // Same fallback as soundohm/transform.ts: the detailed wording where
        // there is one, the coarse kind otherwise.
        formats: [product.format_info ?? product.kind],
      }))
    );
  }

  if (bisAufsMesserRes.status === "fulfilled") {
    perShop.push(
      (bisAufsMesserRes.value.resources?.results?.products ?? []).map((product) => ({
        artist: product.vendor,
        title: product.title,
        formats: [product.type ?? ""],
      }))
    );
  }

  if (soufflecontinuRes.status === "fulfilled") {
    perShop.push(
      (soufflecontinuRes.value.rs?.articles ?? []).map((article) => ({
        artist: article.artiste,
        title: article.titre,
        formats: [article.support],
      }))
    );
  }

  // Hard Wax and JPC return server-rendered HTML instead of JSON -- use the
  // same parsers as the real search (transformHardWax/transformJpc). Those
  // already carry a format field, which is exactly what is needed here.
  if (hardwaxRes.status === "fulfilled") {
    perShop.push(
      transformHardWax(hardwaxRes.value)
        .map((r) => ({ artist: r.artist, title: r.title, formats: [r.format ?? ""] }))
    );
  }

  if (jpcRes.status === "fulfilled") {
    perShop.push(
      transformJpc(jpcRes.value)
        .map((r) => ({ artist: r.artist, title: r.title, formats: [r.format ?? ""] }))
    );
  }

  // Round-Robin instead of concatenating shop by shop: otherwise a single
  // shop with many (loosely matched) hits fills the whole list on its own
  // before another shop gets a turn at all (observed live: "People of the
  // Moon" did not show the correct JPC hit in the suggestion list, even
  // though JPC found it in the real search -- it simply sat too far back in
  // the push order). This way every shop gets at least a fair first chance
  // at a place in the list.
  const interleaved: Candidate[] = [];
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
    // Keep only entries that come on one of the four carriers, and take the
    // first that the user actually asked for -- an ANOST release offering LP
    // and CD is suggested as whichever of the two is ticked.
    .flatMap((candidate) => {
      const format = candidate.formats.find((f) => wantedFormat(f, selected));
      if (format === undefined) return [];
      return [{ artist: candidate.artist, title: candidate.title, format }];
    })
    .filter((s) => {
      const key = `${s.artist ?? ""}::${s.title}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}
