// Eingabe-Validierung für die Such-Textfelder (Artist/Titel). Ziel ist
// weniger klassische Code-Injection -- die Query landet nirgends in SQL oder
// Server-seitigem Code, und jede der 8 Shop-Adapter kodiert sie bereits per
// encodeURIComponent() in die jeweilige URL -- sondern kaputte/übergroße
// Eingaben früh abzufangen, bevor sie an 8 verschiedene Shop-APIs und den
// Browser-Sidecar (echte Camoufox-Seitennavigation!) rausgehen.

// 100 Zeichen sind für Künstler-/Album-Titel weit mehr als genug (auch für
// lange Klassik-Titel), verhindert aber z.B. versehentlich/absichtlich
// eingefügte Textblöcke, die an alle Shops gleichzeitig rausgehen würden.
const MAX_SEARCH_TERM_LENGTH = 100;

// Steuerzeichen (u.a. NUL, ESC, sonstige C0/DEL-Zeichen) haben in einem
// Künstler-/Titel-Feld keine legitime Bedeutung -- rausfiltern, statt sie
// unverändert in State, URLs oder an den Browser-Sidecar durchzureichen.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x1f\x7f]/g;

export function sanitizeSearchTerm(raw: string): string {
  return raw.replace(CONTROL_CHARS, "").slice(0, MAX_SEARCH_TERM_LENGTH);
}
