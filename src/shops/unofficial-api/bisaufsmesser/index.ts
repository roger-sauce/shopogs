import type { ShopAdapter } from "../../../types/shop";
import { searchBisAufsMesser } from "./api";
import { transformBisAufsMesser } from "./transform";
import { matchesQueryWords } from "../../../lib/relevance";

const bisAufsMesser: ShopAdapter = {
  id: "bis-aufs-messer",
  name: "Bis Aufs Messer",
  country: "DE",
  group: "pickup-berlin",
  homeUrl: "https://bisaufsmesser.com",
  logoUrl: "https://bisaufsmesser.com/cdn/shop/files/web_250x@2x.jpg?v=1613733941",
  type: "unofficial-api",
  speed: "fast",
  async checkAvailability(artist, title) {
    const query = [artist, title].filter(Boolean).join(" ").trim();
    if (!query) return [];

    const raw = await searchBisAufsMesser(query);
    const results = transformBisAufsMesser(raw);

    // Shopify-Suche (vendor = Artist) matcht wie bei den anderen Shops eher
    // breit -- gleicher Wortgrenzen-Filter gegen Artist+Titel kombiniert.
    return results.filter((r) => matchesQueryWords(`${r.artist ?? ""} ${r.title}`, query));
  },
};

export default bisAufsMesser;
