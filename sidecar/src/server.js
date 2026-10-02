// Browser sidecar: solves bot protection via Camoufox browser navigation
// instead of cookie harvest and replay (see browserSession.js). Generic for
// several shops -- currently HHV and Boomkat, see SHOP_CONFIG there. nginx
// routes /proxy/<shop>/* here instead of directly to the real shop.
//
// Sequence per request:
//   1) The X-Search-Id header says which search is asking. Every search gets
//      a browser context of its own, so two searches running at the same
//      time cannot disturb each other -- and the one that finishes first
//      cannot close the other one's browser. That used to happen and showed
//      up as HTTP 502 with "Target page, context or browser has been
//      closed".
//   2) Depending on the path either navigateAndGetHtml (real full
//      navigation -- for pages whose bot protection is only resolved on a
//      real navigation) or fetchViaBrowser (fetch() from inside the page --
//      for AJAX endpoints that the real page loads that way too).
//   3) A response that looks like a block or a challenge is logged and
//      passed through as it is. It is deliberately NOT retried: asking the
//      same question again a second later has never yet turned a 403 into an
//      answer, it only doubles the load on a shop that is already throttling
//      us -- and a fresh context cannot help either, since every search
//      already starts with one.
//
// Lifecycle: after every completed search the adapter calls
// POST /proxy/<shop>/__session/close with the same header, which closes that
// one context. The browser stays up for the next search and shuts itself
// down after 30 minutes without a request.
const express = require("express");
const { navigateAndGetHtml, fetchViaBrowser, closeSearch, isAjaxPath } = require("./browserSession");

const PORT = process.env.PORT || 3001;

// Falls back to a fixed id when the header is missing, so an older client --
// or a hand-written curl during debugging -- still works. Those callers share
// one context, exactly as everything did before 02.10.2026.
function searchIdOf(req) {
  const raw = req.get("x-search-id");
  if (typeof raw !== "string") return "default";
  // The id travels into a Map key and into log lines; anything exotic is not
  // ours. Keep it to what the adapters actually generate.
  const clean = raw.trim().slice(0, 64);
  return /^[A-Za-z0-9_-]+$/.test(clean) ? clean : "default";
}

// Cloudflare's interstitial is the reason a size heuristic is not enough on
// its own. It arrives with HTTP 200, a text/html content type and 28 KB of
// markup -- five times the threshold below, and from the outside
// indistinguishable from a page with little on it. Only the content gives it
// away.
//
// The title is proof by itself. The script host is only taken as proof
// together with a smallish body, because a perfectly real page may embed a
// Turnstile widget (a sign-in form, say) and must not be flagged for it.
const CHALLENGE_TITLE = /<title>\s*Just a moment/i;
const CHALLENGE_HINTS = /challenges\.cloudflare\.com|cf-browser-verification|cf_chl_opt/i;

function bodyLooksLikeChallenge(body) {
  if (!body) return false;
  if (CHALLENGE_TITLE.test(body)) return true;
  return body.length < 60000 && CHALLENGE_HINTS.test(body);
}

// Only for the log. Nothing branches on it any more.
function describeBlock(result, isAjax) {
  if (result.status === 404) return null; // a real answer: the page does not exist
  if (result.status >= 400) return `HTTP ${result.status}`;
  if (bodyLooksLikeChallenge(result.body)) return "Challenge-Seite";
  if (isAjax) return null;
  if (!result.contentType || !result.contentType.includes("text/html")) return "kein HTML";
  // According to RECON.md HHV's challenge page returns HTTP 200 with ~1.9 KB
  // of obfuscated JS instead of real HTML.
  if (result.body.length < 5000) return `nur ${result.body.length} Bytes`;
  return null;
}

const app = express();

// Must be registered BEFORE the generic "/proxy/:shop/*" route, otherwise
// Express would never reach it -- the wildcard route below would otherwise
// interpret "__session/close" as a (nonsensical) shop path and pass it
// through.
app.post("/proxy/:shop/__session/close", async (req, res) => {
  await closeSearch(req.params.shop, searchIdOf(req));
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
  const searchId = searchIdOf(req);
  const isAjax = isAjaxPath(shop, upstreamPath);
  const fetchFn = isAjax ? fetchViaBrowser : navigateAndGetHtml;

  try {
    const result = await fetchFn(shop, upstreamPath, searchId);
    console.log(
      `[browser-sidecar][debug] ${shop} ${upstreamPath} -> status=${result.status} length=${result.body.length} contentType=${result.contentType}`
    );

    const block = describeBlock(result, isAjax);
    if (block) {
      console.log(`[browser-sidecar][debug] sieht nach Blockade aus (${block}) für ${shop} ${upstreamPath}`);
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
