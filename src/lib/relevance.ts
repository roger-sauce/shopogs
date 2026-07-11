function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Prüft, ob JEDES Wort aus `query` als GANZES Wort in `candidate` vorkommt
 * (Wortgrenzen via \b). Erlaubt weiterhin Fragment-Suche über mehrere Wörter
 * (z.B. Query "Ambient Works" matcht Titel "Selected Ambient Works Volume
 * II"), verhindert aber Substring-Fehltreffer: manche Shop-Suchen (verifiziert
 * bei SoundOhm & Souffle Continu) matchen "lose" per Substring, sodass eine
 * Suche nach "Memoria" (Carmen Villain) auch "Memorial", "In Memoriam" o.ä.
 * zurückgibt — "Memoria" ist ja tatsächlich literal in "Memorial" enthalten,
 * ein einfacher .includes()-Check hätte das nicht abgefangen.
 */
export function matchesQueryWords(candidate: string | undefined, query: string): boolean {
  if (!candidate) return false;
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  return words.every((w) => new RegExp(`\\b${escapeRegExp(w)}\\b`, "iu").test(candidate));
}
