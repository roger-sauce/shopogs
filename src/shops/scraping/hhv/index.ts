import type { ShopAdapter, AvailabilityResult, LabelSearchResult } from "../../../types/shop";
import {
  searchHhvArticleIds,
  fetchHhvListEntry,
  fetchHhvSearchPage,
  fetchHhvPath,
  closeHhvSession,
  HHV_SEARCH_FACET,
} from "./api";
import { transformHhvListEntry, findHhvLabelDataPath, extractHhvArticleCount } from "./transform";
import { matchesQueryWords } from "../../../lib/relevance";
import { newSearchId } from "../../../lib/searchId";

const hhv: ShopAdapter = {
  id: "hhv",
  name: "HHV",
  country: "DE",
  group: "pickup-berlin",
  homeUrl: "https://www.hhv.de",
  logoUrl: "https://upload.wikimedia.org/wikipedia/commons/2/28/Hhv-Logo.png",
  type: "scraping",
  speed: "slow",
  async checkAvailability(artist, title) {
    // One id per search, carried on every request to the sidecar: it gives
    // this search a browser context of its own, so a search running at the
    // same time cannot be disturbed by it -- and cannot be torn down by the
    // close below. See src/lib/searchId.ts.
    const searchId = newSearchId();

    // No matter whether the search succeeded or aborted with an error, that
    // context has to be closed afterwards, otherwise it lingers until its
    // own timeout.
    try {
      const query = [artist, title].filter(Boolean).join(" ").trim();
      const articleIds = await searchHhvArticleIds(query, searchId);

      const entries = await Promise.all(
        articleIds.map(async (id) => {
          try {
            const html = await fetchHhvListEntry(id, searchId);
            return transformHhvListEntry(html, id);
          } catch (err) {
            console.warn(`[hhv] Artikel ${id} fehlgeschlagen:`, err);
            return null;
          }
        })
      );

      // HHV's search matches broadly, as with SoundOhm/Souffle Continu/JPC,
      // not just exact hits (observed live: the search "Nu Genea People of
      // the Moon" returned, besides the record we were after, also "Sunny G
      // ... So What You Want" and "The Shapeshifters ... Let Loose"). Same
      // fix as in the other shops: every word of the query has to occur as a
      // whole word in artist+title.
      return entries
        .filter((e): e is AvailabilityResult => e !== null)
        .filter((r) => matchesQueryWords(`${r.artist ?? ""} ${r.title}`, query));
    } finally {
      await closeHhvSession(searchId);
    }
  },
  async checkLabelAvailability(label): Promise<LabelSearchResult> {
    // One id per search, carried on every request to the sidecar: it gives
    // this search a browser context of its own, so a search running at the
    // same time cannot be disturbed by it -- and cannot be torn down by the
    // close below. See src/lib/searchId.ts.
    const searchId = newSearchId();

    // As in checkAvailability: the context has to be closed again
    // afterwards.
    try {
      const needle = label.trim();
      const searchUrl = `https://www.hhv.de/records/katalog/filter/suche-${HHV_SEARCH_FACET}?term=${encodeURIComponent(
        needle
      )}`;
      if (!needle) return { supported: true, count: 0, url: "https://www.hhv.de" };

      const html = await fetchHhvSearchPage(needle, searchId);
      const dataPath = findHhvLabelDataPath(html, needle);

      if (!dataPath) {
        // No label filter link with a matching data-title found -- the shop
        // supports label search but does not carry this label (or the
        // free-text search term did not hit a label). Fall back to the plain
        // free-text search page instead of a 404 detail page.
        return { supported: true, count: 0, url: searchUrl };
      }

      const pathUrl = dataPath.startsWith("http")
        ? dataPath
        : `https://www.hhv.de${dataPath.startsWith("/") ? "" : "/"}${dataPath}`;
      const pathHtml = await fetchHhvPath(dataPath, searchId);
      const count = extractHhvArticleCount(pathHtml);
      return { supported: true, count, url: pathUrl };
    } finally {
      await closeHhvSession(searchId);
    }
  },
};

export default hhv;
