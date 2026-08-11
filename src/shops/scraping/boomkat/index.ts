import type { ShopAdapter, AvailabilityResult, LabelSearchResult } from "../../../types/shop";
import {
  autocompleteBoomkat,
  fetchBoomkatProductPage,
  fetchBoomkatArtistPage,
  fetchBoomkatLabelPage,
  slugifyArtist,
  closeBoomkatSession,
} from "./api";
import {
  transformBoomkatProductPage,
  parseBoomkatArtistPage,
  countBoomkatLabelProducts,
} from "./transform";
import { matchesQueryWords } from "../../../lib/relevance";

interface ReleaseMatch {
  artist: string;
  title: string;
  url: string;
}

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

      let releaseMatches: ReleaseMatch[] = [];

      // Pure artist search (no title): the autocomplete API only returns a
      // limited, ranked "best guess" list (~10 hits) and can miss an
      // existing release for short/generic names (observed live: "Sees" was
      // found via the title search "Ampersand Curve", but not via a pure
      // artist search for "Sees"). The artist overview page
      // /artists/<slug> on the other hand lists all of the artist's
      // releases in full -- try it as the primary source for artist-only
      // searches, with a fallback to autocomplete if the slug does not
      // exist or returns nothing.
      if (!titleNeedle && artistNeedle) {
        try {
          const slug = slugifyArtist(artistNeedle);
          const html = await fetchBoomkatArtistPage(slug);
          const entries = parseBoomkatArtistPage(html);
          releaseMatches = entries.filter((e) => matchesQueryWords(e.artist, artistNeedle));
        } catch (err) {
          console.warn(`[boomkat] Artist-Seite fehlgeschlagen, Fallback auf Autocomplete:`, err);
        }
      }

      if (releaseMatches.length === 0) {
        const query = [artist, title].filter(Boolean).join(" ").trim();
        const suggestions = await autocompleteBoomkat(query);

        // Live Recon (as of now) shows: autocomplete only returns release
        // hits directly (no separate "Artist" hit type any more, as
        // documented in the old Recon) -- every hit already comes with
        // title, artist(s) and a direct product link.
        // Word-boundary filter against artist+title, the same pattern as
        // with the other shops.
        releaseMatches = suggestions
          .filter(
            (s) => s.type === "Release" && matchesQueryWords(`${s.artists.join(" ")} ${s.value}`, query)
          )
          .map((s) => ({ artist: s.artists.join(", "), title: s.value, url: s.url }));
      }

      const results = await Promise.all(
        releaseMatches.map(async (match) => {
          try {
            const html = await fetchBoomkatProductPage(match.url);
            const productUrl = match.url.startsWith("http")
              ? match.url
              : `https://boomkat.com${match.url}`;
            return transformBoomkatProductPage(html, match.artist, match.title, productUrl);
          } catch (err) {
            console.warn(`[boomkat] Produktseite ${match.url} fehlgeschlagen:`, err);
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
