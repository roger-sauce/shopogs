import type { ShopAdapter } from "../../../types/shop";
import { searchAnost } from "./api";
import { transformAnost } from "./transform";
import { matchesQueryWords } from "../../../lib/relevance";

const anost: ShopAdapter = {
  id: "anost",
  name: "ANOST",
  country: "DE",
  group: "pickup-berlin",
  homeUrl: "https://www.anost.net",
  type: "unofficial-api",
  speed: "fast",
  async checkAvailability(artist, title) {
    const titleNeedle = title.trim();
    const artistNeedle = artist.trim();
    const query = [artist, title].filter(Boolean).join(" ").trim();
    if (!query) return [];

    const raw = await searchAnost(query);
    const results = transformAnost(raw);

    if (titleNeedle) {
      // Titel angegeben: ANOSTs releases[] haben kein eigenes Artist-Feld
      // (nur einen separaten, nicht verknüpften artists[]-Treffer-Block) --
      // der Filter kann hier also nur gegen den Titel prüfen, nicht gegen
      // Artist+Titel kombiniert wie bei den anderen Shops.
      return results.filter((r) => matchesQueryWords(r.title, titleNeedle));
    }

    // Nur Artist angegeben, kein Titel: releases[] selbst verrät nicht, ob
    // ein Treffer zum gesuchten Artist gehört. Den Titel gegen den
    // Artist-Namen zu prüfen würde denselben Fehltreffer-Bug reproduzieren,
    // den wir bei SoundOhm/Souffle Continu schon gefixt haben (Artist-Name
    // erscheint nur zufällig im Titel). Stattdessen den separaten
    // artists[]-Block der Antwort nutzen: nur wenn ANOST selbst einen
    // passenden Artist-Treffer meldet, gelten die zurückgegebenen Releases
    // für diese Anfrage als vertrauenswürdig.
    const hasMatchingArtist = (raw.artists ?? []).some((a) => matchesQueryWords(a.name, artistNeedle));
    return hasMatchingArtist ? results : [];
  },
};

export default anost;
