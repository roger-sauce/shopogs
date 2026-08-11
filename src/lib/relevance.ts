function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Checks whether EVERY word from `query` occurs as a WHOLE word in
 * `candidate` (word boundaries via \b). Still allows fragment search across
 * several words (e.g. query "Ambient Works" matches the title "Selected
 * Ambient Works Volume II"), but prevents substring false hits: some shop
 * searches (verified at SoundOhm & Souffle Continu) match "loosely" by
 * substring, so a search for "Memoria" (Carmen Villain) also returns
 * "Memorial", "In Memoriam" and the like — "Memoria" really is contained
 * literally in "Memorial", a simple .includes() check would not have caught
 * that.
 *
 * Bugfix: before the \b check, tokens are stripped of leading/trailing
 * punctuation (e.g. "(9CD" -> "9CD", a standalone "-" -> "" -> discarded).
 * Without that, \b failed on tokens that begin/end with a non-word
 * character: \b only marks the transition between word and non-word
 * characters -- if a token like "-" sits entirely between two non-word
 * characters (a space before AND after), there is no transition there at
 * all, so the token could NEVER match. Observed live: selecting the full
 * title suggestion "... Volume 1 - 9 (9CD Box)" found no hits anywhere,
 * even though the title was in the shop exactly like that -- the match
 * failed on "-" and "(9CD", not on the actual title text.
 */
export function matchesQueryWords(candidate: string | undefined, query: string): boolean {
  if (!candidate) return false;
  const words = query
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter(Boolean);
  if (words.length === 0) return true;
  // w is already escaped via escapeRegExp() before it is built into the
  // RegExp -- no regex injection risk, even though `query` comes from user
  // input.
  // eslint-disable-next-line security/detect-non-literal-regexp
  return words.every((w) => new RegExp(`\\b${escapeRegExp(w)}\\b`, "iu").test(candidate));
}
