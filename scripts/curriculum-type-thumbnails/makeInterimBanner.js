#!/usr/bin/env node
/**
 * makeInterimBanner.js — produce a real, on-brand 900x300 thumbnail for ONE
 * curriculum type WITHOUT the gpt-image-2 pipeline.
 *
 * Why this exists: `seedComponentAuthoring.test.ts` requires every registry slug
 * to have a `thumbnail_url` AND that file to exist on disk. Generating the
 * proper AI banner needs the production host's OPENAI_API_KEY and a paid image
 * call, which is not always available (or appropriate) at the time a type is
 * added. Shipping a broken image reference instead is worse than either option:
 * the card renders with a broken hero and the test suite goes red.
 *
 * So this draws a deterministic, brand-consistent banner locally with sharp: the
 * type's accent colour over the enterprise navy field, a soft geometric motif,
 * and the same Colaberry wordmark chip in the same position the AI pipeline
 * stamps. Same geometry (900x300, 3:1), same chip placement, same JPEG settings,
 * so it sits correctly next to the generated banners on every surface.
 *
 * This is explicitly an INTERIM asset. When the AI banner is generated, running
 * compositeAndInstall.js overwrites this file in place — no cleanup, no code
 * change, no reference to update.
 *
 * Usage:
 *   node scripts/curriculum-type-thumbnails/makeInterimBanner.js --slug claude_studio --accent '#6C5CE7'
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const KIT_DIR = __dirname;
const REPO_ROOT = path.resolve(KIT_DIR, '..', '..');
const OUT_DIR = path.join(REPO_ROOT, 'frontend', 'public', 'thumbnails', 'curriculum-types');
const LOGO = path.join(REPO_ROOT, 'frontend', 'public', 'colaberry-logo-transparent.png');

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const slug = argOf('--slug');
const accent = argOf('--accent', '#6C5CE7');
if (!slug) { console.error('Missing --slug <slug>'); process.exit(1); }

// Geometry copied from compositeAndInstall.js so the two are interchangeable.
const OUT_W = 900, OUT_H = 300;
const LOGO_TRIM = { left: 0, top: 0, width: 291, height: 74 };
const LOGO_W = 150, LOGO_H = 38;
const PAD = 12, MARGIN_RIGHT = 70, MARGIN_BOTTOM = 30;
const CHIP_W = LOGO_W + PAD * 2, CHIP_H = LOGO_H + PAD * 2;
const CHIP_X = OUT_W - MARGIN_RIGHT - CHIP_W, CHIP_Y = OUT_H - MARGIN_BOTTOM - CHIP_H;

/**
 * The motif: four linked nodes on a rising path — the four-stage loop, drawn
 * abstractly so it reads as a diagram rather than as clip art. Text-free, in
 * keeping with the AI pipeline's art direction (no words, no logos in the art).
 */
const bannerSvg = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${OUT_W}" height="${OUT_H}" viewBox="0 0 ${OUT_W} ${OUT_H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0B2B4A"/>
      <stop offset="55%" stop-color="#122F52"/>
      <stop offset="100%" stop-color="#1B2A4A"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.62" cy="0.42" r="0.62">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.42"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="path" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0.95"/>
    </linearGradient>
  </defs>

  <rect width="${OUT_W}" height="${OUT_H}" fill="url(#bg)"/>
  <rect width="${OUT_W}" height="${OUT_H}" fill="url(#glow)"/>

  <g opacity="0.10" stroke="#ffffff" stroke-width="1">
    ${Array.from({ length: 11 }, (_, i) => `<line x1="${i * 90}" y1="0" x2="${i * 90}" y2="${OUT_H}"/>`).join('')}
    ${Array.from({ length: 4 }, (_, i) => `<line x1="0" y1="${i * 90}" x2="${OUT_W}" y2="${i * 90}"/>`).join('')}
  </g>

  <path d="M 190 218 C 290 218, 300 160, 390 160 C 480 160, 490 108, 580 108 C 660 108, 680 74, 730 74"
        fill="none" stroke="url(#path)" stroke-width="7" stroke-linecap="round"/>

  ${[[190, 218, 17], [390, 160, 20], [580, 108, 23], [730, 74, 27]]
    .map(([cx, cy, r], i) => `
    <circle cx="${cx}" cy="${cy}" r="${r + 11}" fill="${accent}" opacity="${0.10 + i * 0.04}"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${i === 3 ? accent : '#101B33'}" stroke="${accent}" stroke-width="3.5"/>
    ${i === 3 ? `<circle cx="${cx}" cy="${cy}" r="9" fill="#ffffff" opacity="0.92"/>` : ''}`).join('')}

  <g opacity="0.5">
    <circle cx="118" cy="96" r="3.5" fill="${accent}"/>
    <circle cx="150" cy="132" r="2.5" fill="${accent}"/>
    <circle cx="96" cy="150" r="2" fill="${accent}"/>
    <circle cx="812" cy="200" r="3" fill="${accent}"/>
    <circle cx="846" cy="164" r="2" fill="${accent}"/>
  </g>
</svg>`);

const chipSvg = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${OUT_W}" height="${OUT_H}">` +
  `<rect x="${CHIP_X}" y="${CHIP_Y}" width="${CHIP_W}" height="${CHIP_H}" rx="14" fill="#ffffff" fill-opacity="0.88"/>` +
  `</svg>`
);

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const logo = await sharp(LOGO).extract(LOGO_TRIM).resize(LOGO_W, LOGO_H).png().toBuffer();
  const base = await sharp(bannerSvg).png().toBuffer();
  const out = path.join(OUT_DIR, `${slug}.jpg`);

  await sharp(base)
    .composite([
      { input: chipSvg, top: 0, left: 0 },
      { input: logo, top: CHIP_Y + PAD, left: CHIP_X + PAD },
    ])
    .jpeg({ quality: 86, mozjpeg: true })
    .toFile(out);

  const { size } = fs.statSync(out);
  console.log(`[interim-banner] wrote ${path.relative(REPO_ROOT, out)} (${OUT_W}x${OUT_H}, ${(size / 1024).toFixed(1)} KB, accent ${accent})`);
  console.log('[interim-banner] Replace with the AI banner any time: generateOnHost.js --only ' + slug + ' then compositeAndInstall.js --raw <dir>');
})().catch((e) => { console.error('[interim-banner] FAILED:', e.message); process.exit(1); });
