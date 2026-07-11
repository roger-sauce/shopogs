import type { ShopAdapter, AvailabilityResult } from "../../../types/shop";
import { searchHhvArticleIds, fetchHhvListEntry } from "./api";
import { transformHhvListEntry } from "./transform";

const hhv: ShopAdapter = {
  id: "hhv",
  name: "HHV",
  country: "DE",
  group: "pickup-berlin",
  homeUrl: "https://www.hhv.de",
  logoUrl: "https://upload.wikimedia.org/wikipedia/commons/2/28/Hhv-Logo.png",
  type: "scraping",
  async checkAvailability(artist, title) {
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

    return entries.filter((e): e is AvailabilityResult => e !== null);
  },
};

export default hhv;
