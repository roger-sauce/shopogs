// Hält pro Shop eine laufende Camoufox-Session (Browser + eine offene Seite)
// für die Dauer EINER Suche am Leben. Generisch für mehrere Shops gebaut
// (aktuell HHV + Boomkat) -- jeder Eintrag in SHOP_CONFIG beschreibt einen
// eigenen Shop, der Rest der Logik ist shop-agnostisch.
//
// Zwei grundverschiedene Zugriffsarten:
//   - navigateAndGetHtml: echte Vollnavigation (page.goto). Nötig für
//     Endpunkte, die im echten Seitenbetrieb NUR per Vollnavigation
//     aufgerufen werden (z.B. HHVs Suchseite) -- deren Bot-Challenge besteht
//     teils aus JS, das per document.cookie einen Cookie setzt und sich
//     dann selbst per document.location.reload(true) neu lädt. Das läuft
//     NUR bei einer echten Navigation, niemals bei einem fetch() -- auch
//     nicht bei einem fetch() von INNERHALB der Seite (page.evaluate), weil
//     fetch() niemals <script>-Inhalte der Antwort ausführt (verifiziert an
//     HHV: ein fetch aus der echten Camoufox-Seite heraus lieferte exakt
//     die Challenge-Stub-Seite zurück).
//   - fetchViaBrowser: fetch() INNERHALB der Seite. Für Endpunkte, die auch
//     die echte Seite selbst per AJAX/XHR nachlädt (z.B. HHVs
//     /lazy/artikel/.../list_entry Turbo-Frames, Boomkats
//     /api/autocomplete). Läuft über die echte Browser-Verbindung (TLS-
//     Fingerprint, Cookies, Referer) -- das ist bei Boomkat vermutlich der
//     entscheidende Unterschied zum alten, direkt in nginx/vite geproxyten
//     Ansatz, der dort mit HTTP 403 blockiert wurde (TLS-/Bot-Fingerprinting,
//     das ein simpler Reverse-Proxy nicht imitieren kann).
//
// Jede neue Session navigiert zuerst einmal zur Shop-Startseite (Cookie-
// Banner wegklicken), BEVOR irgendein Request läuft -- bei HHV ändert das
// nichts (die Suchseite navigiert ohnehin gleich danach echt), bei Boomkat
// ist es Voraussetzung: die allererste Anfrage einer Suche ist dort die
// Autocomplete-AJAX-API, ein fetch() von einer noch leeren about:blank-Seite
// aus wäre falscher Origin / keine Same-Site-Cookies.
const SHOP_CONFIG = {
  hhv: {
    origin: "https://www.hhv.de",
    locale: "de-DE",
    acceptButtonPattern: /akzeptieren/i,
    // Turbo-Frame-Nachladen -- auch die echte Seite ruft das per AJAX auf.
    ajaxPathPrefixes: ["/lazy/artikel/"],
  },
  boomkat: {
    origin: "https://boomkat.com",
    locale: "en-GB",
    acceptButtonPattern: /accept|agree|got it/i,
    // Autocomplete-Suche -- auch die echte Seite ruft das per AJAX auf,
    // während man in die Suchbox tippt.
    ajaxPathPrefixes: ["/api/autocomplete"],
  },
};

// Sicherheitsnetz -- im Normalfall schließt das Frontend die Session aktiv
// über closeSession() (siehe server.js /__session/close), lange bevor
// dieses Timeout greift.
const SESSION_IDLE_TTL_MS = 2 * 60 * 1000;

const sessions = new Map(); // shop -> { browser, page, expiresAt }
const inFlightSetup = new Map(); // shop -> Promise<session>

// `shop` kommt in server.js direkt aus dem URL-Pfad (/proxy/:shop/*), ist
// also potenziell attacker-kontrolliert. Ein direktes SHOP_CONFIG[shop]
// würde bei Keys wie "constructor" oder "__proto__" ein Objekt von
// Object.prototype statt undefined liefern und so den `if (!config)`-Check
// weiter unten umgehen -- deshalb hier ein echter hasOwnProperty-Guard statt
// direktem Property-Zugriff.
function getShopConfig(shop) {
  // Der eigentliche Guard steht direkt davor (Object.hasOwn) -- der Linter
  // erkennt den Zusammenhang im Ternary nicht und flaggt den Zugriff trotzdem.
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

async function setupSession(shop) {
  const config = getShopConfig(shop);
  if (!config) throw new Error(`Unbekannter Shop: ${shop}`);

  const { Camoufox } = await import("camoufox-js");
  // exclude_addons: ["UBO"] -- Camoufox versucht sonst bei JEDEM Start,
  // uBlock Origin herunterzuladen und in ein globales, geteiltes
  // Addon-Verzeichnis zu entpacken (unabhängig vom Shop). Seit "Nicht ganz
  // so Schnell" mehrere Shops parallel durchsucht (HHV + Boomkat via
  // Promise.all), starten mehrere Camoufox-Instanzen gleichzeitig und
  // race(t)en beim Entpacken in denselben Ordner -- eine Instanz erwischt
  // dabei ein halbfertiges Verzeichnis ("manifest.json is missing"). Wir
  // brauchen kein Ad-Blocking (wir wollen ja den vollen Seiteninhalt),
  // daher komplett abschalten statt nur die Race Condition zu entschärfen.
  const browser = await Camoufox({ headless: true, locale: config.locale, exclude_addons: ["UBO"] });
  const page = await browser.newPage();

  // Startseite zuerst -- siehe Erklärung oben (Origin/Cookies warm machen,
  // bevor irgendein fetch() aus der Seite heraus läuft).
  await page.goto(config.origin, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1000);
  await acceptCookieBannerIfPresent(shop, page);

  const session = { browser, page, expiresAt: Date.now() + SESSION_IDLE_TTL_MS };
  sessions.set(shop, session);
  return session;
}

async function getSession(shop) {
  const existing = sessions.get(shop);
  if (!isExpired(existing)) return existing;
  if (existing) await closeSession(shop); // abgelaufen -> aufräumen

  if (inFlightSetup.has(shop)) return inFlightSetup.get(shop);

  const promise = setupSession(shop).finally(() => inFlightSetup.delete(shop));
  inFlightSetup.set(shop, promise);
  return promise;
}

function touchSession(shop) {
  const session = sessions.get(shop);
  if (session) session.expiresAt = Date.now() + SESSION_IDLE_TTL_MS;
}

// Echte Vollnavigation -- einzige Möglichkeit, JS-Challenges auszulösen,
// die per document.location.reload nach dem Cookie-Setzen funktionieren.
async function navigateAndGetHtml(shop, path) {
  const config = getShopConfig(shop);
  if (!config) throw new Error(`Unbekannter Shop: ${shop}`);

  const session = await getSession(shop);
  const url = path.startsWith("http") ? path : `${config.origin}${path}`;

  await session.page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  await session.page.waitForTimeout(2000);
  await acceptCookieBannerIfPresent(shop, session.page);

  const body = await session.page.content();
  touchSession(shop);
  return { status: 200, body, contentType: "text/html" };
}

// fetch() INNERHALB der Seite -- für Endpunkte, die auch die echte Seite
// per AJAX/XHR aufruft.
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

// Erzwingt eine frische Session beim nächsten Request -- entweder weil die
// Antwort wie eine Challenge-/Block-Seite aussieht, oder weil das Frontend
// per /__session/close meldet, dass die Suche fertig ist.
async function invalidateSession(shop) {
  await closeSession(shop);
}

module.exports = { navigateAndGetHtml, fetchViaBrowser, invalidateSession, isAjaxPath };
