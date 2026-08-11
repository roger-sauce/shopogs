import { useEffect, useState } from "react";
import { shops } from "./shops";
import type {
  AvailabilityResult,
  LabelSearchResult,
  SelectableFormat,
  ShopAdapter,
  ShopGroup,
  ShopSpeed,
} from "./types/shop";
import { matchesFormatFilter, SELECTABLE_FORMATS } from "./lib/classifyFormat";
import { fetchTitleSuggestions, type TitleSuggestion } from "./lib/titleSuggestions";
import { STATUS_COLORS, STATUS_LABELS } from "./lib/availabilityStatus";
import { sanitizeSearchTerm } from "./lib/inputValidation";

const GROUP_LABELS: Record<ShopGroup, string> = {
  "pickup-berlin": "Pickup in Berlin",
  "mail-order": "Mail Order",
};

// "fast" = ordinary HTTP search (result usually < 1s), "slow" = every search
// navigates live through a Camoufox browser (see sidecar/) — considerably
// slower, but the only way past the bot protection at some shops (e.g.
// HHV). Two separate search rows in the form make the speed difference
// visible to the user, instead of leaving a single search to wait for an
// unpredictable length of time.
const SPEED_LABELS: Record<ShopSpeed, string> = {
  fast: "Schnell",
  slow: "Nicht ganz so Schnell",
};

// Separate wording for the shop icon overview (ShopShowcase) -- there is no
// input field sitting right next to it as in the search form, hence
// "Suche ..." instead of just the speed word, to make the reference clearer.
const SHOWCASE_SPEED_LABELS: Record<ShopSpeed, string> = {
  fast: "Suche ist Schnell",
  slow: "Suche nicht ganz so Schnell",
};

interface ShopResult {
  shop: ShopAdapter;
  status: "loading" | "done" | "error";
  results: AvailabilityResult[];
  error?: string;
}

// Result row of the "Small Label Suche" -- unlike ShopResult above, each
// entry here carries NO list of hits, but only the number of matches plus a
// jump-off link (see LabelSearchResult), or "nicht unterstützt" when the
// shop adapter does not implement checkLabelAvailability (e.g. Bis Aufs
// Messer).
interface LabelShopResult {
  shop: ShopAdapter;
  status: "loading" | "done" | "error";
  result?: LabelSearchResult;
  error?: string;
}

// Identifies an artist/title combination for the "already searched?"
// comparison made by the Go buttons (see GoState below).
function queryKey(artist: string, title: string): string {
  return `${artist.trim()}::${title.trim()}`;
}

// disabled -> no input / no format selected, not clickable.
// ready    -> clickable, the input differs from the query this row last
//             searched for (or nothing has ever been searched) -- golden
//             background, so far the only "active" state.
// done     -> clickable, but the current input matches exactly the query
//             that was last searched for successfully -- grey surface with
//             golden text, so it is clear at a glance that "this is already
//             in the result list below", instead of looking indistin-
//             guishable from the "ready" state as it did before.
type GoState = "disabled" | "ready" | "done";

export default function App() {
  // Two separate pairs of fields for the "Schnell" and "Nicht ganz so
  // Schnell" search rows. Input in the fast row is carried over into the
  // slow one automatically (one-way synchronisation, see the useEffect
  // below) — whoever types in the upper row first does not have to type it
  // again below. The reverse (bottom -> top) is deliberately NOT synced.
  const [artistFast, setArtistFast] = useState("");
  const [titleFast, setTitleFast] = useState("");
  const [artistSlow, setArtistSlow] = useState("");
  const [titleSlow, setTitleSlow] = useState("");

  useEffect(() => {
    setArtistSlow(artistFast);
  }, [artistFast]);
  useEffect(() => {
    setTitleSlow(titleFast);
  }, [titleFast]);

  // Only Vinyl is ticked by default — CD/Cassette/Download have to be added
  // by the user deliberately. If they untick all of them, a warning appears
  // below instead of silently reverting to "show everything".
  const [selectedFormats, setSelectedFormats] = useState<SelectableFormat[]>(["Vinyl"]);

  const [searchingFast, setSearchingFast] = useState(false);
  const [searchingSlow, setSearchingSlow] = useState(false);
  const [searched, setSearched] = useState(false);
  const [shopResults, setShopResults] = useState<ShopResult[]>([]);

  // Remembers, per row, which query the currently displayed results were
  // last fetched for -- the basis for the "done" state of the Go buttons
  // (see GoState).
  const [lastSearchedFastQuery, setLastSearchedFastQuery] = useState<string | null>(null);
  const [lastSearchedSlowQuery, setLastSearchedSlowQuery] = useState<string | null>(null);

  const [suggestions, setSuggestions] = useState<TitleSuggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  // "Small Label Suche" -- a separate mode that repurposes the Artist/Band
  // fields as label input (the album title becomes invisible). It uses the
  // same artistFast/artistSlow states as the normal search on purpose
  // (including the existing fast->slow sync) instead of its own fields --
  // exactly what "ticking this checkbox changes the input fields" means.
  const [smallLabelMode, setSmallLabelMode] = useState(false);
  const [labelSearched, setLabelSearched] = useState(false);
  const [labelResults, setLabelResults] = useState<LabelShopResult[]>([]);
  // As with the normal search: kept separate per row, so that both Go
  // buttons track their own "already searched?" state independently (see
  // GoState) -- the label search is NO longer a single click for all
  // shops, but, like the album search, two separate clicks (fast shops /
  // slow shops).
  const [lastLabelSearchedFastQuery, setLastLabelSearchedFastQuery] = useState<string | null>(null);
  const [lastLabelSearchedSlowQuery, setLastLabelSearchedSlowQuery] = useState<string | null>(null);

  const searching = searchingFast || searchingSlow;

  const hasQueryFast = !!(artistFast.trim() || titleFast.trim());
  const hasQuerySlow = !!(artistSlow.trim() || titleSlow.trim());
  // The format filter is irrelevant for the label search (LabelSearchResult
  // has no format field at all) -- the input alone is enough there.
  const fastReady = smallLabelMode ? hasQueryFast : hasQueryFast && selectedFormats.length > 0;
  const slowReady = smallLabelMode ? hasQuerySlow : hasQuerySlow && selectedFormats.length > 0;
  const canSearchFast = fastReady && !searchingFast;
  const canSearchSlow = slowReady && !searchingSlow;

  const fastGoState: GoState = !fastReady
    ? "disabled"
    : smallLabelMode
    ? lastLabelSearchedFastQuery === artistFast.trim()
      ? "done"
      : "ready"
    : lastSearchedFastQuery === queryKey(artistFast, titleFast)
    ? "done"
    : "ready";
  const slowGoState: GoState = !slowReady
    ? "disabled"
    : smallLabelMode
    ? lastLabelSearchedSlowQuery === artistSlow.trim()
      ? "done"
      : "ready"
    : lastSearchedSlowQuery === queryKey(artistSlow, titleSlow)
    ? "done"
    : "ready";

  // When switching to the results view we push a history entry of our own.
  // That way the browser's "back" button leads back to the app's start
  // screen instead of leaving the page entirely (which is what happens
  // without our own entry, since the app never changes the URL itself).
  useEffect(() => {
    const onPopState = () => {
      setSearched(false);
      setLabelSearched(false);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Suggestions for the full title, debounced while typing in the fast row
  // (the slow one follows automatically, see above). Deliberately ONLY the
  // title, not artist and title combined: a combined query almost wipes out
  // the hit rate across several sources (for "Aphex Twin Ambient" ANOST
  // drops from 15 hits to 2 compared with "Ambient" on its own; according
  // to RECON.md SoundOhm/Souffle Continu do not cover the artist name in
  // their search at all) — exactly the same pattern the real shop adapters
  // already take into account.
  useEffect(() => {
    const query = titleFast.trim();
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }
    const handle = setTimeout(() => {
      fetchTitleSuggestions(query)
        .then((s) => setSuggestions(s))
        .catch(() => setSuggestions([]));
    }, 350);
    return () => clearTimeout(handle);
  }, [titleFast]);

  const toggleFormat = (f: SelectableFormat) => {
    setSelectedFormats((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  };

  // Switching between the normal search and the "Small Label Suche"
  // deliberately clears Artist/Band resp. Small Label -- otherwise a
  // previously typed artist name stays in the (now renamed) field and is
  // accidentally searched for as a label name (it had to be deleted by hand
  // before). Title is cleared as well (invisible in label mode anyway) --
  // titleSlow/artistSlow follow automatically via the existing sync effects.
  const toggleSmallLabelMode = () => {
    setSmallLabelMode((v) => !v);
    setArtistFast("");
    setTitleFast("");
  };

  const applySuggestion = (s: TitleSuggestion) => {
    // Always set it, even when the suggestion carries no artist (ANOST, for
    // example, never supplies one) -- otherwise an old, unsuitable artist
    // stays in the field on click and the search combines two fields that
    // do not belong together at all (observed live: "Aphex Twin" plus the
    // ANOST suggestion "Selected Ambient & ASMR Works 2001-2003", an
    // Ergo Phizmiz homage compilation -- 0 hits everywhere).
    setArtistFast(s.artist ?? "");
    setTitleFast(s.title);
    setSuggestionsOpen(false);
  };

  // Both fields form a combined AND search — change only one of them and
  // forget that the old value is still in the other, and you apparently get
  // "no hits" (e.g. an old "Dustlick" in the title + the new artist
  // "Lovegod" -> nobody has both). Detecting a "new" search automatically
  // is too unreliable (any input could just as well be a refinement) —
  // instead there is an explicit reset button that puts all fields, results
  // and button states cleanly back to their defaults.
  const resetSearch = () => {
    setArtistFast("");
    setTitleFast("");
    setArtistSlow("");
    setTitleSlow("");
    setSuggestions([]);
    setSuggestionsOpen(false);
    setShopResults([]);
    setSearched(false);
    setLastSearchedFastQuery(null);
    setLastSearchedSlowQuery(null);
    setLabelResults([]);
    setLabelSearched(false);
    setLastLabelSearchedFastQuery(null);
    setLastLabelSearchedSlowQuery(null);
  };

  // A button of its own, deliberately separate instead of being opened
  // along with the search: leaving our page should be an explicit action,
  // not a side effect of "Go" (see the focus problem that caused). No
  // trick is needed to keep the focus — switching to the new tab IS the
  // goal here. Uses the fast row, since that one is usually filled in
  // first.
  //
  // In the "Small Label Suche" artistFast carries the label name (the title
  // is empty/invisible there anyway) -- verified by live recon that both
  // sites offer a dedicated label filter for this: Discogs' "type=label"
  // filters on labels exactly (verified: "Balmat" -> exactly 1 hit,
  // "Blume" -> 84 fuzzy hits with the real label right at the top).
  // Bandcamp has no pure "labels only" filter, "item_type=b" ("artists &
  // labels") is the closest category and likewise shows exact label hits
  // right at the top (verified with "Balmat" and "Blume").
  const openDiscogs = () => {
    const query = smallLabelMode
      ? artistFast.trim()
      : [artistFast, titleFast].map((v) => v.trim()).filter(Boolean).join(" ");
    if (!query) return;
    window.open(
      `https://www.discogs.com/search/?q=${encodeURIComponent(query)}&type=${
        smallLabelMode ? "label" : "release"
      }`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  // Like openDiscogs, only with Bandcamp's own search instead of Discogs --
  // Bandcamp's search is considerably more fuzzy-tolerant than Discogs' (a
  // combined artist+title query was verified live to put the right hits
  // straight at the top, even for multi-part box sets), so no hint about
  // "the title should be complete" is needed here. item_type=a filters on
  // "albums" (Bandcamp's own tab filter, verified by recon in Chrome)
  // -- it hides the single-track hits that would otherwise be listed along
  // with them and are not relevant for a record shop check.
  const openBandcamp = () => {
    const query = smallLabelMode
      ? artistFast.trim()
      : [artistFast, titleFast].map((v) => v.trim()).filter(Boolean).join(" ");
    if (!query) return;
    window.open(
      `https://bandcamp.com/search?q=${encodeURIComponent(query)}&item_type=${
        smallLabelMode ? "b" : "a"
      }`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  // Shared search logic for both rows: searches only the shops of the
  // respective speed class.
  const runSearch = async (speed: ShopSpeed, artistVal: string, titleVal: string) => {
    const targets = shops.filter((s) => s.speed === speed);
    if (targets.length === 0) return;

    if (!searched) {
      window.history.pushState({ view: "results" }, "");
    }
    setSearched(true);
    if (speed === "fast") setSearchingFast(true);
    else setSearchingSlow(true);

    setShopResults((prev) => {
      // A new "Schnell" search potentially invalidates the "Nicht ganz so
      // Schnell" results shown last: the input was carried over into the
      // lower row by the sync as well, without that row having searched
      // again -- the old hits there then belong to a superseded query and
      // are therefore removed along with it. The reverse case (a slow
      // search clearing out the fast results) deliberately does not
      // exist, because the fast row is never overwritten by the
      // slow one.
      const keepOthers = speed === "fast" ? [] : prev.filter((r) => r.shop.speed !== speed);
      return [
        ...keepOthers,
        ...targets.map((shop) => ({ shop, status: "loading" as const, results: [] as AvailabilityResult[] })),
      ];
    });
    if (speed === "fast") setLastSearchedSlowQuery(null);

    await Promise.all(
      targets.map(async (shop) => {
        try {
          const results = await shop.checkAvailability(artistVal.trim(), titleVal.trim());
          setShopResults((prev) =>
            prev.map((r) => (r.shop.id === shop.id ? { ...r, status: "done", results } : r))
          );
        } catch (err) {
          setShopResults((prev) =>
            prev.map((r) =>
              r.shop.id === shop.id ? { ...r, status: "error", error: (err as Error).message } : r
            )
          );
        }
      })
    );

    if (speed === "fast") {
      setSearchingFast(false);
      setLastSearchedFastQuery(queryKey(artistVal, titleVal));
    } else {
      setSearchingSlow(false);
      setLastSearchedSlowQuery(queryKey(artistVal, titleVal));
    }
  };

  // Label search ("Small Label Suche") -- split up by speed class like
  // runSearch above: two separate clicks (fast shops / slow shops),
  // exactly the same pattern as in the normal album search. Both rows
  // write into the same flat labelResults array (see LabelResultsList),
  // which in sum still yields the "all shops" list as soon as both rows
  // have searched once.
  const runLabelSearch = async (speed: ShopSpeed, labelVal: string) => {
    const query = labelVal.trim();
    if (!query) return;

    const targets = shops.filter((s) => s.speed === speed);
    if (targets.length === 0) return;

    if (!labelSearched) {
      window.history.pushState({ view: "results" }, "");
    }
    setLabelSearched(true);
    if (speed === "fast") setSearchingFast(true);
    else setSearchingSlow(true);

    setLabelResults((prev) => {
      // Same logic as in runSearch: a new "Schnell" search potentially
      // invalidates the "Nicht ganz so Schnell" results shown last (the
      // input was carried over into the lower row by the sync as well), so
      // they are removed along with it. Not the other way round.
      const keepOthers = speed === "fast" ? [] : prev.filter((r) => r.shop.speed !== speed);
      return [...keepOthers, ...targets.map((shop) => ({ shop, status: "loading" as const }))];
    });
    if (speed === "fast") setLastLabelSearchedSlowQuery(null);

    await Promise.all(
      targets.map(async (shop) => {
        if (!shop.checkLabelAvailability) {
          // No label search adapter available (e.g. Bis Aufs Messer) --
          // recorded explicitly as "nicht unterstützt", not as an error.
          setLabelResults((prev) =>
            prev.map((r) =>
              r.shop.id === shop.id ? { ...r, status: "done" as const, result: { supported: false } } : r
            )
          );
          return;
        }
        try {
          const result = await shop.checkLabelAvailability(query);
          setLabelResults((prev) =>
            prev.map((r) => (r.shop.id === shop.id ? { ...r, status: "done" as const, result } : r))
          );
        } catch (err) {
          setLabelResults((prev) =>
            prev.map((r) =>
              r.shop.id === shop.id
                ? { ...r, status: "error" as const, error: (err as Error).message }
                : r
            )
          );
        }
      })
    );

    if (speed === "fast") {
      setSearchingFast(false);
      setLastLabelSearchedFastQuery(query);
    } else {
      setSearchingSlow(false);
      setLastLabelSearchedSlowQuery(query);
    }
  };

  const handleSearchFast = () => {
    if (!canSearchFast) return;
    if (smallLabelMode) {
      runLabelSearch("fast", artistFast);
      return;
    }
    setSuggestionsOpen(false);
    runSearch("fast", artistFast, titleFast);
  };

  const handleSearchSlow = () => {
    if (!canSearchSlow) return;
    if (smallLabelMode) {
      runLabelSearch("slow", artistSlow);
      return;
    }
    runSearch("slow", artistSlow, titleSlow);
  };

  // Only shops with actual hits (after the format filter) or with an error
  // are displayed — empty/still-loading shops stay invisible.
  const withFiltered = shopResults.map((r) => ({
    ...r,
    filtered: r.results.filter((res) => matchesFormatFilter(res.format, selectedFormats)),
  }));
  // The order within a group used to be simply the insertion order in
  // shopResults (= the declaration order in shops/index.ts) -- which came
  // across as arbitrary/unpredictable. Now it is fixed: first all "fast"
  // shops alphabetically, then all "slow" shops appended alphabetically
  // -- derived dynamically from shop.speed and shop.name, no hardcoded
  // shop name needed.
  const visibleByGroup = (group: ShopGroup) =>
    withFiltered
      .filter((r) => r.shop.group === group && (r.status === "error" || r.filtered.length > 0))
      .sort((a, b) => {
        if (a.shop.speed !== b.shop.speed) return a.shop.speed === "fast" ? -1 : 1;
        return a.shop.name.localeCompare(b.shop.name, "de");
      });

  // Finished searching, but 0 hits (after the format filter) -- shops with
  // an error already show up in their own card and are deliberately not
  // listed again here, so as not to look like duplicates.
  const searchedEmptyShopNames = withFiltered
    .filter((r) => r.status === "done" && r.filtered.length === 0)
    .map((r) => r.shop.name);

  return (
    <div style={{ minHeight: "100vh", background: "#0d0f14", color: "#e8e4d9", fontFamily: "'Georgia', 'Times New Roman', serif" }}>
      <div style={{ borderBottom: "1px solid #2a2d35", padding: "36px 40px 26px", background: "linear-gradient(180deg, #111318 0%, #0d0f14 100%)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", textAlign: "center" }}>
          <h1
            style={{
              fontSize: 30,
              fontWeight: 600,
              margin: 0,
              letterSpacing: 4,
              textTransform: "uppercase",
              color: "#c8a96e",
              whiteSpace: "nowrap",
            }}
          >
            Ich muss diese Platte haben!
          </h1>
          <p style={{ margin: "10px 0 0", color: "#6b6e78", fontSize: 14 }}>
            Verfügbarkeit in Plattenläden
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 40px" }}>
        {/* Search form */}
        <div style={{ background: "#13151c", border: "1px solid #1e2128", borderRadius: 2, padding: "24px 28px" }}>
          {/* Fast row -- ordinary HTTP search */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 10, letterSpacing: 3, color: "#c8a96e", textTransform: "uppercase", marginBottom: 10 }}>
              {SPEED_LABELS.fast}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: smallLabelMode ? "1fr auto" : "1fr 1fr auto",
                gap: 16,
                alignItems: "end",
              }}
            >
              <div>
                <div style={fieldLabelStyle}>{smallLabelMode ? "Small Label" : "Artist / Band"}</div>
                <input
                  value={artistFast}
                  onChange={(e) => setArtistFast(sanitizeSearchTerm(e.target.value))}
                  onKeyDown={(e) => e.key === "Enter" && handleSearchFast()}
                  placeholder={smallLabelMode ? "z.B. Balmat" : "z.B. Aphex Twin"}
                  style={inputStyle}
                />
              </div>
              {!smallLabelMode && (
                <div style={{ position: "relative" }}>
                  <div style={fieldLabelStyle}>Album-Titel</div>
                  <input
                    value={titleFast}
                    onChange={(e) => setTitleFast(sanitizeSearchTerm(e.target.value))}
                    onFocus={() => setSuggestionsOpen(true)}
                    onBlur={() => setTimeout(() => setSuggestionsOpen(false), 150)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearchFast()}
                    placeholder="z.B. Ambient Works"
                    style={inputStyle}
                  />
                  {suggestionsOpen && suggestions.length > 0 && (
                    <div
                      style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        right: 0,
                        marginTop: 4,
                        background: "#0d0f14",
                        border: "1px solid #2a2d35",
                        borderRadius: 2,
                        zIndex: 10,
                        maxHeight: 220,
                        overflowY: "auto",
                      }}
                    >
                      <div style={{ fontSize: 10, letterSpacing: 2, color: "#6b6e78", textTransform: "uppercase", padding: "8px 12px 4px" }}>
                        Vollständiger Titel gefunden
                      </div>
                      {suggestions.map((s, i) => (
                        <div
                          key={i}
                          onMouseDown={() => applySuggestion(s)}
                          style={{
                            padding: "8px 12px",
                            cursor: "pointer",
                            fontSize: 13,
                            color: "#e8e4d9",
                            borderTop: "1px solid #1e2128",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "#171a22")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          {s.artist ? `${s.artist} – ${s.title}` : s.title}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <button onClick={handleSearchFast} disabled={!canSearchFast} style={goButtonStyle(fastGoState)}>
                {searchingFast ? "…" : "Go"}
              </button>
            </div>
          </div>

          {/* Slow row -- full Camoufox browser navigation per search */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 10, letterSpacing: 3, color: "#c8a96e", textTransform: "uppercase", marginBottom: 10 }}>
              {SPEED_LABELS.slow}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: smallLabelMode ? "1fr auto" : "1fr 1fr auto",
                gap: 16,
                alignItems: "end",
              }}
            >
              <div>
                <div style={fieldLabelStyle}>{smallLabelMode ? "Small Label" : "Artist / Band"}</div>
                <input
                  value={artistSlow}
                  onChange={(e) => setArtistSlow(sanitizeSearchTerm(e.target.value))}
                  onKeyDown={(e) => e.key === "Enter" && handleSearchSlow()}
                  placeholder={smallLabelMode ? "z.B. Balmat" : "z.B. Aphex Twin"}
                  style={inputStyle}
                />
              </div>
              {!smallLabelMode && (
                <div>
                  <div style={fieldLabelStyle}>Album-Titel</div>
                  <input
                    value={titleSlow}
                    onChange={(e) => setTitleSlow(sanitizeSearchTerm(e.target.value))}
                    onKeyDown={(e) => e.key === "Enter" && handleSearchSlow()}
                    placeholder="z.B. Ambient Works"
                    style={inputStyle}
                  />
                </div>
              )}
              <button onClick={handleSearchSlow} disabled={!canSearchSlow} style={goButtonStyle(slowGoState)}>
                {searchingSlow ? "…" : "Go"}
              </button>
            </div>
          </div>

          {/* Format filter + Small Label Suche checkbox + Bandcamp/Discogs
              jump-off links in one row. Only the format filter is
              irrelevant for the label search (no format field) and is
              hidden while that mode is active -- Bandcamp/Discogs stay
              visible, because both support a label search as well (see
              openBandcamp/openDiscogs). The checkbox itself likewise stays
              visible ALWAYS, otherwise there would be no way of leaving
              the mode again. */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: smallLabelMode ? "auto auto" : "1fr auto auto",
              gap: 32,
              alignItems: "start",
            }}
          >
            {!smallLabelMode && (
              <div>
                <div style={{ fontSize: 10, letterSpacing: 3, color: "#6b6e78", textTransform: "uppercase", marginBottom: 10 }}>
                  Format
                </div>
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                  {SELECTABLE_FORMATS.map((f) => (
                    <label key={f} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#9099a8", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={selectedFormats.includes(f)}
                        onChange={() => toggleFormat(f)}
                        style={{ accentColor: "#c8a96e" }}
                      />
                      {f}
                    </label>
                  ))}
                </div>
                {selectedFormats.length === 0 && (
                  <div style={{ fontSize: 12, color: "#c8a96e", marginTop: 8 }}>
                    Kein Format ausgewählt — das wird keine Ergebnisse liefern.
                  </div>
                )}
              </div>
            )}

            {/* "Small Label Suche" -- a column of its own with some space
                next to the format filter instead of below it, so that it is
                clear at first glance: this is not another format, but a
                search mode in its own right (see smallLabelMode). */}
            <div>
              <div style={{ fontSize: 10, letterSpacing: 3, color: "#6b6e78", textTransform: "uppercase", marginBottom: 10 }}>
                Small Label Suche
              </div>
              <input
                type="checkbox"
                checked={smallLabelMode}
                onChange={toggleSmallLabelMode}
                style={{ accentColor: "#c8a96e" }}
              />
              {smallLabelMode && (
                <div style={{ fontSize: 11, color: "#6b6e78", marginTop: 8, maxWidth: 220 }}>
                  Zeigt für alle Shops die Trefferanzahl eines Labels plus Absprunglink -- statt
                  einzelner Platten.
                </div>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              {/* An inner column of its own, left-aligned -- this way the
                  hint line lines up with the left edge of the button block
                  (= the left edge of the Bandcamp button), while the whole
                  block as a unit still sits on the right. */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={openBandcamp} disabled={!hasQueryFast} style={externalLinkButtonStyle(hasQueryFast)}>
                    go to bandcamp
                  </button>
                  <button
                    onClick={openDiscogs}
                    disabled={!hasQueryFast}
                    title={smallLabelMode ? undefined : "Album-Titel sollte vollständig sein"}
                    style={externalLinkButtonStyle(hasQueryFast)}
                  >
                    go to discogs
                  </button>
                </div>
                <div style={{ fontSize: 11, color: "#6b6e78", marginTop: 8, textAlign: "left", maxWidth: 220 }}>
                  {smallLabelMode
                    ? "Bandcamp / Discogs: Suche nach Label statt Album"
                    : "Bandcamp / Discogs: Album-Titel sollte vollständig sein"}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* "Neue Suche" deliberately sits BELOW the form instead of at the
            top in the header -- up there the link scrolled out of the
            visible area while paging through a long list of results. */}
        {(hasQueryFast || hasQuerySlow || searched || labelSearched) && (
          <div style={{ textAlign: "right", padding: "18px 0 8px" }}>
            <button
              onClick={resetSearch}
              style={{
                background: "transparent",
                border: "none",
                color: "#c8a96e",
                fontSize: 11,
                letterSpacing: 1.5,
                textTransform: "uppercase",
                textDecoration: "underline",
                cursor: "pointer",
                fontFamily: "inherit",
                padding: 0,
              }}
            >
              Neue Suche
            </button>
          </div>
        )}

        <div style={{ height: 14 }} />

        {/* Results */}
        {smallLabelMode ? (
          labelSearched && (
            <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
              <LabelResultsList results={labelResults} />
              <div style={{ borderTop: "1px solid #1e2128", paddingTop: 32, marginTop: 8 }}>
                <ShopShowcase />
              </div>
            </div>
          )
        ) : (
        searched && (
          <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
            {(["pickup-berlin", "mail-order"] as ShopGroup[]).map((group) => {
              const visible = visibleByGroup(group);
              if (visible.length === 0) return null;
              return (
                <div key={group}>
                  <div style={{ fontSize: 11, letterSpacing: 3, color: "#6b6e78", textTransform: "uppercase", marginBottom: 14 }}>
                    {/* group is a ShopGroup union type, GROUP_LABELS covers it completely via Record -- guaranteed at compile time. */}
                    {/* eslint-disable-next-line security/detect-object-injection */}
                    {GROUP_LABELS[group]}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    {visible.map(({ shop, status, filtered, error }) => {
                      const shopLink = filtered[0]?.url ?? shop.homeUrl;
                      return (
                        <div key={shop.id} style={{ background: "#0f1118", border: "1px solid #1e2128", borderRadius: 2, padding: "16px 20px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                            <a
                              href={shopLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ fontSize: 18, color: "#f0ece0", textDecoration: "none", borderBottom: "1px dotted #4a4d55" }}
                            >
                              {shop.name}
                            </a>
                            <span style={{ fontSize: 11, color: "#6b6e78" }}>{shop.country}</span>
                            {status === "error" && (
                              <span style={{ fontSize: 12, color: "#c87070", marginLeft: "auto" }}>Fehler: {error}</span>
                            )}
                            {status === "done" && (
                              <span style={{ fontSize: 12, color: "#6b6e78", marginLeft: "auto" }}>{filtered.length} Treffer</span>
                            )}
                          </div>

                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {filtered.map((r, i) => (
                              <div
                                key={i}
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "1fr 100px 80px 200px",
                                  alignItems: "center",
                                  gap: 12,
                                  padding: "8px 12px",
                                  background: "#13151c",
                                  borderLeft: `3px solid ${STATUS_COLORS[r.status]}`,
                                  borderRadius: 1,
                                }}
                              >
                                <div>
                                  {r.url ? (
                                    <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ color: "#f0ece0", textDecoration: "none", borderBottom: "1px dotted #4a4d55" }}>
                                      {r.artist ? `${r.artist} – ${r.title}` : r.title}
                                    </a>
                                  ) : (
                                    <span style={{ color: "#f0ece0" }}>{r.artist ? `${r.artist} – ${r.title}` : r.title}</span>
                                  )}
                                </div>
                                <div style={{ fontSize: 12, color: "#9099a8" }}>{r.format ?? "—"}</div>
                                <div style={{ fontSize: 12, color: "#9099a8" }}>{r.price ? `${r.price} ${r.currency ?? ""}` : "—"}</div>
                                <div style={{ fontSize: 11, letterSpacing: 1, color: STATUS_COLORS[r.status], textAlign: "right" }}>
                                  {STATUS_LABELS[r.status].toUpperCase()}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {!searching && searchedEmptyShopNames.length > 0 && (
              <div style={{ textAlign: "center", padding: "16px 0", color: "#9099a8", fontSize: 13 }}>
                Durchsucht, aber nichts gefunden in: {searchedEmptyShopNames.join(", ")}
              </div>
            )}

            {!searching &&
              (["pickup-berlin", "mail-order"] as ShopGroup[]).every((g) => visibleByGroup(g).length === 0) &&
              searchedEmptyShopNames.length === 0 && (
                <div style={{ textAlign: "center", padding: "40px 0", color: "#3a3d45", fontSize: 14 }}>
                  Nirgends gefunden.
                </div>
              )}

            <div style={{ borderTop: "1px solid #1e2128", paddingTop: 32, marginTop: 8 }}>
              <ShopShowcase />
            </div>
          </div>
        )
        )}

        {(smallLabelMode ? !labelSearched : !searched) && (
          <div style={{ padding: "24px 0 60px" }}>
            <ShopShowcase />
            <div style={{ textAlign: "center", padding: "48px 0 0", color: "#3a3d45" }}>
              <div style={{ fontSize: 14, letterSpacing: 1 }}>
                {smallLabelMode
                  ? "Small Label eingeben und Verfügbarkeit über alle Shops prüfen"
                  : "Artist/Band und Album-Titel eingeben und Verfügbarkeit prüfen"}
              </div>
            </div>
          </div>
        )}

        <div style={{ textAlign: "left", padding: "40px 0 8px", fontSize: 12, color: "#3a3d45", letterSpacing: 0.5 }}>
          Designed with ❤️ by Rogzilla, coded by Claude
        </div>
      </div>
    </div>
  );
}

// ANOST supplies no logo image that is easy to hotlink - but it does supply
// the exact SVG paths from its own page header, which we embed 1:1 as vectors.
function AnostLogo({ size }: { size: number }) {
  return (
    <svg
      viewBox="0 0 506 138"
      style={{ width: size, height: size, background: "#fff", borderRadius: 2, flexShrink: 0 }}
    >
      <path d="M317 68a63 63 0 11-126 0 63 63 0 01126 0" />
      <path d="M408 20a52 52 0 00-72 0 50 50 0 000 72l72-72zM393 44c20 20 20 52 0 72a52 52 0 01-72 0l72-72zM431 68h51v62h-51zM415 7h83v54h-83zM103 20v110h83zM186 116V7h-83zM4 130h91V6z" />
    </svg>
  );
}

// Placeholder badge for as long as no real shop logos exist (shop.logoUrl).
// Uniform size, so that real logos slot in seamlessly later on.
function LogoBadge({ shop, size = 32 }: { shop: ShopAdapter; size?: number }) {
  if (shop.id === "anost") {
    return <AnostLogo size={size} />;
  }
  if (shop.logoUrl) {
    return (
      <img
        src={shop.logoUrl}
        alt={shop.name}
        style={{ width: size, height: size, objectFit: "contain", borderRadius: 2, background: "#fff" }}
      />
    );
  }
  const initials = shop.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 2,
        background: "#1e2128",
        border: "1px solid #2a2d35",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11,
        letterSpacing: 0.5,
        color: "#9099a8",
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}

// Result list of the "Small Label Suche" -- deliberately built differently
// from the normal hit list (visibleByGroup): no grouping by
// pickup-berlin/mail-order, no format column, no hiding of empty shops.
// Instead ALWAYS all shops in one flat, alphabetically sorted list -- each
// entry shows either a clickable number of hits (jumping off to the shop's
// own page) or "nicht unterstützt" (e.g. Bis Aufs Messer, which does not
// implement checkLabelAvailability at all).
function LabelResultsList({ results }: { results: LabelShopResult[] }) {
  if (results.length === 0) return null;

  const sorted = [...results].sort((a, b) => a.shop.name.localeCompare(b.shop.name, "de"));

  return (
    <div>
      <div style={{ fontSize: 11, letterSpacing: 3, color: "#6b6e78", textTransform: "uppercase", marginBottom: 14 }}>
        Label-Suche -- alle Shops
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {sorted.map(({ shop, status, result, error }) => (
          <div
            key={shop.id}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              alignItems: "center",
              gap: 12,
              padding: "14px 20px",
              background: "#0f1118",
              border: "1px solid #1e2128",
              borderRadius: 2,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <LogoBadge shop={shop} size={28} />
              <span style={{ fontSize: 16, color: "#f0ece0" }}>{shop.name}</span>
              <span style={{ fontSize: 11, color: "#6b6e78" }}>{shop.country}</span>
            </div>
            <div style={{ textAlign: "right" }}>
              {status === "loading" && <span style={{ fontSize: 13, color: "#6b6e78" }}>…</span>}
              {status === "error" && (
                <span style={{ fontSize: 12, color: "#c87070" }}>Fehler: {error}</span>
              )}
              {status === "done" && result && !result.supported && (
                <span style={{ fontSize: 13, color: "#6b6e78", letterSpacing: 0.5 }}>nicht unterstützt</span>
              )}
              {status === "done" && result && result.supported && (
                <a
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: 15,
                    color: "#c8a96e",
                    textDecoration: "none",
                    borderBottom: "1px dotted #c8a96e",
                  }}
                >
                  {result.count} Treffer
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Decorative logo preview -- "Pickup in Berlin" and "Mail Order" now side
// by side (two columns), each column split internally again into "Schnell"
// (ordinary HTTP search) and "Nicht ganz so Schnell" (full Camoufox browser
// navigation), matching the two search rows above.
function ShopShowcase() {
  const groups: ShopGroup[] = ["pickup-berlin", "mail-order"];
  const speeds: ShopSpeed[] = ["fast", "slow"];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40 }}>
      {groups.map((group) => (
        <div key={group}>
          <div style={{ fontSize: 11, letterSpacing: 3, color: "#6b6e78", textTransform: "uppercase", marginBottom: 18, textAlign: "center" }}>
            {/* group is a ShopGroup union type, GROUP_LABELS covers it completely via Record -- guaranteed at compile time. */}
            {/* eslint-disable-next-line security/detect-object-injection */}
            {GROUP_LABELS[group]}
          </div>
          {speeds.map((speed) => {
            const speedShops = shops.filter((s) => s.group === group && s.speed === speed);
            if (speedShops.length === 0) return null;
            return (
              <div key={speed} style={{ marginBottom: 22 }}>
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: 2,
                    color: "#6b6e78",
                    textTransform: "uppercase",
                    marginBottom: 10,
                    textAlign: "center",
                  }}
                >
                  {/* speed is a ShopSpeed union type, SHOWCASE_SPEED_LABELS covers it completely via Record. */}
                  {/* eslint-disable-next-line security/detect-object-injection */}
                  {SHOWCASE_SPEED_LABELS[speed]}
                </div>
                <div style={{ display: "flex", justifyContent: "center", gap: 22, flexWrap: "wrap" }}>
                  {speedShops.map((shop) => (
                    <a
                      key={shop.id}
                      href={shop.homeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textDecoration: "none" }}
                    >
                      <LogoBadge shop={shop} size={48} />
                      <span style={{ fontSize: 11, color: "#6b6e78" }}>{shop.name}</span>
                    </a>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: 3,
  color: "#6b6e78",
  textTransform: "uppercase",
  marginBottom: 8,
};

// Shared style for "Go to Bandcamp"/"Go to Discogs" -- both buttons behave
// identically (active/inactive depending on hasQueryFast), only the target
// differs.
function externalLinkButtonStyle(enabled: boolean): React.CSSProperties {
  return {
    background: enabled ? "#4a4d55" : "#1e2128",
    border: "none",
    color: enabled ? "#d8dae0" : "#6b6e78",
    padding: "9px 14px",
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    cursor: enabled ? "pointer" : "not-allowed",
    borderRadius: 1,
    fontFamily: "inherit",
  };
}

function goButtonStyle(state: GoState): React.CSSProperties {
  const byState: Record<GoState, { background: string; color: string; cursor: string }> = {
    disabled: { background: "#1e2128", color: "#6b6e78", cursor: "not-allowed" },
    ready: { background: "#c8a96e", color: "#0d0f14", cursor: "pointer" },
    // Grey surface with golden text: signals "this exact query is already
    // in the result list below", so that nobody has to puzzle over whether
    // a search has already run through (see the queryKey comparison
    // above).
    done: { background: "#3a3d45", color: "#c8a96e", cursor: "pointer" },
  };
  // state is a GoState union type, byState covers it completely via Record.
  // eslint-disable-next-line security/detect-object-injection
  const { background, color, cursor } = byState[state];
  return {
    background,
    border: "none",
    color,
    padding: "12px 20px",
    fontSize: 13,
    letterSpacing: 2,
    textTransform: "uppercase",
    cursor,
    borderRadius: 1,
    fontFamily: "inherit",
    minWidth: 72,
  };
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#0d0f14",
  border: "1px solid #2a2d35",
  color: "#f0ece0",
  padding: "10px 12px",
  fontSize: 14,
  borderRadius: 1,
  fontFamily: "inherit",
  boxSizing: "border-box",
};
