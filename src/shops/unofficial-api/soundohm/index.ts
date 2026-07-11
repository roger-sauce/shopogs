import type { ShopAdapter } from "../../../types/shop";
import { searchSoundOhm } from "./api";
import { transformSoundOhm } from "./transform";
import { matchesQueryWords } from "../../../lib/relevance";

const soundohm: ShopAdapter = {
  id: "soundohm",
  name: "SoundOhm",
  country: "IT",
  group: "mail-order",
  homeUrl: "https://www.soundohm.com",
  logoUrl: "https://i1.sndcdn.com/avatars-000471818916-qum5j1-t500x500.jpg",
  type: "unofficial-api",
  async checkAvailability(artist, title) {
    // SoundOhms quickSearch matcht die Anfrage nur als exakte Phrase gegen
    // Titel/Katalog-Felder, nicht gegen den Artist-Namen (verifiziert per
    // Recon: "Andrew Anderson" alleine liefert 0 Treffer, obwohl der Artist
    // existiert; "Thresholds" alleine findet die Platte korrekt). Ein
    // kombinierter "Artist Titel"-String schlägt deshalb fast immer fehl.
    // Daher: bevorzugt nur den Titel suchen, Artist nur als Fallback wenn
    // kein Titel angegeben wurde.
    const query = title.trim() || artist.trim();
    if (!query) return [];

    const raw = await searchSoundOhm(query);
    const rawResults = transformSoundOhm(raw);

    // SoundOhms Suche matcht lose per Substring, nicht nur ganze Wörter —
    // Suche "Memoria" fand z.B. auch "Memorial", "In Memoriam" o.ä.
    // (verifiziert). Deshalb clientseitig auf ganze Wortübereinstimmung
    // gegen den Titel nachfiltern (erlaubt weiterhin Fragment-Suche über
    // mehrere Wörter, verhindert aber solche Substring-Fehltreffer).
    const results = rawResults.filter((r) => matchesQueryWords(r.title, query));

    const artistNeedle = artist.trim().toLowerCase();
    if (!artistNeedle || !title.trim()) return results;

    // Titel-Suche kann mehrere Artists treffen (z.B. gleichnamige Titel) —
    // zusätzlich nach Artist filtern. Kein Fallback auf "alle Treffer" mehr,
    // wenn das 0 Ergebnisse liefert: das hat bisher dazu geführt, dass ein
    // klar falscher Artist trotzdem angezeigt wurde, sobald KEIN Treffer den
    // Artist bestätigte (z.B. Suche "Lovegod Rendezvous" zeigte einen
    // "Rendezvous"-Treffer von einem ganz anderen Artist). Fehlt das
    // Artist-Feld beim Treffer, lassen wir ihn weiterhin durch (kann nicht
    // geprüft werden) — aber ein vorhandenes, nicht passendes Artist-Feld
    // schließt den Treffer jetzt konsequent aus.
    return results.filter((r) => !r.artist || r.artist.toLowerCase().includes(artistNeedle));
  },
};

export default soundohm;
