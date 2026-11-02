/**
 * Strips decorations in brackets from a search term before it is handed to a
 * shop.
 *
 * This is the same asymmetry `relevance.ts` describes, one step earlier. There
 * it governs how an answer is compared: extra words in the result are free,
 * extra words in the query are fatal. Here it governs the question itself --
 * and a shop that never returns the record gives us nothing left to compare.
 *
 * Boomkat is the strict case, measured against the live site on 02.11.2026:
 *
 *     "Andy Stott Late Loop"        -> the record
 *     "Andy Stott Late Loop (LP)"   -> nothing at all
 *     "Burial Untrue (2LP)"         -> nothing at all
 *
 * What makes it worth fixing centrally rather than per shop is where the
 * bracket comes from: SoundOhm lists that record as "Late Loop (LP)", our own
 * title suggestions offer it in exactly that spelling, and accepting the
 * suggestion then made Boomkat blind. A help of ours must not cost a hit
 * somewhere else.
 *
 * Dropping words can only widen what a shop returns, never narrow it, so this
 * is safe for the forgiving shops too -- the relevance filter still removes
 * whatever does not belong.
 *
 * Deliberately ONLY brackets, not free-standing format words: "Antidawn EP"
 * and "Streetlands EP" are what those records are called, and stripping "EP"
 * would destroy real titles.
 */
export function withoutBracketed(text: string): string {
  const stripped = text
    // One level, no nesting: "(LP)", "[2026 Remaster]", "{Reissue}". A bracket
    // inside a bracket does not occur in record titles, and refusing to
    // recurse keeps this a plain, obviously terminating replacement.
    .replace(/[([{][^()[\]{}]*[)\]}]/g, " ")
    // An opening bracket that is never closed, at the end: someone is still
    // typing, or the title was cut off. Either way what follows it is a
    // fragment of a decoration, not of the title.
    .replace(/[([{][^()[\]{}]*$/, " ")
    .replace(/\s+/g, " ")
    .trim();

  // A title that consists of nothing but a bracket keeps its brackets: better
  // to ask an awkward question than an empty one.
  return stripped || text.trim();
}
