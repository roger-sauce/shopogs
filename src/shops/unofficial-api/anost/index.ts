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
      // Title given: ANOST's releases[] have no artist field of their own
      // (only a separate, unlinked artists[] block of hits) -- so the filter
      // can only check against the title here, not against artist+title
      // combined the way the other shops do.
      return results.filter((r) => matchesQueryWords(r.title, titleNeedle));
    }

    // Only artist given, no title: releases[] itself does not reveal whether
    // a hit belongs to the artist being searched for. Checking the title
    // against the artist name would reproduce the same false-hit bug we
    // already fixed for SoundOhm/Souffle Continu (the artist name only
    // happens to appear in the title by coincidence). Instead use the
    // separate artists[] block of the response: only if ANOST itself reports
    // a matching artist hit are the returned releases considered trustworthy
    // for this query.
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
