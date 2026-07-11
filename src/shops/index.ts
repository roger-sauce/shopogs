import type { ShopAdapter } from "../types/shop";

import anost from "./unofficial-api/anost";
import soundohm from "./unofficial-api/soundohm";
import bisAufsMesser from "./unofficial-api/bisaufsmesser";
import hardWax from "./scraping/hardwax";
import hhv from "./scraping/hhv";
import souffleContinu from "./unofficial-api/soufflecontinu";
import jpc from "./scraping/jpc";

// Boomkat wurde bewusst entfernt: die Suche wird zuverlässig mit HTTP 403
// geblockt (vermutlich TLS-/Bot-Fingerprinting), siehe vite.config.ts.
export const shops: ShopAdapter[] = [
  hardWax,
  hhv,
  anost,
  bisAufsMesser,
  soundohm,
  souffleContinu,
  jpc,
];
