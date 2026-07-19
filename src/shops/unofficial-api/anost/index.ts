import type { ShopAdapter, LabelSearchResult } from "../../../types/shop";
import { searchAnost, fetchAnostLabelsPage } from "./api";
import { transformAnost, findAnostLabelEntry } from "./transform";
import { matchesQueryWords } from "../../../lib/relevance";

const ANOST_LABELS_URL = "https://www.anost.net/labels";

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
  async checkLabelAvailability(label): Promise<LabelSearchResult> {
    const needle = label.trim();
    if (!needle) return { supported: true, count: 0, url: ANOST_LABELS_URL };

    const html = await fetchAnostLabelsPage();
    const entry = findAnostLabelEntry(html, needle);
    if (!entry) return { supported: true, count: 0, url: ANOST_LABELS_URL };

    return { supported: true, count: entry.count, url: entry.url };
  },
};

export default anost;
