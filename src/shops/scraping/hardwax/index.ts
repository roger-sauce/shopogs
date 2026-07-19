import type { ShopAdapter, LabelSearchResult } from "../../../types/shop";
import { fetchHardWaxSearch, fetchHardWaxLabelPage, slugifyHardWaxLabel } from "./api";
import { transformHardWax, countHardWaxLabelArticles } from "./transform";
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
  async checkLabelAvailability(label): Promise<LabelSearchResult> {
    const needle = label.trim();
    if (!needle) return { supported: true, count: 0, url: "https://hardwax.com" };

    const slug = slugifyHardWaxLabel(needle);
    const url = `https://hardwax.com/label/${slug}/`;
    const html = await fetchHardWaxLabelPage(slug);
    const count = countHardWaxLabelArticles(html);
    return { supported: true, count, url };
  },
};

export default hardWax;
