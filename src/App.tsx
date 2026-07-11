import { useEffect, useState } from "react";
import { shops } from "./shops";
import type { AvailabilityResult, SelectableFormat, ShopAdapter, ShopGroup } from "./types/shop";
import { matchesFormatFilter, SELECTABLE_FORMATS } from "./lib/classifyFormat";
import { fetchTitleSuggestions, type TitleSuggestion } from "./lib/titleSuggestions";
import { STATUS_COLORS, STATUS_LABELS } from "./lib/availabilityStatus";

const GROUP_LABELS: Record<ShopGroup, string> = {
  "pickup-berlin": "Pickup in Berlin",
  "mail-order": "Mail Order",
};

interface ShopResult {
  shop: ShopAdapter;
  status: "loading" | "done" | "error";
  results: AvailabilityResult[];
  error?: string;
}

export default function App() {
  const [artist, setArtist] = useState("");
  const [title, setTitle] = useState("");
  // Standardmäßig sind alle 4 Formate angehakt (= "zeig alles"). Der User
  // kann gezielt einschränken; wenn er alle abwählt, gibt's unten eine
  // Warnung statt stillschweigend wieder "alles zeigen".
  const [selectedFormats, setSelectedFormats] = useState<SelectableFormat[]>([...SELECTABLE_FORMATS]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [shopResults, setShopResults] = useState<ShopResult[]>([]);

  const [suggestions, setSuggestions] = useState<TitleSuggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  const hasQuery = !!(artist.trim() || title.trim());
  const canSearch = hasQuery && !searching && selectedFormats.length > 0;

  // Beim Wechsel zur Ergebnisansicht legen wir einen eigenen History-Eintrag
  // an. So führt der Browser-"Zurück"-Button zur Startseite der App zurück,
  // statt die Seite komplett zu verlassen (was ohne eigenen History-Eintrag
  // sonst passiert, da die App selbst keine URL-Änderungen vornimmt).
  useEffect(() => {
    const onPopState = () => setSearched(false);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Vorschläge für den vollständigen Titel, debounced während der Eingabe.
  useEffect(() => {
    const query = [artist, title].filter(Boolean).join(" ").trim();
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
  }, [artist, title]);

  const toggleFormat = (f: SelectableFormat) => {
    setSelectedFormats((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  };

  const applySuggestion = (s: TitleSuggestion) => {
    if (s.artist) setArtist(s.artist);
    setTitle(s.title);
    setSuggestionsOpen(false);
  };

  // Beide Felder sind eine kombinierte UND-Suche — wer nur eins ändert und
  // vergisst, dass im anderen noch der alte Wert steht, bekommt scheinbar
  // "keine Treffer" (z.B. altes "Dustlick" im Titel + neuer Artist "Lovegod"
  // -> niemand hat beides). Automatisches Erkennen einer "neuen" Suche ist
  // zu unzuverlässig (jede Eingabe könnte auch eine Verfeinerung sein) —
  // stattdessen ein expliziter Reset-Button, der beide Felder + Ergebnis
  // sauber leert.
  const resetSearch = () => {
    setArtist("");
    setTitle("");
    setSuggestions([]);
    setSuggestionsOpen(false);
    setShopResults([]);
    setSearched(false);
  };

  // Eigener, bewusst separater Button statt automatisch bei der Suche
  // mitzuöffnen: das Verlassen unserer Seite soll eine explizite Aktion
  // sein, kein Nebeneffekt von "Go" (siehe Fokus-Problem, das dadurch
  // entstand). Kein Trick nötig, um den Fokus zu behalten — hier IST das
  // Ziel, in den neuen Tab zu wechseln.
  const openDiscogs = () => {
    if (!hasQuery) return;
    const query = [artist, title].map((v) => v.trim()).filter(Boolean).join(" ");
    window.open(
      `https://www.discogs.com/search/?q=${encodeURIComponent(query)}&type=release`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  const handleSearch = async () => {
    if (!canSearch) return;
    setSuggestionsOpen(false);

    if (!searched) {
      window.history.pushState({ view: "results" }, "");
    }
    setSearching(true);
    setSearched(true);
    setShopResults(shops.map((shop) => ({ shop, status: "loading", results: [] })));

    await Promise.all(
      shops.map(async (shop) => {
        try {
          const results = await shop.checkAvailability(artist.trim(), title.trim());
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

    setSearching(false);
  };

  // Nur Shops mit tatsächlichen Treffern (nach Format-Filter) oder einem
  // Fehler werden angezeigt — leere/lädt-noch Shops bleiben unsichtbar.
  const visibleByGroup = (group: ShopGroup) =>
    shopResults
      .filter((r) => r.shop.group === group)
      .map((r) => ({ ...r, filtered: r.results.filter((res) => matchesFormatFilter(res.format, selectedFormats)) }))
      .filter((r) => r.status === "error" || r.filtered.length > 0);

  return (
    <div style={{ minHeight: "100vh", background: "#0d0f14", color: "#e8e4d9", fontFamily: "'Georgia', 'Times New Roman', serif" }}>
      <div style={{ borderBottom: "1px solid #2a2d35", padding: "40px 40px 28px", background: "linear-gradient(180deg, #111318 0%, #0d0f14 100%)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <h1
            style={{
              fontSize: 42,
              fontWeight: 600,
              margin: 0,
              letterSpacing: 6,
              textTransform: "uppercase",
              color: "#c8a96e",
            }}
          >
            Ich muss diese Platte haben!
          </h1>
          <p style={{ margin: "10px 0 0", color: "#6b6e78", fontSize: 14 }}>
            Prüft Verfügbarkeit in Plattenläden
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 40px" }}>
        {/* Suchformular */}
        <div style={{ background: "#13151c", border: "1px solid #1e2128", borderRadius: 2, padding: "24px 28px", marginBottom: 32 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                <div style={{ fontSize: 10, letterSpacing: 3, color: "#6b6e78", textTransform: "uppercase" }}>
                  Artist / Band
                </div>
                {(hasQuery || searched) && (
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
                )}
              </div>
              <input
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="z.B. Aphex Twin"
                style={inputStyle}
              />
            </div>
            <div style={{ position: "relative" }}>
              <div style={{ fontSize: 10, letterSpacing: 3, color: "#6b6e78", textTransform: "uppercase", marginBottom: 8 }}>
                Album-Titel
              </div>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onFocus={() => setSuggestionsOpen(true)}
                onBlur={() => setTimeout(() => setSuggestionsOpen(false), 150)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
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
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
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

            {/* Go-Button links bündig zum Album-Titel-Feld darüber (gleiche
                Grid-Spalte). Discogs-Button rechts, rechtsbündig zum
                Album-Titel-Feld (space-between statt festem Gap), bewusst
                kleiner/grau, damit klar ist: das ist ein Absprung aus der
                App raus. */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <button
                onClick={handleSearch}
                disabled={!canSearch}
                style={{
                  background: canSearch ? "#c8a96e" : "#1e2128",
                  border: "none",
                  color: canSearch ? "#0d0f14" : "#6b6e78",
                  padding: "12px 20px",
                  fontSize: 13,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  cursor: canSearch ? "pointer" : "not-allowed",
                  borderRadius: 1,
                  fontFamily: "inherit",
                  minWidth: 72,
                }}
              >
                {searching ? "…" : "Go"}
              </button>

              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                <button
                  onClick={openDiscogs}
                  disabled={!hasQuery}
                  title="Album-Titel sollte vollständig sein"
                  style={{
                    background: hasQuery ? "#4a4d55" : "#1e2128",
                    border: "none",
                    color: hasQuery ? "#d8dae0" : "#6b6e78",
                    padding: "9px 14px",
                    fontSize: 10,
                    letterSpacing: 1.5,
                    textTransform: "uppercase",
                    cursor: hasQuery ? "pointer" : "not-allowed",
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
        </div>

        {/* Ergebnisse */}
        {searched && (
          <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
            {(["pickup-berlin", "mail-order"] as ShopGroup[]).map((group) => {
              const visible = visibleByGroup(group);
              if (searching && visible.length === 0) return null;
              if (!searching && visible.length === 0) return null;
              return (
                <div key={group}>
                  <div style={{ fontSize: 11, letterSpacing: 3, color: "#6b6e78", textTransform: "uppercase", marginBottom: 14 }}>
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

            {!searching &&
              (["pickup-berlin", "mail-order"] as ShopGroup[]).every((g) => visibleByGroup(g).length === 0) && (
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
          Created with ❤️ by Rogzilla, coding by Claude
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

// Dekorative Logo-Vorschau auf der Einstiegsseite (vor der ersten Suche) —
// zeigt alle Shops gruppiert, damit auf einen Blick klar ist, wer geprüft wird.
function ShopShowcase() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {(["pickup-berlin", "mail-order"] as ShopGroup[]).map((group) => (
        <div key={group}>
          <div style={{ fontSize: 11, letterSpacing: 3, color: "#6b6e78", textTransform: "uppercase", marginBottom: 14, textAlign: "center" }}>
            {GROUP_LABELS[group]}
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 28, flexWrap: "wrap" }}>
            {shops
              .filter((shop) => shop.group === group)
              .map((shop) => (
                <a
                  key={shop.id}
                  href={shop.homeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textDecoration: "none" }}
                >
                  <LogoBadge shop={shop} size={56} />
                  <span style={{ fontSize: 11, color: "#6b6e78" }}>{shop.name}</span>
                </a>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
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
