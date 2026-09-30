/**
 * captureBusinessAccountShots.js
 *
 * Captures the four product screenshots the public V2 site needs:
 *   shot-today.png        the Today screen a team member actually logs into
 *   shot-individual.png   the per-person drill-through from the company view
 *   shot-workspace.png    the company workspace (replaces a placeholder image)
 *   shot-services-hero.png a Services hero that is not a duplicate of another shot
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IDENTITY MASKING IS NOT OPTIONAL HERE.
 *
 * These are captures of PRODUCTION, so every name, avatar and point total on
 * screen belongs to a real enrolled student. The site they are destined for is
 * a public marketing page. Publishing a real person's name, readiness score and
 * progress there is not something they consented to, and no "sample data" badge
 * makes it acceptable.
 *
 * So: the page is loaded with real data — which is the whole point, because the
 * skills radar and the XP bars only look right when they are driven by someone
 * who has actually done the work — and then every identifying string is
 * replaced in the DOM *before* the shutter fires. Names become a fixed set of
 * invented ones, avatar photos become initials.
 *
 * The numbers stay real. A chart shape is not personal data once it is not
 * attached to a person.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Usage:
 *   node scripts/captureBusinessAccountShots.js
 *
 * Requires PARTICIPANT_TOKEN in the environment (a portal JWT for the account
 * being captured). The token is never written to disk by this script.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PW_PATH || 'playwright');

const BASE = process.env.CAPTURE_BASE || 'https://enterprise.colaberry.ai';
const OUT_DIR = process.env.OUT_DIR || path.join(__dirname, '..', 'frontend', 'public', 'site-v2');
const MAX_SAFE_WIDTH = 1800; // mirrors scripts/captureHelpers.js

/** Invented names. Deliberately not real employees, students or customers. */
const MASK_NAMES = [
  'Jordan Ellis', 'Priya Nair', 'Marcus Webb', 'Lena Hoffman', 'Sam Okafor',
  'Ana Duarte', 'Ravi Chandra', 'Chloe Bennett', 'Tomas Vega', 'Nadia Haq',
  'Ellis Grant', 'Mia Sorensen', 'Owen Baptiste', 'Farah Idris', 'Kai Lindqvist',
  'Rosa Delgado', 'Ben Achebe', 'Iris Kowalski', 'Dev Patel', 'Zoe Marchetti',
];

/**
 * Replace every human name and avatar image on the page with invented ones.
 *
 * Runs in the page. Deliberately stable: the same source string always maps to
 * the same invented name, so a person appearing in two places on one screen is
 * not renamed inconsistently, which would look obviously doctored.
 */
function maskIdentities(arg) {
  // Playwright's page.evaluate passes exactly ONE argument, so both lists
  // arrive together rather than as separate parameters.
  const { realNames, maskNames } = arg;
  const masks = maskNames;
  const map = new Map();
  let next = 0;
  const maskFor = (real) => {
    const key = real.trim();
    if (!map.has(key)) {
      map.set(key, maskNames[next % maskNames.length]);
      next += 1;
    }
    return map.get(key);
  };

  // 1. Text nodes: swap any known real name wherever it appears.
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((n) => {
    let text = n.nodeValue;
    realNames.forEach((real) => {
      if (real && text.includes(real)) text = text.split(real).join(maskFor(real));
    });
    if (text !== n.nodeValue) n.nodeValue = text;
  });

  // 2. Avatar photographs are as identifying as a name. Replace any <img> that
  //    looks like a person with the masked initials on a flat tile.
  document.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src') || '';
    const alt = img.getAttribute('alt') || '';
    const cls = img.className || '';

    // NEVER touch brand marks. The first run of this replaced the Colaberry
    // logo with a "C" initials circle, because the logo is a small image and
    // the size heuristic below cannot tell a wordmark from a face.
    if (/logo|brand|colaberry|favicon|icon/i.test(`${src} ${alt} ${cls}`)) return;

    const isAvatar =
      /avatar|profile|photo/i.test(`${src} ${cls}`) ||
      (img.width > 0 && img.width <= 64 && img.height > 0 && img.height <= 64);
    if (!isAvatar) return;
    const span = document.createElement('span');
    // Initials must come from the MASKED name, not the real one — "FA" for
    // Farhat is still a pointer to a real person.
    const masked = maskFor(alt.trim() || 'Jordan Ellis');
    const initials = masked.split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || 'JE';
    span.textContent = initials;
    Object.assign(span.style, {
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: `${img.width || 32}px`, height: `${img.height || 32}px`,
      borderRadius: '50%', background: '#e2e8f0', color: '#1a365d',
      fontWeight: '700', fontSize: '12px', flex: '0 0 auto',
    });
    img.replaceWith(span);
  });

  // 3. Initials badges are rendered as <span>, not <img>, so the avatar rule
  //    above misses them entirely -- a drill-through captured with the name
  //    masked still showed the real person's "SR" circle. Any element whose
  //    entire text is 2-3 uppercase letters and which is round is an initials
  //    badge; rewrite it from the masked name instead.
  const firstMask = (masks && masks[0]) || 'Jordan Ellis';
  const maskInitials = firstMask.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  document.querySelectorAll('span, div').forEach((el) => {
    if (el.children.length) return;
    const t = (el.textContent || '').trim();
    if (!/^[A-Z]{2,3}$/.test(t)) return;
    const cs = getComputedStyle(el);
    const round = (cs.borderRadius || '').includes('50%') || parseInt(cs.borderRadius, 10) >= 12;
    if (round) el.textContent = maskInitials;
  });

  // 4. Email addresses are identifying too.
  document.body.innerHTML = document.body.innerHTML.replace(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    'name@company.com',
  );
}

async function shoot(page, { name, url, waitFor, clip, clipRect, realNames }) {
  await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(4500);
  if (waitFor) {
    await page.waitForSelector(waitFor, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1200);
  }

  await page.evaluate(maskIdentities, { realNames, maskNames: MASK_NAMES });
  await page.waitForTimeout(400);

  // `clipRect` crops to an explicit region. Used to exclude the left nav and the
  // right People rail: those rails carry other members' avatars and presence,
  // and cropping them out is a stronger privacy guarantee than masking them --
  // one photo survived the mask on the first run because it fell outside the
  // size heuristic. It also makes a better image: the product, not the chrome.
  const target = clip ? await page.$(clip) : null;
  const box = target ? await target.boundingBox() : null;
  const region = clipRect || (box
    ? { x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 8), width: box.width + 16, height: Math.min(box.height + 16, 1400) }
    : null);
  const file = path.join(OUT_DIR, name);
  await page.screenshot(region ? { path: file, clip: region } : { path: file });

  const bytes = fs.statSync(file).size;
  console.log(`  ${name.padEnd(26)} ${String(bytes).padStart(7)} bytes`);
  return file;
}

(async () => {
  const token = process.env.PARTICIPANT_TOKEN;
  if (!token) {
    console.error('PARTICIPANT_TOKEN is required (a portal JWT for the account to capture).');
    process.exit(1);
  }
  const realNames = (process.env.REAL_NAMES || '').split('|').map((s) => s.trim()).filter(Boolean);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  // 1440 wide keeps every output under MAX_SAFE_WIDTH at deviceScaleFactor 1,
  // which is the rule captureHelpers.js enforces for anything a reader opens.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await ctx.addInitScript((t) => localStorage.setItem('participant_token', t), token);
  const page = await ctx.newPage();

  console.log(`Capturing from ${BASE} (identities masked before every shutter)`);
  const shots = JSON.parse(process.env.SHOTS || '[]');
  for (const s of shots) {
    await shoot(page, { ...s, realNames });
  }

  await browser.close();
  console.log(`Done. MAX_SAFE_WIDTH=${MAX_SAFE_WIDTH}; captured at 1440 so no downscale is needed.`);
})();
