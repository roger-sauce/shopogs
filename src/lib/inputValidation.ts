// Input validation for the search text fields (artist/title). The goal is
// less classic code injection -- the query never ends up in SQL or in
// server-side code, and each of the 8 shop adapters already encodes it with
// encodeURIComponent() into the respective URL -- than catching broken/
// oversized input early, before it goes out to 8 different shop APIs and the
// browser sidecar (real Camoufox page navigation!).

// 100 characters are far more than enough for artist/album titles (even for
// long classical titles), but it prevents e.g. accidentally/deliberately
// pasted blocks of text that would go out to all shops at the same time.
const MAX_SEARCH_TERM_LENGTH = 100;

// Control characters (NUL, ESC and other C0/DEL characters among them) have
// no legitimate meaning in an artist/title field -- filter them out instead
// of passing them through unchanged into state, URLs or to the browser
// sidecar.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x1f\x7f]/g;

export function sanitizeSearchTerm(raw: string): string {
  return raw.replace(CONTROL_CHARS, "").slice(0, MAX_SEARCH_TERM_LENGTH);
}
