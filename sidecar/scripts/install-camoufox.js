// For the currently "newest supported" version (152.0.4-alpha.25)
// camoufox-js@0.11.1 wrongly picks a ~557MB ZIP that demonstrably contains
// ONLY fonts/fontconfig, no browser executable (camoufox-bin) -- checked
// directly against the GitHub releases: v135.0.1-beta.24 has a complete
// 680MB Linux x64 ZIP with a real browser binary. This script installs that
// older, known-working version manually, before `npx camoufox-js fetch`
// (which downloads GeoIP/addons unconditionally and independently of this)
// runs -- its freshness check then finds a valid version.json and leaves
// our manual installation untouched.
const fs = require("fs");
const path = require("path");
const https = require("https");
const AdmZip = require("adm-zip");

// INSTALL_DIR/VERSION/RELEASE/ZIP_PATH all come from build-time constants
// or a Dockerfile ENV (not from user input) -- the
// security/detect-non-literal-fs-filename warnings below (createWriteStream/
// mkdirSync/writeFileSync) are therefore false alarms.
const INSTALL_DIR = process.env.CAMOUFOX_INSTALL_DIR || "/opt/camoufox";
const VERSION = "135.0.1";
const RELEASE = "beta.24";
// Derive the architecture from the build environment instead of hardcoding
// x86_64: the stack is moving from the amd64 QNAP to an arm64 Raspberry Pi,
// and Camoufox is a Firefox binary of its own (not a Playwright browser), so
// it has to match the host architecture. v135.0.1-beta.24 has both builds as
// full ZIPs (lin.arm64 674MB, lin.x86_64 680MB) -- the pinned, known-working
// version therefore stays untouched. process.arch instead of a fixed
// "arm64", so that a build on amd64 keeps working.
const ARCH = process.arch === "arm64" ? "arm64" : "x86_64";
const ZIP_URL = `https://github.com/daijro/camoufox/releases/download/v${VERSION}-${RELEASE}/camoufox-${VERSION}-${RELEASE}-lin.${ARCH}.zip`;
const ZIP_PATH = "/tmp/camoufox-manual.zip";

function download(url, dest, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location &&
          redirectsLeft > 0
        ) {
          res.resume();
          return download(res.headers.location, dest, redirectsLeft - 1).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} für ${url}`));
        }
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on("finish", () => file.close(resolve));
        file.on("error", reject);
      })
      .on("error", reject);
  });
}

async function main() {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  fs.mkdirSync(INSTALL_DIR, { recursive: true });
  console.log(`Lade ${ZIP_URL} ...`);
  await download(ZIP_URL, ZIP_PATH);
  console.log("Download fertig, entpacke ...");
  const zip = new AdmZip(ZIP_PATH);
  zip.extractAllTo(INSTALL_DIR, true);
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  fs.writeFileSync(
    path.join(INSTALL_DIR, "version.json"),
    JSON.stringify({ version: VERSION, release: RELEASE })
  );
  fs.unlinkSync(ZIP_PATH);
  console.log(`Camoufox v${VERSION}-${RELEASE} manuell installiert unter ${INSTALL_DIR}.`);
}

main().catch((err) => {
  console.error("Manuelle Camoufox-Installation fehlgeschlagen:", err);
  process.exit(1);
});
