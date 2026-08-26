import type { SelectableFormat } from "../types/shop";

export const SELECTABLE_FORMATS: SelectableFormat[] = ["Vinyl", "CD", "Cassette", "Download"];

// Rough heuristic for mapping the format label delivered by the respective
// shop (e.g. "2LP", "12\"", "MP3", "Cassette") onto one of the four UI
// filter categories. Not every adapter delivers a format field — in that
// case the hit is only displayed if all 4 formats really are selected
// (see matchesFormatFilter).
//
// The branches below are written against what the eight shops actually send,
// collected in one sweep over the live API: "2CD", "LP (yellow)", "2 LPs",
// "2Tape", "Single 12\"", "K7 / tape", "10”". Anything that is deliberately
// none of the four -- "Book", "Livre", "Buch", "Blu-ray Disc", HHV's bare
// "Box" -- stays unclassified on purpose.
export function classifyFormat(rawFormat: string | undefined): SelectableFormat | undefined {
  if (!rawFormat) return undefined;
  const f = rawFormat.toLowerCase();

  if (/mp3|wav|flac|aiff|download|digital/.test(f)) return "Download";
  // Abbreviations, and why a plain \b cannot carry them:
  //
  //   ANOST writes cassettes as "CS", sets of them as "2CS" and "3CS"
  //   (verified on the Sucata Tapes label page, where every release is a
  //   tape). JPC writes "MC", Soufflé Continu "K7 / tape".
  //
  //   A quantity in front must not rule the token out, a letter must --
  //   otherwise "classics", "discs" and "boxcd" would all count as formats.
  //   \b cannot say that: digits are word characters themselves, so between
  //   "9" and "cd" in "9CD Box" there is no boundary AT ALL, and \bcds?\b
  //   failed as a matter of principle as soon as a digit stood in front.
  //   Hence the negative lookbehind, plus one exception for the "3xCD"
  //   spelling, where the x has to earn its keep with a digit before it or
  //   "maxcd" would slip through.
  if (/cassette|tape|(?:(?<![a-z])|(?<=\dx))(?:cs|mc|k7)\b/.test(f)) return "Cassette";
  // Same rule, plus the trailing s for quantities like "3 CDs" (JPC).
  if (/(?:(?<![a-z])|(?<=\dx))cds?\b/.test(f)) return "CD";
  // The inch mark comes in four spellings across the shops: Hard Wax sends
  // the ASCII quote in '10"', ANOST the typographic one in '10”'. Both are
  // listed, together with the double prime that is typographically the
  // correct sign, because a record that spells its size differently is still
  // a record. "inch" is HHV's wording ("7inch").
  if (/lp|vinyl|ep\b|inch|["“”″]/.test(f)) return "Vinyl";

  return undefined;
}

/**
 * `selected` is a multiple selection of checkboxes; by default all 4 are
 * ticked (= "show everything"). If really ALL 4 are selected, we also show
 * hits whose format cannot be classified (when in doubt, display it). As
 * soon as the user narrows things down deliberately (not all 4), the format
 * has to match one of the selected categories unambiguously — otherwise it
 * is hidden (previously, non-classifiable formats were wrongly shown
 * ALWAYS, regardless of the filter).
 * An empty selection (0 formats) matches nothing — that is caught
 * separately in the UI with a warning.
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
