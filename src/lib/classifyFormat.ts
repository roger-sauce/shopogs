import type { SelectableFormat } from "../types/shop";

export const SELECTABLE_FORMATS: SelectableFormat[] = ["Vinyl", "CD", "Cassette", "Download"];

// Grobe Heuristik, um die vom jeweiligen Shop gelieferte Format-Bezeichnung
// (z.B. "2LP", "12\"", "MP3", "Cassette") einer der vier UI-Filterkategorien
// zuzuordnen. Nicht jeder Adapter liefert ein Format-Feld — in dem Fall wird
// der Treffer nur angezeigt, wenn wirklich alle 4 Formate ausgewählt sind
// (siehe matchesFormatFilter).
export function classifyFormat(rawFormat: string | undefined): SelectableFormat | undefined {
  if (!rawFormat) return undefined;
  const f = rawFormat.toLowerCase();

  if (/mp3|wav|flac|aiff|download|digital/.test(f)) return "Download";
  if (/cassette|tape|\bmc\b/.test(f)) return "Cassette";
  // (?<![a-z])cds?\b statt \bcds?\b: manche Shops liefern Mengenangaben wie
  // "3 CDs" (verifiziert bei JPC) — ohne das "s?" matcht \bcd\b das nicht,
  // weil kein Wortende zwischen "d" und "s" liegt.
  // Bugfix: Box-Sets wie "9CD Box" (verifiziert bei SoundOhm, Merzbow "Nine
  // Studies...") wurden trotzdem nie als CD erkannt -- \b ist eine
  // Wort-/Nicht-Wort-Grenze, Ziffern zählen aber selbst als Wortzeichen, also
  // gibt es zwischen "9" und "c" in "9cd" GAR KEINE \b-Grenze, das führende
  // \b in \bcds?\b schlug also grundsätzlich fehl, sobald direkt eine Zahl
  // vor "CD" stand. Negative Lookbehind statt \b vorne: verbietet nur ein
  // unmittelbar vorangehendes a-z (schützt weiter vor Fehltreffern wie
  // "recorded"), erlaubt aber Ziffern/Satzanfang direkt davor.
  if (/(?<![a-z])cds?\b/.test(f)) return "CD";
  if (/lp|"|vinyl|12"|10"|7"|ep\b/.test(f)) return "Vinyl";

  return undefined;
}

/**
 * `selected` ist eine Mehrfachauswahl aus Checkboxen, standardmäßig sind
 * alle 4 angehakt (= "zeig alles"). Wenn wirklich ALLE 4 ausgewählt sind,
 * zeigen wir auch Treffer mit nicht klassifizierbarem Format (im Zweifel
 * anzeigen). Sobald der User gezielt einschränkt (nicht alle 4), muss das
 * Format eindeutig zu einer der ausgewählten Kategorien passen — sonst wird
 * ausgeblendet (vorher wurden nicht-klassifizierbare Formate fälschlich
 * IMMER angezeigt, unabhängig vom Filter).
 * Leere Auswahl (0 Formate) matcht nichts — das wird in der UI separat mit
 * einer Warnung abgefangen.
 */
export function matchesFormatFilter(
  rawFormat: string | undefined,
  selected: SelectableFormat[]
): boolean {
  if (selected.length === 0) return false;
  if (selected.length === SELECTABLE_FORMATS.length) return true;
  const classified = classifyFormat(rawFormat);
  return classified !== undefined && selected.includes(classified);
}
