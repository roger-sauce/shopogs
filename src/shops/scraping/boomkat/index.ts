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
      // The keyword search is the first and, in practice, the only way in.
      //
      // The artist overview page would be the richer source -- it lists a
      // catalogue in full, where the search answers with five ranked rows --
      // and it used to be asked first for exactly that reason. Measured
      // against the live shop in October 2026, it is simply not available to
      // us any more: /artists/<slug> answers 403 to the sidecar, on the
      // retry as well, while /labels/<slug> and the release pages come
      // through untouched. Boomkat evidently guards its artist listings
      // harder than the rest.
      //
      // Asking it first therefore burned two doomed requests before every
      // single search -- slower, and precisely the kind of load that invites
      // the throttling we then blamed on something else.
      let releaseMatches: BoomkatReleaseEntry[] = [];

      try {
        const hits = parseBoomkatKeywordResults(await searchBoomkatKeywords(query));
        releaseMatches = hits.filter((hit) =>
          matchesQueryWords(`${hit.artist} ${hit.title}`, query)
        );
      } catch (err) {
        console.warn(`[boomkat] Stichwortsuche fehlgeschlagen:`, err);
      }

      // Kept as a last resort rather than deleted. It costs nothing while
      // the search delivers, it is the better source should Boomkat ever
      // relax that rule, and it still answers the case the search is known
      // to be weak at: a title the ranking drops (observed: "Sees" was found
      // through the title but not through the artist name).
      if (releaseMatches.length === 0 && artistNeedle) {
        try {
          const html = await fetchBoomkatArtistPage(slugifyArtist(artistNeedle));
          releaseMatches = parseBoomkatArtistPage(html).filter((entry) =>
            matchesQueryWords(`${entry.artist} ${entry.title}`, query)
          );
        } catch (err) {
          console.warn(`[boomkat] Artist-Seite fehlgeschlagen:`, err);
        }
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
