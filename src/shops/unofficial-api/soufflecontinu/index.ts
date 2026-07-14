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
  speed: "fast",
  async checkAvailability(artist, title) {
    // Wie bei SoundOhm verifiziert: die Suche matcht einen kombinierten
    // "Artist Titel"-String schlecht/gar nicht (getestet: "Nurse With Wound
    // Alice The Goon" -> 0 Treffer, obwohl die Platte existiert; "Alice The
    // Goon" alleine findet sie korrekt). Deshalb bevorzugt nur den Titel
    // suchen, Artist nur als Fallback wenn kein Titel angegeben wurde.
    const titleNeedle = title.trim();
    const artistNeedle = artist.trim();
    const query = titleNeedle || artistNeedle;
    if (!query) return [];

    const raw = await searchSouffleContinu(query);
    const rawResults = transformSouffleContinu(raw);

    if (titleNeedle) {
      // Wie bei SoundOhm: die Suche matcht lose per Substring, nicht nur
      // ganze Wörter (verifiziert: "Memoria" fand auch "In Memoriam",
      // "Memorial" usw.). Clientseitig auf ganze Wortübereinstimmung gegen
      // den Titel nachfiltern.
      const results = rawResults.filter((r) => matchesQueryWords(r.title, titleNeedle));

      if (!artistNeedle) return results;

      // Kein Fallback mehr auf "alle Treffer" bei 0 Artist-Matches (gleicher
      // Bugfix wie bei SoundOhm) — ein vorhandenes, nicht passendes
      // Artist-Feld schließt den Treffer aus, statt trotzdem angezeigt zu
      // werden.
      return results.filter(
        (r) => !r.artist || r.artist.toLowerCase().includes(artistNeedle.toLowerCase())
      );
    }

    // Nur Artist angegeben, kein Titel: gleicher Bugfix wie bei SoundOhm --
    // ohne Titel matchte die Anfrage bisher nur gegen den Titel der
    // Treffer, nie gegen das Artist-Feld selbst. Jetzt explizit dagegen
    // filtern.
    return rawResults.filter((r) => r.artist && matchesQueryWords(r.artist, artistNeedle));
  },
};

export default souffleContinu;
