import { defineConfig, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";

// None of the target shops send CORS headers for browser fetches. In the dev
// server the adapters therefore run through a local proxy path (/proxy/<shop>)
// which forwards the request server-side to the real shop.
//
// IMPORTANT for production (e.g. deploying on the QNAP NAS): this proxy only
// exists in the Vite dev server. In production an equivalent is needed, e.g.
// an nginx reverse proxy with the same paths (see the konzert-guide approach
// for hr2: PROXY_BASE + nginx sets Host/UA/proxy_ssl_server_name).
const shopTargets: Record<string, string> = {
  "/proxy/hardwax": "https://hardwax.com",
  "/proxy/hhv": "http://localhost:3001",
  "/proxy/boomkat": "http://localhost:3001",
  "/proxy/anost": "https://www.anost.net",
  "/proxy/bisaufsmesser": "https://bisaufsmesser.com",
  "/proxy/soundohm": "https://www.soundohm.com",
  "/proxy/soufflecontinu": "https://www.soufflecontinu.com",
  "/proxy/jpc": "https://www.jpc.de",
};

// HHV and Boomkat go through the browser sidecar (see RECON.md, "Playwright
// Session-Relay für HHV") instead of straight to the real shop. The sidecar
// expects the full path INCLUDING the /proxy/<shop> prefix (exactly as
// nginx.conf forwards it in the Docker setup) and builds its own browser
// headers itself -- hence deliberately no rewrite/header spoofing for these.
const SIDECAR_PATHS = ["/proxy/hhv", "/proxy/boomkat"];

// Some shops block requests whose Referer/User-Agent does not look like a
// normal browser call coming directly from their own domain. By default the
// Vite proxy passes through the dev server's Referer (e.g.
// http://localhost:5173/...), which looks like a cross-site request —
// therefore override it here per target.
//
// (Boomkat used to run exactly through this and was removed completely
// because of it: even with the full header set an HTTP 403 persisted there —
// presumably TLS/bot fingerprinting that a plain Node reverse proxy cannot
// imitate. Boomkat now goes through the browser sidecar (SIDECAR_PATHS
// above); the proxy header fix here still makes sense for the other shops,
// which are reachable directly.)
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent": BROWSER_UA,
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
  "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
};

const proxy: Record<string, ProxyOptions> = Object.fromEntries(
  Object.entries(shopTargets).map(([path, target]) => {
    if (SIDECAR_PATHS.includes(path)) {
      return [path, { target, changeOrigin: true } satisfies ProxyOptions];
    }
    return [
      path,
      {
        target,
        changeOrigin: true,
        secure: true,
        // Plain string prefix stripping instead of new RegExp(`^${path}`) --
        // no injection risk here (path comes from locally hardcoded keys),
        // but this keeps the pattern the same as in sidecar/src/server.js for
        // the real, attacker-controlled case.
        rewrite: (p: string) => (p.startsWith(path) ? p.slice(path.length) : p),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        configure: (proxyServer: any) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          proxyServer.on("proxyReq", (proxyReq: any) => {
            for (const [key, value] of Object.entries(BROWSER_HEADERS)) {
              proxyReq.setHeader(key, value);
            }
            proxyReq.setHeader("Referer", `${target}/`);
            proxyReq.removeHeader("origin");
            proxyReq.removeHeader("x-forwarded-for");
            proxyReq.removeHeader("x-forwarded-host");
            proxyReq.removeHeader("x-forwarded-port");
            proxyReq.removeHeader("x-forwarded-proto");
          });
        },
      } satisfies ProxyOptions,
    ];
  })
);

export default defineConfig({
  plugins: [react()],
  server: {
    proxy,
  },
});
