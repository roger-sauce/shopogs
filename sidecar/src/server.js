// Browser-Sidecar: löst Bot-Schutz per Camoufox-Browser-Navigation statt
// Cookie-Harvest-und-Replay (siehe browserSession.js). Generisch für mehrere
// Shops -- aktuell HHV und Boomkat, siehe SHOP_CONFIG dort. nginx leitet
// /proxy/<shop>/* hierher um, statt direkt an den echten Shop.
//
// Ablauf pro Request:
//   1) Je nach Pfad entweder navigateAndGetHtml (echte Vollnavigation --
//      für Seiten, deren Bot-Schutz nur bei echter Navigation aufgelöst
//      wird) oder fetchViaBrowser (fetch() aus der Seite heraus -- für
//      AJAX-Endpunkte, die auch die echte Seite so nachlädt). Session wird
//      bei Bedarf neu aufgebaut.
//   2) Sieht die Antwort nach Block/Challenge aus (HTTP-Status oder bei
//      HTML-Seiten ungewöhnlich kleiner Body), Session invalidieren und
//      EINMAL neu versuchen (mit frischer Session).
//
// Lifecycle: das Frontend ruft nach jeder abgeschlossenen Suche
// POST /proxy/<shop>/__session/close auf (siehe hhv/boomkat api.ts), damit
// der Browser-Prozess sofort wieder verschwindet statt bis zum Idle-Timeout
// offen zu bleiben -- bei wenig parallelen Suchen lohnt sich Dauerbetrieb
// nicht.
const express = require("express");
const { navigateAndGetHtml, fetchViaBrowser, invalidateSession, isAjaxPath } = require("./browserSession");

const PORT = process.env.PORT || 3001;

function looksLikeChallenge(result, isAjax) {
  // HTTP-Fehlerstatus ist ein generisches Blockiert-Signal (z.B. Boomkats
  // HTTP 403 bei TLS-/Bot-Fingerprinting) -- unabhängig vom Endpunkt-Typ.
  if (result.status >= 400) return true;
  // AJAX/JSON-Antworten dürfen legitim kurz sein (z.B. 0 Autocomplete-
  // Treffer) -- kein Größen-Check, sonst False Positives.
  if (isAjax) return false;
  // Laut RECON.md liefert HHVs Challenge-Seite HTTP 200 mit ~1.9 KB
  // obfuskiertem JS statt echtem HTML -- reicht als grobe Heuristik für
  // Vollnavigations-Seiten.
  return !result.contentType || !result.contentType.includes("text/html") || result.body.length < 5000;
}

const app = express();

// Muss VOR der generischen "/proxy/:shop/*"-Route registriert werden, sonst
// würde Express sie nie erreichen -- die Wildcard-Route unten würde
// "__session/close" sonst als (unsinnigen) Shop-Pfad interpretieren und
// weiterreichen.
app.post("/proxy/:shop/__session/close", async (req, res) => {
  await invalidateSession(req.params.shop);
  res.status(204).end();
});

app.all("/proxy/:shop/*", async (req, res) => {
  const { shop } = req.params;
  // Reines String-Prefix-Stripping statt new RegExp(`^/proxy/${shop}`) --
  // `shop` kommt direkt aus der URL (attacker-kontrolliert) und würde sonst
  // ungeprüft in ein Regex-Pattern eingebaut (z.B. Sonderzeichen wie "."
  // oder "*" in einem Shop-Namen hätten unbeabsichtigte Regex-Semantik statt
  // literal zu matchen). Ein einfacher startsWith/slice braucht kein Escaping
  // und ist obendrein günstiger.
  const proxyPrefix = `/proxy/${shop}`;
  const upstreamPath = req.originalUrl.startsWith(proxyPrefix)
    ? req.originalUrl.slice(proxyPrefix.length)
    : req.originalUrl;
  const isAjax = isAjaxPath(shop, upstreamPath);
  const fetchFn = isAjax ? fetchViaBrowser : navigateAndGetHtml;

  try {
    let result = await fetchFn(shop, upstreamPath);
    console.log(
      `[browser-sidecar][debug] ${shop} ${upstreamPath} -> status=${result.status} length=${result.body.length} contentType=${result.contentType}`
    );

    if (looksLikeChallenge(result, isAjax)) {
      console.log(`[browser-sidecar][debug] sieht wie Block/Challenge aus, Session-Retry für ${shop} ${upstreamPath}`);
      await invalidateSession(shop);
      result = await fetchFn(shop, upstreamPath);
      console.log(
        `[browser-sidecar][debug] Retry ${shop} ${upstreamPath} -> status=${result.status} length=${result.body.length}`
      );
    }

    res.status(result.status);
    res.set("content-type", result.contentType || "text/html");
    res.send(result.body);
  } catch (err) {
    console.error(`[browser-sidecar] Fehler für ${shop} ${upstreamPath}:`, err);
    res.status(502).send("browser-sidecar: upstream error");
  }
});

app.get("/health", (_req, res) => res.send("ok"));

app.listen(PORT, () => {
  console.log(`browser-sidecar läuft auf Port ${PORT}`);
});
