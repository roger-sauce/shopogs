const sharp = require("sharp");
const fs = require("fs");

// The record is Crate's, measured from its icon-1024.png rather than guessed,
// and every one of those figures is kept as it stands: ring 356..385, so a
// stroke of 29.5 around radius 370.5, label out to 104, spindle hole 20.5.
// The euro is laid over it at that same 29.5, which is the point -- the two
// signs share one line weight instead of arguing about it.
const GOLD = "#C8A96E", BG = "#14120E";
const S = 1024, C = 512;
const RING = 370.5, RING_W = 29.5, DOT = 104, SPINDLE = 20.5;

// Taken from the official construction sheet (Euro_Construction.svg), as
// ratios of its outer radius so they survive any scaling: where the C opens,
// how far the bars reach either side, and the slant of their ends. Only the
// stroke weight departs from the sheet -- there it would be 0.169 of the outer
// radius, here it is the record's own.
const SHEET = { open: 50.5, close: -44.8, left: 264.3 / 213, right: 109.7 / 213, slant: 15 / 36 };
const EURO_R = 300;

function icon({ gold, bg }) {
  const w = RING_W, rm = EURO_R - w / 2;
  const on = (a) => [C + rm * Math.cos(a * Math.PI / 180), C + rm * Math.sin(a * Math.PI / 180)];
  const [x1, y1] = on(SHEET.open), [x2, y2] = on(SHEET.close);

  // The long way round: 265 degrees, hence the large-arc flag.
  const arc = `<path d="M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${rm} ${rm} 0 1 1 ${x2.toFixed(1)} ${y2.toFixed(1)}" fill="none" stroke="${gold}" stroke-width="${w}"/>`;

  const dx = w * SHEET.slant, L = EURO_R * SHEET.left, R = EURO_R * SHEET.right;
  const bar = (mid, fill) =>
    `<path d="M ${C - L + dx} ${mid - w / 2} L ${C + R + dx} ${mid - w / 2} L ${C + R} ${mid + w / 2} L ${C - L} ${mid + w / 2} Z" fill="${fill}"/>`;
  const bars = (fill) => bar(C - w, fill) + bar(C + w, fill);

  // Where the bars cross the label both are gold, so the crossing would be one
  // shape. Punching the bars out of the label in the background colour keeps
  // both readable: the label stays a disc, the bars stay bars.
  //
  // That leaves the spindle sitting in the gold strip between them, touching
  // both -- a dark dot against dark bars reads as part of them. A thin gold
  // ring gives it back its edge, drawn inside radius 20.5 so the hole keeps
  // exactly the size it has in Crate's logo.
  const spindle = `<circle cx="${C}" cy="${C}" r="${SPINDLE}" fill="${bg}"/>
  <circle cx="${C}" cy="${C}" r="${SPINDLE - 2.5}" fill="none" stroke="${gold}" stroke-width="5"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs>
    <!-- The bars stop short of the rim rather than running into it. -->
    <clipPath id="inside"><circle cx="${C}" cy="${C}" r="336"/></clipPath>
    <clipPath id="label"><circle cx="${C}" cy="${C}" r="${DOT}"/></clipPath>
  </defs>
  <rect width="${S}" height="${S}" fill="${bg}"/>
  <circle cx="${C}" cy="${C}" r="${RING}" fill="none" stroke="${gold}" stroke-width="${RING_W}"/>
  <g clip-path="url(#inside)">${arc}${bars(gold)}</g>
  <circle cx="${C}" cy="${C}" r="${DOT}" fill="${gold}"/>
  <g clip-path="url(#label)">${bars(bg)}</g>
  ${spindle}
</svg>`;
}

// Light and dark are the same image -- the icon is dark to begin with. For the
// tinted appearance iOS expects greyscale: the light areas take the user's
// colour, hence white on black rather than gold on charcoal.
const colour = icon({ gold: GOLD, bg: BG });
const tinted = icon({ gold: "#FFFFFF", bg: "#000000" });

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
