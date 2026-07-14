import { useEffect, useState } from "react";
import { shops } from "./shops";
import type {
  AvailabilityResult,
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

// "fast" = normale HTTP-Suche (Ergebnis meist < 1s), "slow" = jede Suche
// navigiert live durch einen Camoufox-Browser (siehe sidecar/) — deutlich
// langsamer, aber der einzige Weg an manchen Shops (z.B. HHV) vorbei am
// Bot-Schutz. Zwei separate Such-Zeilen im Formular machen den
// Geschwindigkeitsunterschied für den User sichtbar, statt eine einzelne
// Suche unvorhersehbar lange warten zu lassen.
const SPEED_LABELS: Record<ShopSpeed, string> = {
  fast: "Schnell",
  slow: "Nicht ganz so Schnell",
};

// Eigener Wortlaut für die Shop-Icon-Übersicht (ShopShowcase) -- dort steht
// kein Eingabefeld direkt daneben wie im Suchformular, deshalb "Suche ..."
// statt nur des Tempo-Worts, um den Bezug klarer zu machen.
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

// Identifiziert eine Artist/Titel-Kombination für den "schon gesucht?"-
// Vergleich der Go-Buttons (siehe GoState unten).
function queryKey(artist: string, title: string): string {
  return `${artist.trim()}::${title.trim()}`;
}

// disabled -> keine Eingabe / kein Format ausgewählt, nicht klickbar.
// ready    -> klickbar, Eingabe unterscheidet sich von der zuletzt
//             gesuchten Anfrage dieser Zeile (oder es wurde noch nie
//             gesucht) -- goldener Hintergrund, wie bisher der einzige
//             "aktiv"-Zustand.
// done     -> klickbar, aber die aktuelle Eingabe entspricht exakt der
//             zuletzt erfolgreich gesuchten Anfrage -- graue Fläche mit
//             goldener Schrift, damit auf einen Blick klar ist "das steht
//             schon unten in der Ergebnisliste", statt wie vorher ununter-
//             scheidbar vom "bereit"-Zustand zu wirken.
type GoState = "disabled" | "ready" | "done";

export default function App() {
  // Zwei getrennte Feldpaare für die "Schnell"- und "Nicht ganz so
  // Schnell"-Suchzeile. Eingaben in der schnellen Zeile werden automatisch
  // in die langsame übernommen (einseitige Synchronisation, siehe
  // useEffect unten) — wer zuerst oben tippt, muss unten nicht nochmal
  // tippen. Umgekehrt (unten -> oben) wird bewusst NICHT synchronisiert.
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

  // Standardmäßig nur Vinyl angehakt — CD/Cassette/Download muss der User
  // gezielt dazuwählen. Wenn er alle abwählt, gibt's unten eine Warnung
  // statt stillschweigend wieder "alles zeigen".
  const [selectedFormats, setSelectedFormats] = useState<SelectableFormat[]>(["Vinyl"]);

  const [searchingFast, setSearchingFast] = useState(false);
  const [searchingSlow, setSearchingSlow] = useState(false);
  const searching = searchingFast || searchingSlow;
  const [searched, setSearched] = useState(false);
  const [shopResults, setShopResults] = useState<ShopResult[]>([]);

  // Merkt sich pro Zeile, für welche Anfrage die aktuell angezeigten
  // Ergebnisse zuletzt geholt wurden -- Grundlage für den "done"-Zustand
  // der Go-Buttons (siehe GoState).
  const [lastSearchedFastQuery, setLastSearchedFastQuery] = useState<string | null>(null);
  const [lastSearchedSlowQuery, setLastSearchedSlowQuery] = useState<string | null>(null);

  const [suggestions, setSuggestions] = useState<TitleSuggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  const hasQueryFast = !!(artistFast.trim() || titleFast.trim());
  const hasQuerySlow = !!(artistSlow.trim() || titleSlow.trim());
  const fastReady = hasQueryFast && selectedFormats.length > 0;
  const slowReady = hasQuerySlow && selectedFormats.length > 0;
  const canSearchFast = fastReady && !searchingFast;
  const canSearchSlow = slowReady && !searchingSlow;

  const fastGoState: GoState = !fastReady
    ? "disabled"
    : lastSearchedFastQuery === queryKey(artistFast, titleFast)
    ? "done"
    : "ready";
  const slowGoState: GoState = !slowReady
    ? "disabled"
    : lastSearchedSlowQuery === queryKey(artistSlow, titleSlow)
    ? "done"
    : "ready";

  // Beim Wechsel zur Ergebnisansicht legen wir einen eigenen History-Eintrag
  // an. So führt der Browser-"Zurück"-Button zur Startseite der App zurück,
  // statt die Seite komplett zu verlassen (was ohne eigenen History-Eintrag
  // sonst passiert, da die App selbst keine URL-Änderungen vornimmt).
  useEffect(() => {
    const onPopState = () => setSearched(false);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Vorschläge für den vollständigen Titel, debounced während der Eingabe in
  // der schnellen Zeile (die langsame folgt automatisch, siehe oben).
  // Bewusst NUR der Titel, nicht Artist+Titel kombiniert: eine kombinierte
  // Anfrage killt die Trefferquote bei mehreren Quellen fast komplett (ANOST
  // fällt bei "Aphex Twin Ambient" von 15 auf 2 Treffer gegenüber "Ambient"
  // allein; SoundOhm/Souffle Continu erfassen den Artist-Namen in der Suche
  // laut RECON.md gar nicht) — exakt das gleiche Muster, das die echten
  // Shop-Adapter dafür schon berücksichtigen.
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

  const applySuggestion = (s: TitleSuggestion) => {
    // Immer setzen, auch wenn der Vorschlag keinen Artist mitbringt (z.B.
    // liefert ANOST nie einen) -- sonst bleibt beim Klick ein alter,
    // unpassender Artist im Feld stehen und die Suche kombiniert zwei
    // Felder, die gar nicht zusammengehören (live beobachtet: "Aphex Twin"
    // + ANOST-Vorschlag "Selected Ambient & ASMR Works 2001-2003", einer
    // Ergo-Phizmiz-Hommage-Compilation -- 0 Treffer überall).
    setArtistFast(s.artist ?? "");
    setTitleFast(s.title);
    setSuggestionsOpen(false);
  };

  // Beide Felder sind eine kombinierte UND-Suche — wer nur eins ändert und
  // vergisst, dass im anderen noch der alte Wert steht, bekommt scheinbar
  // "keine Treffer" (z.B. altes "Dustlick" im Titel + neuer Artist "Lovegod"
  // -> niemand hat beides). Automatisches Erkennen einer "neuen" Suche ist
  // zu unzuverlässig (jede Eingabe könnte auch eine Verfeinerung sein) —
  // stattdessen ein expliziter Reset-Button, der alle Felder, Ergebnisse und
  // Button-Zustände sauber auf Default zurücksetzt.
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
  };

  // Eigener, bewusst separater Button statt automatisch bei der Suche
  // mitzuöffnen: das Verlassen unserer Seite soll eine explizite Aktion
  // sein, kein Nebeneffekt von "Go" (siehe Fokus-Problem, das dadurch
  // entstand). Kein Trick nötig, um den Fokus zu behalten — hier IST das
  // Ziel, in den neuen Tab zu wechseln. Nutzt die schnelle Zeile, da die
  // meist zuerst ausgefüllt wird.
  const openDiscogs = () => {
    if (!hasQueryFast) return;
    const query = [artistFast, titleFast].map((v) => v.trim()).filter(Boolean).join(" ");
    window.open(
      `https://www.discogs.com/search/?q=${encodeURIComponent(query)}&type=release`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  // Gemeinsame Suchlogik für beide Zeilen: durchsucht nur die Shops der
  // jeweiligen Geschwindigkeitsklasse.
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
      // Eine neue "Schnell"-Suche macht die zuletzt gezeigten "Nicht ganz so
      // Schnell"-Ergebnisse potenziell ungültig: die Eingabe wurde ja per
      // Sync auch in die untere Zeile übernommen, ohne dass diese schon neu
      // gesucht hätte -- die alten Treffer dort gehören dann zu einer
      // überholten Anfrage und werden deshalb mit entfernt. Umgekehrt (eine
      // langsame Suche räumt die schnellen Ergebnisse auf) gibt es bewusst
      // nicht, weil die schnelle Zeile nie durch die langsame überschrieben
      // wird.
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

  const handleSearchFast = () => {
    if (!canSearchFast) return;
    setSuggestionsOpen(false);
    runSearch("fast", artistFast, titleFast);
  };

  const handleSearchSlow = () => {
    if (!canSearchSlow) return;
    runSearch("slow", artistSlow, titleSlow);
  };

  // Nur Shops mit tatsächlichen Treffern (nach Format-Filter) oder einem
  // Fehler werden angezeigt — leere/lädt-noch Shops bleiben unsichtbar.
  const withFiltered = shopResults.map((r) => ({
    ...r,
    filtered: r.results.filter((res) => matchesFormatFilter(res.format, selectedFormats)),
  }));
  // Reihenfolge innerhalb einer Gruppe war bisher einfach die
  // Einfüge-Reihenfolge in shopResults (= Deklarationsreihenfolge in
  // shops/index.ts) -- wirkte dadurch beliebig/unvorhersehbar. Jetzt fest:
  // erst alle "schnellen" Shops alphabetisch, danach alle "langsamen"
  // Shops alphabetisch angehängt -- ergibt sich dynamisch aus shop.speed
  // und shop.name, kein hartkodierter Shop-Name nötig.
  const visibleByGroup = (group: ShopGroup) =>
    withFiltered
      .filter((r) => r.shop.group === group && (r.status === "error" || r.filtered.length > 0))
      .sort((a, b) => {
        if (a.shop.speed !== b.shop.speed) return a.shop.speed === "fast" ? -1 : 1;
        return a.shop.name.localeCompare(b.shop.name, "de");
      });

  // Fertig durchsucht, aber 0 Treffer (nach Format-Filter) -- Shops mit
  // Fehler tauchen schon in ihrer eigenen Karte auf, hier bewusst nicht
  // nochmal gelistet, um nicht doppelt zu wirken.
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
        {/* Suchformular */}
        <div style={{ background: "#13151c", border: "1px solid #1e2128", borderRadius: 2, padding: "24px 28px" }}>
          {/* Schnelle Zeile -- normale HTTP-Suche */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 10, letterSpacing: 3, color: "#c8a96e", textTransform: "uppercase", marginBottom: 10 }}>
              {SPEED_LABELS.fast}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 16, alignItems: "end" }}>
              <div>
                <div style={fieldLabelStyle}>Artist / Band</div>
                <input
                  value={artistFast}
                  onChange={(e) => setArtistFast(sanitizeSearchTerm(e.target.value))}
                  onKeyDown={(e) => e.key === "Enter" && handleSearchFast()}
                  placeholder="z.B. Aphex Twin"
                  style={inputStyle}
                />
              </div>
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
              <button onClick={handleSearchFast} disabled={!canSearchFast} style={goButtonStyle(fastGoState)}>
                {searchingFast ? "…" : "Go"}
              </button>
            </div>
          </div>

          {/* Langsame Zeile -- volle Camoufox-Browser-Navigation pro Suche */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 10, letterSpacing: 3, color: "#c8a96e", textTransform: "uppercase", marginBottom: 10 }}>
              {SPEED_LABELS.slow}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 16, alignItems: "end" }}>
              <div>
                <div style={fieldLabelStyle}>Artist / Band</div>
                <input
                  value={artistSlow}
                  onChange={(e) => setArtistSlow(sanitizeSearchTerm(e.target.value))}
                  onKeyDown={(e) => e.key === "Enter" && handleSearchSlow()}
                  placeholder="z.B. Aphex Twin"
                  style={inputStyle}
                />
              </div>
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
              <button onClick={handleSearchSlow} disabled={!canSearchSlow} style={goButtonStyle(slowGoState)}>
                {searchingSlow ? "…" : "Go"}
              </button>
            </div>
          </div>

          {/* Format-Filter + Discogs-Sprungmarke -- gemeinsam für beide
              Zeilen, da rein clientseitige Nachfilterung bzw. externer Link. */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "start" }}>
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

            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <button
                onClick={openDiscogs}
                disabled={!hasQueryFast}
                title="Album-Titel sollte vollständig sein"
                style={{
                  background: hasQueryFast ? "#4a4d55" : "#1e2128",
                  border: "none",
                  color: hasQueryFast ? "#d8dae0" : "#6b6e78",
                  padding: "9px 14px",
                  fontSize: 10,
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                  cursor: hasQueryFast ? "pointer" : "not-allowed",
                  borderRadius: 1,
                  fontFamily: "inherit",
                }}
              >
                go to discogs
              </button>
              <div style={{ fontSize: 11, color: "#6b6e78", marginTop: 8, textAlign: "right" }}>
                Discogs: Album-Titel sollte vollständig sein
              </div>
            </div>
          </div>
        </div>

        {/* "Neue Suche" bewusst UNTER dem Formular statt oben im Header --
            oben verschwand der Link beim Scrollen durch eine lange
            Ergebnisliste aus dem sichtbaren Bereich. */}
        {(hasQueryFast || hasQuerySlow || searched) && (
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

        {/* Ergebnisse */}
        {searched && (
          <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
            {(["pickup-berlin", "mail-order"] as ShopGroup[]).map((group) => {
              const visible = visibleByGroup(group);
              if (visible.length === 0) return null;
              return (
                <div key={group}>
                  <div style={{ fontSize: 11, letterSpacing: 3, color: "#6b6e78", textTransform: "uppercase", marginBottom: 14 }}>
                    {/* group ist ein ShopGroup-Union-Type, GROUP_LABELS deckt ihn per Record vollständig ab -- zur Compile-Zeit abgesichert. */}
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
        )}

        {!searched && (
          <div style={{ padding: "24px 0 60px" }}>
            <ShopShowcase />
            <div style={{ textAlign: "center", padding: "48px 0 0", color: "#3a3d45" }}>
              <div style={{ fontSize: 14, letterSpacing: 1 }}>Artist/Band und Album-Titel eingeben und Verfügbarkeit prüfen</div>
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

// ANOST liefert kein einfach hotlinkbares Logo-Bild - dafür aber die exakten
// SVG-Pfade aus dem eigenen Seiten-Header, die wir 1:1 als Vektor einbetten.
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

// Platzhalter-Badge, solange keine echten Shop-Logos vorliegen (shop.logoUrl).
// Einheitliche Größe, damit sich später echte Logos nahtlos einfügen.
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

// Dekorative Logo-Vorschau -- "Pickup in Berlin" und "Mail Order" jetzt
// nebeneinander (zwei Spalten), jede Spalte intern nochmal aufgeteilt in
// "Schnell" (normale HTTP-Suche) und "Nicht ganz so Schnell" (volle
// Camoufox-Browser-Navigation), passend zu den zwei Suchzeilen oben.
function ShopShowcase() {
  const groups: ShopGroup[] = ["pickup-berlin", "mail-order"];
  const speeds: ShopSpeed[] = ["fast", "slow"];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40 }}>
      {groups.map((group) => (
        <div key={group}>
          <div style={{ fontSize: 11, letterSpacing: 3, color: "#6b6e78", textTransform: "uppercase", marginBottom: 18, textAlign: "center" }}>
            {/* group ist ein ShopGroup-Union-Type, GROUP_LABELS deckt ihn per Record vollständig ab -- zur Compile-Zeit abgesichert. */}
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
                  {/* speed ist ein ShopSpeed-Union-Type, SHOWCASE_SPEED_LABELS deckt ihn per Record vollständig ab. */}
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

function goButtonStyle(state: GoState): React.CSSProperties {
  const byState: Record<GoState, { background: string; color: string; cursor: string }> = {
    disabled: { background: "#1e2128", color: "#6b6e78", cursor: "not-allowed" },
    ready: { background: "#c8a96e", color: "#0d0f14", cursor: "pointer" },
    // Graue Fläche mit goldener Schrift: signalisiert "diese exakte Anfrage
    // steckt schon in der Ergebnisliste unten", damit man nicht rätseln
    // muss, ob eine Suche schon durchgelaufen ist (siehe queryKey-Vergleich
    // oben).
    done: { background: "#3a3d45", color: "#c8a96e", cursor: "pointer" },
  };
  // state ist ein GoState-Union-Type, byState deckt ihn per Record vollständig ab.
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
