export type Format = "All" | "Vinyl" | "CD" | "Cassette" | "Download";
/** Format-Werte, die einzeln als Checkbox auswählbar sind (ohne "All"). */
export type SelectableFormat = Exclude<Format, "All">;

export type ShopGroup = "pickup-berlin" | "mail-order";

/**
 * fast – normale HTTP-Suche (nginx-Proxy mit Header-Spoofing), Ergebnis
 *        typischerweise in < 1s.
 * slow – jede Suche navigiert live durch einen Camoufox-Browser (siehe
 *        sidecar/), weil der Shop-Bot-Schutz sich nicht mit einfachen
 *        HTTP-Requests umgehen lässt (z.B. HHV: Cookie ist an den
 *        TLS-Fingerprint der Verbindung gebunden, die ihn geholt hat).
 *        Deutlich langsamer (Browser-Start + Challenge lösen).
 */
export type ShopSpeed = "fast" | "slow";

/**
 * Alle Status, die ein Treffer haben kann, WENN er überhaupt bestellbar ist.
 * Ausverkaufte/nicht verfügbare Formate werden von den Adaptern gar nicht
 * erst als Treffer zurückgegeben (siehe checkAvailability) — es gibt also
 * bewusst keinen "sold_out"-Status hier.
 *
 *   in_stock   – normal auf Lager / sofort lieferbar
 *   preorder   – Vorbestellung, Release/Versand liegt in der Zukunft
 *   processing – bestellbar, aber (noch) nicht auf Lager; Lieferzeit
 *                ungewiss (z.B. SoundOhms "in process of stocking")
 *   last_copy  – auf Lager, aber nur noch (ein) letztes Exemplar
 */
export type AvailabilityStatus = "in_stock" | "preorder" | "processing" | "last_copy";

export interface AvailabilityResult {
  /** ID des Shop-Adapters, z.B. "hard-wax" */
  shopId: string;
  /** Anzeigename des Titels, wie vom Shop geliefert */
  title: string;
  /** Künstler/Band, falls vom Shop getrennt geliefert */
  artist?: string;
  /** Format-Label wie vom Shop geliefert, z.B. "2LP", "CD", "Cassette" */
  format?: string;
  price?: string;
  currency?: string;
  /** Direktlink zum Produkt/Suchergebnis im Shop */
  url?: string;
  status: AvailabilityStatus;
}

export interface ShopAdapter {
  /** z.B. "hard-wax" */
  id: string;
  /** z.B. "Hard Wax" */
  name: string;
  /** Land des Shops, z.B. "DE", "FR", "GB", "IT" */
  country: string;
  /** "pickup-berlin" für die 4 Berliner Läden, "mail-order" für den Rest */
  group: ShopGroup;
  /** "fast" (normale HTTP-Suche) oder "slow" (volle Camoufox-Browser-Navigation pro Suche) */
  speed: ShopSpeed;
  /** Homepage-URL, u.a. Fallback-Link falls ein Treffer keine eigene URL hat */
  homeUrl: string;
  /** Pfad zu einem Logo unter /public/logos/ (optional, solange keins vorliegt) */
  logoUrl?: string;
  /**
   * official-api    – öffentlich dokumentierte API
   * unofficial-api   – öffentlich erreichbare, aber nicht offiziell für
   *                    Drittnutzung dokumentierte JSON-Endpoints
   * scraping         – HTML-Ergebnisseiten werden geparst
   */
  type: "official-api" | "unofficial-api" | "scraping";
  /**
   * Sucht nach einem Titel im Shop und gibt alle gefundenen Treffer mit
   * Verfügbarkeitsstatus zurück. `format` ist ein Hinweis-Filter, nicht
   * jeder Adapter kann ihn serverseitig anwenden — im Zweifel clientseitig
   * nachfiltern.
   */
  checkAvailability: (
    artist: string,
    title: string,
    format?: Format
  ) => Promise<AvailabilityResult[]>;
}
