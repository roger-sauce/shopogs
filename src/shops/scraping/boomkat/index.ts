import type { ShopAdapter } from "../../../types/shop";
import { autocompleteBoomkat, fetchBoomkatArtistPage } from "./api";
import { transformBoomkatArtistPage } from "./transform";

const boomkat: ShopAdapter = {
  id: "boomkat",
  name: "Boomkat",
  country: "GB",
  group: "mail-order",
  homeUrl: "https://boomkat.com",
  logoUrl: "https://pbs.twimg.com/profile_images/779441514/BoomkatLogoTwitter01_400x400.jpg",
  type: "scraping",
  async checkAvailability(artist, title) {
    const query = [artist, title].filter(Boolean).join(" ").trim();
    const suggestions = await autocompleteBoomkat(query);
    const artistMatch = suggestions.find((s) => s.type === "Artist");

    if (!artistMatch) {
      // Kein Artist-Treffer über Autocomplete gefunden -> kein Ergebnis.
      return [];
    }

    const [inStockHtml, outOfStockHtml] = await Promise.all([
      fetchBoomkatArtistPage(artistMatch.url, "in-stock"),
      fetchBoomkatArtistPage(artistMatch.url, "out-of-stock"),
    ]);

    const inStock = transformBoomkatArtistPage(inStockHtml, true);
    const outOfStock = transformBoomkatArtistPage(outOfStockHtml, false);

    const titleLower = title.toLowerCase();
    const matchesTitle = (r: { title: string }) =>
      !titleLower || r.title.toLowerCase().includes(titleLower);

    return [...inStock, ...outOfStock].filter(matchesTitle);
  },
};

export default boomkat;
