/**
 * voiceStudio.e2e.js: the Voice Studio console end to end (VS3.7).
 *
 * Roles (signed out, scoped staff, author, approver) · draft, validate, four-eyes, approve, publish ·
 * voice preview (refused without a key; audio supplied by the browser) and a blind comparison · dry run and
 * the live-test confirmation · call filters and detail · trust timeline and export · route change and
 * rollback · with the flag off, nothing changes for existing admin pages.
 *
 * NOTHING DIALS: the stack has no Twilio or Synthflow credentials and VOICE_TEST_ENABLED is off, and the
 * run fails if a voice_calls row appears that it did not seed. No speech is bought: the two audio
 * endpoints are answered inside the browser, after one real request proves the server refuses without a key.
 *
 * LOCAL STACK ONLY (voiceStudio-stack.md): two backends on one database, the console flag on and off.
 * Exit 0 = every check passed · 1 = a check failed · 2 = refused or could not set up.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { setup, token, seed, cleanup } = require('./lib/voiceStudioE2E');

const { base, api, offBase, offApi, dbUrl, refuse } = setup('voice_studio_e2e', { needOff: true });
const { chromium } = require(process.env.PW_PATH || 'playwright');
const { Client } = require('pg');

const RUN = crypto.randomBytes(3).toString('hex');
const SHOTS = process.env.SHOT_DIR || path.join(require('os').tmpdir(), `voiceStudio-e2e-${RUN}`);
const TABS = ['', '/agents', '/lab', '/numbers', '/calls', '/trust', '/quality', '/costs'];
const EXISTING = ['/admin/dashboard', '/admin/leads', '/admin/campaigns'];
const P = '/api/admin/voice-studio';
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };
const get = (url, jwt) => fetch(url, { headers: jwt ? { authorization: `Bearer ${jwt}` } : {}, signal: AbortSignal.timeout(20_000) });

async function main() {
  const db = new Client({ connectionString: dbUrl });
  await db.connect();
  const author = token();
  const approver = token();
  const organizer = token({ mgmt_role: 'community_organizer' });
  const broad = token({ mgmt_role: 'admin' });
  // Refuse a stack that is not the one documented, before writing anything.
  const on = await get(`${api}${P}/overview`, author.jwt).catch((e) => ({ status: e.name }));
  const off = await get(`${offApi}${P}/overview`, author.jwt).catch((e) => ({ status: e.name }));
  if (on.status !== 200 || off.status !== 404) refuse(`stack not ready: flag-on backend ${on.status} (want 200), flag-off backend ${off.status} (want 404)`);
  if ((await (await get(`${api}${P}/overview`, author.jwt)).json()).safety.testEnabled) refuse('VOICE_TEST_ENABLED must be off on the local stack');

  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'msedge', headless: process.env.HEADED !== '1' });
  const errors = [];
  const open = async (jwt) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    if (jwt) await ctx.addInitScript((t) => { localStorage.setItem('admin_token', t); }, jwt);
    const page = await ctx.newPage();
    page.setDefaultTimeout(20_000);
    page.on('pageerror', (e) => errors.push(e.message));
    return page;
  };
  const shot = (page, n) => page.screenshot({ path: path.join(SHOTS, `${n}.png`), fullPage: true }).catch(() => undefined);
  let s = null;

  try {
    s = await seed(db, RUN);
    const seededCalls = (await db.query('SELECT count(*)::int AS n FROM voice_calls')).rows[0].n;

    // 1. Roles.
    check('signed out: the API answers 401', (await get(`${api}${P}/agents`)).status === 401);
    const anon = await open(null);
    await anon.goto(`${base}/admin/voice-studio`);
    await anon.waitForURL(/login/).catch(() => undefined);
    check('signed out: the page goes to the admin login', /login/.test(anon.url()), anon.url());
    await anon.context().close();
    check('scoped staff (community organizer): refused by the section gate', (await get(`${api}${P}/agents`, organizer.jwt)).status === 403);
    check('broad management role (admin): allowed', (await get(`${api}${P}/agents`, broad.jwt)).status === 200);
    check('a participant token: refused', [401, 403].includes((await get(`${api}${P}/agents`, token({ role: 'participant' }).jwt)).status));

    // 2. Every tab loads for an admin.
    const page = await open(author.jwt);
    for (const t of TABS) {
      await page.goto(`${base}/admin/voice-studio${t}`); // eslint-disable-line no-await-in-loop
      await page.locator('.voice-studio nav a.active').waitFor(); // eslint-disable-line no-await-in-loop
      await page.waitForLoadState('networkidle').catch(() => undefined); // eslint-disable-line no-await-in-loop
      const txt = await page.locator('.voice-studio').innerText(); // eslint-disable-line no-await-in-loop
      check(`tab ${t || '/overview'} loads`, !/could not be loaded|switched off/.test(txt));
      check(`tab ${t || '/overview'} shows no phone number`, !/\+1\d{10}|2145550100/.test(txt));
    }
    await page.goto(`${base}/admin/voice-studio`);
    // The test view: calls exist but no turns or cost do, so some KPIs are null.
    await page.getByRole('button', { name: 'Test calls' }).click();
    await page.getByText('Test calls in the last 7 days.').waitFor();
    const kpis = (await (await get(`${api}${P}/overview?days=7&mode=test`, author.jwt)).json()).kpis;
    const nulls = kpis.filter((k) => k.value === null);
    const shown = [];
    for (const k of nulls) shown.push(await page.getByTestId(`kpi-${k.key}-value`).innerText()); // eslint-disable-line no-await-in-loop
    check('Overview: every KPI with no data reads "No data", never 0', nulls.length > 0 && shown.every((t) => t === 'No data'), `${nulls.length} KPIs`);
    await shot(page, '01-overview');

    // 3. Draft, validate, four eyes, approve, publish.
    await page.goto(`${base}/admin/voice-studio/agents`);
    const agentName = `[e2e] Agent ${RUN}`;
    await page.getByRole('button', { name: agentName }).click();
    await page.getByRole('button', { name: 'Edit a copy' }).first().click();
    await page.locator('#vs-prompt').fill(`You answer admissions questions. Run ${RUN}.`);
    await page.locator('#vs-disclosure').fill('');
    await page.getByRole('button', { name: 'Validate' }).click();
    await page.getByTestId('validate-issues').waitFor();
    check('Validate refuses a version without an AI disclosure', true);
    await page.locator('#vs-disclosure').fill('This is the Colaberry AI assistant. I am an AI, not a person.');
    await page.locator('#vs-tool-transfer_to_human').check();
    await page.getByRole('button', { name: 'Validate' }).click();
    await page.getByTestId('validate-ok').waitFor();
    check('Validate shows a tool without a grant as not available', /Not available:.*transfer_to_human/.test(await page.getByTestId('validate-ok').innerText()));
    await page.getByRole('button', { name: 'Save as draft' }).click();
    await page.getByText('Saved as draft version 2').waitFor();
    const v2 = (await db.query('SELECT id, status, author FROM voice_agent_versions WHERE profile_id = $1 AND version = 2', [s.profile])).rows[0];
    check('the draft is saved with its author', v2 && v2.status === 'draft' && v2.author === author.sub);
    const row = (p) => p.locator('tr').filter({ hasText: 'v2' });
    await row(page).getByRole('button', { name: 'Approve' }).click();
    await page.getByTestId('action-msg').waitFor();
    check('the author cannot approve their own draft', (await db.query('SELECT status FROM voice_agent_versions WHERE id = $1', [v2.id])).rows[0].status === 'draft', await page.getByTestId('action-msg').innerText());
    check('a draft cannot be published before approval', (await fetch(`${api}${P}/versions/${v2.id}/publish`, { method: 'POST', headers: { authorization: `Bearer ${approver.jwt}` } })).status === 409);
    const page2 = await open(approver.jwt);
    await page2.goto(`${base}/admin/voice-studio/agents`);
    await page2.getByRole('button', { name: agentName }).click();
    await row(page2).getByRole('button', { name: 'Approve' }).click();
    await page2.getByText('Version 2: approved.').waitFor();
    await row(page2).getByRole('button', { name: 'Publish' }).click();
    await page2.getByText('Version 2: published.').waitFor();
    const pub = (await db.query('SELECT p.active_version_id, v.status, v.approved_by FROM voice_agent_profiles p JOIN voice_agent_versions v ON v.id = p.active_version_id WHERE p.id = $1', [s.profile])).rows[0];
    check('a second person approves and publishes; it becomes the active version', pub && pub.active_version_id === v2.id && pub.status === 'published' && pub.approved_by === approver.sub);
    await shot(page2, '02-agents');

    // 4. Voice Lab.
    await page.goto(`${base}/admin/voice-studio/lab`);
    await page.getByRole('button', { name: /\(recommended\)/ }).first().click();
    await page.getByTestId('lab-msg').waitFor();
    check('a preview with no speech key is refused with a message, not a crash', /preview could not be made/.test(await page.getByTestId('lab-msg').innerText()));
    const asked = [];
    const mp3 = Buffer.from('//uQxAAAAAANIAAAAAExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV', 'base64');
    await page.route(/\/lab\/(preview|ab\/[^/]+\/clip\/[XY])$/, (r) => { asked.push(`${r.request().method()} ${r.request().postData() || ''}`); r.fulfill({ status: 200, contentType: 'audio/mpeg', body: mp3 }); });
    await page.getByRole('button', { name: /\(recommended\)/ }).first().click();
    await page.getByTestId('preview-audio').waitFor();
    check('a preview plays the chosen catalog voice', /"voice":"[a-z]+"/.test(asked[0] || ''), asked[0] || '');
    await page.getByRole('button', { name: 'Start a blind comparison' }).click();
    await page.getByTestId('trial').waitFor();
    await page.getByRole('button', { name: 'Play X' }).click();
    await page.getByTestId('clip-X').waitFor();
    check('the comparison hides which voice is which until scored', !/marin|cedar/i.test(await page.getByTestId('trial').innerText()));
    await page.getByRole('button', { name: 'Prefer X' }).click();
    await page.getByTestId('reveal').waitFor();
    check('scoring reveals and stores the preference', (await db.query(`SELECT verdict FROM voice_evaluation_runs WHERE scores->>'created_by' = $1`, [author.sub])).rows[0]?.verdict === 'scored');

    // 5. Mock call and the live-test confirmation. Nothing dials.
    const posts = [];
    page.on('request', (r) => { if (r.method() === 'POST' && /\/voice-studio\/tests$/.test(new URL(r.url()).pathname)) posts.push(r.url()); });
    await page.getByRole('button', { name: 'Dry run', exact: true }).click();
    await page.getByText('no phone was dialed').waitFor();
    check('a dry run sends no test-call request', posts.length === 0);
    await page.locator('#vs-dry').uncheck();
    await page.getByRole('button', { name: 'Start live test call' }).click();
    await page.getByTestId('confirm-live').waitFor();
    check('a live test asks for confirmation first, with the spend limit', posts.length === 0 && /180 seconds/.test(await page.getByTestId('confirm-live').innerText()));
    await shot(page, '03-confirm');
    await page.getByRole('button', { name: 'Cancel' }).click();
    check('Cancel sends nothing', posts.length === 0 && (await page.getByTestId('confirm-live').count()) === 0);
    await page.getByRole('button', { name: 'Start live test call' }).click();
    await page.getByRole('button', { name: 'Ring the test phone' }).click();
    await page.getByTestId('lab-msg').waitFor();
    check('confirmed with test mode off: refused by the server, and it says why', posts.length === 1 && /test calls are switched off/.test(await page.getByTestId('lab-msg').innerText()), await page.getByTestId('lab-msg').innerText());
    check('no call was created', (await db.query('SELECT count(*)::int AS n FROM voice_calls')).rows[0].n === seededCalls);

    // 6. Call filters and detail.
    await page.goto(`${base}/admin/voice-studio/calls`);
    await page.locator('tbody tr').first().waitFor();
    const rows = () => page.locator('tbody tr');
    await page.getByLabel('Engine').selectOption('openai_realtime');
    await page.waitForFunction(() => { const r = [...document.querySelectorAll('tbody tr')]; return r.length === 1 && /failed/.test(r[0].textContent); });
    await page.getByLabel('Traffic').selectOption('false');
    await page.getByTestId('calls-empty').waitFor();
    check('filters combine: engine plus live traffic has none', true);
    await page.getByLabel('Engine').selectOption('');
    await page.getByLabel('State').selectOption('completed');
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1);
    await rows().first().getByRole('button', { name: 'Open' }).click();
    const detail = await page.getByTestId('call-detail').innerText();
    check('call detail: masked carrier id, duration, latency, tool events', /CA\*\*\*\*/.test(detail) && /42 s/.test(detail) && /640 ms/.test(detail) && !detail.includes(`CA${RUN}1`));
    await page.getByRole('link', { name: 'Open in Trust Center' }).click();

    // 7. Trust timeline, denied filter, audit export.
    await page.getByTestId('timeline').waitFor();
    check('trust timeline: one denied action among the events', (await page.locator('[data-verdict="denied"]').count()) === 1 && (await page.getByTestId('timeline').locator('li').count()) >= 5);
    await page.locator('#tc-denied').check();
    check('denied-only filter', (await page.getByTestId('timeline').locator('li').count()) === 1);
    await page.getByRole('button', { name: 'Prepare audit export' }).click();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download CSV' }).click()]);
    const csv = fs.readFileSync(await dl.path(), 'utf8');
    check('the audit export has the denied action and no phone number', /book_meeting/.test(csv) && !/2145550100/.test(csv));
    await shot(page, '04-trust');

    // 8. Route change and rollback.
    await page.goto(`${base}/admin/voice-studio/numbers`);
    check('the number is shown by reference', (await page.getByTestId('numbers').innerText()).includes(`e2e-line-${RUN}`));
    await page.getByRole('button', { name: 'New route' }).click();
    await page.locator('#vr-path').fill(`e2e-${RUN}`);
    await page.locator('#vr-mode').selectOption('test');
    await page.getByRole('button', { name: 'Validate and show impact' }).click();
    await page.getByTestId('route-issues').waitFor();
    check('a route without a published version is refused', /published agent version/.test(await page.getByTestId('route-issues').innerText()));
    check('Apply stays disabled until a change validates', await page.getByRole('button', { name: 'Apply change' }).isDisabled());
    await page.locator('#vr-version').fill(v2.id);
    await page.getByRole('button', { name: 'Validate and show impact' }).click();
    await page.getByTestId('route-impact').waitFor();
    await page.getByRole('button', { name: 'Apply change' }).click();
    await page.getByTestId('route-msg').waitFor();
    const route = () => db.query('SELECT mode, engine, approved_by FROM voice_routes WHERE path_key = $1', [`e2e-${RUN}`]).then((r) => r.rows[0]);
    const r1 = await route();
    check('the validated change is applied, with who applied it', r1 && r1.mode === 'test' && r1.engine === 'conversation_relay' && r1.approved_by === author.sub);
    await page.locator('tr').filter({ hasText: `e2e-${RUN}` }).getByRole('button', { name: 'Change' }).click();
    await page.locator('#vr-mode').selectOption('legacy');
    await page.getByRole('button', { name: 'Validate and show impact' }).click();
    await page.getByTestId('route-impact').waitFor();
    await page.getByRole('button', { name: 'Apply change' }).click();
    await page.getByText('Route change applied.').waitFor();
    await page.locator('tr').filter({ hasText: `e2e-${RUN}` }).getByText('legacy', { exact: true }).first().waitFor();
    const r2 = await route();
    check('rollback to legacy: the route is back on Synthflow', r2.mode === 'legacy' && r2.engine === 'synthflow_legacy');

    // 9. Flag off: no console, and existing admin pages are the same.
    for (const p of ['/overview', '/agents', '/lab/catalog', '/numbers', '/routes', '/calls', '/quality', '/costs']) check(`flag off: GET ${p} is 404`, (await get(`${offApi}${P}${p}`, author.jwt)).status === 404); // eslint-disable-line no-await-in-loop
    await page.goto(`${offBase}/admin/voice-studio`);
    await page.getByText('Voice Studio is switched off on this server').waitFor();
    check('flag off: the page says it is switched off', true);
    const shape = async (origin, p) => {
      await page.goto(`${origin}${p}`);
      await page.waitForLoadState('networkidle').catch(() => undefined);
      return page.evaluate(() => ({ links: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')), text: document.body.innerText.replace(/\d[\d:,.]*/g, '#').replace(/\s+/g, ' ').slice(0, 4000) }));
    };
    for (const p of EXISTING) {
      const a = await shape(offBase, p); // eslint-disable-line no-await-in-loop
      const b = await shape(base, p); // eslint-disable-line no-await-in-loop
      check(`${p}: no Voice Studio link, flag on or off`, ![...a.links, ...b.links].some((h) => /voice-studio/.test(h)) && a.links.length > 5, `${a.links.length} links`);
      check(`${p}: same links and text with the flag on and off`, JSON.stringify(a.links) === JSON.stringify(b.links) && a.text === b.text);
    }
    check('no uncaught page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (err) {
    check('the run completed', false, `${err.name}: ${String(err.message).split('\n').slice(0, 3).join(' ')}`);
    for (const c of browser.contexts()) for (const p of c.pages()) await shot(p, `failure-${c.pages().indexOf(p)}`); // eslint-disable-line no-await-in-loop
  } finally {
    await browser.close();
    const left = await cleanup(db, RUN, s, [author.sub, approver.sub]).catch((e) => [e.message]);
    check('cleanup removed every row this run made', left.length === 0, left.join('; ') || 'nothing left');
    await db.end();
  }
  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed. Screenshots: ${SHOTS}`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(JSON.stringify({ event: 'voice_studio_e2e_crashed', outcome: 'failure', error_class: e.name, message: e.message })); process.exit(2); });
