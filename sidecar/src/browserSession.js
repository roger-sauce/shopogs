// Drives one Camoufox browser per shop and, inside it, one isolated context
// per search. Built generically for several shops (currently HHV + Boomkat) --
// each entry in SHOP_CONFIG describes one shop of its own, the rest of the
// logic is shop-agnostic.
//
// THE SHAPE OF THIS FILE IS THE FIX FOR A REAL BUG. Until 02.10.2026 there
// was exactly one session per SHOP, while its lifetime was managed per
// SEARCH: every adapter closes the session in a finally block when it is
// done. Two searches running at the same time therefore shared one browser,
// and whichever finished first tore it down under the other -- Playwright
// reports that as "Target page, context or browser has been closed", the
// sidecar answered 502, and the shop looked broken. The browser now outlives
// the search; what a search opens and closes is its own context.
//
// Two fundamentally different kinds of access, unchanged:
//   - navigateAndGetHtml: real full navigation (page.goto). Needed for
//     endpoints that in real page operation are called ONLY via full
//     navigation (e.g. HHV's search page) -- their bot challenge consists
//     partly of JS that sets a cookie via document.cookie and then
//     reloads itself via document.location.reload(true). That runs
//     ONLY on a real navigation, never on a fetch() -- not even on a
//     fetch() from INSIDE the page (page.evaluate), because fetch() never
//     executes <script> content of the response (verified against HHV: a
//     fetch from inside the real Camoufox page returned exactly the
//     challenge stub page).
//   - fetchViaBrowser: fetch() INSIDE the page. For endpoints that the real
//     page itself also loads via AJAX/XHR (e.g. HHV's
//     /lazy/artikel/.../list_entry turbo frames, Boomkat's keyword search).
//     Runs over the real browser connection (TLS fingerprint, cookies,
//     referer) -- with Boomkat that is presumably the decisive difference
//     from the old approach proxied directly in nginx/vite, which was
//     blocked there with HTTP 403.
//
// Every new context first navigates once to the shop start page (and clicks
// the cookie banner away) BEFORE any request runs -- with HHV that changes
// nothing (the search page navigates for real right afterwards anyway), with
// Boomkat it is a precondition: there the very first request of a search is
// the keyword AJAX API, and a fetch() from a still empty about:blank page
// would be the wrong origin / no same-site cookies.
const SHOP_CONFIG = {
  hhv: {
    origin: "https://www.hhv.de",
    locale: "de-DE",
    acceptButtonPattern: /akzeptieren/i,
    // Turbo frame lazy loading -- the real page calls this via AJAX too.
    ajaxPathPrefixes: ["/lazy/artikel/"],
  },
  boomkat: {
    origin: "https://boomkat.com",
    locale: "en-GB",
    acceptButtonPattern: /accept|agree|got it/i,
    // The keyword search HAS to be a fetch: a full navigation to an API path
    // is answered with Cloudflare's "Just a moment..." interstitial, which
    // arrives with HTTP 200 and 28 KB of ordinary-looking HTML. Until October
    // 2026 this entry read /api/autocomplete, and the stale path produced
    // exactly that symptom -- it looked like the shop had locked us out.
    //
    // The pages are listed as well because they are answered the same way
    // either route, and one mechanism is easier to reason about than two.
    // Note that /artists/<slug> is refused outright (403) since the relaunch,
    // which is why the adapter asks the keyword search first and treats the
    // artist page as a last resort.
    ajaxPathPrefixes: ["/api/search/keywords", "/artists/", "/labels/"],
  },
};

// The browser stays up between searches. Starting Camoufox is the expensive
// part on a Pi -- a context costs almost nothing by comparison -- but a
// browser nobody has asked anything in half an hour has no business sitting
// in 4 GB of RAM either.
const BROWSER_IDLE_TTL_MS = 30 * 60 * 1000;

// Safety net, not the normal path: the adapters close their context in a
// finally block. This catches the case where that call never arrives --
// a crashed API container, a dropped connection.
const SEARCH_IDLE_TTL_MS = 5 * 60 * 1000;

const SWEEP_INTERVAL_MS = 60 * 1000;

const browsers = new Map(); // shop -> { browser, expiresAt }
const browserStarts = new Map(); // shop -> Promise<browser>
const searches = new Map(); // "<shop>\u0000<searchId>" -> { shop, context, page, expiresAt }
const searchStarts = new Map(); // same key -> Promise<search>

// In server.js, `shop` comes straight from the URL path (/proxy/:shop/*), so
// it is potentially attacker-controlled. A direct SHOP_CONFIG[shop] would,
// for keys like "constructor" or "__proto__", return an object from
// Object.prototype instead of undefined and thus bypass the `if (!config)`
// check further below -- hence a real hasOwnProperty guard here instead of
// direct property access.
function getShopConfig(shop) {
  // The actual guard sits directly in front of it (Object.hasOwn) -- the
  // linter does not see the connection in the ternary and flags the access anyway.
  // eslint-disable-next-line security/detect-object-injection
  return Object.hasOwn(SHOP_CONFIG, shop) ? SHOP_CONFIG[shop] : undefined;
}

function isAjaxPath(shop, path) {
  const config = getShopConfig(shop);
  return config?.ajaxPathPrefixes?.some((prefix) => path.startsWith(prefix)) ?? false;
}

// A NUL byte separates the two halves, because it cannot occur in either:
// the shop is matched against SHOP_CONFIG, the search id is generated by the
// adapters. No escaping needed, no collisions possible.
function searchKey(shop, searchId) {
  return `${shop}\u0000${searchId}`;
}

// --- Browser --------------------------------------------------------------

async function startBrowser(shop) {
  const config = getShopConfig(shop);
  const { Camoufox } = await import("camoufox-js");
  // exclude_addons: ["UBO"] -- otherwise Camoufox tries on EVERY start to
  // download uBlock Origin and unpack it into a global, shared addon
  // directory (regardless of the shop). Since a slow search asks HHV and
  // Boomkat in parallel, several Camoufox instances start at the same time
  // and race each other while unpacking into the same folder -- one instance
  // then catches a half-finished directory ("manifest.json is missing"). We
  // do not need ad blocking (we do want the full page content), therefore
  // switch it off completely instead of merely defusing the race condition.
  const browser = await Camoufox({ headless: true, locale: config.locale, exclude_addons: ["UBO"] });
  browsers.set(shop, { browser, expiresAt: Date.now() + BROWSER_IDLE_TTL_MS });
  console.log(`[browser-sidecar] Browser für ${shop} gestartet.`);
  return browser;
}

async function getBrowser(shop) {
  const existing = browsers.get(shop);
  // `closing` is set by the sweeper before it awaits browser.close(). Without
  // it, a request arriving in that window would be handed a browser that is
  // already on its way out.
  if (existing && !existing.closing && existing.browser.isConnected()) {
    existing.expiresAt = Date.now() + BROWSER_IDLE_TTL_MS;
    return existing.browser;
  }
  // Lost the process (crash, external kill): drop the stale entry rather than
  // handing out a browser whose every call would throw.
  if (existing) browsers.delete(shop);

  if (browserStarts.has(shop)) return browserStarts.get(shop);
  const promise = startBrowser(shop).finally(() => browserStarts.delete(shop));
  browserStarts.set(shop, promise);
  return promise;
}

// A search that is still being set up lives in searchStarts, not yet in
// searches -- and that gap was exactly wide enough for the sweeper to close a
// browser out from under a starting search ("browserContext.newPage: Target
// page, context or browser has been closed", observed 02.10.2026).
function hasLiveWork(shop) {
  if ([...searches.values()].some((s) => s.shop === shop)) return true;
  const prefix = `${shop}\u0000`;
  return [...searchStarts.keys()].some((key) => key.startsWith(prefix));
}

function touchBrowser(shop) {
  const entry = browsers.get(shop);
  if (entry) entry.expiresAt = Date.now() + BROWSER_IDLE_TTL_MS;
}

// --- Search context -------------------------------------------------------

async function acceptCookieBannerIfPresent(shop, page) {
  const config = getShopConfig(shop);
  try {
    const acceptButton = page.getByRole("button", { name: config.acceptButtonPattern });
    if ((await acceptButton.count()) > 0) {
      await acceptButton.first().click({ timeout: 5000 });
      await page.waitForTimeout(1000);
      console.log(`[browser-sidecar][debug] Cookie-Banner für ${shop} geklickt.`);
    }
  } catch (e) {
    console.log(`[browser-sidecar][debug] Cookie-Banner-Klick für ${shop} fehlgeschlagen: ${e.message}`);
  }
}

// Navigation with "networkidle" as a WISH rather than a condition.
//
// networkidle counts as met when no network request runs for half a
// second. On shop pages with analytics, advertising or long polling this
// state never occurs -- and then the entire call failed after 30 seconds,
// even though the page had long since been fully loaded. Observed with HHV
// on 04.08.2026: the same search failed and went through on the second
// attempt, depending on what the tracking scripts were doing at the time.
// Playwright advises against networkidle as a wait condition in its own
// documentation.
//
// Therefore: log the timeout and carry on with the state we have.
async function gotoTolerant(page, url, beschreibung) {
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  } catch (e) {
    if (e.name === "TimeoutError") {
      console.log(
        `[browser-sidecar][debug] networkidle nicht erreicht für ${beschreibung} -- arbeite mit dem geladenen Stand weiter`
      );
      return "timeout";
    }
    // NS_BINDING_ABORTED: the navigation was aborted. With Boomkat this is
    // the case when the keyword search returns a release link to a page that
    // does not exist -- it does that for records that are not stocked there
    // at all. That is not an error, simply no hit, and it does not belong in
    // the log as a stack trace.
    if (/NS_BINDING_ABORTED/.test(e.message)) {
      console.log(`[browser-sidecar][debug] Navigation abgebrochen für ${beschreibung} -- kein Treffer`);
      return "abgebrochen";
    }
    throw e;
  }
  return "ok";
}

const GONE = /has been closed|Target page, context or browser/i;

async function startSearch(shop, searchId) {
  const config = getShopConfig(shop);

  // Two attempts, because a browser can disappear between being handed over
  // and being used -- the sweeper may have decided to close it, or the
  // process died on its own. Starting a new one costs seconds; failing the
  // search costs the user their answer.
  for (let versuch = 1; ; versuch += 1) {
    const browser = await getBrowser(shop);
    try {
      const context = await browser.newContext({ locale: config.locale });
      const page = await context.newPage();

      // Warm up: the context starts with no cookies at all, so the origin has
      // to be visited once before any fetch() runs from inside the page.
      await gotoTolerant(page, config.origin, `${shop} Startseite`);
      await page.waitForTimeout(1000);
      await acceptCookieBannerIfPresent(shop, page);

      const search = { shop, context, page, expiresAt: Date.now() + SEARCH_IDLE_TTL_MS };
      searches.set(searchKey(shop, searchId), search);
      return search;
    } catch (e) {
      if (versuch >= 2 || !GONE.test(e.message)) throw e;
      console.warn(
        `[browser-sidecar] Browser für ${shop} war beim Kontextaufbau schon weg -- zweiter Versuch.`
      );
      const stale = browsers.get(shop);
      if (stale && stale.browser === browser) browsers.delete(shop);
    }
  }
}

async function getSearch(shop, searchId) {
  const key = searchKey(shop, searchId);
  const existing = searches.get(key);
  if (existing) {
    existing.expiresAt = Date.now() + SEARCH_IDLE_TTL_MS;
    touchBrowser(shop);
    return existing;
  }

  if (searchStarts.has(key)) return searchStarts.get(key);
  const promise = startSearch(shop, searchId).finally(() => searchStarts.delete(key));
  searchStarts.set(key, promise);
  return promise;
}

function touchSearch(shop, searchId) {
  const search = searches.get(searchKey(shop, searchId));
  if (search) search.expiresAt = Date.now() + SEARCH_IDLE_TTL_MS;
  touchBrowser(shop);
}

/**
 * Ends one search. Closes ITS context and nothing else -- another search in
 * the same shop keeps its own, and the browser stays up for the next one.
 */
async function closeSearch(shop, searchId) {
  const key = searchKey(shop, searchId);
  const search = searches.get(key);
  if (!search) return;
  searches.delete(key);
  try {
    await search.context.close();
  } catch (e) {
    console.warn(`[browser-sidecar] Kontext-Schließen für ${shop} fehlgeschlagen:`, e.message);
  }
}

// --- The two kinds of access ---------------------------------------------

async function navigateAndGetHtml(shop, path, searchId) {
  const config = getShopConfig(shop);
  if (!config) throw new Error(`Unbekannter Shop: ${shop}`);

  const { page } = await getSearch(shop, searchId);
  const url = path.startsWith("http") ? path : `${config.origin}${path}`;

  const ergebnis = await gotoTolerant(page, url, `${shop} ${path}`);

  // An aborted navigation means: the target page does not exist. Report it
  // as 404 instead of as an error -- the caller in index.ts then reads that
  // as "no hit" and writes no stack trace into the log.
  if (ergebnis === "abgebrochen") {
    touchSearch(shop, searchId);
    return { status: 404, body: "", contentType: "text/html" };
  }

  await page.waitForTimeout(2000);
  await acceptCookieBannerIfPresent(shop, page);

  const body = await page.content();
  touchSearch(shop, searchId);
  return { status: 200, body, contentType: "text/html" };
}

async function fetchViaBrowser(shop, path, searchId) {
  const config = getShopConfig(shop);
  if (!config) throw new Error(`Unbekannter Shop: ${shop}`);

  const { page } = await getSearch(shop, searchId);
  const url = path.startsWith("http") ? path : `${config.origin}${path}`;

  const result = await page.evaluate(async (targetUrl) => {
    const res = await fetch(targetUrl, { headers: { Accept: "text/html, application/json" } });
    const body = await res.text();
    return { status: res.status, body, contentType: res.headers.get("content-type") };
  }, url);

  touchSearch(shop, searchId);
  return result;
}

// --- Housekeeping ---------------------------------------------------------

// Contexts whose close never arrived, and browsers nobody has asked anything
// in half an hour. A browser is only let go once it has no contexts left --
// an abandoned context would otherwise take a running search with it, which
// is the very bug this file was rebuilt to avoid.
async function sweep() {
  const now = Date.now();

  for (const [key, search] of [...searches]) {
    if (search.expiresAt > now) continue;
    console.log(`[browser-sidecar] Verwaister Kontext für ${search.shop} nach Zeitablauf geschlossen.`);
    searches.delete(key);
    try {
      await search.context.close();
    } catch {
      // The context may already be gone with its browser -- nothing to do.
    }
  }

  for (const [shop, entry] of [...browsers]) {
    // Checked twice, and the second time with no await in between: closing the
    // contexts above took time, and in it a search may have grabbed this very
    // browser and refreshed its deadline.
    if (entry.expiresAt > Date.now()) continue;
    if (hasLiveWork(shop)) continue;
    if (browsers.get(shop) !== entry) continue;

    // From here on the entry counts as gone, even though close() is still
    // running: getBrowser skips it and starts a fresh browser instead.
    entry.closing = true;
    browsers.delete(shop);
    console.log(`[browser-sidecar] Browser für ${shop} nach 30 Minuten Leerlauf beendet.`);
    try {
      await entry.browser.close();
    } catch (e) {
      console.warn(`[browser-sidecar] Browser-Schließen für ${shop} fehlgeschlagen:`, e.message);
    }
  }
}

// unref(), so this timer alone never keeps the process alive.
const sweeper = setInterval(() => {
  sweep().catch((e) => console.warn("[browser-sidecar] Aufräumen fehlgeschlagen:", e.message));
}, SWEEP_INTERVAL_MS);
sweeper.unref();

module.exports = { navigateAndGetHtml, fetchViaBrowser, closeSearch, isAjaxPath };
