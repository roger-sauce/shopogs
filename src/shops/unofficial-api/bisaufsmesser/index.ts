import type { ShopAdapter } from "../../../types/shop";
import { searchBisAufsMesser } from "./api";
import { transformBisAufsMesser } from "./transform";

const bisAufsMesser: ShopAdapter = {
  id: "bis-aufs-messer",
  name: "Bis Aufs Messer",
  country: "DE",
  group: "pickup-berlin",
  homeUrl: "https://bisaufsmesser.com",
  logoUrl: "https://bisaufsmesser.com/cdn/shop/files/web_250x@2x.jpg?v=1613733941",
  type: "unofficial-api",
  async checkAvailability(artist, title) {
    const query = [artist, title].filter(Boolean).join(" ").trim();
    const raw = await searchBisAufsMesser(query);
    return transformBisAufsMesser(raw);
  },
};

export default bisAufsMesser;
