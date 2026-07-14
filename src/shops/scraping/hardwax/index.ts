import type { ShopAdapter } from "../../../types/shop";
import { fetchHardWaxSearch } from "./api";
import { transformHardWax } from "./transform";
import { matchesQueryWords } from "../../../lib/relevance";

const hardWax: ShopAdapter = {
  id: "hard-wax",
  name: "Hard Wax",
  country: "DE",
  group: "pickup-berlin",
  homeUrl: "https://hardwax.com",
  logoUrl:
    "https://gravatar.com/avatar/d6295178bd0bed1019559c8ca9c40745828cf5e0e4fbccfff2b46c973b50c9fb?s=300&r=pg&d=mm",
  type: "scraping",
  speed: "fast",
  async checkAvailability(artist, title) {
    const query = [artist, title].filter(Boolean).join(" ").trim();
    if (!query) return [];

    const html = await fetchHardWaxSearch(query);
    const results = transformHardWax(html);

    // Bisher ungefiltert -- Hard Wax' eigene Suche matcht offenbar breiter
    // als nur "alle Wörter der Anfrage im Treffer" (live beobachtet: Suche
    // "Sees" lieferte Treffer ganz ohne "Sees" in Artist/Titel). Gleicher
    // Wortgrenzen-Filter wie bei JPC/HHV/Boomkat.
    return results.filter((r) => matchesQueryWords(`${r.artist ?? ""} ${r.title}`, query));
  },
};

export default hardWax;
