import type { ShopAdapter } from "../../../types/shop";
import { fetchJpcSearch } from "./api";
import { transformJpc } from "./transform";
import { matchesQueryWords } from "../../../lib/relevance";

const jpc: ShopAdapter = {
  id: "jpc",
  name: "JPC",
  country: "DE",
  group: "mail-order",
  homeUrl: "https://www.jpc.de",
  logoUrl:
    "https://upload.wikimedia.org/wikipedia/commons/5/5a/Jpc-schallplatten_Versandhandelsgesellschaft_mbH_Logo.svg",
  type: "scraping",
  speed: "fast",
  async checkAvailability(artist, title) {
    const query = [artist, title].filter(Boolean).join(" ").trim();
    if (!query) return [];

    const html = await fetchJpcSearch(query);
    const results = transformJpc(html);

    // JPCs Suche matcht Mehrwort-Queries eher großzügig (OR-artig) und
    // liefert dadurch auch Treffer, die nur einzelne Wörter enthalten
    // (z.B. bei "Aphex Twin Selected Ambient Works" auch fremde Alben mit
    // "Selected" im Titel). Gegen Artist+Titel kombiniert gegenprüfen.
    return results.filter((r) => matchesQueryWords(`${r.artist ?? ""} ${r.title}`, query));
  },
};

export default jpc;
