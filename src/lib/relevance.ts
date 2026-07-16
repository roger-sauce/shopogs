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
 *
 * Bugfix: Tokens werden vor dem \b-Check um führende/nachgestellte
 * Satzzeichen bereinigt (z.B. "(9CD" -> "9CD", ein alleinstehendes "-" ->
 * "" -> verworfen). Ohne das scheiterte \b bei Tokens, die mit einem
 * Nicht-Wortzeichen beginnen/enden: \b markiert nur den Übergang zwischen
 * Wort- und Nicht-Wortzeichen -- steht ein Token wie "-" komplett zwischen
 * zwei Nicht-Wortzeichen (Leerzeichen davor UND danach), gibt es dort gar
 * keinen Übergang, das Token konnte also NIE matchen. Live beobachtet: den
 * vollständigen Titel-Vorschlag "... Volume 1 - 9 (9CD Box)" auswählen fand
 * nirgends Treffer, obwohl der Titel exakt so im Shop stand -- an "-" und
 * "(9CD" ist der Match gescheitert, nicht am eigentlichen Titeltext.
 */
export function matchesQueryWords(candidate: string | undefined, query: string): boolean {
  if (!candidate) return false;
  const words = query
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter(Boolean);
  if (words.length === 0) return true;
  // w ist vor dem Einbau in die RegExp bereits per escapeRegExp() escaped --
  // kein Regex-Injection-Risiko, auch wenn `query` aus Nutzereingaben stammt.
  // eslint-disable-next-line security/detect-non-literal-regexp
  return words.every((w) => new RegExp(`\\b${escapeRegExp(w)}\\b`, "iu").test(candidate));
}
