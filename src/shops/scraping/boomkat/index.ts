import type { ShopAdapter, AvailabilityResult } from "../../../types/shop";
import {
  autocompleteBoomkat,
  fetchBoomkatProductPage,
  fetchBoomkatArtistPage,
  slugifyArtist,
  closeBoomkatSession,
} from "./api";
import { transformBoomkatProductPage, parseBoomkatArtistPage } from "./transform";
import { matchesQueryWords } from "../../../lib/relevance";

interface ReleaseMatch {
  artist: string;
  title: string;
  url: string;
}

const boomkat: ShopAdapter = {
  id: "boomkat",
  name: "Boomkat",
  country: "GB",
  group: "mail-order",
  homeUrl: "https://boomkat.com",
  logoUrl: "https://pbs.twimg.com/profile_images/779441514/BoomkatLogoTwitter01_400x400.jpg",
  type: "scraping",
  // Läuft wie HHV über den Browser-Sidecar (volle Camoufox-Browser-
  // Navigation statt direktem Reverse-Proxy) -- siehe api.ts.
  speed: "slow",
  async checkAvailability(artist, title) {
    // Jede Suche baut im Sidecar eine eigene Camoufox-Session auf (siehe
    // browserSession.js) -- egal ob die Suche erfolgreich war oder mit
    // einem Fehler abbricht, muss diese Session danach geschlossen werden,
    // sonst bleibt der Browser-Prozess bis zum Idle-Timeout offen.
    try {
      const artistNeedle = artist.trim();
      const titleNeedle = title.trim();
      if (!artistNeedle && !titleNeedle) return [];

      let releaseMatches: ReleaseMatch[] = [];

      // Reine Artist-Suche (kein Titel): die Autocomplete-API liefert nur
      // eine begrenzte, geranktes "Best Guess"-Liste (~10 Treffer) und kann
      // bei kurzen/generischen Namen ein existierendes Release übersehen
      // (live beobachtet: "Sees" per Titelsuche "Ampersand Curve" gefunden,
      // aber per reiner Artist-Suche "Sees" nicht). Die Artist-
      // Übersichtsseite /artists/<slug> listet dagegen alle Releases des
      // Artists vollständig auf -- als primäre Quelle für Artist-only-Suchen
      // versuchen, mit Fallback auf Autocomplete falls der Slug nicht
      // existiert oder nichts liefert.
      if (!titleNeedle && artistNeedle) {
        try {
          const slug = slugifyArtist(artistNeedle);
          const html = await fetchBoomkatArtistPage(slug);
          const entries = parseBoomkatArtistPage(html);
          releaseMatches = entries.filter((e) => matchesQueryWords(e.artist, artistNeedle));
        } catch (err) {
          console.warn(`[boomkat] Artist-Seite fehlgeschlagen, Fallback auf Autocomplete:`, err);
        }
      }

      if (releaseMatches.length === 0) {
        const query = [artist, title].filter(Boolean).join(" ").trim();
        const suggestions = await autocompleteBoomkat(query);

        // Live-Recon (Stand jetzt) zeigt: Autocomplete liefert nur noch
        // Release-Treffer direkt (kein separater "Artist"-Treffer-Typ mehr
        // wie in der alten Recon dokumentiert) -- jeder Treffer hat schon
        // Titel, Artist(s) und einen direkten Produktlink dabei.
        // Wortgrenzen-Filter gegen Artist+Titel, gleiches Muster wie bei den
        // anderen Shops.
        releaseMatches = suggestions
          .filter(
            (s) => s.type === "Release" && matchesQueryWords(`${s.artists.join(" ")} ${s.value}`, query)
          )
          .map((s) => ({ artist: s.artists.join(", "), title: s.value, url: s.url }));
      }

      const results = await Promise.all(
        releaseMatches.map(async (match) => {
          try {
            const html = await fetchBoomkatProductPage(match.url);
            const productUrl = match.url.startsWith("http")
              ? match.url
              : `https://boomkat.com${match.url}`;
            return transformBoomkatProductPage(html, match.artist, match.title, productUrl);
          } catch (err) {
            console.warn(`[boomkat] Produktseite ${match.url} fehlgeschlagen:`, err);
            return [];
          }
        })
      );

      return results.flat() as AvailabilityResult[];
    } finally {
      await closeBoomkatSession();
    }
  },
};

export default boomkat;
