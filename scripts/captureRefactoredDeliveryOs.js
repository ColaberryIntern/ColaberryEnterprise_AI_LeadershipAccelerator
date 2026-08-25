/**
 * captureRefactoredDeliveryOs — screenshot the two Delivery OS surfaces on DEV.
 *
 * WHY. Root CLAUDE.md and this project's operating doctrine both say the same thing:
 * green CI is not visual verification. Gates 10 and 11 shipped their backends with the UI
 * deliberately deferred, and handoff item 5 built 16 screens that had never been rendered.
 * This is the step that makes "it works" a claim about something someone looked at.
 *
 * DEV ONLY. The base URL is the dev instance on :9999. There is no production target in
 * this file and no flag to point it at one — master plan §20 does not authorize production
 * deployment, so a capture script that could aim at prod would be an invitation.
 *
 *   node scripts/captureRefactoredDeliveryOs.js
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');
const { chromium } = require('playwright');
const {
  createSafeContext,
  safeScreenshot,
  boundedFullPage,
  writeCaptureSummary,
} = require('./captureHelpers');

const BASE_URL = 'http://95.216.199.47:9999';
const OUT_DIR = path.join(__dirname, '..', 'docs', 'screenshots', 'refactored-delivery-os-dev');

/**
 * Mint inside the container: `jsonwebtoken` and the secret both live there, not here.
 *
 * Piped from a temp file rather than a heredoc — heredocs need a POSIX shell, and this
 * runs on Windows as often as not. Plain `<` redirection works under both cmd.exe and sh.
 */
function mintJwt() {
  const script = `
const jwt = require('jsonwebtoken');
const secret = process.env.JWT_SECRET;
if (!secret) { process.stderr.write('no JWT_SECRET'); process.exit(1); }
process.stdout.write(jwt.sign(
  { sub: 'ali', email: 'ali@colaberry.com', role: 'super_admin' },
  secret,
  { expiresIn: '6h' },
));`;
  const tmp = path.join(os.tmpdir(), `mint-delivery-jwt-${process.pid}.js`);
  fs.writeFileSync(tmp, script, 'utf8');
  try {
    return execSync(
      `ssh -o BatchMode=yes root@95.216.199.47 "docker exec -i accelerator-dev-backend node" < "${tmp}"`,
      { encoding: 'utf8' },
    ).trim();
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch (_) {
      /* best effort */
    }
  }
}

const STOPS = [
  { file: '01-client-overview', url: '/admin/refactored/client', label: 'Client Review Room — Overview' },
  { file: '02-client-decisions', url: '/admin/refactored/client', label: 'Client — Decisions', click: 'Decisions' },
  { file: '03-client-changes', url: '/admin/refactored/client', label: 'Client — Changes', click: 'Changes' },
  { file: '04-client-results', url: '/admin/refactored/client', label: 'Client — Results', click: 'Results' },
  { file: '05-builder-command', url: '/admin/refactored/builder', label: 'Builder Workspace — Command' },
  { file: '06-builder-proof', url: '/admin/refactored/builder', label: 'Builder — Proof', click: 'Proof' },
  { file: '07-builder-release', url: '/admin/refactored/builder', label: 'Builder — Release', click: 'Release' },
  { file: '08-builder-operate', url: '/admin/refactored/builder', label: 'Builder — Operate', click: 'Operate' },
];

(async () => {
  const token = mintJwt();
  if (!token || token.length < 40) throw new Error(`JWT mint failed (got ${token.length} chars)`);
  console.log(`[init] JWT minted (${token.length} chars)`);

  const browser = await chromium.launch();
  const context = await createSafeContext(browser);
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));

  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.evaluate((t) => {
    try {
      window.localStorage.setItem('admin_token', t);
    } catch (_) {}
  }, token);

  const entries = [];
  for (const stop of STOPS) {
    await page.goto(`${BASE_URL}${stop.url}`, { waitUntil: 'networkidle', timeout: 45_000 });
    if (stop.click) {
      const btn = page.getByRole('button', { name: stop.click, exact: true });
      if (await btn.count()) await btn.first().click();
      await page.waitForTimeout(400);
    }
    await page.waitForTimeout(600);
    const file = path.join(OUT_DIR, `${stop.file}.png`);
    await boundedFullPage(page, file);
    console.log(`[shot] ${stop.label} -> ${path.basename(file)}`);
    entries.push({ file: `${stop.file}.png`, label: stop.label, url: stop.url });
  }

  // Console errors are part of the evidence. A screenshot that looks right while the page
  // throws is not a passing result.
  console.log(`\n[console] ${consoleErrors.length} error(s)`);
  consoleErrors.slice(0, 10).forEach((e) => console.log(`  ${e}`));

  // The helper takes the ENTRY ARRAY. Passing an object nests the ledger one level
  // deep and the per-PNG width record stops being where the protocol says it is.
  writeCaptureSummary(OUT_DIR, entries);
  await browser.close();
  process.exit(consoleErrors.length > 0 ? 2 : 0);
})().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
