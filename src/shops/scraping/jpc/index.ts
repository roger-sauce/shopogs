import type { ShopAdapter, LabelSearchResult } from "../../../types/shop";
import { fetchJpcSearch, fetchJpcLabelSearch, jpcLabelUrl } from "./api";
import { transformJpc, extractJpcLabelCount } from "./transform";
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
  async checkLabelAvailability(label): Promise<LabelSearchResult> {
    const needle = label.trim();
    if (!needle) return { supported: true, count: 0, url: "https://www.jpc.de" };

    const url = jpcLabelUrl(needle);
    const html = await fetchJpcLabelSearch(needle);
    const count = extractJpcLabelCount(html);
    return { supported: true, count, url };
  },
};

export default jpc;
