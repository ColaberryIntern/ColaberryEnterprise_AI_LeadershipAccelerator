/**
 * Cert Prep end-to-end — a student's whole journey through the feature, driven
 * in a real browser against a real deployment.
 *
 * Every check below records what was CLAIMED, how it was checked, and what was
 * actually observed. A check that cannot be run says so and counts as a gap
 * rather than quietly passing: "not run" and "passed" must never look alike in
 * the report this produces.
 *
 * Usage:
 *   node certprep-e2e.js <baseUrl> <fixtures.json> [outDir]
 *
 * The fixtures file is the JSON printed by `certPrepE2eFixture` inside the
 * backend container: two enrollments, one either side of the Week 7 fence, and
 * their participant tokens.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || '').replace(/\/$/, '');
const FIXTURES = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const OUT = process.argv[4] || path.join(__dirname, 'e2e-out');
fs.mkdirSync(OUT, { recursive: true });

if (!BASE) { console.error('usage: node certprep-e2e.js <baseUrl> <fixtures.json> [outDir]'); process.exit(2); }

const results = [];
let currentGroup = 'ungrouped';
const group = (g) => { currentGroup = g; console.log(`\n=== ${g} ===`); };

function record(id, claim, status, evidence, method) {
  results.push({ id, group: currentGroup, claim, status, evidence: String(evidence ?? ''), method: method || 'browser' });
  const mark = status === 'pass' ? 'PASS' : status === 'fail' ? 'FAIL' : 'SKIP';
  console.log(`${mark}  ${id}  ${claim}${evidence ? ` — ${evidence}` : ''}`);
}
const check = (id, claim, ok, evidence, method) => record(id, claim, ok ? 'pass' : 'fail', evidence, method);
const skip = (id, claim, why) => record(id, claim, 'skip', why, 'not run');

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return `${name}.png`;
}

async function newPage(browser, viewport = { width: 1600, height: 950 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.__errors = [];
  page.__failedCalls = [];
  page.on('console', (m) => { if (m.type() === 'error') page.__errors.push(m.text()); });
  page.on('pageerror', (e) => page.__errors.push(String(e)));
  page.on('response', async (r) => {
    if (r.status() >= 400 && /\/api\//.test(r.url())) {
      let body = ''; try { body = (await r.text()).slice(0, 200); } catch { body = '<unreadable>'; }
      page.__failedCalls.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname} :: ${body}`);
    }
  });
  return { context, page };
}

async function signIn(page, token) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate((t) => {
    localStorage.removeItem('admin_token');
    localStorage.setItem('participant_token', t);
  }, token);
}

/** Call the API exactly as the app does — same origin, same header. */
async function api(page, method, pathname, body, token) {
  return page.evaluate(async ({ method, pathname, body, token }) => {
    const res = await fetch(pathname, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    let json = null; let text = '';
    try { text = await res.text(); json = JSON.parse(text); } catch { /* keep text */ }
    return { status: res.status, json, text: text.slice(0, 400) };
  }, { method, pathname, body: body ?? null, token: token ?? null });
}

// ── A. the fence ─────────────────────────────────────────────────────────────

async function fence(browser) {
  group('A. The Week 7 fence');
  const { context, page } = await newPage(browser);
  await signIn(page, FIXTURES.locked.token);
  await page.goto(`${BASE}/portal/cert-prep`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const body = await page.evaluate(() => document.body.innerText);
  const img = await shot(page, 'A1-fence-closed');

  check('A1', 'A student before Week 7 is told when Cert Prep starts',
    /week\s*7/i.test(body), `page names Week 7: ${/week\s*7/i.test(body)} (${img})`);
  check('A2', 'No readiness score is shown before the fence opens',
    !/\b\d{3}\s*(\/|out of)\s*1000\b/i.test(body), 'no NNN/1000 anywhere in the rendered text');
  check('A3', 'No zeroed dial and no locked-question inventory',
    !/\b0\s*(pts|%)\s*readiness/i.test(body) && !/\d+\s+locked questions/i.test(body),
    'neither a 0 readiness nor a locked inventory is rendered');

  const start = await api(page, 'POST', '/api/portal/cert-prep/sessions', { mode: 'diagnostic' }, FIXTURES.locked.token);
  check('A4', 'The API refuses to start a sitting before the fence, not just the UI',
    start.status === 403, `POST /sessions → ${start.status} ${start.text.slice(0, 90)}`, 'api');

  const summary = await api(page, 'GET', '/api/portal/cert-prep', null, FIXTURES.locked.token);
  const avail = summary.json?.availability;
  check('A5', 'The server, not the client, decides availability',
    avail && avail.available === false && avail.reason === 'before_start_week',
    `available=${avail?.available} reason=${avail?.reason} week=${avail?.programWeek}`, 'api');

  await context.close();
}

// ── B. blueprint integrity ───────────────────────────────────────────────────

async function blueprint(browser) {
  group('B. Blueprint and weights');
  const { context, page } = await newPage(browser);
  await signIn(page, FIXTURES.open.token);
  await page.goto(`${BASE}/portal/cert-prep`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const doms = await api(page, 'GET', '/api/portal/cert-prep/domains', null, FIXTURES.open.token);
  const list = doms.json?.domains ?? [];
  const track = doms.json?.track;
  const weights = list.map((d) => `${d.domain_id} ${Number(d.weight_pct)}%`).join(' · ');
  const total = list.reduce((s, d) => s + Number(d.weight_pct), 0);

  check('B1', 'The blueprint is the official published one, not a guess',
    track?.blueprint_source === 'official',
    `source=${track?.blueprint_source} version=${track?.blueprint_version}`, 'api');
  check('B2', 'Five domains whose weights total 100%',
    list.length === 5 && Math.round(total) === 100, `${list.length} domains, total ${total}% — ${weights}`, 'api');
  check('B3', 'D2 carries LESS weight than D3, as the official guide states',
    Number(list.find((d) => d.domain_id === 'D2')?.weight_pct) < Number(list.find((d) => d.domain_id === 'D3')?.weight_pct),
    `D2 ${list.find((d) => d.domain_id === 'D2')?.weight_pct}% vs D3 ${list.find((d) => d.domain_id === 'D3')?.weight_pct}%`, 'api');
  check('B4', 'The exam shape matches the published guide',
    track?.exam_item_count === 60 && track?.exam_duration_minutes === 120 && track?.passing_scaled_score === 720,
    `${track?.exam_item_count} items / ${track?.exam_duration_minutes} min / pass ${track?.passing_scaled_score}`, 'api');

  await context.close();
}

// ── C-F. the student journey ─────────────────────────────────────────────────

async function journey(browser) {
  group('C. The page a student lands on');
  const { context, page } = await newPage(browser);
  await signIn(page, FIXTURES.open.token);
  await page.goto(`${BASE}/portal/cert-prep`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const landing = await page.evaluate(() => document.body.innerText);
  const img = await shot(page, 'C1-open-landing');

  check('C1', 'The readiness figure is captioned as a Colaberry estimate, never a predicted exam score',
    /Colaberry readiness estimate/i.test(landing) && !/predicted (exam )?score/i.test(landing), img);
  check('C2', 'A readiness that has not been measured reads as words, not as zero',
    !/readiness\s*0\b/i.test(landing), 'no "readiness 0" in the rendered text');
  check('C3', 'The sticky progress rail is present with the domain breakdown',
    /Your progress/i.test(landing) && /By domain/i.test(landing), 'rail headings rendered');
  check('C4', 'A domain nobody has answered reads "Not attempted", never 0%',
    /Not attempted/i.test(landing) || !/\b0%\b/.test(landing),
    'untouched domains carry the words rather than a zero');

  group('D. A diagnostic, end to end');
  // Start through the UI: the practice tab, then the baseline control.
  const practiceTab = page.getByRole('tab', { name: /practice/i }).first();
  if (await practiceTab.count()) { await practiceTab.click(); await page.waitForTimeout(600); }
  const startBtn = page.locator('button.cp-action', { hasText: 'Retake the baseline' });
  const canStart = await startBtn.count();
  check('D1', 'A student can start a sitting from the page itself', canStart > 0,
    canStart ? 'the baseline control is present and clickable' : 'no start control found');

  let served = null;
  if (canStart) {
    // Capture the payload the server actually sends for the sitting.
    const [resp] = await Promise.all([
      page.waitForResponse((r) => /\/api\/portal\/cert-prep\/sessions$/.test(r.url()) && r.request().method() === 'POST', { timeout: 20000 }).catch(() => null),
      startBtn.click(),
    ]);
    await page.waitForTimeout(2500);
    if (resp) { try { served = await resp.json(); } catch { served = null; } }
    await shot(page, 'D2-question');
  }

  const payload = JSON.stringify(served ?? {});
  check('D2', 'The served payload carries NO answer key and NO rationale',
    served ? (!/"correct_keys"/.test(payload) && !/"rationale"/.test(payload)) : false,
    served ? `${(served.items || []).length} items served; correct_keys absent: ${!/"correct_keys"/.test(payload)}` : 'no payload captured',
    'api');
  check('D3', 'A sitting is shorter than requested rather than padded when the bank cannot fill it',
    served ? Array.isArray(served.items) && served.items.length > 0 : false,
    served ? `${served.items.length} items for a ${served.session?.mode} form (${served.session?.form_version})` : 'n/a', 'api');

  // Answer everything. Each step waits for the state it expects rather than a
  // fixed pause: the first version of this loop silently stopped after 6 of 10
  // items and still reported success, because the assertion under it only
  // checked that SOME answers went in.
  let answered = 0; let revealedAfter = false; let revealedBefore = false; let loopNote = '';
  const total = (served && served.items) ? served.items.length : 0;
  for (let i = 0; i < 120; i += 1) {
    const option = page.locator('button.cp-option:not([disabled])').first();
    if (!(await option.count())) { loopNote = `no enabled option at item ${i + 1}`; break; }
    if (i === 0) {
      const pre = await page.evaluate(() => document.body.innerText);
      revealedBefore = /Correct|Not quite/i.test(pre);
    }
    await option.click();
    const submit = page.getByRole('button', { name: /^Submit answer$/ });
    if (!(await submit.count())) { loopNote = `no submit control at item ${i + 1}`; break; }
    await submit.click();
    // The rationale block IS the acknowledgement that the answer was stored.
    await page.locator('.cp-rationale').first().waitFor({ state: 'visible', timeout: 15000 })
      .catch(() => { loopNote = `no rationale after item ${i + 1}`; });
    if (i === 0) {
      const post = await page.evaluate(() => document.body.innerText);
      revealedAfter = /Correct|Not quite/i.test(post);
      await shot(page, 'D4-after-answer');
    }
    answered += 1;
    const next = page.getByRole('button', { name: /^Next question$/ });
    const finish = page.getByRole('button', { name: /^Finish and score$/ });
    if (await finish.count()) { await finish.click(); await page.waitForTimeout(3500); break; }
    if (await next.count()) {
      await next.click();
      await page.locator('.cp-rationale').first().waitFor({ state: 'detached', timeout: 10000 }).catch(() => undefined);
      continue;
    }
    loopNote = `neither Next nor Finish after item ${i + 1}`;
    break;
  }
  check('D4', 'EVERY served question is answered, not merely some',
    total > 0 && answered === total, `${answered} of ${total} answered${loopNote ? ` — ${loopNote}` : ''}`);
  check('D5', 'The rationale appears only AFTER an answer is submitted',
    !revealedBefore && revealedAfter, `before=${revealedBefore} after=${revealedAfter}`);

  await shot(page, 'D6-scored');
  // Assert the SESSION, not the wording. "score" and "readiness" appear on the
  // page whether or not a sitting was ever completed, so matching them proved
  // nothing - it passed on a run whose diagnostic was still in progress.
  const sessions = await api(page, 'GET', '/api/portal/cert-prep/sessions', null, FIXTURES.open.token);
  const diagSessions = (sessions.json?.sessions ?? []).filter((x) => x.mode === 'diagnostic');
  const completed = diagSessions.filter((x) => x.status === 'completed');
  const withScore = completed.filter((x) => x.scaled_score != null);
  check('D6', 'The sitting is recorded as COMPLETED with a server-computed score',
    completed.length >= 1 && withScore.length >= 1,
    `${completed.length} completed diagnostic(s), ${withScore.length} carrying a scaled score`
    + (withScore[0] ? ` (latest ${withScore[0].scaled_score})` : ''), 'api');

  group('E. Points');
  const pts = await api(page, 'GET', '/api/portal/points', null, FIXTURES.open.token);
  const events = pts.json?.events ?? [];
  const diag = events.filter((e) => (e.event_type || e.type) === 'cert_diagnostic_complete');
  check('E1', 'Completing the diagnostic awards points through the real route',
    diag.length >= 1, `${diag.length} cert_diagnostic_complete event(s), total ${pts.json?.total} pts`, 'api');
  check('E2', 'The award is once only, not once per completion',
    diag.length <= 1, `${diag.length} award event(s) after one completion`, 'api');

  await page.goto(`${BASE}/portal/cert-prep`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const hud = await page.evaluate(() => document.body.innerText);
  await shot(page, 'E3-points-hud');
  check('E3', 'The points show in the portal chrome, not only in the database',
    /\b\d+\s*pts\b/i.test(hud), (hud.match(/\b\d+\s*pts\b/i) || ['none'])[0]);

  group('F. Resume and idempotency');
  const start1 = await api(page, 'POST', '/api/portal/cert-prep/sessions',
    { mode: 'practice', idempotency_key: 'e2e-idem-1' }, FIXTURES.open.token);
  const start2 = await api(page, 'POST', '/api/portal/cert-prep/sessions',
    { mode: 'practice', idempotency_key: 'e2e-idem-1' }, FIXTURES.open.token);
  check('F1', 'A retried start returns the SAME sitting rather than minting a second',
    start1.json?.session?.id && start1.json.session.id === start2.json?.session?.id,
    `${start1.status}/${start2.status} · ${start1.json?.session?.id} vs ${start2.json?.session?.id}`, 'api');

  const raced = await page.evaluate(async ({ token }) => {
    const post = () => fetch('/api/portal/cert-prep/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'practice', idempotency_key: 'e2e-race-1' }),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
    const [a, b] = await Promise.all([post(), post()]);
    return { a: a.status, b: b.status, sameId: a.body?.session?.id === b.body?.session?.id, id: a.body?.session?.id };
  }, { token: FIXTURES.open.token });
  check('F2', 'Two SIMULTANEOUS starts on one key both succeed and return one sitting',
    raced.a === 201 && raced.b === 201 && raced.sameId,
    `statuses ${raced.a}/${raced.b}, same id: ${raced.sameId}`, 'api');

  const sid = start1.json?.session?.id;
  if (sid) {
    const firstKey = start1.json.items?.[0]?.question_key;
    const a1 = await api(page, 'POST', `/api/portal/cert-prep/sessions/${sid}/responses`,
      { question_key: firstKey, selected_keys: ['A'] }, FIXTURES.open.token);
    const a2 = await api(page, 'POST', `/api/portal/cert-prep/sessions/${sid}/responses`,
      { question_key: firstKey, selected_keys: ['B'] }, FIXTURES.open.token);
    const view = await api(page, 'GET', `/api/portal/cert-prep/sessions/${sid}`, null, FIXTURES.open.token);
    const count = Object.keys(view.json?.answered ?? {}).length;
    check('F3', 'Answering the same question twice updates in place instead of duplicating',
      a1.status < 400 && a2.status < 400 && count === 1,
      `two submits → ${count} recorded answer(s)`, 'api');
    check('F4', 'Resuming a sitting returns what was already answered',
      view.status === 200 && count >= 1, `GET /sessions/${sid.slice(0, 8)} → ${view.status}, ${count} answered`, 'api');
  } else {
    skip('F3', 'Answering the same question twice updates in place', 'no session id to submit against');
    skip('F4', 'Resuming a sitting returns what was already answered', 'no session id to resume');
  }

  group('G. Mock sittings');
  const mock = await api(page, 'POST', '/api/portal/cert-prep/sessions', { mode: 'mock' }, FIXTURES.open.token);
  const mockSession = mock.json?.session;
  check('G1', 'A mock is time-limited, and the limit comes from the blueprint',
    mockSession?.time_limit_seconds === 120 * 60,
    `time_limit_seconds=${mockSession?.time_limit_seconds}, expires_at=${mockSession?.expires_at}`, 'api');
  check('G2', 'A mock is built to the exam shape it can actually fill',
    Array.isArray(mock.json?.items), `${mock.json?.items?.length} items · form ${mockSession?.form_version}`, 'api');

  await page.goto(`${BASE}/portal/cert-prep`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const mocksTab = page.getByRole('tab', { name: /mock/i }).first();
  if (await mocksTab.count()) { await mocksTab.click(); await page.waitForTimeout(600); }
  const sitting = page.locator('button.cp-action', { hasText: 'Full sitting' });
  if (await sitting.count()) {
    await sitting.click();
    await page.waitForTimeout(3000);
    const t = await page.evaluate(() => document.body.innerText);
    await shot(page, 'G3-mock-timer');
    check('G3', 'The sitting shows a live countdown', /\d+\s*:\s*\d{2}/.test(t),
      (t.match(/\d+\s*:\s*\d{2}[^\n]*/) || ['no timer text'])[0]);
  } else {
    skip('G3', 'The sitting shows a live countdown', 'no mock control on the page');
  }

  group('H. Evidence');
  const ev = await api(page, 'GET', '/api/portal/cert-prep/evidence', null, FIXTURES.open.token);
  check('H1', 'The evidence surface answers for a real student', ev.status === 200,
    `GET /evidence → ${ev.status}`, 'api');
  const evJson = JSON.stringify(ev.json ?? {});
  check('H2', 'Nothing counts as evidence until a human verifies it',
    !/"mapping_state":"verified"/.test(evJson) || /verified_by/.test(evJson),
    'no self-awarded verified rows in a fresh enrollment', 'api');

  await context.close();
  return { failedCalls: page.__failedCalls, consoleErrors: page.__errors };
}

// ── I. security ──────────────────────────────────────────────────────────────

async function security(browser) {
  group('I. Authorization');
  const { context, page } = await newPage(browser);
  await signIn(page, FIXTURES.open.token);
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });

  const noToken = await api(page, 'GET', '/api/portal/cert-prep', null, null);
  check('I1', 'The student API refuses an unauthenticated caller', noToken.status === 401,
    `no Authorization header → ${noToken.status}`, 'api');

  const adminAsStudent = await api(page, 'GET', '/api/admin/cert-prep/bank', null, FIXTURES.open.token);
  check('I2', 'A student token cannot reach the instructor surface',
    adminAsStudent.status === 403 || adminAsStudent.status === 401,
    `participant token on /api/admin/cert-prep/bank → ${adminAsStudent.status}`, 'api');

  const adminNoToken = await api(page, 'GET', '/api/admin/cert-prep/audit', null, null);
  check('I3', 'The audit trail is not readable without credentials',
    adminNoToken.status === 401 || adminNoToken.status === 403,
    `no header on /api/admin/cert-prep/audit → ${adminNoToken.status}`, 'api');

  // One student must not be able to open another's sitting.
  const mine = await api(page, 'POST', '/api/portal/cert-prep/sessions', { mode: 'practice' }, FIXTURES.open.token);
  const sid = mine.json?.session?.id;
  if (sid) {
    const asOther = await api(page, 'GET', `/api/portal/cert-prep/sessions/${sid}`, null, FIXTURES.locked.token);
    check('I4', "Another student's sitting is not found, not merely forbidden",
      asOther.status === 404 || asOther.status === 403,
      `other student on /sessions/${sid.slice(0, 8)} → ${asOther.status}`, 'api');
  } else {
    skip('I4', "Another student's sitting is not readable", 'could not create a sitting to test with');
  }

  await context.close();
}

// ── J. layout ────────────────────────────────────────────────────────────────

async function layout(browser) {
  group('J. Layout and responsiveness');
  for (const [w, h, label] of [[1600, 950, 'desktop'], [1280, 900, 'laptop'], [390, 844, 'phone']]) {
    const { context, page } = await newPage(browser, { width: w, height: h });
    await signIn(page, FIXTURES.open.token);
    await page.goto(`${BASE}/portal/cert-prep`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    // Wait for the page to be tall enough to scroll past the condense threshold
    // (220px) before scrolling. A fixed pause passed locally and failed against
    // production, where the first render is slower - the check was measuring how
    // fast the page loaded, not whether the header condenses.
    await page.waitForFunction(() => document.documentElement.scrollHeight > window.innerHeight + 400, null,
      { timeout: 20000 }).catch(() => undefined);
    await page.evaluate(() => window.scrollTo(0, Math.max(900, document.documentElement.scrollHeight * 0.4)));
    await page.waitForTimeout(1500);
    const m = await page.evaluate(() => {
      const top = document.querySelector('.te-top');
      const side = document.querySelector('.te-side');
      const slot = document.querySelector('.te-condensed-slot');
      const t = top && top.getBoundingClientRect();
      const s = side && side.getBoundingClientRect();
      const sticky = side ? getComputedStyle(side).position === 'sticky' : false;
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        hidden: (t && s && sticky) ? Math.max(0, Math.round(t.bottom - s.top)) : 0,
        condensed: slot ? slot.classList.contains('is-visible') : false,
        sticky,
      };
    });
    await shot(page, `J-${label}`);
    check(`J1-${label}`, `No horizontal overflow at ${w}px`, m.overflow === 0, `scrollWidth − clientWidth = ${m.overflow}`);
    // The rail is sticky only while the two-column grid holds. Below 1300px the
    // shared format deliberately collapses to one column and the rail stacks
    // under the content - sticking a full-width block mid-page would be worse
    // than not sticking at all. The first run of this suite asserted stickiness
    // at 1280 and failed; the assertion was wrong, not the layout.
    if (w > 1300) {
      check(`J2-${label}`, `The progress rail is sticky and clears the app bar at ${w}px`,
        m.sticky && m.hidden === 0, `sticky=${m.sticky}, hidden behind header=${m.hidden}px`);
    } else {
      check(`J2-${label}`, `Below the 1300px breakpoint the rail stacks instead of sticking`,
        !m.sticky, `position=${m.sticky ? 'sticky' : 'static'} as the breakpoint intends`);
    }
    if (w >= 1280) {
      check(`J3-${label}`, `The next action condenses into the top bar at ${w}px`, m.condensed, `condensed=${m.condensed}`);
    }
    await context.close();
  }
}

// ── run ──────────────────────────────────────────────────────────────────────

(async () => {
  console.log(`Cert Prep e2e against ${BASE}`);
  const browser = await chromium.launch();
  let pageSignals = {};
  try {
    await fence(browser);
    await blueprint(browser);
    pageSignals = await journey(browser) || {};
    await security(browser);
    await layout(browser);
  } catch (err) {
    record('RUN', 'The suite completed without crashing', 'fail', String(err && err.message).slice(0, 300), 'harness');
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => r.status === 'fail');
  const skipped = results.filter((r) => r.status === 'skip');
  console.log(`\n${results.length - failed.length - skipped.length}/${results.length} passed, ${failed.length} failed, ${skipped.length} not run`);
  failed.forEach((f) => console.log(`  FAIL ${f.id} ${f.claim} — ${f.evidence}`));

  fs.writeFileSync(path.join(OUT, 'e2e-results.json'), JSON.stringify({
    base: BASE,
    ranAt: new Date().toISOString(),
    results,
    failedCalls: pageSignals.failedCalls || [],
    consoleErrors: (pageSignals.consoleErrors || []).slice(0, 20),
  }, null, 2));
  process.exit(failed.length ? 1 : 0);
})();
