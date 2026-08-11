// Makes `new DOMParser()` available in Node.
//
// Three of the adapters parse server-rendered HTML (Hard Wax, JPC, Boomkat)
// and call `new DOMParser().parseFromString(html, "text/html")` for it -- a
// browser API that does not exist in Node.
//
// Deliberately a global replacement rather than a helper function that every
// transform.ts would have to import: that way the parser files stay unchanged
// line for line. They are the most laborious piece of this project (see the
// comments on Hard Wax' hashed class names, or JPC answering 404 on an empty
// result), and every change there is an opportunity to break something.
//
// linkedom rather than jsdom: it implements exactly the subset used here
// (querySelector/querySelectorAll, textContent, getAttribute), is smaller by
// a good margin and starts without a JS engine of its own -- foreign script
// is not supposed to run here at all, that is what the Camoufox sidecar is
// for.
//
// `??=` rather than a hard assignment: should a future Node version bring its
// own DOMParser, that one wins.
import { DOMParser } from "linkedom";

globalThis.DOMParser ??= DOMParser as unknown as typeof globalThis.DOMParser;
