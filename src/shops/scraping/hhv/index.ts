import type { ShopAdapter, AvailabilityResult } from "../../../types/shop";
import { searchHhvArticleIds, fetchHhvListEntry, closeHhvSession } from "./api";
import { transformHhvListEntry } from "./transform";
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
};

export default hhv;
