const sharp = require("sharp");
const fs = require("fs");

// Measured from Crate's current icon-1024.png rather than guessed: ring from
// radius 356 to 385, label out to 104, spindle hole 20.5 -- and these two
// colours. The gold is the same one the shopogs search form uses.
const GOLD = "#C8A96E", BG = "#14120E";
const S = 1024, C = 512, RING = 370.5, RING_W = 29.5, DOT = 104, SPINDLE = 20.5;

function icon({ gold, bg, hollowLabel = false }) {
  const line = (d, w) =>
    `<path d="${d}" fill="none" stroke="${gold}" stroke-width="${w}" stroke-linecap="round"/>`;

  // The reticle sits between the centre and twelve o'clock, with tick marks.
  //
  // The ticks are what separates a marker from a sight: only a scale turns two
  // crossed lines into an instrument someone aims with. They lie across their
  // arm rather than along it, so they read as the direction being measured
  // instead of merely extending the line.
  const y = C - 224, gap = 28, reach = 104, w = 6, tickW = 5, tickLen = 34;
  const h = tickLen / 2;
  const reticle = [
    line(`M ${C} ${y - gap} L ${C} ${y - reach}`, w),
    line(`M ${C} ${y + gap} L ${C} ${y + reach}`, w),
    line(`M ${C - gap} ${y} L ${C - reach} ${y}`, w),
    line(`M ${C + gap} ${y} L ${C + reach} ${y}`, w),
  ];
  for (const d of [56, 80]) {
    reticle.push(line(`M ${C - h} ${y - d} L ${C + h} ${y - d}`, tickW));
    reticle.push(line(`M ${C - h} ${y + d} L ${C + h} ${y + d}`, tickW));
    reticle.push(line(`M ${C - d} ${y - h} L ${C - d} ${y + h}`, tickW));
    reticle.push(line(`M ${C + d} ${y - h} L ${C + d} ${y + h}`, tickW));
  }

  // The label is a filled disc with the spindle punched out of it -- except in
  // the tinted appearance, where a filled disc that size becomes a glaring
  // plate once iOS colours it. There the same circle is drawn as an outline of
  // the ring's own weight, and the spindle stays as a dot so the shape still
  // reads as a record rather than a washer.
  const label = hollowLabel
    ? `<circle cx="${C}" cy="${C}" r="${DOT - RING_W / 2}" fill="none" stroke="${gold}" stroke-width="${RING_W}"/>
  <circle cx="${C}" cy="${C}" r="${SPINDLE}" fill="${gold}"/>`
    : `<circle cx="${C}" cy="${C}" r="${DOT}" fill="${gold}"/>
  <circle cx="${C}" cy="${C}" r="${SPINDLE}" fill="${bg}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <rect width="${S}" height="${S}" fill="${bg}"/>
  <circle cx="${C}" cy="${C}" r="${RING}" fill="none" stroke="${gold}" stroke-width="${RING_W}"/>
  ${label}
  ${reticle.join("\n  ")}
</svg>`;
}

// Light and dark are the same image -- the icon is dark to begin with. For the
// tinted appearance iOS expects greyscale: the light areas take the user's
// colour, hence white on black rather than gold on charcoal.
const colour = icon({ gold: GOLD, bg: BG });
const tinted = icon({ gold: "#FFFFFF", bg: "#000000", hollowLabel: true });

// Written straight into the asset catalogue next door, so there is no copy
// step to forget.
const OUT = `${__dirname}/../WaxStock/Assets.xcassets/AppIcon.appiconset`;

(async () => {
  fs.writeFileSync(`${__dirname}/icon.svg`, colour);
  fs.writeFileSync(`${__dirname}/icon-tinted.svg`, tinted);
  await sharp(Buffer.from(colour)).png().toFile(`${OUT}/icon-1024.png`);
  await sharp(Buffer.from(colour)).png().toFile(`${OUT}/icon-1024-dark.png`);
  await sharp(Buffer.from(tinted)).greyscale().png().toFile(`${OUT}/icon-1024-tinted.png`);
  for (const f of ["icon-1024.png", "icon-1024-dark.png", "icon-1024-tinted.png"]) {
    const m = await sharp(`${OUT}/${f}`).metadata();
    console.log(f, `${m.width}x${m.height}`);
  }
})();
