#!/usr/bin/env node
/**
 * Capture every portal section AS a set of members, through the admin
 * "View as member" path, and record whether each section actually loaded.
 *
 * Why this exists: after converting the eight existing interns onto the AI
 * Internship platform (2026-09-21) Ali asked for proof that "they can access all
 * sections successfully" — real screenshots, not a claim. Nothing here is
 * intern-specific: hand it any roster of emails and it does the same for them.
 *
 * How it gets in: for each email it asks `/api/admin/students?search=` for the
 * enrollment id, then `/api/admin/accelerator/enrollments/:id/view-as-token` for
 * the read-only view-as URL — the same audited route the admin UI's button hits
 * (`read_only: true`, `impersonated_by: <admin>`, every write refused server-side).
 * No token is minted here; the admin JWT must already exist.
 *
 * Usage:
 *   node scripts/captureViewAsPortalSections.js --roster tmp/roster.json \
 *        [--out docs/screenshots/<date>-<context>] [--base https://enterprise.colaberry.ai]
 *
 *   roster.json: [{ "email": "...", "label": "Harpreet Kaur" }, ...]
 *   Admin JWT:   scripts/.ali_admin_jwt.txt (gitignored) or ADMIN_JWT env.
 *
 * Output: <out>/<NN-slug>/<section>.png plus <out>/_summary.json with one entry per
 * (member, section): http status, whether it bounced to /portal/login, any error
 * text found in the DOM, the page's H1, and the capture-helper width ledger.
 *
 * Every screenshot goes through scripts/captureHelpers.js (≤1800px wide).
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { createSafeContext, safeScreenshot, writeCaptureSummary } = require('./captureHelpers');

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const BASE = opt('base', process.env.CAPTURE_BASE || 'https://enterprise.colaberry.ai');
const ROSTER_PATH = opt('roster', null);
const OUT_DIR = path.resolve(opt('out', `docs/screenshots/${new Date().toISOString().slice(0, 10)}-view-as`));
/**
 * Admin auth, in order: ADMIN_JWT env → scripts/.ali_admin_jwt.txt → bridged from
 * scripts/.ali_jwt.txt. The bridge is `POST /api/portal/mgmt/enter`, the same call
 * the portal's "Management" button makes for a staff member: it returns the 12h
 * admin token scoped to their mgmt role. The bridged token lives in memory only.
 */
let ADMIN_JWT = (process.env.ADMIN_JWT || readIfExists(path.join(__dirname, '.ali_admin_jwt.txt')) || '').trim();

/** The sections TodayShell links to, in nav order. */
const SECTIONS = [
  { slug: '01-today',      route: '/portal/today',      label: 'Today' },
  { slug: '02-internship', route: '/portal/internship', label: 'Internship' },
  { slug: '03-path',       route: '/portal/path',       label: 'Path' },
  { slug: '04-classroom',  route: '/portal/classroom',  label: 'Classroom' },
  { slug: '05-projects',   route: '/portal/projects',   label: 'Projects' },
  { slug: '06-schedule',   route: '/portal/schedule',   label: 'Schedule' },
  { slug: '07-events',     route: '/portal/events',     label: 'Events' },
  { slug: '08-points',     route: '/portal/points',     label: 'Points' },
  { slug: '09-portfolio',  route: '/portal/portfolio',  label: 'Portfolio' },
  { slug: '10-cert-prep',  route: '/portal/cert-prep',  label: 'Cert Prep' },
  { slug: '11-community',  route: '/portal/community',  label: 'Community' },
  { slug: '12-rooms',      route: '/portal/rooms',      label: 'Rooms' },
  { slug: '13-library',    route: '/portal/library',    label: 'Library' },
  { slug: '14-company',    route: '/portal/company',    label: 'Company' },
  { slug: '15-settings',   route: '/portal/settings',   label: 'Settings' },
];

/** Text that means the section did NOT load, regardless of HTTP status. */
const ERROR_PATTERNS = [
  /Something went wrong/i,
  /An unexpected error occurred/i,
  /Could not load/i,
  /Failed to load/i,
  /content_requires_paid/i,
  /No view-as token provided/i,
  /Your session has expired/i,
];

function readIfExists(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function jwtExpired(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    return !payload.exp || payload.exp * 1000 < Date.now() + 60_000;
  } catch { return true; }
}

async function bridgeAdminFromPortalToken() {
  const portalToken = (readIfExists(path.join(__dirname, '.ali_jwt.txt')) || '').trim();
  if (!portalToken || jwtExpired(portalToken)) return null;
  const res = await fetch(`${BASE}/api/portal/mgmt/enter`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${portalToken}`, 'Content-Type': 'application/json' },
  });
  if (res.status !== 200) {
    console.error(`[auth] mgmt bridge refused: ${res.status} ${(await res.text()).slice(0, 120)}`);
    return null;
  }
  const body = await res.json();
  console.log(`[auth] bridged admin session from the portal token (role ${body.role}, ${body.sections?.length ?? '?'} sections, 12h)`);
  return body.admin_token || null;
}

async function adminGet(pathname) {
  const res = await fetch(`${BASE}${pathname}`, { headers: { Authorization: `Bearer ${ADMIN_JWT}` } });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* non-JSON error page */ }
  return { status: res.status, body, text };
}

async function resolveEnrollment(email) {
  const r = await adminGet(`/api/admin/students?search=${encodeURIComponent(email)}`);
  if (r.status !== 200) throw new Error(`students search ${r.status}: ${r.text.slice(0, 120)}`);
  const hit = (r.body?.students || []).find((s) => String(s.email || '').toLowerCase() === email.toLowerCase());
  if (!hit) throw new Error(`no student with email ${email}`);
  return hit;
}

async function viewAsUrl(enrollmentId) {
  const r = await adminGet(`/api/admin/accelerator/enrollments/${enrollmentId}/view-as-token`);
  if (r.status !== 200 || !r.body?.url) throw new Error(`view-as-token ${r.status}: ${r.text.slice(0, 120)}`);
  return r.body.url;
}

const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

async function captureMember(browser, member, index) {
  const memberDir = path.join(OUT_DIR, `${String(index + 1).padStart(2, '0')}-${slugify(member.label || member.email)}`);
  fs.mkdirSync(memberDir, { recursive: true });

  // View-as is sessionStorage-scoped to the tab, so one context + one page per member.
  // token: '' — do NOT inject the default .ali_jwt.txt participant token; the member's
  // read-only view-as session must be the only auth in this context.
  const context = await createSafeContext(browser, { token: '', label: 'safe' });
  const page = await context.newPage();
  const entries = [];

  const landing = await page.goto(member.viewAsUrl, { waitUntil: 'networkidle', timeout: 45_000 });
  await page.waitForTimeout(1500);
  const landedOn = page.url();
  const viewerOk = /\/portal\/(today|internship)/.test(landedOn);
  console.log(`[view-as] ${member.label.padEnd(24)} landed → ${landedOn} ${viewerOk ? 'ok' : '⚠ NOT SIGNED IN'}`);

  for (const s of SECTIONS) {
    const out = path.join(memberDir, `${s.slug}.png`);
    const entry = { member: member.label, email: member.email, enrollment_id: member.enrollmentId, section: s.label, route: s.route, file: null };
    process.stdout.write(`  ${s.slug.padEnd(16)} `);
    try {
      const resp = await page.goto(`${BASE}${s.route}`, { waitUntil: 'networkidle', timeout: 45_000 });
      await page.waitForTimeout(2000);
      const finalUrl = page.url();
      const bodyText = await page.evaluate(() => document.body?.innerText || '');
      const h1 = await page.evaluate(() => (document.querySelector('h1, h2')?.textContent || '').trim().slice(0, 120));
      const errorHit = ERROR_PATTERNS.find((re) => re.test(bodyText));
      const shot = await safeScreenshot(page, out, { fullPage: true, label: 'safe' });
      Object.assign(entry, {
        file: path.relative(OUT_DIR, out).replace(/\\/g, '/'),
        status: resp ? resp.status() : 'no-response',
        finalUrl,
        bouncedToLogin: /\/portal\/login/.test(finalUrl),
        stayedOnRoute: finalUrl.includes(s.route),
        errorText: errorHit ? errorHit.source : null,
        h1,
        textLength: bodyText.length,
        originalWidth: shot.originalWidth,
        finalWidth: shot.finalWidth,
        downscaled: shot.downscaled,
      });
      entry.ok = !entry.bouncedToLogin && !entry.errorText && entry.textLength > 80;
      console.log(`${entry.status} ${entry.ok ? 'ok' : '⚠ ' + (entry.bouncedToLogin ? 'login' : entry.errorText || 'thin page')}  ${h1 ? '“' + h1.slice(0, 50) + '”' : ''}`);
    } catch (err) {
      entry.error = err.message;
      entry.ok = false;
      console.log(`FAIL ${err.message.slice(0, 100)}`);
    }
    entries.push(entry);
  }

  await context.close();
  return { landing: landing ? landing.status() : 'no-response', landedOn, viewerOk, entries };
}

async function main() {
  if (!ROSTER_PATH) { console.error('--roster <file> is required'); process.exit(2); }
  if (!ADMIN_JWT || jwtExpired(ADMIN_JWT)) {
    if (ADMIN_JWT) console.log('[auth] stored admin JWT is expired; trying the portal → management bridge');
    ADMIN_JWT = await bridgeAdminFromPortalToken();
  }
  if (!ADMIN_JWT) { console.error('No usable admin JWT: refresh scripts/.ali_admin_jwt.txt, set ADMIN_JWT, or keep a valid scripts/.ali_jwt.txt for the bridge'); process.exit(2); }
  const roster = JSON.parse(fs.readFileSync(ROSTER_PATH, 'utf8'));
  const members = Array.isArray(roster) ? roster : roster.interns || roster.members || [];
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`[capture] base ${BASE}\n[capture] out  ${OUT_DIR}\n[capture] members ${members.length}`);

  // Resolve everyone first so a bad email fails before any browser work. A roster
  // row may carry `enrollment_id` already (the students search matches names, not
  // emails, so an email-only row can miss); use it when present.
  const resolved = [];
  for (const m of members) {
    const enrollmentId = m.enrollment_id || (await resolveEnrollment(m.email)).enrollment_id;
    const url = await viewAsUrl(enrollmentId);
    resolved.push({ email: m.email, label: m.label || m.full_name || m.email, enrollmentId, viewAsUrl: url });
    console.log(`[resolve] ${m.email.padEnd(32)} → ${enrollmentId}`);
  }

  const browser = await chromium.launch({ headless: true });
  const all = [];
  const perMember = [];
  for (let i = 0; i < resolved.length; i += 1) {
    const r = await captureMember(browser, resolved[i], i);
    perMember.push({ member: resolved[i].label, email: resolved[i].email, enrollment_id: resolved[i].enrollmentId, landing: r.landing, landedOn: r.landedOn, viewerOk: r.viewerOk, sectionsOk: r.entries.filter((e) => e.ok).length, sections: r.entries.length });
    all.push(...r.entries);
  }
  await browser.close();

  writeCaptureSummary(OUT_DIR, all);
  fs.writeFileSync(path.join(OUT_DIR, '_members.json'), JSON.stringify({ base: BASE, captured_at: new Date().toISOString(), sections: SECTIONS, members: perMember }, null, 2));

  const failed = all.filter((e) => !e.ok);
  console.log(`\n[capture] ${all.length - failed.length}/${all.length} sections loaded across ${resolved.length} members`);
  for (const f of failed) console.log(`  ⚠ ${f.member} · ${f.section}: ${f.error || f.errorText || (f.bouncedToLogin ? 'bounced to login' : 'thin page')}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => { console.error('[capture] FATAL', err); process.exit(1); });
