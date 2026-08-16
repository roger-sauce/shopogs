const sharp = require("sharp");
const fs = require("fs");
const S = 1024, C = S / 2;
const wave = (t, l) => l.reduce((s, [f, p, a]) => s + a * Math.cos(f * t + p), 0);

// K1: der gewaehlte Entwurf. Aussen ein von Hand gedruecktes Siegel --
// unregelmaessige Form UND unregelmaessige Strichstaerke --, innen zwei
// exakte Platten. Der Gegensatz ist der ganze Gedanke.
function icon({ ink, ground }) {
  const rW = [[9, 0.6, 11], [5, 2.1, 9], [3, 1.1, 7], [14, 4.2, 4]];
  // Mittellinie und Dicke laufen als getrennte Wellensummen mit eigenen
  // Frequenzen. Waeren sie gekoppelt, saessen die Beulen genau dort, wo der
  // Strich dick wird, und man saehe ein Muster statt eines Abdrucks.
  const wW = [[4, 1.7, 9], [7, 3.4, 6], [2, 0.4, 5], [11, 2.8, 3]];
  const outer = [], inner = [];
  for (let i = 0; i <= 1440; i++) {
    const t = (i / 1440) * Math.PI * 2;
    const r = 348 + wave(t, rW);
    // Nie duenner als 7: darunter reisst der Strich bei 60 Pixeln ab.
    const w = Math.max(7, 26 + wave(t, wW));
    const co = Math.cos(t), si = Math.sin(t);
    outer.push(`${(C + (r + w / 2) * co).toFixed(2)} ${(C + (r + w / 2) * si).toFixed(2)}`);
    inner.push(`${(C + (r - w / 2) * co).toFixed(2)} ${(C + (r - w / 2) * si).toFixed(2)}`);
  }
  const band = `M ${outer.join(" L ")} Z M ${inner.reverse().join(" L ")} Z`;

  // Ausgeglichen auf die sichtbare Masse (+22/+20, weil die hintere Platte
  // nur als Sichel erscheint), dann 18 Pixel Richtung 5 Uhr.
  const d = 18, H5 = [0.5, 0.866];
  const bx = -96 + 22 + H5[0] * d, by = -84 + 20 + H5[1] * d;
  const fx =  52 + 22 + H5[0] * d, fy =  44 + 20 + H5[1] * d;
  const r = 126, stroke = 26, dot = 29;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <rect width="${S}" height="${S}" fill="${ground}"/>
  <path d="${band}" fill="${ink}" fill-rule="evenodd"/>
  <circle cx="${C + bx}" cy="${C + by}" r="${r}" fill="none" stroke="${ink}" stroke-width="${stroke}"/>
  <circle cx="${C + bx}" cy="${C + by}" r="${dot}" fill="${ink}"/>
  <circle cx="${C + fx}" cy="${C + fy}" r="${r + stroke / 2 + 16}" fill="${ground}"/>
  <circle cx="${C + fx}" cy="${C + fy}" r="${r}" fill="none" stroke="${ink}" stroke-width="${stroke}"/>
  <circle cx="${C + fx}" cy="${C + fy}" r="${dot}" fill="${ink}"/>
</svg>`;
}

// Hell und dunkel sind dasselbe Bild -- das Icon ist ohnehin dunkel. Fuer die
// getoente Fassung erwartet iOS Graustufen: die hellen Stellen nehmen die
// Farbe des Nutzers an, deshalb Weiss auf Schwarz statt Gold auf Anthrazit.
const colour  = icon({ ink: "#C8A96E", ground: "#0D0F14" });
const tinted  = icon({ ink: "#FFFFFF", ground: "#000000" });

(async () => {
  fs.writeFileSync("icon.svg", colour);
  fs.writeFileSync("icon-tinted.svg", tinted);
  await sharp(Buffer.from(colour)).png().toFile("icon-1024.png");
  await sharp(Buffer.from(colour)).png().toFile("icon-1024-dark.png");
  await sharp(Buffer.from(tinted)).greyscale().png().toFile("icon-1024-tinted.png");
  for (const f of ["icon-1024.png", "icon-1024-dark.png", "icon-1024-tinted.png"]) {
    const m = await sharp(f).metadata();
    console.log(f, `${m.width}x${m.height}`, m.channels + " Kanaele");
  }
})();
