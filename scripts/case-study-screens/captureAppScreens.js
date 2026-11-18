#!/usr/bin/env node
/**
 * captureAppScreens.js: real screens from the logged-in app for a case study, redacted, every time.
 *
 * WHY (Ali, 2026-11-18): "Make sure the pictures from the app ... should not be missed moving fwd - it's
 * been missed in every single 1st try." The app screens are behind a login, and every first try found the
 * stored session expired and fell back to no pictures, or asked Ali for screenshots late in the build. This
 * tool makes the login a one-minute step at the START, and the capture and redaction repeatable.
 *
 *   node scripts/case-study-screens/captureAppScreens.js --check
 *       Is there a usable admin session? Exit 0 yes, 3 no.
 *   node scripts/case-study-screens/captureAppScreens.js --login
 *       Opens a visible Edge window on /admin/login. The person signs in as usual. The session is saved to
 *       scripts/.ali_admin_jwt.txt (git-ignored by scripts/.*_jwt.txt), the file the other capture scripts
 *       already read. Nothing is minted and no token passes through chat.
 *   node scripts/case-study-screens/captureAppScreens.js --spec <spec.json> --out <dir>
 *       Captures every screen in the spec, redacted, and writes <dir>/manifest.json with md5s.
 *
 * SPEC: { "base": "https://enterprise.colaberry.ai", "screens": [
 *   { "name": "decide-panel", "path": "/admin/internship?view=apps",
 *     "steps": [{ "click": "text=Review" }, { "waitFor": "text=Decide" }],   optional, in order
 *     "clip": "[data-testid=decide-panel]",                                   optional: crop to an element
 *     "clipRect": { "x": 256, "y": 0, "width": 1184, "height": 900 },        optional: crop to a rectangle
 *     "mask": ["td.applicant-name", ".avatar"],                               optional: painted over
 *     "redactText": ["Jane Doe"],                                            optional: literal strings
 *     "redactNamesFrom": ["/api/admin/internship/queue"],                   optional: admin API endpoints;
 *          every field named like a name (name, full_name, first_name, display_name...) in their JSON is
 *          redacted on the screen, as a whole and word by word. Use it for every page that lists people.
 *     "keepWords": ["Info"],                                                 optional: a name PART that is also a
 *          UI word (a staff display name "Info Desk" would otherwise blank "Info requested").
 *     "viewport": { "width": 1440, "height": 900 } } ] }
 *
 * REDACTION, ALWAYS, ON EVERY SCREEN (a spec can add to it, never remove it):
 *   - every email address and phone number in the page text is replaced before the capture;
 *   - every literal in redactText is replaced with "[redacted]";
 *   - every element matched by mask is painted over in the capture;
 *   - AFTER redaction the visible text is scanned again, and a screen that still shows an email address
 *     or a phone number is NOT written. The run exits 4 and names the screen.
 * Names cannot be found by a pattern. Pass them in redactText or mask their cells, and LOOK at every
 * capture before it is used (build-case-study §8, "check every frame for people").
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const JWT_FILE = path.join(ROOT, 'scripts', '.ali_admin_jwt.txt');
const BASE_DEFAULT = 'https://enterprise.colaberry.ai';
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Separators optional: a bare "4254452358" was missed on the first live capture (2026-11-18), and the
// re-scan used the same pattern, so the leak check passed it too. Never relax this without the test below.
const PHONE = /(?<!\d)(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/g;

function loadPlaywright() {
  for (const p of [path.join(ROOT, 'node_modules', 'playwright'), path.join(ROOT, 'frontend', 'node_modules', 'playwright'), 'playwright']) {
    try { return require(p); } catch { /* next */ }
  }
  throw new Error('playwright not found: run npm install at the repo root');
}
// App Control blocks Playwright's bundled Chromium on this machine (0x11C7); Edge is allowed.
const launch = (chromium, headless) => chromium.launch({ channel: 'msedge', headless });

function jwtExp(token) {
  try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).exp * 1000; } catch { return 0; }
}
function readSession() {
  const t = (process.env.ADMIN_JWT || (fs.existsSync(JWT_FILE) ? fs.readFileSync(JWT_FILE, 'utf8') : '')).trim();
  return t && jwtExp(t) > Date.now() + 5 * 60_000 ? t : null;
}

async function login(base) {
  const { chromium } = loadPlaywright();
  const browser = await launch(chromium, false);
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await page.goto(`${base}/admin/login`);
  console.log('[login] Sign in in the Edge window that just opened. Waiting up to 15 minutes...');
  const deadline = Date.now() + 15 * 60_000;
  let token = null;
  while (Date.now() < deadline && !token) {
    if (page.isClosed()) { console.error('[login] the window was closed before signing in finished; run --login again'); process.exit(3); }
    await new Promise((r) => setTimeout(r, 2000));
    token = await page.evaluate(() => localStorage.getItem('admin_token')).catch(() => null);
    if (token && jwtExp(token) < Date.now()) token = null;
  }
  await browser.close().catch(() => {});
  if (!token) { console.error('[login] no admin session within 15 minutes'); process.exit(3); }
  fs.writeFileSync(JWT_FILE, token, { mode: 0o600 });
  console.log(`[login] saved; valid until ${new Date(jwtExp(token)).toISOString()}`);
}

/** Person names from admin API endpoints: every string field whose key ends in "name". */
async function namesFrom(base, token, endpoints) {
  const out = new Set();
  const walk = (v, k) => {
    if (Array.isArray(v)) return v.forEach((x) => walk(x, k));
    if (v && typeof v === 'object') return Object.entries(v).forEach(([kk, vv]) => walk(vv, kk));
    // A bare `name` key also holds project and agent names on some endpoints, so it counts only when the
    // value looks like a person: two to four capitalized words, letters only.
    const personLike = (x) => /^\p{Lu}[\p{L}'.-]*(\s+\p{Lu}[\p{L}'.-]*){1,3}$/u.test(x);
    const nameKey = /^(full|first|last|display|student|intern|applicant|preferred)_?name$/i.test(k || '') || (/^name$/i.test(k || '') && typeof v === 'string' && personLike(v.trim()));
    if (typeof v === 'string' && nameKey && /^[\p{L}' .-]{2,60}$/u.test(v.trim())) {
      const n = v.trim(); out.add(n);
      for (const part of n.split(/\s+/)) if (part.length > 2) out.add(part);
    }
  };
  for (const e of endpoints || []) {
    const r = await fetch(base + e, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) { console.error(`[names] ${e} answered ${r.status}: refusing to capture without its names`); process.exit(5); }
    walk(await r.json());
  }
  return [...out];
}

async function capture(specFile, outDir) {
  const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
  const base = spec.base || BASE_DEFAULT;
  const token = readSession();
  if (!token) { console.error('No usable admin session. Run with --login first (one minute, at the START of the build).'); process.exit(3); }
  fs.mkdirSync(outDir, { recursive: true });
  const { chromium } = loadPlaywright();
  const browser = await launch(chromium, true);
  const manifest = [];
  let leaked = 0;
  for (const s of spec.screens) {
    const ctx = await browser.newContext({ viewport: s.viewport || { width: 1440, height: 900 }, colorScheme: 'light' });
    await ctx.addInitScript((t) => { try { localStorage.setItem('admin_token', t); } catch { /* opaque origin */ } }, token);
    const page = await ctx.newPage();
    await page.goto(base + s.path, { waitUntil: 'networkidle', timeout: 90_000 });
    if (/\/admin\/login/.test(page.url())) { console.error(`[${s.name}] bounced to login: the session was refused`); process.exit(3); }
    for (const st of s.steps || []) {
      if (st.click) await page.locator(st.click).first().click({ timeout: 20_000 });
      if (st.waitFor) await page.locator(st.waitFor).first().waitFor({ timeout: 30_000 });
      if (st.wait) await page.waitForTimeout(st.wait);
    }
    await page.waitForTimeout(s.settle || 1500);
    await page.evaluate(({ extra, emailSrc, phoneSrc }) => {
      const email = new RegExp(emailSrc, 'gi'); const phone = new RegExp(phoneSrc, 'g');
      const lits = extra.filter(Boolean).sort((a, b) => b.length - a.length);
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
      for (const n of nodes) {
        let v = n.nodeValue;
        v = v.replace(email, 'name@example.com').replace(phone, '(555) 010-0000');
        for (const l of lits) v = v.split(l).join('[redacted]');
        n.nodeValue = v;
      }
      for (const el of document.querySelectorAll('input,textarea')) {
        el.value = String(el.value || '').replace(email, 'name@example.com').replace(phone, '(555) 010-0000');
      }
    }, { extra: [...(s.redactText || []), ...(await namesFrom(base, token, s.redactNamesFrom))].filter((x) => !(s.keepWords || []).includes(x)), emailSrc: EMAIL.source, phoneSrc: PHONE.source });
    const left = await page.evaluate(({ emailSrc, phoneSrc }) => {
      const t = document.body.innerText;
      return [...(t.match(new RegExp(emailSrc, 'gi')) || []), ...(t.match(new RegExp(phoneSrc, 'g')) || [])].filter((x) => x !== 'name@example.com' && x !== '(555) 010-0000');
    }, { emailSrc: EMAIL.source, phoneSrc: PHONE.source });
    if (left.length) { console.error(`[${s.name}] NOT WRITTEN: ${left.length} contact detail(s) still visible after redaction`); leaked += 1; await ctx.close(); continue; }
    const file = path.join(outDir, `${s.name}.png`);
    const opts = { path: file, mask: (s.mask || []).map((m) => page.locator(m)), maskColor: '#c8ced8' };
    if (s.clip) await page.locator(s.clip).first().screenshot(opts);
    else await page.screenshot(s.clipRect ? { ...opts, clip: s.clipRect, fullPage: true } : opts);
    const md5 = crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex');
    manifest.push({ name: s.name, path: s.path, file: path.basename(file), md5, capturedAt: new Date().toISOString() });
    console.log(`[${s.name}] ok ${md5.slice(0, 8)}`);
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify({ base, screens: manifest }, null, 1));
  if (leaked) process.exit(4);
}

module.exports = { EMAIL, PHONE };
if (require.main === module) (async () => {
  const a = process.argv.slice(2);
  const val = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
  if (a.includes('--check')) { const t = readSession(); console.log(t ? `admin session valid until ${new Date(jwtExp(t)).toISOString()}` : 'no usable admin session: run --login'); process.exit(t ? 0 : 3); }
  if (a.includes('--login')) return login(val('--base') || BASE_DEFAULT);
  if (val('--spec')) return capture(val('--spec'), val('--out') || path.join(process.cwd(), 'app-screens'));
  console.log('usage: --check | --login [--base URL] | --spec <file> --out <dir>');
})().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
