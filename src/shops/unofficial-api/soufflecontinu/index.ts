import type { ShopAdapter } from "../../../types/shop";
import { searchSouffleContinu } from "./api";
import { transformSouffleContinu } from "./transform";
import { matchesQueryWords } from "../../../lib/relevance";

const souffleContinu: ShopAdapter = {
  id: "souffle-continu",
  name: "Souffle Continu",
  country: "FR",
  group: "mail-order",
  homeUrl: "https://www.soufflecontinu.com",
  logoUrl:
    "https://osuny-1b4da.kxcdn.com/app19ybcf8yy75hadh9ubbrluox2?format=webp&width=200&height=200&fit=cover&quality=80",
  type: "unofficial-api",
  async checkAvailability(artist, title) {
    // Wie bei SoundOhm verifiziert: die Suche matcht einen kombinierten
    // "Artist Titel"-String schlecht/gar nicht (getestet: "Nurse With Wound
    // Alice The Goon" -> 0 Treffer, obwohl die Platte existiert; "Alice The
    // Goon" alleine findet sie korrekt). Deshalb bevorzugt nur den Titel
    // suchen, Artist nur als Fallback wenn kein Titel angegeben wurde.
    const query = title.trim() || artist.trim();
    if (!query) return [];

    const raw = await searchSouffleContinu(query);
    const rawResults = transformSouffleContinu(raw);

    // Wie bei SoundOhm: die Suche matcht lose per Substring, nicht nur ganze
    // Wörter (verifiziert: "Memoria" fand auch "In Memoriam", "Memorial"
    // usw.). Clientseitig auf ganze Wortübereinstimmung gegen den Titel
    // nachfiltern.
    const results = rawResults.filter((r) => matchesQueryWords(r.title, query));

    const artistNeedle = artist.trim().toLowerCase();
    if (!artistNeedle || !title.trim()) return results;

    // Kein Fallback mehr auf "alle Treffer" bei 0 Artist-Matches (gleicher
    // Bugfix wie bei SoundOhm) — ein vorhandenes, nicht passendes
    // Artist-Feld schließt den Treffer aus, statt trotzdem angezeigt zu
    // werden.
    return results.filter((r) => !r.artist || r.artist.toLowerCase().includes(artistNeedle));
  },
};

export default souffleContinu;
