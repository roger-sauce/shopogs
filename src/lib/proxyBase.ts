// Base for the /proxy/<shop> paths that every shop adapter calls.
//
// In the browser it stays empty, and with that everything stays as it was:
// the paths are same-origin, nginx (or Vite's dev proxy) intercepts them,
// the adapters notice nothing of this file.
//
// In the server process (see server/) there is no origin against which a
// relative path could be resolved -- `fetch("/proxy/hardwax/...")` there
// simply throws "Failed to parse URL". SHOPOGS_PROXY_BASE therefore
// supplies an absolute prefix.
//
// It deliberately points at the nginx container (http://shopogs) and NOT
// directly at the respective shop: header spoofing, TLS server name and the
// forwarding of HHV/Boomkat to the browser sidecar all live in nginx.conf.
// Rebuilding those rules a second time in Node would mean having to keep
// them correct in two places at once from then on.
//
// Access via globalThis instead of directly via `process`: the web build has
// no @types/node, a bare `process.env` would be a type error there.
const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;

const BASE = env?.SHOPOGS_PROXY_BASE ?? "";

export function proxyBase(shop: string): string {
  return `${BASE}/proxy/${shop}`;
}
