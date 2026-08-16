// Guards against loose substring hits from the shops' own searches -- and,
// since the rework, against our own strictness.
//
// The rule underneath is asymmetric, and it is worth stating plainly because
// every symptom follows from it: extra words in the CANDIDATE are free, extra
// words in the QUERY are fatal. Searching "Rolling Stones" has always found
// "The Rolling Stones"; searching "The Rolling Stones" found nothing where a
// shop omits the article. Missing umlauts, a stray hyphen and a trailing
// "(Remastered)" are the same failure seen from other angles: the query
// carries something the shop's text does not.
//
// Two answers, deliberately separate:
//
//   1. A canonical form both sides are folded into, so spelling differences
//      stop mattering at all (see `canonical`).
//   2. A class of words that are optional rather than required, so a query
//      may carry an article or a decoration the shop does not use (see
//      OPTIONAL_WORDS and the bracket handling in `matchesQueryWords`).
//
// What was deliberately NOT done: allowing "one or two words to miss". That
// brings back exactly the false hits this filter was built against -- a
// search for "Memoria" (Carmen Villain) also returning "Memorial" and "In
// Memoriam", verified at SoundOhm and Souffle Continu. Words are either
// required or known to be optional; nothing is left to chance.

/**
 * The form both sides are folded into before they are compared.
 *
 * Lossy on purpose. Applied symmetrically, a lossy form can never lose a
 * genuine match -- it can only conflate too much, and the whole-word check
 * still stands behind it.
 *
 * The umlaut step is where that matters. "Björk", "Bjork" and "Bjoerk" have
 * to end up in the same place, and no single spelling can be that place:
 * folding ö to "o" misses "Bjoerk", folding it to "oe" misses "Bjork". So
 * both the accent AND the digraph collapse to the bare vowel. That "Queen"
 * becomes "quen" on the way is harmless, because the query travels the same
 * road.
 */
export function canonical(text: string): string {
  return (
    text
      .toLowerCase()
      // Decompose, then drop the combining marks: é -> e, ö -> o, å -> a.
      .normalize("NFD")
      .replace(/\p{M}+/gu, "")
      // German transliterations, and ß in both of its spellings. Runs after
      // the accents are gone, so "ö" and a typed "oe" arrive here alike.
      .replace(/ß/g, "ss")
      .replace(/ae|oe|ue/g, (m) => m[0])
      .replace(/ss/g, "s")
      // Everything that is not a letter or a digit becomes a gap. This is
      // what makes "85-92" and "85 - 92" the same thing, and it retires the
      // old edge-trimming of tokens along with the bug that came with it.
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
  );
}

/**
 * Words a query may carry without the shop having to. Articles, because
 * shops disagree about leading ones, and the vocabulary of reissues, because
 * it describes the pressing rather than the record.
 *
 * Four languages, because the shops are in four countries -- an Italian
 * title at SoundOhm and a French one at Souffle Continu are not exotic here.
 *
 * Note what is NOT in this list: "vol", "volume", "part", "no". A volume
 * number is not decoration, it is the difference between two records, so it
 * stays required. The cost of that is a query saying "Volume II" not finding
 * a shop that writes "Vol. 2" -- accepted knowingly, and the reason the
 * suggestions from /api/suggest are worth reaching for.
 *
 * Written the way one would say them and folded through `canonical` on the
 * way in, because that is what they are compared against. Spelling them in
 * canonical form by hand does not work: "reissue" folds to "reisu", and an
 * entry nobody recognises is an entry nobody maintains. It cost exactly one
 * failing case to learn.
 */
const OPTIONAL_WORDS = new Set(
  [
    // English
    "the", "a", "an",
    // German
    "der", "die", "das", "den", "dem", "des", "ein", "eine", "einen", "einem", "eines",
    // French. "l" stands for the elided "l'", which loses its apostrophe in
    // the fold anyway.
    "le", "la", "les", "l", "un", "une", "du", "de",
    // Italian
    "il", "lo", "gli", "i", "uno", "una",
    // The vocabulary of pressings
    "remaster", "remastered", "reissue", "reissued", "repress", "expanded",
    "deluxe", "edition", "anniversary", "version", "limited", "ltd", "promo"
  ].map(canonical)
);

/** Anything in round or square brackets. Taken from the RAW query, before
 *  `canonical` dissolves the brackets themselves. */
const BRACKETED = /[([][^)\]]*[)\]]/g;

function words(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/**
 * Whether every REQUIRED word of `query` occurs as a whole word in
 * `candidate`.
 *
 * Fragment searches keep working -- "Ambient Works" still matches "Selected
 * Ambient Works Volume II" -- while a substring like "Memoria" inside
 * "Memorial" still does not, because the word boundaries survive the fold.
 */
export function matchesQueryWords(candidate: string | undefined, query: string): boolean {
  if (!candidate) return false;

  // Bracketed text is decoration by construction: "(Remastered)", "(9CD
  // Box)", "(Reissue)". Collected before canonicalisation, because afterwards
  // the brackets are gone and there is no telling what was inside them.
  const bracketed = new Set(words(canonical((query.match(BRACKETED) ?? []).join(" "))));

  const all = words(canonical(query));
  if (all.length === 0) return true;

  const required = all.filter((w) => !OPTIONAL_WORDS.has(w) && !bracketed.has(w));

  // Everything optional means the query says nothing at all -- "The The",
  // or a lone "A". Falling back to the full set is the only reading that
  // does not match the entire catalogue.
  const needed = required.length > 0 ? required : all;

  const hay = canonical(candidate);
  return needed.every((w) => wholeWordIn(hay, w));
}

/**
 * `\bword\b` against the already-canonical haystack.
 *
 * Built by hand rather than with a RegExp: after `canonical` the haystack is
 * letters, digits and single spaces, so a word boundary is simply a gap or an
 * end. That saves escaping user input into a pattern -- and with it the whole
 * question of regex injection.
 */
function wholeWordIn(hay: string, word: string): boolean {
  if (!word) return true;
  let from = 0;
  for (;;) {
    const at = hay.indexOf(word, from);
    if (at < 0) return false;
    const before = at === 0 || hay[at - 1] === " ";
    const afterIndex = at + word.length;
    const after = afterIndex === hay.length || hay[afterIndex] === " ";
    if (before && after) return true;
    from = at + 1;
  }
}
