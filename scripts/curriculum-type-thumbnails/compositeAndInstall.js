#!/usr/bin/env node
/**
 * compositeAndInstall.js — turns the raw AI-generated images into the shipped
 * curriculum-type thumbnails: center-crops each 1536x1024 render to a 3:1
 * banner (matching the Experience Studio card strip), downscales to 900x300,
 * stamps the Colaberry wordmark on a small translucent chip bottom-right
 * (deterministic compositing — image models cannot reproduce a logo
 * faithfully), and writes optimized JPEGs into
 * frontend/public/thumbnails/curriculum-types/<slug>.jpg.
 *
 * RUNS LOCALLY at repo root (needs `sharp` from the root node_modules).
 *
 * Usage: node scripts/curriculum-type-thumbnails/compositeAndInstall.js --raw <dir-with-raw-pngs>
 *
 * Idempotent: same inputs produce the same outputs; existing files are
 * overwritten in place (safe to rerun). Slugs with no raw image are reported
 * as missing and skipped — never a broken/empty output file.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const KIT_DIR = __dirname;
const REPO_ROOT = path.resolve(KIT_DIR, '..', '..');
const PROMPTS = JSON.parse(fs.readFileSync(path.join(KIT_DIR, 'prompts.json'), 'utf8'));
const OUT_DIR = path.join(REPO_ROOT, 'frontend', 'public', 'thumbnails', 'curriculum-types');
const LOGO = path.join(REPO_ROOT, 'frontend', 'public', 'colaberry-logo-transparent.png');

const args = process.argv.slice(2);
const RAW_DIR = args[args.indexOf('--raw') + 1];
if (!RAW_DIR || !fs.existsSync(RAW_DIR)) { console.error('Missing --raw <dir>'); process.exit(1); }

// Banner geometry. Margins keep the chip visible under object-fit:cover crops
// across card widths (~2.6:1 through ~3.5:1 render boxes).
const OUT_W = 900, OUT_H = 300;
// Wordmark trimmed to 291x74 (drops the baked-in cherry reflection) then scaled.
const LOGO_TRIM = { left: 0, top: 0, width: 291, height: 74 };
const LOGO_W = 150, LOGO_H = 38;
const PAD = 12, MARGIN_RIGHT = 70, MARGIN_BOTTOM = 30;
const CHIP_W = LOGO_W + PAD * 2, CHIP_H = LOGO_H + PAD * 2;
const CHIP_X = OUT_W - MARGIN_RIGHT - CHIP_W, CHIP_Y = OUT_H - MARGIN_BOTTOM - CHIP_H;

const chipSvg = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${OUT_W}" height="${OUT_H}">` +
  `<rect x="${CHIP_X}" y="${CHIP_Y}" width="${CHIP_W}" height="${CHIP_H}" rx="14" fill="#ffffff" fill-opacity="0.88"/>` +
  `</svg>`
);

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const logo = await sharp(LOGO).extract(LOGO_TRIM).resize(LOGO_W, LOGO_H).png().toBuffer();
  const missing = [];
  let written = 0;

  for (const t of PROMPTS.types) {
    const rawFile = path.join(RAW_DIR, `${t.slug}.png`);
    if (!fs.existsSync(rawFile)) { missing.push(t.slug); continue; }

    const src = sharp(rawFile);
    const meta = await src.metadata();
    // center-crop to 3:1
    const cropH = Math.min(meta.height, Math.round(meta.width / 3));
    const top = Math.round((meta.height - cropH) / 2);
    const banner = await src
      .extract({ left: 0, top, width: meta.width, height: cropH })
      .resize(OUT_W, OUT_H)
      .toBuffer();

    const out = path.join(OUT_DIR, `${t.slug}.jpg`);
    await sharp(banner)
      .composite([
        { input: chipSvg, top: 0, left: 0 },
        { input: logo, top: CHIP_Y + PAD, left: CHIP_X + PAD },
      ])
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(out);
    written += 1;
    console.log(JSON.stringify({ event: 'installed', slug: t.slug, file: path.relative(REPO_ROOT, out), kb: Math.round(fs.statSync(out).size / 1024) }));
  }

  console.log(JSON.stringify({ event: 'done', written, missing }));
  process.exit(missing.length ? 1 : 0);
})().catch((e) => { console.error(JSON.stringify({ event: 'fatal', message: e.message })); process.exit(1); });
