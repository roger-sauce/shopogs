import { defineConfig, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";

// Alle Ziel-Shops senden keine CORS-Header für Browser-Fetches. Im Dev-Server
// laufen die Adapter deshalb über einen lokalen Proxy-Pfad (/proxy/<shop>),
// der die Anfrage serverseitig an den echten Shop weiterreicht.
//
// WICHTIG für Produktion (z.B. Deploy auf der QNAP-NAS): dieser Proxy existiert
// nur im Vite-Dev-Server. Im Produktivbetrieb braucht es ein Äquivalent, z.B.
// einen nginx-Reverse-Proxy mit denselben Pfaden (siehe Konzert-Guide-Ansatz
// für hr2: PROXY_BASE + nginx setzt Host/UA/proxy_ssl_server_name).
const shopTargets: Record<string, string> = {
  "/proxy/hardwax": "https://hardwax.com",
  "/proxy/hhv": "https://www.hhv.de",
  "/proxy/anost": "https://www.anost.net",
  "/proxy/bisaufsmesser": "https://bisaufsmesser.com",
  "/proxy/soundohm": "https://www.soundohm.com",
  "/proxy/soufflecontinu": "https://www.soufflecontinu.com",
  "/proxy/jpc": "https://www.jpc.de",
};

// Manche Shops blocken Requests, deren Referer/User-Agent nicht wie ein
// normaler Browser-Aufruf direkt von der eigenen Domain aussieht. Der
// Vite-Proxy reicht standardmäßig den Referer des Dev-Servers (z.B.
// http://localhost:5173/...) durch, was wie ein Fremd-Request wirkt —
// deshalb hier pro Ziel überschreiben.
//
// (Boomkat wurde deshalb aus der Shop-Liste entfernt: selbst mit
// vollständigem Header-Set blieb dort ein HTTP 403 bestehen — vermutlich
// TLS-/Bot-Fingerprinting, das ein simpler Node-Reverse-Proxy nicht
// imitieren kann. Der Proxy-Header-Fix bleibt trotzdem für die anderen
// Shops sinnvoll.)
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
  Object.entries(shopTargets).map(([path, target]) => [
    path,
    {
      target,
      changeOrigin: true,
      secure: true,
      rewrite: (p: string) => p.replace(new RegExp(`^${path}`), ""),
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
  ])
);

export default defineConfig({
  plugins: [react()],
  server: {
    proxy,
  },
});
