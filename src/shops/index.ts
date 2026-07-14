import type { ShopAdapter } from "../types/shop";

import anost from "./unofficial-api/anost";
import soundohm from "./unofficial-api/soundohm";
import bisAufsMesser from "./unofficial-api/bisaufsmesser";
import hardWax from "./scraping/hardwax";
import hhv from "./scraping/hhv";
import souffleContinu from "./unofficial-api/soufflecontinu";
import jpc from "./scraping/jpc";
import boomkat from "./scraping/boomkat";

// Boomkat war länger entfernt (direkter Reverse-Proxy wurde zuverlässig mit
// HTTP 403 geblockt, vermutlich TLS-/Bot-Fingerprinting) -- läuft jetzt wie
// HHV über den Browser-Sidecar (volle Camoufox-Navigation), siehe
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
