// Browser sidecar: solves bot protection via Camoufox browser navigation
// instead of cookie harvest and replay (see browserSession.js). Generic for
// several shops -- currently HHV and Boomkat, see SHOP_CONFIG there. nginx
// routes /proxy/<shop>/* here instead of directly to the real shop.
//
// Sequence per request:
//   1) Depending on the path either navigateAndGetHtml (real full
//      navigation -- for pages whose bot protection is only resolved on a
//      real navigation) or fetchViaBrowser (fetch() from inside the page --
//      for AJAX endpoints that the real page loads that way too). The
//      session is rebuilt if needed.
//   2) If the response looks like a block/challenge (HTTP status, or for
//      HTML pages an unusually small body), invalidate the session and
//      retry ONCE (with a fresh session).
//
// Lifecycle: after every completed search the frontend calls
// POST /proxy/<shop>/__session/close (see hhv/boomkat api.ts) so that the
// browser process disappears again immediately instead of staying open
// until the idle timeout -- with few parallel searches continuous operation
// is not worth it.
const express = require("express");
const { navigateAndGetHtml, fetchViaBrowser, invalidateSession, isAjaxPath } = require("./browserSession");

const PORT = process.env.PORT || 3001;

function looksLikeChallenge(result, isAjax) {
  // 404 is a real answer, not a block: the page does not exist. Since
  // 04.08.2026 the sidecar reports it that way itself when a navigation
  // aborts with NS_BINDING_ABORTED -- the case with Boomkat when the
  // autocomplete interface returns a product link to a record that is not
  // there. A retry with a fresh session would be pure waste of time here,
  // the result would stay the same.
  if (result.status === 404) return false;
  // Any other HTTP error status is a generic blocked signal (e.g. Boomkat's
  // HTTP 403 on TLS-/bot fingerprinting) -- independent of the endpoint
  // type.
  if (result.status >= 400) return true;
  // AJAX/JSON responses may legitimately be short (e.g. 0 autocomplete
  // hits) -- no size check, otherwise false positives.
  if (isAjax) return false;
  // According to RECON.md HHV's challenge page returns HTTP 200 with ~1.9 KB
  // of obfuscated JS instead of real HTML -- good enough as a rough
  // heuristic for full-navigation pages.
  return !result.contentType || !result.contentType.includes("text/html") || result.body.length < 5000;
}

const app = express();

// Must be registered BEFORE the generic "/proxy/:shop/*" route, otherwise
// Express would never reach it -- the wildcard route below would otherwise
// interpret "__session/close" as a (nonsensical) shop path and pass it
// through.
app.post("/proxy/:shop/__session/close", async (req, res) => {
  await invalidateSession(req.params.shop);
  res.status(204).end();
});

app.all("/proxy/:shop/*", async (req, res) => {
  const { shop } = req.params;
  // Plain string prefix stripping instead of new RegExp(`^/proxy/${shop}`) --
  // `shop` comes straight from the URL (attacker-controlled) and would
  // otherwise be built unchecked into a regex pattern (e.g. special
  // characters like "." or "*" in a shop name would have unintended regex
  // semantics instead of matching literally). A simple startsWith/slice
  // needs no escaping and is cheaper on top of that.
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
