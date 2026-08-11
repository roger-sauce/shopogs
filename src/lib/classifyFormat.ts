import type { SelectableFormat } from "../types/shop";

export const SELECTABLE_FORMATS: SelectableFormat[] = ["Vinyl", "CD", "Cassette", "Download"];

// Rough heuristic for mapping the format label delivered by the respective
// shop (e.g. "2LP", "12\"", "MP3", "Cassette") onto one of the four UI
// filter categories. Not every adapter delivers a format field — in that
// case the hit is only displayed if all 4 formats really are selected
// (see matchesFormatFilter).
export function classifyFormat(rawFormat: string | undefined): SelectableFormat | undefined {
  if (!rawFormat) return undefined;
  const f = rawFormat.toLowerCase();

  if (/mp3|wav|flac|aiff|download|digital/.test(f)) return "Download";
  if (/cassette|tape|\bmc\b/.test(f)) return "Cassette";
  // (?<![a-z])cds?\b instead of \bcds?\b: some shops deliver quantities like
  // "3 CDs" (verified at JPC) — without the "s?" \bcd\b does not match that,
  // because there is no word end between "d" and "s".
  // Bugfix: box sets like "9CD Box" (verified at SoundOhm, Merzbow "Nine
  // Studies...") were still never recognised as CD -- \b is a
  // word/non-word boundary, but digits themselves count as word characters,
  // so between "9" and "c" in "9cd" there is NO \b boundary AT ALL; the
  // leading \b in \bcds?\b therefore failed as a matter of principle as soon
  // as a digit stood directly before "CD". Negative lookbehind instead of a
  // leading \b: it only forbids an immediately preceding a-z (still guards
  // against false hits like "recorded"), but allows digits/start of string
  // directly in front of it.
  if (/(?<![a-z])cds?\b/.test(f)) return "CD";
  if (/lp|"|vinyl|12"|10"|7"|ep\b/.test(f)) return "Vinyl";

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
