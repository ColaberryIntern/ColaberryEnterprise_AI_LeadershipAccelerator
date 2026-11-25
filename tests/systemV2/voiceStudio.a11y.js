/**
 * voiceStudio.a11y.js: the Voice Studio console, accessibility and layout (VS3.7).
 *
 * Every tab at 390 px and 1280 px, with real rows on it:
 *  - axe-core finds no serious or critical WCAG 2 A/AA violation in the console. Violations in the shared
 *    admin shell (every admin page has it) are printed as notes, not failed, as in commsHub.a11y.js;
 *  - at 390 px nothing is wider than the screen (tables and the tab strip scroll inside themselves).
 * Also: the editor, the route form and the live-test confirmation pass axe while open, and keyboard-only
 * use works: tabs by Tab and Enter, focus visible, focus kept when a timeline loads, the confirmation focused.
 *
 * LOCAL STACK ONLY (voiceStudio-stack.md). Exit 0 = every check passed · 1 = failed · 2 = refused.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { setup, token, seed, cleanup } = require('./lib/voiceStudioE2E');

const { base, api, dbUrl, refuse } = setup('voice_studio_a11y');
const { chromium } = require(process.env.PW_PATH || 'playwright');
const { Client } = require('pg');

const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const RUN = crypto.randomBytes(3).toString('hex');
const SHOTS = process.env.SHOT_DIR || path.join(require('os').tmpdir(), `voiceStudio-a11y-${RUN}`);
const SCOPE = '.voice-studio';
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };

function measure(scope) {
  const vw = document.documentElement.clientWidth;
  const wide = [...document.querySelectorAll(`${scope} *`)].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > vw + 1 && !el.closest('.table-responsive, .nav-tabs, pre'); })
    .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} ${Math.round(el.getBoundingClientRect().right)}px`);
  return { scrollW: document.documentElement.scrollWidth, vw, wide: wide.slice(0, 5) };
}

async function axe(page, name) {
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ content: AXE });
  const v = await page.evaluate(async (scope) => {
    const out = { inside: [], outside: [] };
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } });
    for (const x of r.violations.filter((i) => i.impact === 'serious' || i.impact === 'critical')) {
      for (const n of x.nodes) {
        const el = document.querySelector(n.target[0]);
        const d = (n.any[0] && n.any[0].data) || {};
        (!el || el.closest(scope) ? out.inside : out.outside).push(`${x.id}: ${n.target.join(' ')}${d.fgColor ? ` ${d.fgColor} on ${d.bgColor} = ${d.contrastRatio}` : ''}`);
      }
    }
    return out;
  }, SCOPE);
  check(`${name}: axe finds nothing serious or critical in the console`, v.inside.length === 0, v.inside.slice(0, 4).join(' | '));
  if (v.outside.length) console.log(`  note  ${name}: shared admin shell (reported, not failed): ${[...new Set(v.outside)].slice(0, 2).join(' | ')}`);
}

/** Press Tab until the predicate (run in the page on the focused element) is true, at most n times. */
async function tabTo(page, predicate, arg, n = 120) {
  for (let i = 0; i < n; i += 1) {
    await page.keyboard.press('Tab'); // eslint-disable-line no-await-in-loop
    if (await page.evaluate(([src, a]) => new Function('el', 'a', `return (${src})(el, a)`)(document.activeElement, a), [predicate.toString(), arg])) return true; // eslint-disable-line no-await-in-loop, no-new-func
  }
  return false;
}

async function main() {
  const db = new Client({ connectionString: dbUrl });
  await db.connect();
  const admin = token();
  const r = await fetch(`${api}/api/admin/voice-studio/overview`, { headers: { authorization: `Bearer ${admin.jwt}` }, signal: AbortSignal.timeout(20_000) }).catch((e) => ({ status: e.name }));
  if (r.status !== 200) refuse(`stack not ready: ${r.status}`);
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'msedge', headless: process.env.HEADED !== '1' });
  let s = null;
  try {
    s = await seed(db, RUN);
    await db.query(`INSERT INTO voice_routes (tenant_id, brand_slug, path_key, call_type, mode) VALUES ($1,'colaberry',$2,'interest','legacy')`, [s.tenant, `e2e-${RUN}`]);
    const TABS = [['overview', ''], ['agents', '/agents'], ['lab', '/lab'], ['numbers', '/numbers'], ['calls', '/calls'], ['trust', `/trust?call=${s.calls.done}`], ['quality', '/quality'], ['costs', '/costs']];
    for (const [width, height] of [[390, 844], [1280, 900]]) {
      const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' }); // eslint-disable-line no-await-in-loop
      await ctx.addInitScript((t) => { localStorage.setItem('admin_token', t); }, admin.jwt); // eslint-disable-line no-await-in-loop
      const page = await ctx.newPage(); // eslint-disable-line no-await-in-loop
      page.setDefaultTimeout(20_000);
      const at = async (name) => {
        await page.mouse.move(0, 0);
        await page.waitForTimeout(400); // let the hover color finish fading, so axe measures the resting state
        await axe(page, `${name} @${width}`);
        if (width === 390) { const m = await page.evaluate(measure, SCOPE); check(`${name} @390: nothing wider than the screen`, m.scrollW <= m.vw && m.wide.length === 0, m.wide.join('; ') || `${m.scrollW}/${m.vw}`); }
        await page.screenshot({ path: path.join(SHOTS, `${name}-${width}.png`), fullPage: true });
      };
      for (const [name, url] of TABS) {
        await page.goto(`${base}/admin/voice-studio${url}`); // eslint-disable-line no-await-in-loop
        await page.locator(`${SCOPE} nav a.active`).waitFor(); // eslint-disable-line no-await-in-loop
        await page.waitForLoadState('networkidle').catch(() => undefined); // eslint-disable-line no-await-in-loop
        await page.locator(`${SCOPE} .spinner-border`).waitFor({ state: 'detached' }); // eslint-disable-line no-await-in-loop
        if (name === 'overview') await page.getByTestId('safety').waitFor(); // eslint-disable-line no-await-in-loop
        if (name === 'agents') await page.getByRole('button', { name: `[e2e] Agent ${RUN}` }).waitFor(); // eslint-disable-line no-await-in-loop
        if (name === 'calls') { await page.getByRole('button', { name: 'Open' }).first().click(); await page.getByTestId('call-detail').waitFor(); } // eslint-disable-line no-await-in-loop
        if (name === 'trust') await page.getByTestId('timeline').waitFor(); // eslint-disable-line no-await-in-loop
        await at(name); // eslint-disable-line no-await-in-loop
      }
      // Open states.
      await page.goto(`${base}/admin/voice-studio/agents`); // eslint-disable-line no-await-in-loop
      await page.getByRole('button', { name: `[e2e] Agent ${RUN}` }).click(); // eslint-disable-line no-await-in-loop
      await page.getByRole('button', { name: 'Edit a copy' }).first().click(); // eslint-disable-line no-await-in-loop
      await page.getByRole('button', { name: 'Validate' }).click(); // eslint-disable-line no-await-in-loop
      await page.getByTestId('validate-ok').waitFor(); // eslint-disable-line no-await-in-loop
      await at('editor'); // eslint-disable-line no-await-in-loop
      await page.goto(`${base}/admin/voice-studio/numbers`); // eslint-disable-line no-await-in-loop
      await page.getByRole('button', { name: 'New route' }).click(); // eslint-disable-line no-await-in-loop
      await page.locator('#vr-mode').selectOption('live'); // eslint-disable-line no-await-in-loop
      await page.getByRole('button', { name: 'Validate and show impact' }).click(); // eslint-disable-line no-await-in-loop
      await page.getByTestId('route-issues').waitFor(); // eslint-disable-line no-await-in-loop
      await at('route-form'); // eslint-disable-line no-await-in-loop
      await page.goto(`${base}/admin/voice-studio/lab`); // eslint-disable-line no-await-in-loop
      await page.locator('#vs-dry').uncheck(); // eslint-disable-line no-await-in-loop
      await page.getByRole('button', { name: 'Start live test call' }).click(); // eslint-disable-line no-await-in-loop
      await page.getByTestId('confirm-live').waitFor(); // eslint-disable-line no-await-in-loop
      await at('confirm'); // eslint-disable-line no-await-in-loop
      await ctx.close(); // eslint-disable-line no-await-in-loop
    }

    // Keyboard only.
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript((t) => { localStorage.setItem('admin_token', t); }, admin.jwt);
    const page = await ctx.newPage();
    await page.goto(`${base}/admin/voice-studio`);
    await page.getByTestId('safety').waitFor();
    const reached = await tabTo(page, (el, a) => !!el && el.getAttribute('href') === a, '/admin/voice-studio/trust');
    check('keyboard: the Trust Center tab is reached with Tab', reached);
    const visible = await page.evaluate(() => { const c = getComputedStyle(document.activeElement); return c.boxShadow !== 'none' || (c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0); });
    check('keyboard: the focused tab has a visible focus indicator', visible);
    await page.keyboard.press('Enter');
    await page.locator('#tc-call').waitFor();
    check('keyboard: Enter opens the tab', /\/trust$/.test(new URL(page.url()).pathname));
    check('keyboard: the call picker is reached with Tab', await tabTo(page, (el) => !!el && el.id === 'tc-call'));
    // Hold the detail request so the loading state is observable.
    let release;
    const held = new Promise((res) => { release = res; });
    await page.route(/\/voice-studio\/calls\/[0-9a-f-]{36}$/, async (rt) => { await held; await rt.continue(); });
    await page.keyboard.press('ArrowDown');
    await page.locator(`${SCOPE} .spinner-border`).waitFor();
    const during = await page.evaluate(() => document.activeElement && document.activeElement.id);
    release();
    await page.locator(`${SCOPE} .spinner-border`).waitFor({ state: 'detached' });
    const after = await page.evaluate(() => document.activeElement && document.activeElement.id);
    check('keyboard: focus stays on the picker while a timeline loads, and after', during === 'tc-call' && after === 'tc-call', `${during} / ${after}`);
    await page.goto(`${base}/admin/voice-studio/lab`);
    await page.locator('#vs-dry').focus();
    await page.keyboard.press('Space');
    check('keyboard: the live test button is reached', await tabTo(page, (el) => !!el && /Start live test call/.test(el.textContent || '')));
    await page.keyboard.press('Enter');
    await page.getByTestId('confirm-live').waitFor();
    check('keyboard: the confirmation takes focus', await page.evaluate(() => /Ring the test phone/.test((document.activeElement || {}).textContent || '')));
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    check('keyboard: Cancel closes it', (await page.getByTestId('confirm-live').count()) === 0);
    await ctx.close();
  } catch (err) {
    check('the accessibility run completed', false, `${err.name}: ${String(err.message).split('\n').slice(0, 3).join(' ')}`);
  } finally {
    await browser.close();
    const left = await cleanup(db, RUN, s, [admin.sub]).catch((e) => [e.message]);
    check('cleanup removed every row this run made', left.length === 0, left.join('; ') || 'nothing left');
    await db.end();
  }
  const failed = results.filter((x) => !x).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed. Screenshots: ${SHOTS}`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(JSON.stringify({ event: 'voice_studio_a11y_crashed', outcome: 'failure', error_class: e.name, message: e.message })); process.exit(2); });
