import type { ShopAdapter, AvailabilityResult, LabelSearchResult } from "../../../types/shop";
import {
  searchBoomkatKeywords,
  fetchBoomkatReleasePage,
  fetchBoomkatArtistPage,
  fetchBoomkatLabelPage,
  slugifyArtist,
  closeBoomkatSession,
} from "./api";
import {
  transformBoomkatProductPage,
  parseBoomkatKeywordResults,
  parseBoomkatArtistPage,
  countBoomkatLabelProducts,
  type BoomkatReleaseEntry,
} from "./transform";
import { matchesQueryWords } from "../../../lib/relevance";

const boomkat: ShopAdapter = {
  id: "boomkat",
  name: "Boomkat",
  country: "GB",
  group: "mail-order",
  homeUrl: "https://boomkat.com",
  logoUrl: "https://pbs.twimg.com/profile_images/779441514/BoomkatLogoTwitter01_400x400.jpg",
  type: "scraping",
  // Runs through the browser sidecar like HHV (full Camoufox browser
  // navigation instead of a direct reverse proxy) -- see api.ts.
  speed: "slow",
  async checkAvailability(artist, title) {
    // Every search sets up its own Camoufox session in the sidecar (see
    // browserSession.js) -- no matter whether the search succeeded or
    // aborted with an error, that session has to be closed afterwards,
    // otherwise the browser process stays open until the idle timeout.
    try {
      const artistNeedle = artist.trim();
      const titleNeedle = title.trim();
      if (!artistNeedle && !titleNeedle) return [];

      const query = [artistNeedle, titleNeedle].filter(Boolean).join(" ");
      let releaseMatches: BoomkatReleaseEntry[] = [];

      // With an artist to go on, the artist overview page is the better
      // source and it is tried first -- for both kinds of search, not just
      // the artist-only one as before.
      //
      // The keyword search answers with five rows, ranked by its own idea of
      // relevance, and a record that is in the shop can simply fall off that
      // list (observed: "Sees" was found through the title but not through
      // the artist name). /artists/<slug> lists the catalogue in full and
      // costs exactly one request either way.
      if (artistNeedle) {
        try {
          const html = await fetchBoomkatArtistPage(slugifyArtist(artistNeedle));
          releaseMatches = parseBoomkatArtistPage(html).filter((entry) =>
            matchesQueryWords(`${entry.artist} ${entry.title}`, query)
          );
        } catch (err) {
          console.warn(`[boomkat] Artist-Seite fehlgeschlagen, Fallback auf Stichwortsuche:`, err);
        }
      }

      // No artist, an unknown slug, or nothing on the page that matches the
      // title: ask the search. It returns artists, releases and a link to
      // the full search page all mixed together; the parser keeps the
      // releases.
      if (releaseMatches.length === 0) {
        const hits = parseBoomkatKeywordResults(await searchBoomkatKeywords(query));
        releaseMatches = hits.filter((hit) =>
          matchesQueryWords(`${hit.artist} ${hit.title}`, query)
        );
      }

      const results = await Promise.all(
        releaseMatches.map(async (match) => {
          try {
            const html = await fetchBoomkatReleasePage(match.url);
            const releaseUrl = match.url.startsWith("http")
              ? match.url
              : `https://boomkat.com${match.url}`;
            return transformBoomkatProductPage(html, match.artist, match.title, releaseUrl);
          } catch (err) {
            console.warn(`[boomkat] Release-Seite ${match.url} fehlgeschlagen:`, err);
            return [];
          }
        })
      );

      return results.flat() as AvailabilityResult[];
    } finally {
      await closeBoomkatSession();
    }
  },
  async checkLabelAvailability(label): Promise<LabelSearchResult> {
    // As with checkAvailability: every search sets up its own Camoufox
    // session in the sidecar, which absolutely has to be closed again
    // afterwards.
    try {
      const needle = label.trim();
      if (!needle) return { supported: true, count: 0, url: "https://boomkat.com" };

      const slug = slugifyArtist(needle);
      const url = `https://boomkat.com/labels/${slug}`;
      const html = await fetchBoomkatLabelPage(slug);
      const count = countBoomkatLabelProducts(html);
      return { supported: true, count, url };
    } finally {
      await closeBoomkatSession();
    }
  },
};

export default boomkat;
