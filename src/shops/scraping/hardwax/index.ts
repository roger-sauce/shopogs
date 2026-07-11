import type { ShopAdapter } from "../../../types/shop";
import { fetchHardWaxSearch } from "./api";
import { transformHardWax } from "./transform";

const hardWax: ShopAdapter = {
  id: "hard-wax",
  name: "Hard Wax",
  country: "DE",
  group: "pickup-berlin",
  homeUrl: "https://hardwax.com",
  logoUrl:
    "https://gravatar.com/avatar/d6295178bd0bed1019559c8ca9c40745828cf5e0e4fbccfff2b46c973b50c9fb?s=300&r=pg&d=mm",
  type: "scraping",
  async checkAvailability(artist, title) {
    const query = [artist, title].filter(Boolean).join(" ").trim();
    const html = await fetchHardWaxSearch(query);
    return transformHardWax(html);
  },
};

export default hardWax;
