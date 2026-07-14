// camoufox-js@0.11.1 wählt für die aktuell "neueste unterstützte" Version
// (152.0.4-alpha.25) fälschlich ein ~557MB-ZIP, das nachweislich NUR
// Fonts/Fontconfig enthält, kein Browser-Executable (camoufox-bin) --
// direkt gegen GitHub-Releases geprüft: v135.0.1-beta.24 hat ein
// vollständiges 680MB-Linux-x64-ZIP mit echtem Browser-Binary. Dieses
// Skript installiert diese ältere, bekannt funktionierende Version manuell,
// bevor `npx camoufox-js fetch` (das GeoIP/Addons unabhängig davon
// unconditional nachlädt) läuft -- dessen Freshness-Check erkennt danach
// ein gültiges version.json und lässt unsere manuelle Installation unangetastet.
const fs = require("fs");
const path = require("path");
const https = require("https");
const AdmZip = require("adm-zip");

// INSTALL_DIR/VERSION/RELEASE/ZIP_PATH kommen alle aus Build-Zeit-Konstanten
// bzw. einer Dockerfile-ENV (nicht aus Nutzereingaben) -- die
// security/detect-non-literal-fs-filename-Warnungen unten (createWriteStream/
// mkdirSync/writeFileSync) sind daher Fehlalarme.
const INSTALL_DIR = process.env.CAMOUFOX_INSTALL_DIR || "/opt/camoufox";
const VERSION = "135.0.1";
const RELEASE = "beta.24";
const ZIP_URL = `https://github.com/daijro/camoufox/releases/download/v${VERSION}-${RELEASE}/camoufox-${VERSION}-${RELEASE}-lin.x86_64.zip`;
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
