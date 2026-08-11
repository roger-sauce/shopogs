import type { ShopAdapter } from "../types/shop";

import anost from "./unofficial-api/anost";
import soundohm from "./unofficial-api/soundohm";
import bisAufsMesser from "./unofficial-api/bisaufsmesser";
import hardWax from "./scraping/hardwax";
import hhv from "./scraping/hhv";
import souffleContinu from "./unofficial-api/soufflecontinu";
import jpc from "./scraping/jpc";
import boomkat from "./scraping/boomkat";

// Boomkat was removed for a while (a direct reverse proxy was reliably
// blocked with HTTP 403, presumably TLS/bot fingerprinting) -- it now runs
// through the browser sidecar like HHV (full Camoufox navigation), see
// scraping/boomkat/api.ts.
export const shops: ShopAdapter[] = [
  hardWax,
  hhv,
  anost,
  bisAufsMesser,
  soundohm,
  souffleContinu,
  jpc,
  boomkat,
];
