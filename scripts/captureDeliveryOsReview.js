/**
 * captureDeliveryOsReview — all 16 Delivery OS surfaces, for the review doc.
 *
 * Routes through `captureHelpers.js` per the screenshot-review protocol. Uses
 * `retina-review` because these PNGs are embedded into
 * `docs/REFACTORED_DELIVERY_OS_REVIEW.html` for a human to inspect — they are NOT read
 * back by Claude, which is the condition the protocol attaches to DSF 2.
 *
 * Base URL defaults to production because that is what shipped. Override with CAPTURE_BASE
 * to point at dev.
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');
const { chromium } = require('playwright');
const {
  RETINA_REVIEW_VIEWPORT,
  safeScreenshot,
  writeCaptureSummary,
} = require('./captureHelpers');

const BASE_URL = process.env.CAPTURE_BASE || 'https://enterprise.colaberry.ai';
const CONTAINER = process.env.CAPTURE_CONTAINER || 'accelerator-backend';
const OUT_DIR =
  process.env.CAPTURE_OUT ||
  path.join(__dirname, '..', 'docs', 'screenshots', '2026-08-25-refactored-delivery-os');

/** Mint inside the container — the secret lives there, not here. */
function mintJwt() {
  const script = `
const jwt = require('jsonwebtoken');
const secret = process.env.JWT_SECRET;
if (!secret) { process.stderr.write('no JWT_SECRET'); process.exit(1); }
process.stdout.write(jwt.sign(
  { sub: 'ali', email: 'ali@colaberry.com', role: 'super_admin' },
  secret,
  { expiresIn: '2h' },
));`;
  const tmp = path.join(os.tmpdir(), `mint-review-jwt-${process.pid}.js`);
  fs.writeFileSync(tmp, script, 'utf8');
  try {
    return execSync(
      `ssh -o BatchMode=yes root@95.216.199.47 "docker exec -i ${CONTAINER} node" < "${tmp}"`,
      { encoding: 'utf8' },
    ).trim();
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
}

const CLIENT = '/admin/refactored/client';
const BUILDER = '/admin/refactored/builder';

const STOPS = [
  { n: '01', slug: 'client-overview', url: CLIENT, label: 'Client · Overview' },
  { n: '02', slug: 'client-decisions', url: CLIENT, label: 'Client · Decisions', click: 'Decisions' },
  { n: '03', slug: 'client-design', url: CLIENT, label: 'Client · Design', click: 'Design' },
  { n: '04', slug: 'client-preview', url: CLIENT, label: 'Client · Preview', click: 'Preview' },
  { n: '05', slug: 'client-changes', url: CLIENT, label: 'Client · Changes', click: 'Changes' },
  { n: '06', slug: 'client-releases', url: CLIENT, label: 'Client · Releases', click: 'Releases' },
  { n: '07', slug: 'client-results', url: CLIENT, label: 'Client · Results', click: 'Results' },
  { n: '08', slug: 'client-documents', url: CLIENT, label: 'Client · Documents', click: 'Documents' },
  { n: '09', slug: 'builder-command', url: BUILDER, label: 'Builder · Command' },
  { n: '10', slug: 'builder-plan', url: BUILDER, label: 'Builder · Plan', click: 'Plan' },
  { n: '11', slug: 'builder-design', url: BUILDER, label: 'Builder · Design', click: 'Design' },
  { n: '12', slug: 'builder-build', url: BUILDER, label: 'Builder · Build', click: 'Build' },
  { n: '13', slug: 'builder-agents', url: BUILDER, label: 'Builder · Agents', click: 'Agents' },
  { n: '14', slug: 'builder-proof', url: BUILDER, label: 'Builder · Proof', click: 'Proof' },
  { n: '15', slug: 'builder-release', url: BUILDER, label: 'Builder · Release', click: 'Release' },
  { n: '16', slug: 'builder-operate', url: BUILDER, label: 'Builder · Operate', click: 'Operate' },
];

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const token = mintJwt();
  if (!token || token.length < 40) throw new Error(`JWT mint failed (${token.length} chars)`);
  console.log(`[init] JWT minted (${token.length} chars) · base ${BASE_URL}`);

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: RETINA_REVIEW_VIEWPORT.width, height: RETINA_REVIEW_VIEWPORT.height },
    deviceScaleFactor: RETINA_REVIEW_VIEWPORT.deviceScaleFactor ?? 2,
  });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.evaluate((t) => { try { window.localStorage.setItem('admin_token', t); } catch (_) {} }, token);

  const entries = [];
  for (const stop of STOPS) {
    await page.goto(`${BASE_URL}${stop.url}`, { waitUntil: 'networkidle', timeout: 45_000 });
    if (stop.click) {
      const btn = page.getByRole('button', { name: stop.click, exact: true });
      if (await btn.count()) await btn.first().click();
      await page.waitForTimeout(350);
    }
    await page.waitForTimeout(550);

    const file = `${stop.n}-${stop.slug}.png`;
    const out = path.join(OUT_DIR, file);
    const meta = await safeScreenshot(page, out, { fullPage: true, label: 'retina-review' });
    console.log(`[shot] ${stop.n} ${stop.label}`);
    entries.push({
      file,
      label: stop.label,
      url: `${BASE_URL}${stop.url}`,
      originalWidth: meta?.originalWidth ?? null,
      finalWidth: meta?.finalWidth ?? null,
      downscaled: meta?.downscaled ?? false,
    });
  }

  console.log(`\n[console] ${consoleErrors.length} error(s)`);
  consoleErrors.slice(0, 8).forEach((e) => console.log(`  ${e}`));

  // The helper takes the ENTRY ARRAY. Passing an object nests the ledger one level
  // deep and the per-PNG width record stops being where the protocol says it is.
  writeCaptureSummary(OUT_DIR, entries);
  await browser.close();
  process.exit(consoleErrors.length ? 2 : 0);
})().catch((e) => { console.error(e?.message ?? e); process.exit(1); });
