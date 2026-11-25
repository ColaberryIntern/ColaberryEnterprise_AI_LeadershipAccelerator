/**
 * weeklyLiveStudio.e2e.js: browser proof for the Studio setup planner (Basecamp WL3.5).
 *
 *     BASE_URL=https://enterprise.colaberry.ai node tests/systemV2/weeklyLiveStudio.e2e.js
 *     SERVE_DIR=frontend/build PW_CHANNEL=msedge SHOTS=some/dir node tests/systemV2/weeklyLiveStudio.e2e.js
 *
 * Every API call is intercepted, so it needs only the frontend and never reads or writes real data. It
 * checks, at 1440 and 390 px, in light and dark: every section renders, nothing scrolls sideways, axe
 * (with color contrast, which jsdom cannot judge) finds nothing, and a refused staff member sees no tabs.
 * Exit 1 on any failure.
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const PW = require(process.env.PW_PATH || 'playwright');

const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const results = [];
const check = (name, ok, detail = '') => { results.push(Boolean(ok)); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };

const THEMES = ['Claude Code Workspace', 'Agent Skills', 'Claude API + Workflow Assistant', 'Prompt Library', 'MCP Server Foundations', 'Real MCP Integration', 'Multi-Agent Teams', 'Workflow Automation', 'Reliability Engineering + Quality Layer', 'Governance Engine', 'Systems Architecture', 'Capstone + Architect Expo'];
const MULT = [15.1, 3.9, 3.5, 3.8, 7.6, 1.1, 0.8, 29.5, 8.3, 1.9, 13.8, null];
const weeks = THEMES.map((theme, i) => ({ week: i + 1, theme, intensive: 'I', timesCovered: i < 2 ? 1 : 0, lastCovered: i === 1 ? '2026-11-23' : i === 0 ? '2026-11-12' : null, lastTitle: i === 1 ? 'Your Know-How Is Now a Product (Week 2 · Agent Skills)' : null, daysAgo: i === 1 ? 2 : i === 0 ? 13 : null, coveredInLast4: i < 2, planned: i === 2 ? { date: '2026-11-30', title: 'It Works While You Sleep' } : null }));
const demand = MULT.map((m, i) => ({ week: i + 1, video_url: null, video_title: null, channel: null, views: 1, multiple: m, score: m === null ? 2 : m >= 3 ? 5 : m >= 1 ? 3 : 1, thin_median: i === 6, measured_at: '2026-11-25', failed: false }));
const signals = [['s1', 'AI-referred holiday shopping up; agents to drive a fifth of e-commerce traffic', 'Digital Commerce 360', [9, 5]], ['s2', 'ChatGPT Wallet: agents make purchases, approved with Face ID', 'OpenAI', [6, 9]], ['s3', 'AI-linked layoffs continue', 'Anadolu Agency', [7]]]
  .map(([id, headline, publisher, factors], i) => ({ id, headline, publisher, url: `https://example.com/${id}`, published_at: i === 2 ? null : '2026-11-19', date_confirmed: i !== 2, factors, fits_weeks: [3, 8], idea: 'Who is answering your customers at 2 AM?', dropped_reason: null }))
  .concat({ id: 's4', headline: 'A story whose page refused the fetch', publisher: 'AP', url: 'https://example.com/4', published_at: null, date_confirmed: false, factors: [1], fits_weeks: [], idea: null, dropped_reason: 'HTTP 403' });
const TITLES = [['Get Your Morning Back', 3, 89.8], ['Stop Starting It by Hand', 8, 87.6], ['Show Me It Ran', 12, 82.2], ["Don't Trust the Green Check", 9, 81], ["It Can't Approve Itself", 10, 68.8]];
const topics = TITLES.map(([title, week, score], i) => ({
  id: `t${i}`, rank: i + 1, week, title, spin: 'Holiday shopping agents are in the news, and it matters whether the assistant takes work off your desk or decisions out of your hands.', parody: 'At a kitchen table, Mel asks a new assistant to sort the mail. It marks a coupon URGENT. "Everything with an exclamation point," it explains.',
  hooks: [{ text: 'I opened the inbox at 6 AM and found three replies ready for me to check.', viral: 85 }, { text: 'Nothing sent. That was the best line.', viral: 82 }], package: { long_video: 'I let it work my night shift', shorts: 'Six cuts from the class', thumbnail: 'Night shift' }, marketing: { before: 'Parody on Friday', class_day: 'Post at noon', after: 'Shorts all week' },
  signals_used: ['s1', 's2'], teach_lines: Object.fromEntries(['demand', 'viewer', 'promise', 'proof', 'news', 'tension', 'series'].map((k) => [k, { score: 4, why: 'A short reason from the judge.' }])), teach: 88, viral: 85, convert: 91, topic_score: score, factors: [5, 6, 9], warnings: i ? [{ code: 'jumps_ahead', message: `Week ${week} is past the next one the class reaches.` }] : [], recommended: i === 0,
}));
const setup = { batch: { ok: true, cohortId: 'c', cohortName: 'Cohort - November 2026' }, map: { asOf: '2026-11-25', recentWeeks: [2, 1], weeks }, demand, latestPlanId: 'p1', sessions: [{ id: 'x', date: '2026-11-23', title: 'Your Know-How Is Now a Product (Week 2 · Agent Skills)', week: 2, status: 'completed' }, { id: 'y', date: '2026-11-30', title: 'It Works While You Sleep (Weekly Live Ep 2)', week: 3, status: 'scheduled' }] };
const plan = (over = {}) => ({ plan: { id: 'p1', air_date: '2026-11-30', cohort_id: 'c', status: 'ready', stage: 'done', error: null, note: 'Only 9 news stories could be confirmed this time.', cost_usd: 0.4, chosen_topic_id: null, inputs: { week: 'auto' }, ...over }, demand, signals, topics });
const sessions = [{ id: 'a', title: 'It Works While You Sleep (Weekly Live Ep 2)', session_date: '2099-11-30', start_time: '18:30', cohort_name: 'Cohort - November 2026', editorial_state: null, access_mode: null }, { id: 'b', title: 'Your Know-How Is Now a Product', session_date: '2026-01-05', start_time: '18:30', cohort_name: 'Cohort - November 2026', editorial_state: 'scheduled', access_mode: 'cohort' }];

function serve(dir) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
  return new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      let f = path.join(dir, decodeURIComponent(req.url.split('?')[0]));
      if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dir, 'index.html');
      res.setHeader('content-type', types[path.extname(f)] || 'application/octet-stream');
      fs.createReadStream(f).pipe(res);
    }).listen(0, () => resolve(s));
  });
}

async function main() {
  const server = process.env.SERVE_DIR ? await serve(path.resolve(process.env.SERVE_DIR)) : null;
  const base = server ? `http://localhost:${server.address().port}` : (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
  const browser = await PW.chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  const open = async (width, dark, refuse) => {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: dark ? 'dark' : 'light' });
    await ctx.addInitScript(() => {
      const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, '');
      localStorage.setItem('admin_token', `${b64({ alg: 'HS256' })}.${b64({ sub: 'u', email: 'a@example.com', role: 'admin', exp: 4102444800 })}.x`);
    });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    await page.route('**/api/**', (route) => {
      const u = new URL(route.request().url()).pathname;
      if (u.endsWith('/live/plan-setup')) return refuse ? json(route, { error: 'no' }, 403) : json(route, setup);
      if (u.endsWith('/live/plans/p1/choose')) return json(route, { error: 'This topic scores 82.2, under the 85 needed.', code: 'needs_override' }, 409);
      if (u.endsWith('/live/plans/p1')) return json(route, plan());
      if (/\/studio|live-studio|\/live\/sessions|studio-sessions/.test(u)) return json(route, { sessions });
      return json(route, u.endsWith('/me') ? { role: 'admin', sections: ['program'], has_portal_account: true } : {});
    });
    await page.goto(`${base}/admin/live/studio`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('[data-testid="classes-panel"]', { timeout: 20000 });
    await page.waitForTimeout(800);
    return { ctx, page, errors };
  };

  try {
    for (const width of [1440, 390]) for (const dark of [false, true]) {
      const at = `${width}${dark ? ' dark' : ''}`;
      const { ctx, page, errors } = await open(width, dark, false);
      check(`${at}: tabs`, (await page.$$('[role="tab"]')).length === 4);
      for (const tab of ['classes', 'plan', 'map', 'rubric']) {
        await page.click(`[data-testid="tab-${tab}"]`);
        await page.waitForTimeout(300);
        if (tab === 'classes') check(`${at}: class list`, (await page.textContent('[data-testid="classes-panel"]')).includes('Weekly Live Ep 2'));
        if (tab === 'plan') {
          await page.waitForSelector('[data-testid="topic-5"]', { timeout: 10000 }).catch(() => null);
          check(`${at}: five topic cards`, (await page.$$('[data-testid^="choose-"]')).length === 5);
          check(`${at}: 12 demand bars`, (await page.$$('[data-testid^="demand-"]:not([data-testid="demand-bars"])')).length === 12);
        }
        const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        check(`${at} ${tab}: no sideways scroll`, over <= 0, `${over}px`);
        await page.evaluate(AXE);
        const axe = await page.evaluate(() => window.axe.run(document.querySelector('.cls-root'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } }).then((r) => ({ v: r.violations.map((x) => `${x.id}: ${x.nodes.slice(0, 2).map((n) => `${n.html.slice(0, 110)} ${(n.any[0] && n.any[0].message) || ''}`).join(' | ')}`), inc: r.incomplete.filter((x) => x.id === 'color-contrast').reduce((t, x) => t + x.nodes.length, 0) })));
        check(`${at} ${tab}: axe`, axe.v.length === 0 && axe.inc === 0, axe.v.concat(axe.inc ? [`${axe.inc} contrast checks undecided`] : []).join(' || ').slice(0, 700));
        if (process.env.SHOTS && !dark) { fs.mkdirSync(process.env.SHOTS, { recursive: true }); await page.screenshot({ path: path.join(process.env.SHOTS, `${tab}-${width}.png`), fullPage: true }); if (tab === 'plan') for (const n of [1, 5]) { const el = await page.$(`[data-testid="topic-${n}"]`); if (el) await el.screenshot({ path: path.join(process.env.SHOTS, `topic${n}-${width}.png`) }); } }
      }
      await page.click('[data-testid="tab-plan"]');
      await page.click('[data-testid="choose-3"]');
      await page.waitForSelector('[data-testid="choose-anyway-3"]', { timeout: 5000 }).catch(() => null);
      check(`${at}: a topic under the gate asks first`, Boolean(await page.$('[data-testid="choose-anyway-3"]')));
      check(`${at}: no page errors`, errors.length === 0, errors.join(' | '));
      await ctx.close();
    }
    const { ctx, page } = await open(1440, false, true);
    check('refused staff: no tabs, class list still there', !(await page.$('[role="tab"]')) && (await page.textContent('[data-testid="classes-panel"]')).includes('Weekly Live Ep 2'));
    await ctx.close();
  } catch (e) { check('run', false, e.message); } finally { await browser.close(); if (server) server.close(); }
  console.log(`${results.filter(Boolean).length}/${results.length} passed`);
  process.exit(results.length && results.every(Boolean) ? 0 : 1);
}
main();
