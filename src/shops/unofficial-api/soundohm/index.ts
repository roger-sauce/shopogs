import type { ShopAdapter, LabelSearchResult } from "../../../types/shop";
import { searchSoundOhm, fetchSoundOhmLabelPage } from "./api";
import { transformSoundOhm, countSoundOhmLabelProducts } from "./transform";
import { matchesQueryWords } from "../../../lib/relevance";

const SOUNDOHM_HOME_URL = "https://www.soundohm.com";

const soundohm: ShopAdapter = {
  id: "soundohm",
  name: "SoundOhm",
  country: "IT",
  group: "mail-order",
  homeUrl: "https://www.soundohm.com",
  logoUrl: "https://i1.sndcdn.com/avatars-000471818916-qum5j1-t500x500.jpg",
  type: "unofficial-api",
  speed: "fast",
  async checkAvailability(artist, title) {
    // SoundOhm's quickSearch matches the query only as an exact phrase
    // against title/catalogue fields, not against the artist name (verified
    // by recon: "Andrew Anderson" on its own returns 0 hits even though the
    // artist exists; "Thresholds" on its own finds the record correctly). A
    // combined "artist title" string therefore almost always fails.
    // Hence: prefer searching the title only, artist just as a fallback when
    // no title was given.
    const titleNeedle = title.trim();
    const artistNeedle = artist.trim();
    const query = titleNeedle || artistNeedle;
    if (!query) return [];

    const raw = await searchSoundOhm(query);
    const rawResults = transformSoundOhm(raw);

    if (titleNeedle) {
      // SoundOhm's search matches loosely by substring, not only whole words —
      // searching "Memoria" also found e.g. "Memorial", "In Memoriam" and the
      // like (verified). So filter client-side for whole-word matches
      // against the title (still allows fragment searches spanning
      // several words, but prevents such substring false positives).
      const results = rawResults.filter((r) => matchesQueryWords(r.title, titleNeedle));

      if (!artistNeedle) return results;

      // A title search can hit several artists (e.g. identically named titles) —
      // so filter by artist as well. No more fallback to "all hits" when
      // that yields 0 results: until now that caused a clearly wrong
      // artist to be shown anyway as soon as NO hit confirmed the
      // artist (e.g. searching "Lovegod Rendezvous" showed a
      // "Rendezvous" hit by a completely different artist). If the
      // artist field is missing on a hit we still let it through (it cannot
      // be checked) — but an artist field that is present and does not match
      // now excludes the hit consistently.
      return results.filter(
        (r) => !r.artist || r.artist.toLowerCase().includes(artistNeedle.toLowerCase())
      );
    }

    // Only artist given, no title: the search ran with the artist name
    // as the query, but according to RECON.md it matches only against
    // title/catalogue fields, not against the artist name itself. Without this
    // filter we get back hits where the name happens to appear in the TITLE
    // instead of in the artist field (observed live: searching "Sees" found
    // "... A Mountain Sees a Mountain" by Hamid Drake/Pat Thomas — "Sees"
    // only appeared in the title).
    // So filter explicitly against the ARTIST field here, not against the title.
    return rawResults.filter((r) => r.artist && matchesQueryWords(r.artist, artistNeedle));
  },
  async checkLabelAvailability(label): Promise<LabelSearchResult> {
    const needle = label.trim();
    if (!needle) return { supported: true, count: 0, url: SOUNDOHM_HOME_URL };

    const raw = await searchSoundOhm(needle);
    const products = raw.result?.products ?? [];
    const matchingLabel = products
      .flatMap((p) => p.label_info ?? [])
      .find((l) => l.name.trim().toLowerCase() === needle.toLowerCase());

    if (!matchingLabel) {
      // No product with a matching label name found -- unlike ANOST,
      // SoundOhm offers no alphabetical label index page as a
      // sensible fallback link, so fall back to the homepage.
      return { supported: true, count: 0, url: SOUNDOHM_HOME_URL };
    }

    const html = await fetchSoundOhmLabelPage(matchingLabel.slug);
    const count = countSoundOhmLabelProducts(html);
    return { supported: true, count, url: `https://www.soundohm.com/label/${matchingLabel.slug}` };
  },
};

export default soundohm;
