// Keeps one running Camoufox session (browser + one open page) per shop
// alive for the duration of ONE search. Built generically for several shops
// (currently HHV + Boomkat) -- each entry in SHOP_CONFIG describes one
// shop of its own, the rest of the logic is shop-agnostic.
//
// Two fundamentally different kinds of access:
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
//     /lazy/artikel/.../list_entry turbo frames, Boomkat's
//     /api/autocomplete). Runs over the real browser connection (TLS
//     fingerprint, cookies, referer) -- with Boomkat that is presumably the
//     decisive difference from the old approach proxied directly in
//     nginx/vite, which was blocked there with HTTP 403 (TLS/bot
//     fingerprinting that a simple reverse proxy cannot imitate).
//
// Every new session first navigates once to the shop start page (click the
// cookie banner away) BEFORE any request runs -- with HHV that changes
// nothing (the search page navigates for real right afterwards anyway), with
// Boomkat it is a precondition: there the very first request of a search is
// the autocomplete AJAX API, and a fetch() from a still empty about:blank
// page would be the wrong origin / no same-site cookies.
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
    // Autocomplete search -- the real page calls this via AJAX too,
    // while you type into the search box.
    ajaxPathPrefixes: ["/api/autocomplete"],
  },
};

// Safety net -- normally the frontend closes the session actively
// via closeSession() (see server.js /__session/close), long before
// this timeout takes effect.
const SESSION_IDLE_TTL_MS = 2 * 60 * 1000;

const sessions = new Map(); // shop -> { browser, page, expiresAt }
const inFlightSetup = new Map(); // shop -> Promise<session>

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

function isExpired(session) {
  return !session || session.expiresAt <= Date.now();
}

function isAjaxPath(shop, path) {
  const config = getShopConfig(shop);
  return config?.ajaxPathPrefixes?.some((prefix) => path.startsWith(prefix)) ?? false;
}

async function closeSession(shop) {
  const session = sessions.get(shop);
  if (!session) return;
  sessions.delete(shop);
  try {
    await session.browser.close();
  } catch (e) {
    console.warn(`[browser-sidecar] Browser-Schließen für ${shop} fehlgeschlagen:`, e.message);
  }
}

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
// Therefore: log the timeout and carry on with the state we have. If the
// page really is unusable, the challenge detection in server.js kicks in
// (unusually small body) and forces an attempt with a fresh session.
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
    // the case when the autocomplete interface returns a product link to a
    // page that does not exist -- it does that for records that are not
    // stocked there at all. That is not an error, simply no hit, and it
    // does not belong in the log as a stack trace.
    if (/NS_BINDING_ABORTED/.test(e.message)) {
      console.log(`[browser-sidecar][debug] Navigation abgebrochen für ${beschreibung} -- kein Treffer`);
      return "abgebrochen";
    }
    throw e;
  }
  return "ok";
}

async function setupSession(shop) {
  const config = getShopConfig(shop);
  if (!config) throw new Error(`Unbekannter Shop: ${shop}`);

  const { Camoufox } = await import("camoufox-js");
  // exclude_addons: ["UBO"] -- otherwise Camoufox tries on EVERY start to
  // download uBlock Origin and unpack it into a global, shared addon
  // directory (regardless of the shop). Since "Nicht ganz so Schnell"
  // searches several shops in parallel (HHV + Boomkat via Promise.all),
  // several Camoufox instances start at the same time and race each other
  // while unpacking into the same folder -- one instance then catches a
  // half-finished directory ("manifest.json is missing"). We do not need
  // ad blocking (we do want the full page content), therefore switch it
  // off completely instead of merely defusing the race condition.
  const browser = await Camoufox({ headless: true, locale: config.locale, exclude_addons: ["UBO"] });
  const page = await browser.newPage();

  // Start page first -- see the explanation above (warm up origin/cookies
  // before any fetch() runs from inside the page).
  await gotoTolerant(page, config.origin, `${shop} Startseite`);
  await page.waitForTimeout(1000);
  await acceptCookieBannerIfPresent(shop, page);

  const session = { browser, page, expiresAt: Date.now() + SESSION_IDLE_TTL_MS };
  sessions.set(shop, session);
  return session;
}

async function getSession(shop) {
  const existing = sessions.get(shop);
  if (!isExpired(existing)) return existing;
  if (existing) await closeSession(shop); // expired -> clean up

  if (inFlightSetup.has(shop)) return inFlightSetup.get(shop);

  const promise = setupSession(shop).finally(() => inFlightSetup.delete(shop));
  inFlightSetup.set(shop, promise);
  return promise;
}

function touchSession(shop) {
  const session = sessions.get(shop);
  if (session) session.expiresAt = Date.now() + SESSION_IDLE_TTL_MS;
}

// Real full navigation -- the only way to trigger JS challenges that work
// via document.location.reload after the cookie has been set.
async function navigateAndGetHtml(shop, path) {
  const config = getShopConfig(shop);
  if (!config) throw new Error(`Unbekannter Shop: ${shop}`);

  const session = await getSession(shop);
  const url = path.startsWith("http") ? path : `${config.origin}${path}`;

  const ergebnis = await gotoTolerant(session.page, url, `${shop} ${path}`);

  // An aborted navigation means: the target page does not exist. Report it
  // as 404 instead of as an error -- the caller in index.ts then reads that
  // as "no hit" and writes no stack trace into the log.
  if (ergebnis === "abgebrochen") {
    touchSession(shop);
    return { status: 404, body: "", contentType: "text/html" };
  }

  await session.page.waitForTimeout(2000);
  await acceptCookieBannerIfPresent(shop, session.page);

  const body = await session.page.content();
  touchSession(shop);
  return { status: 200, body, contentType: "text/html" };
}

// fetch() INSIDE the page -- for endpoints that the real page itself also
// calls via AJAX/XHR.
async function fetchViaBrowser(shop, path) {
  const config = getShopConfig(shop);
  if (!config) throw new Error(`Unbekannter Shop: ${shop}`);

  const session = await getSession(shop);
  const url = path.startsWith("http") ? path : `${config.origin}${path}`;

  const result = await session.page.evaluate(async (targetUrl) => {
    const res = await fetch(targetUrl, { headers: { Accept: "text/html, application/json" } });
    const body = await res.text();
    return { status: res.status, body, contentType: res.headers.get("content-type") };
  }, url);

  touchSession(shop);
  return result;
}

// Forces a fresh session on the next request -- either because the response
// looks like a challenge/block page, or because the frontend reports via
// /__session/close that the search is finished.
async function invalidateSession(shop) {
  await closeSession(shop);
}

module.exports = { navigateAndGetHtml, fetchViaBrowser, invalidateSession, isAjaxPath };
