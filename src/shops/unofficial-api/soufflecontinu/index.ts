import type { ShopAdapter, LabelSearchResult } from "../../../types/shop";
import {
  searchSouffleContinu,
  fetchSouffleContinuLabelsIndex,
  fetchSouffleContinuLabelArticleCount,
} from "./api";
import { transformSouffleContinu, findSouffleContinuLabelEntry } from "./transform";
import { matchesQueryWords } from "../../../lib/relevance";

// Labels starting with a digit live in the alphabetical index under the
// letter "0" (verified by recon), everything else under its first
// letter.
function souffleContinuIndexLetter(label: string): string {
  const first = label.trim().charAt(0).toLowerCase();
  return /[0-9]/.test(first) ? "0" : first;
}

const souffleContinu: ShopAdapter = {
  id: "souffle-continu",
  name: "Souffle Continu",
  country: "FR",
  group: "mail-order",
  homeUrl: "https://www.soufflecontinu.com",
  logoUrl:
    "https://osuny-1b4da.kxcdn.com/app19ybcf8yy75hadh9ubbrluox2?format=webp&width=200&height=200&fit=cover&quality=80",
  type: "unofficial-api",
  speed: "fast",
  async checkAvailability(artist, title) {
    // Verified as with SoundOhm: the search matches a combined
    // "artist title" string badly or not at all (tested: "Nurse With Wound
    // Alice The Goon" -> 0 hits even though the record exists; "Alice The
    // Goon" on its own finds it correctly). So prefer searching the title
    // only, artist just as a fallback when no title was given.
    const titleNeedle = title.trim();
    const artistNeedle = artist.trim();
    const query = titleNeedle || artistNeedle;
    if (!query) return [];

    const raw = await searchSouffleContinu(query);
    const rawResults = transformSouffleContinu(raw);

    if (titleNeedle) {
      // As with SoundOhm: the search matches loosely by substring, not only
      // whole words (verified: "Memoria" also found "In Memoriam",
      // "Memorial" etc.). Filter client-side for whole-word matches against
      // the title.
      const results = rawResults.filter((r) => matchesQueryWords(r.title, titleNeedle));

      if (!artistNeedle) return results;

      // No more fallback to "all hits" when there are 0 artist matches (the
      // same bugfix as with SoundOhm) — an artist field that is present but
      // does not match excludes the hit, instead of it being displayed
      // anyway.
      return results.filter(
        (r) => !r.artist || r.artist.toLowerCase().includes(artistNeedle.toLowerCase())
      );
    }

    // Only an artist given, no title: the same bugfix as with SoundOhm --
    // without a title the query previously matched only against the title
    // of the hits, never against the artist field itself. Now filter
    // against it explicitly.
    return rawResults.filter((r) => r.artist && matchesQueryWords(r.artist, artistNeedle));
  },
  async checkLabelAvailability(label): Promise<LabelSearchResult> {
    const needle = label.trim();
    if (!needle) return { supported: true, count: 0, url: "https://www.soufflecontinu.com" };

    const letter = souffleContinuIndexLetter(needle);
    const indexUrl = `https://www.soufflecontinu.com/labels/${letter}/`;
    const indexHtml = await fetchSouffleContinuLabelsIndex(letter);
    const entry = findSouffleContinuLabelEntry(indexHtml, needle);

    if (!entry) {
      // Label not listed on this letter page -- the shop does not carry
      // this label, but the search itself is supported (see the
      // LabelSearchResult docs: count 0 + fallback URL to the overview
      // page, not a 404 detail page).
      return { supported: true, count: 0, url: indexUrl };
    }

    const labelUrl = entry.href.startsWith("http")
      ? entry.href
      : `https://www.soufflecontinu.com${entry.href.startsWith("/") ? "" : "/"}${entry.href}`;
    const count = await fetchSouffleContinuLabelArticleCount(entry.id);
    return { supported: true, count, url: labelUrl };
  },
};

export default souffleContinu;
