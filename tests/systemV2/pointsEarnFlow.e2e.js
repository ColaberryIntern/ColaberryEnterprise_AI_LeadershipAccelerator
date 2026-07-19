/**
 * pointsEarnFlow.e2e.js — end-to-end regression guard for the portal points loop.
 *
 * Proves the whole earn contract against a LIVE target:
 *   1. a card completion awards EXACTLY the card's "+N pts" badge value (sum of
 *      card.points) — the badge↔HUD parity that must never drift,
 *   2. GET /api/portal/points rises by that award,
 *   3. the top-bar HUD renders the new total in the browser, and
 *   4. clicking the HUD deep-links to Settings ▸ Points.
 *
 * No test framework is added — this uses raw Playwright (already a dependency,
 * used by scripts/capture*.js) + Node's global fetch. A fresh throwaway guest
 * (@colaberry-test.local) is created per run, so it is safe to re-run.
 *
 * Usage:
 *   node tests/systemV2/pointsEarnFlow.e2e.js
 *   BASE_URL=http://localhost:9999 node tests/systemV2/pointsEarnFlow.e2e.js
 * Exit 0 = all checks pass, 1 = one or more failed.
 */
const path = require('path');
const { chromium } = require('playwright');

const BASE = (process.env.BASE_URL || 'https://enterprise.colaberry.ai').replace(/\/$/, '');

const jsonHeaders = { 'Content-Type': 'application/json' };
const auth = (token) => ({ ...jsonHeaders, Authorization: `Bearer ${token}` });
async function api(pathname, opts = {}) {
  const res = await fetch(`${BASE}${pathname}`, opts);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}
const badgeOf = (card) => {
  const p = (card && card.points) || {};
  return (p.learning || 0) + (p.builder || 0) + (p.community || 0);
};

let failures = 0;
function check(name, ok, detail) {
  if (ok) console.log(`  ✓ ${name}`);
  else { console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); failures++; }
}
function finish() {
  console.log(failures === 0 ? '\n[e2e] PASS' : `\n[e2e] FAIL (${failures} failed check(s))`);
  process.exit(failures === 0 ? 0 : 1);
}

async function main() {
  console.log(`[e2e] Points earn flow against ${BASE}`);

  // 1) fresh throwaway guest
  const email = `e2e-points-${Date.now()}@colaberry-test.local`;
  const signup = await api('/api/portal/free-signup', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ full_name: 'E2E Points', email }) });
  const token = signup.body.jwt;
  check('free-signup returns a participant JWT', !!token, `status ${signup.status}`);
  if (!token) return finish();

  // 2) baseline points total
  const before = await api('/api/portal/points', { headers: auth(token) });
  check('GET /api/portal/points (baseline) is 200', before.status === 200, `status ${before.status}`);
  const total0 = before.body.total ?? 0;

  // 3) find an available, non-gated card that carries points
  const feed = await api('/api/portal/classroom', { headers: auth(token) });
  check('classroom feed loads with cards', Array.isArray(feed.body.cards) && feed.body.cards.length > 0, `status ${feed.status}`);
  const GATED = new Set(['media', 'survey', 'quiz', 'evaluation']); // need watch-gate / bespoke submit flows
  const candidates = (feed.body.cards || []).filter((c) => c.status === 'available' && !GATED.has(c.render_band) && badgeOf(c) > 0);
  check('found at least one completable card with points', candidates.length > 0, `${candidates.length} candidates`);

  // 4) complete it — the award must equal the card's badge value
  let earned = null;
  for (const card of candidates) {
    const comp = await api(`/api/portal/classroom/cards/${card.id}/complete`, { method: 'POST', headers: auth(token) });
    if (comp.status === 200 && typeof comp.body.points_awarded === 'number' && comp.body.points_awarded > 0) {
      earned = { card, expected: badgeOf(card), awarded: comp.body.points_awarded };
      break;
    }
  }
  check('a card completed and awarded points', !!earned, earned ? '' : 'no candidate completed with points');
  if (!earned) return finish();
  check(`award (${earned.awarded}) equals the card badge (${earned.expected}) [${earned.card.render_band}]`, earned.awarded === earned.expected);

  // 5) the points total rose by exactly the award
  const after = await api('/api/portal/points', { headers: auth(token) });
  const total1 = after.body.total ?? 0;
  check(`points total rose by the award (${total0} -> ${total1}, +${earned.awarded})`, total1 === total0 + earned.awarded);

  // 6) browser: the HUD renders the new total, and clicking it deep-links to Points
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext();
    await ctx.addInitScript((t) => localStorage.setItem('participant_token', t), token);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/portal/classroom`, { waitUntil: 'networkidle', timeout: 30000 });
    const hud = page.locator('.te-hud .pts').first();
    await hud.waitFor({ timeout: 15000 });
    const hudText = (await hud.innerText()).trim();
    check(`HUD shows the new total (rendered "${hudText}", expected ${total1})`, hudText.replace(/[^0-9]/g, '').includes(String(total1)));

    await page.locator('.te-hud').first().click();
    await page.waitForURL(/\/portal\/settings\?tab=points/, { timeout: 10000 }).catch(() => {});
    check('clicking the HUD lands on Settings ▸ Points', /\/portal\/settings\?tab=points/.test(page.url()), page.url());

    const shot = path.join(__dirname, 'logs', `points-e2e-${Date.now()}.png`);
    await page.screenshot({ path: shot, fullPage: false }).catch(() => {});
    console.log(`  ℹ screenshot: ${shot}`);
  } finally {
    await browser.close();
  }

  finish();
}

main().catch((err) => { console.error('[e2e] fatal', err); process.exit(1); });
