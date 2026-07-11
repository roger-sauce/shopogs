import type { ShopAdapter } from "../../../types/shop";
import { searchAnost } from "./api";
import { transformAnost } from "./transform";

const anost: ShopAdapter = {
  id: "anost",
  name: "ANOST",
  country: "DE",
  group: "pickup-berlin",
  homeUrl: "https://www.anost.net",
  type: "unofficial-api",
  async checkAvailability(artist, title) {
    const query = [artist, title].filter(Boolean).join(" ").trim();
    const raw = await searchAnost(query);
    return transformAnost(raw);
  },
};

export default anost;
