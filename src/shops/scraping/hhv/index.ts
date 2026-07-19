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
    // Jede Suche baut im Sidecar eine eigene Camoufox-Session auf (siehe
    // browserSession.js) -- egal ob die Suche erfolgreich war oder mit
    // einem Fehler abbricht, muss diese Session danach geschlossen werden,
    // sonst bleibt der Browser-Prozess bis zum Idle-Timeout offen.
    try {
      const query = [artist, title].filter(Boolean).join(" ").trim();
      const articleIds = await searchHhvArticleIds(query);

      const entries = await Promise.all(
        articleIds.map(async (id) => {
          try {
            const html = await fetchHhvListEntry(id);
            return transformHhvListEntry(html, id);
          } catch (err) {
            console.warn(`[hhv] Artikel ${id} fehlgeschlagen:`, err);
            return null;
          }
        })
      );

      // HHVs Suche matcht wie bei SoundOhm/Souffle Continu/JPC breit, nicht
      // nur exakte Treffer (live beobachtet: Suche "Nu Genea People of the
      // Moon" lieferte neben der gesuchten Platte auch "Sunny G ... So What
      // You Want" und "The Shapeshifters ... Let Loose" zurück). Gleicher
      // Fix wie bei den anderen Shops: jedes Wort der Anfrage muss als
      // ganzes Wort in Artist+Titel vorkommen.
      return entries
        .filter((e): e is AvailabilityResult => e !== null)
        .filter((r) => matchesQueryWords(`${r.artist ?? ""} ${r.title}`, query));
    } finally {
      await closeHhvSession();
    }
  },
  async checkLabelAvailability(label): Promise<LabelSearchResult> {
    // Wie bei checkAvailability: jede Suche baut im Sidecar eine eigene
    // Camoufox-Session auf, die danach unbedingt wieder geschlossen werden
    // muss.
    try {
      const needle = label.trim();
      const searchUrl = `https://www.hhv.de/records/katalog/filter/suche-${HHV_SEARCH_FACET}?term=${encodeURIComponent(
        needle
      )}`;
      if (!needle) return { supported: true, count: 0, url: "https://www.hhv.de" };

      const html = await fetchHhvSearchPage(needle);
      const dataPath = findHhvLabelDataPath(html, needle);

      if (!dataPath) {
        // Kein Label-Filter-Link mit passendem data-title gefunden -- Shop
        // unterstützt Label-Suche, führt dieses Label aber nicht (oder der
        // Freitext-Suchbegriff traf kein Label). Fallback auf die einfache
        // Freitext-Suchseite statt einer 404-Detailseite.
        return { supported: true, count: 0, url: searchUrl };
      }

      const pathUrl = dataPath.startsWith("http")
        ? dataPath
        : `https://www.hhv.de${dataPath.startsWith("/") ? "" : "/"}${dataPath}`;
      const pathHtml = await fetchHhvPath(dataPath);
      const count = extractHhvArticleCount(pathHtml);
      return { supported: true, count, url: pathUrl };
    } finally {
      await closeHhvSession();
    }
  },
};

export default hhv;
