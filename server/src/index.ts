// Has to come before everything else: the adapters parse HTML with
// `new DOMParser()`, which exists in Node only once this file has run.
import "./dom.ts";

import { timingSafeEqual } from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";

import { shops } from "../../src/shops/index.ts";
import { sanitizeSearchTerm } from "../../src/lib/inputValidation.ts";
import { fetchTitleSuggestions } from "../../src/lib/titleSuggestions.ts";
import type { AvailabilityResult, LabelSearchResult, ShopSpeed } from "../../src/types/shop.ts";

// The same adapters that run in the browser -- only server-side here, so the
// iPhone app gets finished hits instead of raw shop pages. The way out still
// leads through nginx (see src/lib/proxyBase.ts).

const PORT = Number(process.env.PORT ?? 3002);

// How long a single shop is allowed to take.
//
// Generous for the slow class: every search starts a Camoufox session of its
// own in the sidecar and has to solve its bot challenge. A timeout that fires
// while the browser is still working produces the worst kind of error message
// -- one that blames the network because patience ran out.
const TIMEOUT_MS: Record<ShopSpeed, number> = {
  fast: 30_000,
  slow: 150_000,
};

interface ShopSearchEntry {
  shopId: string;
  status: "done" | "error";
  results?: AvailabilityResult[];
  error?: string;
}

interface ShopLabelEntry {
  shopId: string;
  status: "done" | "error";
  result?: LabelSearchResult;
  error?: string;
}

// One shop that hangs must not block the other seven. The underlying fetch
// does carry on afterwards (the adapters take no AbortSignal), but by then
// nobody is interested in its result -- and the process clears it away by
// itself.
function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    work,
    new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error(`${label}: no answer after ${ms / 1000}s`)), ms).unref();
    }),
  ]);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** First value of a query parameter as a string -- Express hands back an
 *  array when a parameter is set twice. */
function firstValue(raw: unknown): string {
  if (Array.isArray(raw)) return typeof raw[0] === "string" ? raw[0] : "";
  return typeof raw === "string" ? raw : "";
}

function parseSpeed(raw: unknown): ShopSpeed | undefined {
  const value = firstValue(raw);
  return value === "fast" || value === "slow" ? value : undefined;
}

const app = express();
// Otherwise every response announces that Express is running here.
app.disable("x-powered-by");
// Answers are always to be fetched fresh; a cached stock level is worse than
// no stock level at all.
app.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// Deliberately before the key check and deliberately without a key: this is
// the one question worth asking when nothing works -- is anything answering
// at all? With a key, "server dead" and "wrong key" would be the same error
// again.
app.get(["/health", "/api/health"], (_req: Request, res: Response) => {
  res.json({ ok: true, shops: shops.length });
});

/**
 * As long as SHOPOGS_API_KEY is unset the API stands open -- exactly like
 * /proxy/ already does today, and because the web app is meant to reach it
 * without a login. The key is therefore one environment variable away, should
 * this ever need to be reachable from outside, without touching code here.
 */
function requireKey(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.SHOPOGS_API_KEY;
  if (!expected) {
    next();
    return;
  }

  const header = req.get("authorization") ?? "";
  const offered = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(offered);
  const b = Buffer.from(expected);
  // Length first: timingSafeEqual throws on differing lengths.
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    res.status(401).json({ error: "Invalid or missing key" });
    return;
  }
  next();
}

app.use("/api", requireKey);

// So the app does not have to maintain the shop list (name, country, group,
// speed) a second time -- the truth lives in src/shops/index.ts. The
// adapter's functions of course stay here.
app.get("/api/shops", (_req: Request, res: Response) => {
  res.json({
    shops: shops.map((shop) => ({
      id: shop.id,
      name: shop.name,
      country: shop.country,
      group: shop.group,
      speed: shop.speed,
      type: shop.type,
      homeUrl: shop.homeUrl,
      logoUrl: shop.logoUrl,
      supportsLabelSearch: typeof shop.checkLabelAvailability === "function",
    })),
  });
});

/**
 * Artist/title search across all shops of one speed class.
 *
 * One entry per shop, not per hit: a broken shop should stay visible instead
 * of quietly disappearing from the list. Hence no Promise.all either, which
 * would throw everything away on the first failure -- every shop gets its own
 * try/catch.
 */
app.get("/api/search", async (req: Request, res: Response) => {
  const speed = parseSpeed(req.query.speed);
  if (!speed) {
    res.status(400).json({ error: "speed must be fast or slow" });
    return;
  }

  // The same cleanup as in the web form (control characters out, capped at
  // 100 characters). Repeated here because a native client has no form -- and
  // because the terms go on to eight foreign shops and a real browser.
  const artist = sanitizeSearchTerm(firstValue(req.query.artist));
  const title = sanitizeSearchTerm(firstValue(req.query.title));
  if (!artist.trim() && !title.trim()) {
    res.status(400).json({ error: "artist or title is required" });
    return;
  }

  const targets = shops.filter((shop) => shop.speed === speed);
  const results: ShopSearchEntry[] = await Promise.all(
    targets.map(async (shop) => {
      try {
        const found = await withTimeout(
          shop.checkAvailability(artist.trim(), title.trim()),
          TIMEOUT_MS[speed],
          shop.name
        );
        return { shopId: shop.id, status: "done" as const, results: found };
      } catch (err) {
        return { shopId: shop.id, status: "error" as const, error: errorMessage(err) };
      }
    })
  );

  res.json({ results });
});

/**
 * Label search ("Small Label Suche" in the web app) -- returns only a hit
 * count and a jump-off link per shop, rather than a hit list that would run
 * into four digits for large labels.
 */
app.get("/api/label", async (req: Request, res: Response) => {
  const speed = parseSpeed(req.query.speed);
  if (!speed) {
    res.status(400).json({ error: "speed must be fast or slow" });
    return;
  }

  const query = sanitizeSearchTerm(firstValue(req.query.q)).trim();
  if (!query) {
    res.status(400).json({ error: "q is required" });
    return;
  }

  const targets = shops.filter((shop) => shop.speed === speed);
  const results: ShopLabelEntry[] = await Promise.all(
    targets.map(async (shop) => {
      // No label adapter present (e.g. Bis Aufs Messer) -- that is a
      // statement, not an error, and is passed on as such.
      if (!shop.checkLabelAvailability) {
        return { shopId: shop.id, status: "done" as const, result: { supported: false as const } };
      }
      try {
        const result = await withTimeout(
          shop.checkLabelAvailability(query),
          TIMEOUT_MS[speed],
          shop.name
        );
        return { shopId: shop.id, status: "done" as const, result };
      } catch (err) {
        return { shopId: shop.id, status: "error" as const, error: errorMessage(err) };
      }
    })
  );

  res.json({ results });
});

/**
 * Suggestions for the full album title while only a fragment has been typed.
 * Uses the fast shops only -- a suggestion per keystroke must not start a
 * browser.
 */
app.get("/api/suggest", async (req: Request, res: Response) => {
  const query = sanitizeSearchTerm(firstValue(req.query.q)).trim();
  if (query.length < 3) {
    res.json({ suggestions: [] });
    return;
  }

  try {
    const suggestions = await withTimeout(
      fetchTitleSuggestions(query),
      TIMEOUT_MS.fast,
      "Suggestions"
    );
    res.json({ suggestions });
  } catch (err) {
    res.status(502).json({ error: errorMessage(err) });
  }
});

// Anything that is not a known route gets JSON instead of Express' HTML error
// page -- a client that ends up here can do nothing with an error page.
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Unknown route" });
});

app.listen(PORT, () => {
  console.log(`[shopogs-api] listening on ${PORT}, ${shops.length} shops registered`);
});
