import type { ShopAdapter, LabelSearchResult } from "../../../types/shop";
import {
  searchSouffleContinu,
  fetchSouffleContinuLabelsIndex,
  fetchSouffleContinuLabelArticleCount,
} from "./api";
import { transformSouffleContinu, findSouffleContinuLabelEntry } from "./transform";
import { matchesQueryWords } from "../../../lib/relevance";

// Ziffern-Labels laufen in der alphabetischen Übersicht unter dem
// Buchstaben "0" (verifiziert per Recon), alles andere unter seinem ersten
// Buchstaben.
function souffleContinuIndexLetter(label: string): string {
  const first = label.trim().charAt(0).toLowerCase();
  return /[0-9]/.test(first) ? "0" : first;
}

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
  async checkLabelAvailability(label): Promise<LabelSearchResult> {
    const needle = label.trim();
    if (!needle) return { supported: true, count: 0, url: "https://www.soufflecontinu.com" };

    const letter = souffleContinuIndexLetter(needle);
    const indexUrl = `https://www.soufflecontinu.com/labels/${letter}/`;
    const indexHtml = await fetchSouffleContinuLabelsIndex(letter);
    const entry = findSouffleContinuLabelEntry(indexHtml, needle);

    if (!entry) {
      // Label auf dieser Buchstaben-Seite nicht gelistet -- führt dieses
      // Label nicht, aber die Suche selbst wird unterstützt (siehe
      // LabelSearchResult-Doku: count 0 + Fallback-URL auf die
      // Übersichtsseite, keine 404-Detailseite).
      return { supported: true, count: 0, url: indexUrl };
    }

    const labelUrl = entry.href.startsWith("http")
      ? entry.href
      : `https://www.soufflecontinu.com${entry.href.startsWith("/") ? "" : "/"}${entry.href}`;
    const count = await fetchSouffleContinuLabelArticleCount(entry.id);
    return { supported: true, count, url: labelUrl };
  },
};

export default souffleContinu;
