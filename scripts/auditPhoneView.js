#!/usr/bin/env node
/**
 * Phone-view audit: load the learner experience at iPhone size on PRODUCTION and
 * measure, per page, whether it fits the screen.
 *
 * Why this exists (C126): most ad-funnel learners arrive on a phone, and Ali found
 * the experience "like only getting to see a piece of the big screen": sideways
 * scrolling, the video off to the right, the page dimmed. Nothing measured that.
 * This does, so a fix can be proven and the regression caught next time.
 *
 * Per page it records:
 *   - scrollWidth vs the phone's width (any sideways scroll at all is a fail)
 *   - the OUTERMOST elements that stick out past the right/left edge (the culprits)
 *   - full-screen fixed layers (backdrops) that are visible, i.e. "the page is dimmed"
 *   - a viewport screenshot (what the phone actually shows, 390px css wide)
 *
 * Auth: public pages load signed out. Portal pages load as a REAL member through the
 * admin "View as member" path, which is READ-ONLY server-side (every write refused),
 * so the audit can never change a learner's data. No token is printed.
 *
 * Usage:
 *   node scripts/auditPhoneView.js --member <email> [--out <dir>] [--base <url>]
 *   Admin JWT: ADMIN_JWT env or scripts/.ali_admin_jwt.txt (gitignored).
 *   Exit code 1 when any page scrolls sideways, so it can gate a deploy.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const BASE = opt('base', 'https://enterprise.colaberry.ai');
const MEMBER = opt('member', null);
const OUT = path.resolve(opt('out', `docs/screenshots/${new Date().toISOString().slice(0, 10)}-phone-audit`));
const ROOT = path.resolve(__dirname, '..');
const readIf = (p) => { try { return fs.readFileSync(p, 'utf8').trim(); } catch { return ''; } };
const ADMIN_JWT = process.env.ADMIN_JWT || readIf(path.join(__dirname, '.ali_admin_jwt.txt'))
  || readIf(path.join(ROOT, 'scripts', '.ali_admin_jwt.txt'));

/** Never print a token: Playwright errors echo the navigated URL, and the view-as URL carries one. */
const scrub = (s) => String(s)
  .replace(/#t=[^\s"']+/g, '#t=<redacted>')
  .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '<jwt-redacted>');

/** iPhone 13/14: the most common phone width in the ad traffic. */
const PHONE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
};

const PUBLIC_PAGES = [
  { slug: 'p01-home', route: '/' },
  { slug: 'p02-open-house', route: '/open-house' },
  { slug: 'p03-signup', route: '/portal/signup' },
  { slug: 'p04-login', route: '/portal/login' },
];
const PORTAL_PAGES = [
  '/portal/today', '/portal/path', '/portal/classroom', '/portal/projects', '/portal/schedule',
  '/portal/events', '/portal/points', '/portal/portfolio', '/portal/cert-prep', '/portal/community',
  '/portal/rooms', '/portal/library', '/portal/settings',
].map((route, i) => ({ slug: `m${String(i + 1).padStart(2, '0')}-${route.split('/').pop()}`, route }));

/** Runs inside the page. Pure DOM measurement, no writes. */
function measure() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const sw = Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0);
  const describe = (el) => {
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
    const txt = (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls ? '.' + cls : ''}${txt ? ` "${txt}"` : ''}`;
  };
  const clippedByAncestor = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (/(hidden|auto|scroll|clip)/.test(cs.overflowX)) {
        const pr = p.getBoundingClientRect();
        if (pr.right <= vw + 2 && pr.left >= -2) return true;
      }
    }
    return false;
  };
  const sticking = new Set();
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    if ((r.right > vw + 2 || r.left < -2) && !clippedByAncestor(el)) sticking.add(el);
  }
  // Keep only the outermost: an element whose ancestor also sticks out is a symptom, not the cause.
  const outermost = [...sticking].filter((el) => {
    for (let p = el.parentElement; p; p = p.parentElement) if (sticking.has(p)) return false;
    return true;
  });
  const offenders = outermost.slice(0, 12).map((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { el: describe(el), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width),
      position: cs.position, minWidth: cs.minWidth, gridCols: cs.display === 'grid' ? cs.gridTemplateColumns : undefined };
  });
  const overlays = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) continue;
    const r = el.getBoundingClientRect();
    if (r.width * r.height < vw * vh * 0.6) continue;
    const bg = cs.backgroundColor;
    const tinted = bg && bg !== 'transparent' && !/rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\s*\)/.test(bg);
    if (tinted || cs.backdropFilter !== 'none') overlays.push({ el: describe(el), bg, w: Math.round(r.width), h: Math.round(r.height) });
  }
  return { vw, scrollWidth: sw, sideways: sw > vw + 1, offenders, overlays: overlays.slice(0, 5),
    h1: (document.querySelector('h1,h2')?.innerText || '').trim().slice(0, 60), url: location.pathname };
}

async function auditPage(page, item, dir) {
  const out = { ...item };
  try {
    const resp = await page.goto(`${BASE}${item.route}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    out.status = resp ? resp.status() : null;
  } catch (e) {
    out.status = 'timeout';
  }
  await page.waitForTimeout(5000);
  Object.assign(out, await page.evaluate(measure));
  const shot = path.join(dir, `${item.slug}.png`);
  await page.screenshot({ path: shot, fullPage: false });
  out.screenshot = path.relative(OUT, shot);
  const flag = out.sideways ? `SIDEWAYS ${out.scrollWidth}px` : 'fits';
  console.log(`${item.slug.padEnd(16)} ${String(out.status).padEnd(4)} ${flag.padEnd(16)} overlays:${out.overlays.length} -> ${out.url}`);
  for (const o of out.offenders.slice(0, 4)) console.log(`    sticks out: ${o.el} [${o.left}..${o.right}] w${o.width} ${o.position}${o.gridCols ? ' grid:' + o.gridCols : ''}`);
  for (const o of out.overlays) console.log(`    overlay: ${o.el} ${o.bg}`);
  return out;
}

async function viewAsUrl(member) {
  const get = async (p) => {
    const r = await fetch(`${BASE}${p}`, { headers: { Authorization: `Bearer ${ADMIN_JWT}` }, signal: AbortSignal.timeout(20_000) });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  // --member takes an enrollment id directly (the student search omits $0 Explorer accounts) or an email.
  let id = member;
  if (member.includes('@')) {
    const s = await get(`/api/admin/students?search=${encodeURIComponent(member)}`);
    const hit = (s.body?.students || []).find((x) => String(x.email || '').toLowerCase() === member.toLowerCase());
    if (!hit) throw new Error(`no enrollment found by search for that email (status ${s.status}); pass the enrollment id instead`);
    id = hit.id;
  }
  const v = await get(`/api/admin/accelerator/enrollments/${id}/view-as-token`);
  if (!v.body?.url) throw new Error(`view-as-token refused (status ${v.status})`);
  return v.body.url;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const results = [];
  try {
    const pub = await browser.newContext(PHONE);
    const pp = await pub.newPage();
    for (const item of PUBLIC_PAGES) results.push(await auditPage(pp, item, OUT));
    await pub.close();

    if (MEMBER) {
      if (!ADMIN_JWT) throw new Error('no admin JWT (ADMIN_JWT or scripts/.ali_admin_jwt.txt)');
      const ctx = await browser.newContext(PHONE);
      const page = await ctx.newPage();
      await page.goto(await viewAsUrl(MEMBER), { waitUntil: 'domcontentloaded', timeout: 45_000 });
      console.log(`[view-as] read-only session for the member landed on ${new URL(page.url()).pathname}`);
      for (const item of PORTAL_PAGES) results.push(await auditPage(page, item, OUT));
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(OUT, '_phone_audit.json'), JSON.stringify({ base: BASE, phone: PHONE.viewport, at: new Date().toISOString(), results }, null, 2));
  const bad = results.filter((r) => r.sideways);
  console.log(`\n${results.length} pages, ${bad.length} scroll sideways, ${results.filter((r) => r.overlays.length).length} with a full-screen layer. -> ${OUT}`);
  process.exit(bad.length ? 1 : 0);
})().catch((e) => { console.error(`[phone-audit] ${scrub(e.message)}`); process.exit(2); });
