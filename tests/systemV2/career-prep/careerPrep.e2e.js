/**
 * Career Prep v27 (CP5.4): the Release 1 flows in a real browser (Edge), against the BUILT app (frontend/build) served
 * on 127.0.0.1 with the platform API answered from fixtures (fakeApi.js). Nothing can reach production or any server.
 *
 * Why fixtures and not a seeded local stack (declared in the run's plan): this machine has no Docker and no local
 * Postgres, so the plan's DEV_ONLY seeded database cannot run here. The server side of every step is covered by the
 * backend jest suites (and the Postgres integration suites in CI); this suite proves the browser side end to end.
 *
 * Checks (kit P6, adapted to Release 1):
 *   1 /portal/career lands on the Career Prep floor with one door and a styled trail (one row); the door opens the room
 *   2 the room: pick the interview, pick a plan, Your plan shows the days, Start runs the timer
 *   3 Try records (fake camera) and shows the score; Finish shows the recap; See my dashboard marks the moved skill New
 *     and its readiness equals the recap's
 *   4 ‹ Floor n and Esc both land on the floor with focus on the door
 *   5 Add an interview and Create one for me set the anchor pill (Added by you / Practice)
 *   6 the Offers sheet opens from its URL and the jump bar, is drawn above the room, and shows no fee (the payload rule
 *     is the server's strict response schemas, tested in the backend)
 *   1b, 2, 7 (the campus card's Go, the long way through the tower, the audiences) are covered by jest against the real
 *     components: goStart / hqCareerPrepTower / CareerPrepCard / careerPrepFloor tests (no campus stack runs here)
 *   8 zero console errors throughout, and inside a sandboxed iframe
 *   9 the design (shots L3-4..L3-7): the Try frame shows a LIVE mirrored self-view while recording (a real MediaStream
 *     from a canvas stands in for the camera) and stops its tracks after; the score card is ONE Delivery number plus the
 *     two cards; Your progress draws its SVG charts from rich data, and an honest empty state from no data (a ring toward
 *     the first score, empty gray skill bars, no made-up number); the room is light with the OS in dark mode; a first
 *     answer that cannot yet move a number reads as "building" in the recap, never "No answer was scored"
 *   11 (R1.2) Hire studio > Video: a saved answer's "Show on my public profile" is unchecked by default; ticking and
 *     unticking send on / off; the note says employers never see the score (1600 and 390). The public side (the rule,
 *     the 404s, the card on hire.refactored.ai) is covered by the backend integration suite and the hire site's tests.
 * Fidelity screenshots (FIDELITY_DIR, default: none): the session part, Try after a scored answer, Your progress rich
 * and empty at 1600x960, and Try at 390 wide, to read next to the design shots.
 * Layout: no horizontal scroll in any of the room's own scroll containers, no tooltip off screen, for the room (Your progress, Your plan) at 1600, 1440, 390, light
 * and dark, and the floor at 1440 and 390; at 390 the last plan block is focused so its tooltip is on screen.
 *
 * Usage (repo root): node tests/systemV2/career-prep/careerPrep.e2e.js, or runAll.js for every suite (env: see harness.js)
 * Exit 0 only when every check ran and passed; a check that did not evaluate counts as a failure.
 */
// The server, fake camera, page factory, check recorder and runner live in harness.js (split in loop task T06).
const fs = require('fs');
const path = require('path');
const { SELFTEST, BASE, check, newPage, tid, shot, unit, runSuite } = require('./harness');

async function flowFloorAndRoom(browser) {
  const { ctx, page, errors, api } = await newPage(browser);
  await page.goto(`${BASE}/portal/career`);
  await page.waitForSelector(tid('cp-floor'));
  const trail = await page.$eval(tid('cp-trail'), (el) => ({ display: getComputedStyle(el).display, tops: [...el.children].map((c) => Math.round(c.getBoundingClientRect().top)), step: el.getAttribute('data-step') }));
  check('1 /portal/career: the floor, one door, a styled one-row trail at step 2', trail.display === 'flex' && new Set(trail.tops).size === 1 && trail.step === '2' && (await page.$$(tid('cp-door'))).length === 1, JSON.stringify(trail));
  // Production 2026-11-16: reached directly, the floor rendered unstyled (the tower's hq.css lives in the campus chunk,
  // never loaded here) and the floor had no frame to fill. Prove the floor is drawn as the tower draws it.
  const floorLook = await page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const r = (s) => q(s)?.getBoundingClientRect();
    return {
      floorH: Math.round(r('[data-testid="cp-floor"]')?.height ?? 0),
      plate: getComputedStyle(q('.cp-floor .plate')).position,
      btnRadius: getComputedStyle(q('[data-testid="cm-hq-to-cab"]')).borderRadius,
      doorInView: (r('[data-testid="cp-door"]')?.bottom ?? 1e9) <= innerHeight,
      coraTx: getComputedStyle(q('.cp-cora .tx')).flexDirection,
    };
  });
  check('1a the floor is drawn as in the tower (framed, plate placed, tower buttons, door on screen, Cora name over title)',
    floorLook.floorH >= 400 && floorLook.plate === 'absolute' && floorLook.btnRadius === '20px' && floorLook.doorInView && floorLook.coraTx === 'column', JSON.stringify(floorLook));
  // On a phone: the floor screen clears the plate, and Cora stays inside the frame without covering the door or the buttons.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  const phone = await page.evaluate(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const plate = r('.cp-floor .plate'); const screen = r('.cp-floor .cp-screen'); const cora = r('[data-testid="cp-cora"]');
    const door = r('[data-testid="cp-door"]'); const bar = r('.cp-floor .cm-hq-floorbar');
    return { gap: Math.round(screen.top - plate.bottom), coraIn: cora.width > 0 && cora.top >= 0 && cora.bottom <= innerHeight && cora.left >= 0 && cora.right <= innerWidth, coraHitsDoor: hit(cora, door), coraHitsBar: hit(cora, bar) };
  });
  check('1a phone (390): the screen clears the plate; Cora is on screen, clear of the door and the buttons',
    phone.gap >= 0 && phone.coraIn && !phone.coraHitsDoor && !phone.coraHitsBar, JSON.stringify(phone));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.click(tid('cp-door'));
  await page.waitForSelector(tid('cp-room'));
  await page.click(tid('cp-card-i1'));
  await page.waitForSelector('[data-testid="cp-card-plan:days"]');
  await page.click('[data-testid="cp-card-plan:days"]');
  await page.waitForSelector(tid('cp-card-start'));
  const days = await page.$$('.cp-day');
  await page.click(tid('cp-card-start'));
  await page.waitForSelector(tid('cp-session'));
  const ring = await page.$eval('.cp-ring', (el) => el.getAttribute('aria-label'));
  check('2 room: pick the interview, pick a plan (days shown), Start runs the timer', days.length === 2 && /left in this part$/.test(ring), `${days.length} days, ring "${ring}"`);
  await page.click(tid('cp-session-next'));
  await page.click(tid('cp-record'));
  await page.waitForSelector(tid('cp-selfview'));
  await page.waitForTimeout(300);
  const live = await page.evaluate(() => {
    const v = document.querySelector('[data-testid="cp-selfview"]');
    return { stream: v.srcObject instanceof MediaStream && v.srcObject === window.__cpStream, muted: v.muted, inline: v.playsInline, mirrored: getComputedStyle(v).transform,
      rec: (document.querySelector('[data-testid="cp-rec"]') || {}).textContent || '', inFrame: !!v.closest('[data-testid="cp-cam"]') };
  });
  await page.click(tid('cp-stop'));
  await page.waitForSelector(tid('cp-try-result'), { timeout: 10_000 });
  const after = await page.evaluate(() => ({ stopped: window.__cpStopped === true, video: !!document.querySelector('[data-testid="cp-selfview"]') }));
  check('9a Try: while recording the frame shows a live, muted, mirrored self-view of the camera stream; its tracks stop after',
    live.stream && live.muted && live.inline && live.mirrored === 'matrix(-1, 0, 0, 1, 0, 0)' && /^Recording 0:0\d$/.test(live.rec) && live.inFrame && after.stopped && !after.video,
    JSON.stringify({ ...live, ...after }));
  const card = await page.evaluate(() => {
    const r = document.querySelector('[data-testid="cp-try-result"]');
    return { numbers: r.querySelectorAll('[data-testid="cp-delivery"]').length, delivery: (r.querySelector('[data-testid="cp-delivery"]') || {}).textContent,
      well: !!r.querySelector('[data-testid="cp-fb-well"] li'), fix: !!r.querySelector('[data-testid="cp-fb-fix"] li'), scoredIn: (r.querySelector('[data-testid="cp-scored-in"]') || {}).textContent,
      side: (() => { const a = r.querySelector('[data-testid="cp-fb-well"]').getBoundingClientRect(); const b = r.querySelector('[data-testid="cp-fb-fix"]').getBoundingClientRect(); return Math.abs(a.top - b.top) < 2 && b.left > a.right - 1; })(),
      content: /content\s*\d/i.test(r.textContent), closed: !r.querySelector('details.cp-numbers').open };
  });
  check('9b the score card: Scored in N seconds, ONE Delivery number (89 = mean of 100, 100, 66), the two cards side by side, no content number, the numbers collapsed',
    card.numbers === 1 && card.delivery === '89' && card.well && card.fix && /^Scored in \d+ seconds?$/.test(card.scoredIn || '') && card.side && !card.content && card.closed, JSON.stringify(card));
  await page.click(tid('cp-session-next'));
  await page.click(tid('cp-session-next'));
  await page.waitForSelector(tid('cp-recap'));
  const recap = await page.textContent(tid('cp-recap'));
  await page.click(tid('cp-recap-dashboard'));
  await page.waitForSelector(tid('cp-new-pace_clarity'));
  const shown = (await page.textContent(`${tid('cp-readiness')} b`)).trim();
  const recapAfter = (recap.match(/Readiness(\d+)/) || [])[1];
  check('3 Try is scored; Finish shows the recap; the dashboard marks the moved skill New, readiness = the recap\'s',
    /Readiness69 5 up from 64/.test(recap) && /48 → 57/.test(recap) && !!recapAfter && shown === recapAfter, `recap after ${recapAfter}, dashboard shows ${shown}`);
  const charts = await page.evaluate(() => ({
    line: document.querySelectorAll('[data-testid="cp-trend-svg"] polyline').length, dots: document.querySelectorAll('[data-testid="cp-trend-svg"] circle').length,
    ready: !!document.querySelector('[data-testid="cp-trend-svg"] .cp-ready'), bars: document.querySelectorAll('[data-testid="cp-weekly-svg"] rect').length,
    skills: document.querySelectorAll('[data-testid="cp-skills"] .cp-bar-fill').length, tiles: document.querySelectorAll('[data-testid="cp-tiles"] li').length,
    arrows: document.querySelectorAll('[data-testid="cp-skills"] .cp-delta.up, [data-testid="cp-skills"] .cp-delta.down').length,
    ivBars: document.querySelectorAll('[data-testid^="cp-iv-"] .cp-bar-tick').length, tables: document.querySelectorAll('.cp-chart figcaption button').length,
  }));
  check('9c Your progress draws its charts from the data: the readiness line with its dashed ready line, 8 weekly bars, 9 skill bars with arrows, interview bars, 6 source tiles (CP5.8 adds read-aloud), a table toggle per chart',
    charts.line === 1 && charts.dots === 8 && charts.ready && charts.bars === 8 && charts.skills === 9 && charts.arrows >= 8 && charts.ivBars === 2 && charts.tiles === 6 && charts.tables === 2, JSON.stringify(charts));
  for (const [how, act] of [['‹ Floor n', () => page.click(tid('cp-back'))], ['Esc', () => page.keyboard.press('Escape')]]) {
    if (how === 'Esc') { await page.goto(`${BASE}/portal/career/room`); await page.waitForSelector(tid('cp-room')); await page.click(tid('cp-cora-col')); }
    await act();
    await page.waitForSelector(tid('cp-floor-page'));
    const focused = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-testid'));
    check(`4 closing the room with ${how} lands on the floor, focus on the door`, focused === 'cp-door' && new URL(page.url()).pathname === '/portal/career', `focus ${focused}`);
  }
  await ctx.close();
  return errors;
}


/** The design's views at 1600x960 (and Try at 390), for the fidelity gate, plus the empty student and the dark OS. */
async function flowDesign(browser) {
  const errors = [];
  {
    const { ctx, page, errors: e } = await newPage(browser, { viewport: { width: 1600, height: 960 }, dark: true });
    await page.goto(`${BASE}/portal/career/room`);
    await page.click(tid('cp-card-i1'));
    await page.click('[data-testid="cp-card-plan:days"]');
    await page.waitForSelector(tid('cp-plan'));
    await shot(page, 'g_plan_1600x960');
    await page.click(tid('cp-card-start'));
    await page.waitForSelector(tid('cp-session'));
    const look = await page.evaluate(() => {
      const room = getComputedStyle(document.querySelector('[data-testid="cp-room"]'));
      const cora = getComputedStyle(document.querySelector('[data-testid="cp-cora-col"]'));
      return { bg: room.backgroundColor, fg: room.color, cora: cora.backgroundColor, scheme: matchMedia('(prefers-color-scheme: dark)').matches };
    });
    check('9d the room is LIGHT with the OS in dark mode (design palette on .cp-room)',
      look.scheme && look.bg === 'rgb(247, 250, 252)' && look.fg === 'rgb(22, 34, 44)' && look.cora === 'rgb(255, 255, 255)', JSON.stringify(look));
    await shot(page, 'a_session_part_1600x960');
    // Other pages define global .cp-* rules (PortfolioPage.css: .cp-card with a shadow and margin, .cp-note in italic,
    // .cp-tab at 15px...). With that stylesheet loaded, the room must look the same.
    const portfolioCss = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'frontend', 'src', 'pages', 'portal', 'portfolio', 'PortfolioPage.css'), 'utf8');
    const before = await page.evaluate(() => [...document.querySelectorAll('.cp-card, .cp-tab, .cp-chip, .cp-callout, .cp-callout p, .cp-muted')].map((e) => { const c = getComputedStyle(e); return [c.boxShadow, c.marginBottom, c.fontStyle, c.fontSize, c.fontWeight, c.padding, c.color].join('|'); }));
    await page.addStyleTag({ content: portfolioCss });
    const after = await page.evaluate(() => [...document.querySelectorAll('.cp-card, .cp-tab, .cp-chip, .cp-callout, .cp-callout p, .cp-muted')].map((e) => { const c = getComputedStyle(e); return [c.boxShadow, c.marginBottom, c.fontStyle, c.fontSize, c.fontWeight, c.padding, c.color].join('|'); }));
    const changed = before.map((b, i) => (b === after[i] ? null : `${i}: ${b} -> ${after[i]}`)).filter(Boolean);
    check('9h other pages\' global .cp-* rules (PortfolioPage.css) do not change the room', before.length > 10 && changed.length === 0, changed.slice(0, 3).join('; ') || `${before.length} elements unchanged`);
    await page.click(tid('cp-session-next'));
    await page.click(tid('cp-record'));
    await page.click(tid('cp-stop'));
    await page.waitForSelector(tid('cp-try-result'));
    await shot(page, 'b_try_scored_1600x960');
    await page.click(tid('cp-session-next'));
    await page.click(tid('cp-session-next'));
    await page.waitForSelector(tid('cp-recap'));
    await shot(page, 'f_recap_1600x960');
    await page.click(tid('cp-recap-dashboard'));
    await page.waitForSelector(tid('cp-new-pace_clarity'));
    await shot(page, 'c_progress_rich_1600x960');
    errors.push(...e);
    await ctx.close();
  }
  {
    const { ctx, page, errors: e } = await newPage(browser, { viewport: { width: 1600, height: 960 }, api: { empty: true } });
    await page.goto(`${BASE}/portal/career/room`);
    await page.waitForSelector(tid('cp-dashboard'));
    const empty = await page.evaluate(() => ({
      ring: (document.querySelector('[data-testid="cp-progress-ring"]') || { getAttribute: () => null }).getAttribute('aria-label'),
      number: !!document.querySelector('[data-testid="cp-readiness"]'), emptyBars: document.querySelectorAll('[data-testid="cp-skills"] .cp-bar.is-empty').length,
      values: document.querySelectorAll('[data-testid="cp-skills"] .cp-skill-v').length, trendEmpty: !!document.querySelector('[data-testid="cp-trend-empty"]'),
      weekly: !!document.querySelector('[data-testid="cp-weekly-svg"]'), zeroScore: /\b0 ?\/ ?100\b/.test(document.querySelector('[data-testid="cp-dashboard"]').textContent),
      note: /not enough practice yet/.test(document.querySelector('[data-testid="cp-skills"]').textContent),
    }));
    check('9e Your progress with no data is visual and honest: a ring toward the first score, empty gray skill bars that say so, no readiness number, no 0 / 100',
      empty.ring === '0 of 5 skills scored' && !empty.number && empty.emptyBars === 9 && empty.values === 0 && empty.trendEmpty && empty.weekly && !empty.zeroScore && empty.note, JSON.stringify(empty));
    await shot(page, 'd_progress_empty_1600x960');
    // The first answer of a new student: scored, but no skill can have a number yet. The recap must say so.
    await page.click(tid('cp-card-i1'));
    await page.click('[data-testid="cp-card-plan:days"]');
    await page.click(tid('cp-card-start'));
    await page.waitForSelector(tid('cp-session'));
    await page.click(tid('cp-session-next'));
    await page.click(tid('cp-record'));
    await page.click(tid('cp-stop'));
    await page.waitForSelector(tid('cp-try-result'));
    await page.click(tid('cp-session-next'));
    await page.click(tid('cp-session-next'));
    await page.waitForSelector(tid('cp-recap'));
    const recap = await page.textContent(tid('cp-recap'));
    const log = await page.textContent(tid('cp-log'));
    check('9f a first scored answer that cannot move a number yet reads as building (recap and Cora), never "No answer was scored"',
      !/No answer was scored/.test(recap + log) && /1 of 3 practice results to a first score/.test(recap) && /One answer scored/.test(log), recap.slice(0, 200));
    errors.push(...e);
    await ctx.close();
  }
  {
    const { ctx, page, errors: e } = await newPage(browser, { viewport: { width: 390, height: 844 } });
    await page.goto(`${BASE}/portal/career/room`);
    await page.click(tid('cp-card-i1'));
    await page.click('[data-testid="cp-card-plan:days"]');
    await page.click(tid('cp-card-start'));
    await page.click(tid('cp-session-next'));
    await page.click(tid('cp-record'));
    await page.click(tid('cp-stop'));
    await page.waitForSelector(tid('cp-try-result'));
    await page.evaluate(() => document.querySelector('[data-testid="cp-cam"]').scrollIntoView({ block: 'start' }));
    const sw = await page.evaluate(() => [document.documentElement, ...document.querySelectorAll('.cp-room, .cp-room *')]
      .filter((el) => /(auto|scroll)/.test(getComputedStyle(el).overflowX) || el === document.documentElement).filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.className || el.tagName));
    check('9g Try at 390 wide: the frame and the score card fit, no horizontal scroll', sw.length === 0, sw.join(', '));
    await shot(page, 'e_try_scored_390');
    errors.push(...e);
    await ctx.close();
  }
  return errors;
}

/**
 * R1.1 (Ali's live test, 2026-11-16): the source icon opens the evidence (never a plan); the intro video link; the plan
 * buttons wait while a plan is built; saving a Try answer is an unchecked box, and unticking deletes it; Cora on the
 * right follows the newest message; the left rail navigates and shows the scores; the tab strip never scrolls.
 * Each check runs in its own page, so one that cannot even start (an older build) is recorded as FAILED with the reason,
 * and the others still run.
 */

async function flowR11(browser) {
  const errors = [];
  for (const [w, h] of [[1600, 960], [390, 844]]) {
    const vp = { viewport: { width: w, height: h } };
    const wide = w > 900;
    await unit(browser, errors, `10e ${w}: ${wide ? 'three columns: rail on the left, the tabs in the middle, Cora on the RIGHT' : 'stacked: the rail on top, the panel, then Cora below'}`, vp, async (page) => {
      await page.goto(`${BASE}/portal/career/room`);
      await page.waitForSelector(tid('cp-dashboard'));
      const cols = await page.evaluate(() => {
        const r = (s) => document.querySelector(s).getBoundingClientRect();
        const rail = r('[data-testid="cp-rail"]'); const mid = r('.cp-tabs-col'); const cora = r('[data-testid="cp-cora-col"]');
        return { rail: [Math.round(rail.left), Math.round(rail.top)], mid: [Math.round(mid.left), Math.round(mid.top), Math.round(mid.bottom)], cora: [Math.round(cora.left), Math.round(cora.top)] };
      });
      await shot(page, `j_room_layout_${w}`);
      return [wide ? cols.rail[0] < cols.mid[0] && cols.mid[0] < cols.cora[0] && cols.rail[1] === cols.cora[1]
        : cols.rail[1] < cols.mid[1] && cols.mid[2] <= cols.cora[1] + 1, JSON.stringify(cols)];
    });
    await unit(browser, errors, `10f ${w}: the rail navigates (3 tabs, 5 pages), shows readiness and every scored skill lowest first, and a skill opens Your progress at that skill (no plan)`, vp, async (page, plans) => {
      await page.goto(`${BASE}/portal/career/room`);
      await page.waitForSelector(tid('cp-dashboard'));
      await page.click(tid('cp-rail-tab-plan'));
      await page.waitForSelector(tid('cp-panel-plan'));
      const rail = await page.evaluate(() => ({
        tabs: document.querySelectorAll('[data-testid^="cp-rail-tab-"]').length, sheets: document.querySelectorAll('[data-testid^="cp-rail-sheet-"]').length,
        on: document.querySelector('[data-testid="cp-rail-tab-plan"]').getAttribute('aria-current'),
        ready: ((document.querySelector('[data-testid="cp-rail-readiness"] b') || {}).textContent || ''),
        skills: [...document.querySelectorAll('.cp-rail-skill-v')].map((n) => Number(n.textContent)),
      }));
      // The lowest skill (on a phone the rail shows only the three lowest).
      await page.click(tid('cp-rail-skill-pace_clarity'));
      await page.waitForSelector(`${tid('cp-skrow-pace_clarity')}.is-focus`);
      await page.click(tid('cp-rail-sheet-offers'));
      await page.waitForSelector(tid('cp-sheet-offers'));
      const sheet = new URL(page.url()).hash;
      return [rail.tabs === 3 && rail.sheets === 5 && rail.on === 'page' && rail.ready === '64' && rail.skills.length === 9 && rail.skills.every((v, i, a) => i === 0 || a[i - 1] <= v)
        && plans.length === 0 && sheet === '#offers', JSON.stringify({ ...rail, plans: plans.length, sheet })];
    });
    await unit(browser, errors, `10a ${w}: the video icon opens "Where this score comes from" on top of the room (no plan built, no nested buttons), with the intro video and a "not kept" Try answer`, vp, async (page, plans) => {
      await page.goto(`${BASE}/portal/career/room`);
      await page.waitForSelector(tid('cp-dashboard'));
      // The old build drew the icon INSIDE the plan button: clicking it is what built Ali's plans.
      const icon = (await page.$(tid('cp-src-pace_clarity-video'))) || (await page.$(`${tid('cp-skill-pace_clarity')} .cp-srcs i`));
      await icon.click();
      await page.waitForSelector(tid('cp-srcitem-intro_video'));
      const panel = await page.evaluate(() => {
        const p = document.querySelector('[data-testid="cp-srcpanel"]').getBoundingClientRect();
        const link = document.querySelector('[data-testid="cp-srcitem-link"]');
        const hit = document.elementFromPoint(p.left + p.width / 2, p.top + 10);
        return { onScreen: p.left >= 0 && p.right <= innerWidth && p.top >= 0, onTop: !!hit && !!hit.closest('[data-testid="cp-srcpanel"]'),
          notKept: !!document.querySelector('[data-testid="cp-srcitem-notkept"]'), href: link && link.getAttribute('href'), nested: document.querySelectorAll('button button').length };
      });
      await shot(page, `h_sources_panel_${w}`);
      return [panel.onScreen && panel.onTop && panel.notKept && panel.href === '/portal/portfolio?tab=hire&section=video' && panel.nested === 0 && plans.length === 0, JSON.stringify({ ...panel, plans: plans.length })];
    });
    await unit(browser, errors, `10b ${w}: Esc closes the sources panel and leaves the room open; "Watch your intro video" opens Portfolio > Hire > Video`, vp, async (page) => {
      await page.goto(`${BASE}/portal/career/room`);
      await page.waitForSelector(tid('cp-dashboard'));
      await page.click(tid('cp-src-pace_clarity-video'));
      await page.waitForSelector(tid('cp-srcpanel'));
      await page.keyboard.press('Escape');
      await page.waitForSelector(tid('cp-srcpanel'), { state: 'detached' });
      const stillRoom = !!(await page.$(tid('cp-room')));
      await page.click(tid('cp-src-pace_clarity-video'));
      await page.click(tid('cp-srcitem-link'));
      await page.waitForURL((u) => u.pathname === '/portal/portfolio');
      const url = new URL(page.url());
      return [stillRoom && url.searchParams.get('tab') === 'hire' && url.searchParams.get('section') === 'video', `${stillRoom ? 'room stayed' : 'room closed'}, ${url.pathname}${url.search}`];
    });
    await unit(browser, errors, `10g ${w}: after picks that add messages, Cora's newest item is in view in the chat (it follows the newest)`, vp, async (page) => {
      await page.goto(`${BASE}/portal/career/room`);
      await page.click(tid('cp-card-i1'));
      await page.click('[data-testid="cp-card-plan:days"]');
      await page.waitForSelector(tid('cp-card-start'));
      // Back to Your progress (the plan opened Your plan), so the long dashboard is what the student is looking at.
      await page.click('#cp-tab-progress');
      await page.waitForTimeout(150);
      const follow = await page.evaluate(() => {
        const log = document.querySelector('[data-testid="cp-log"]'); const col = document.querySelector('[data-testid="cp-cora-col"]');
        const last = log.lastElementChild.getBoundingClientRect(); const box = log.getBoundingClientRect(); const c = col.getBoundingClientRect();
        // Visible inside the chat: the log and its column (on a phone the column sits below the panel, off screen until scrolled to).
        const top = Math.max(box.top, c.top); const bottom = Math.min(box.bottom, c.bottom);
        return { inView: last.top >= top - 1 && last.bottom <= bottom + 1, last: [Math.round(last.top), Math.round(last.bottom)], view: [Math.round(top), Math.round(bottom)] };
      });
      return [follow.inView, JSON.stringify(follow)];
    });
    await unit(browser, errors, `10d ${w}: the scored Try card has an UNCHECKED "Save this answer to my profile"; ticking saves it with the question, unticking deletes it; the privacy line says so`, vp, async (page) => {
      const calls = [];
      page.on('request', (r) => { const p = new URL(r.url()).pathname; if (/\/attempts\/[^/]+\/save$/.test(p)) calls.push(`${r.method()} ${r.method() === 'POST' ? (r.postDataJSON() || {}).question || '' : ''}`); });
      await page.goto(`${BASE}/portal/career/room`);
      await page.click(tid('cp-card-i1'));
      await page.click('[data-testid="cp-card-plan:days"]');
      await page.click(tid('cp-card-start'));
      await page.click(tid('cp-session-next'));
      await page.click(tid('cp-record'));
      await page.click(tid('cp-stop'));
      await page.waitForSelector(tid('cp-try-result'));
      await page.waitForSelector(tid('cp-save-check'));
      const first = await page.evaluate(() => ({ checked: document.querySelector('[data-testid="cp-save-check"]').checked, privacy: (document.querySelector('[data-testid="cp-privacy"]') || {}).textContent || '' }));
      await page.click(tid('cp-save-check'));
      await page.waitForSelector(`${tid('cp-save')}[data-state="saved"]`);
      await page.evaluate(() => document.querySelector('[data-testid="cp-save"]').scrollIntoView({ block: 'center' }));
      await shot(page, `i_save_box_${w}`);
      await page.click(tid('cp-save-check'));
      await page.waitForSelector(`${tid('cp-save')}[data-state="deleted"]`);
      return [first.checked === false && /deleted after scoring unless you choose to save it/.test(first.privacy) && calls.length === 2 && /^POST \S/.test(calls[0]) && calls[1].startsWith('DELETE'),
        JSON.stringify({ ...first, calls })];
    });
  }
  // A plan takes 1.5 s to build: the buttons wait (a repeat click builds nothing), then Your plan names the picked skill.
  await unit(browser, errors, '10c while a plan builds every plan button waits ("Building your plan..."), a repeat click builds nothing, and Your plan names the picked skill',
    { viewport: { width: 1600, height: 960 }, api: { planDelayMs: 1500 } }, async (page, plans) => {
      await page.goto(`${BASE}/portal/career/room?anchor=i1`);
      await page.waitForSelector(tid('cp-dashboard'));
      const btn = (await page.$(tid('cp-read-plan-pace_clarity'))) || (await page.$('.cp-read li:first-child button'));
      await btn.click();
      await page.waitForTimeout(200);
      const busy = await page.evaluate(() => {
        const b = document.querySelector('.cp-read li:first-child button');
        return { text: b.textContent, disabled: [...document.querySelectorAll('.cp-read button, [data-testid^="cp-skill-"]')].every((x) => x.disabled) };
      });
      await page.click('.cp-read li:first-child button', { force: true, timeout: 1000 }).catch(() => undefined);
      await page.click(tid('cp-skill-few_fillers'), { force: true, timeout: 1000 }).catch(() => undefined);
      await page.waitForTimeout(2500);
      const focus = await page.evaluate(() => (document.querySelector('[data-testid="cp-plan-focus"]') || {}).textContent || null);
      return [busy.text === 'Building your plan...' && busy.disabled && plans.length === 1 && plans[0].focusSkill === 'pace_clarity' && focus === 'Focused on Pace and clarity, the skill you picked.',
        JSON.stringify({ ...busy, posts: plans.length, focus })];
    });
  return errors;
}

/** R1.2 (Ali, Q1: A): a saved answer's second opt-in, "Show on my public profile", in Hire studio > Video. */
async function flowR12(browser) {
  const errors = [];
  for (const [w, h] of [[1600, 960], [390, 844]]) {
    await unit(browser, errors, `11 ${w}: a saved answer's "Show on my public profile" is UNCHECKED by default; ticking sends on, unticking sends off; the note says employers never see the score`,
      { viewport: { width: w, height: h }, api: { saved: ['a1'] } }, async (page) => {
        const puts = [];
        page.on('request', (r) => { if (r.method() === 'PUT' && /\/attempts\/a1\/public$/.test(new URL(r.url()).pathname)) puts.push((r.postDataJSON() || {}).on); });
        await page.goto(`${BASE}/portal/portfolio?tab=hire&section=video`);
        await page.waitForSelector(tid('hs-saved-public'));
        const box = () => page.$eval(tid('hs-saved-public'), (el) => el.checked);
        const before = await box();
        const look = await page.evaluate(() => {
          const el = document.querySelector('[data-testid="hs-saved-public"]').closest('label').getBoundingClientRect();
          return { onScreen: el.left >= 0 && el.right <= innerWidth, overflow: document.documentElement.scrollWidth > innerWidth, note: (document.querySelector('.hs-saved-note') || {}).textContent || '' };
        });
        await page.click(tid('hs-saved-public'));
        await page.waitForFunction(() => document.querySelector('[data-testid="hs-saved-public"]').checked === true);
        const status = await page.$eval(tid('hs-saved-status'), (el) => el.textContent);
        await page.click(tid('hs-saved-public'));
        await page.waitForFunction(() => document.querySelector('[data-testid="hs-saved-public"]').checked === false);
        return [before === false && puts.join(',') === 'true,false' && status === 'Some are on your public profile' && look.onScreen && !look.overflow && /never your score/.test(look.note),
          JSON.stringify({ before, puts, status, ...look })];
      });
  }
  return errors;
}

async function flowAnchors(browser) {
  const { ctx, page, errors } = await newPage(browser);
  await page.goto(`${BASE}/portal/career/room`);
  await page.waitForSelector(tid('cp-card-add'));
  await page.click(tid('cp-card-add'));
  await page.fill('form[data-testid="cp-form"] label:has-text("Company") input', 'Globex');
  await page.fill('form[data-testid="cp-form"] label:has-text("Role") input', 'Data Analyst');
  await page.click('form[data-testid="cp-form"] button[type="submit"]');
  await page.waitForFunction(() => /Added by you/.test(document.querySelector('[data-testid="cp-anchor"]')?.textContent || ''), null, { timeout: 8000 })
    .catch(async (e) => { throw new Error(`added pill: ${await page.textContent(tid('cp-anchor')).catch(() => '?')} (${e.message})`); });
  const added = await page.textContent(tid('cp-anchor'));
  await page.click('[data-testid="cp-anchor"] button, .cp-anchor-change');
  await page.waitForSelector(tid('cp-card-create'));
  await page.click(`${tid('cp-card-create')} >> nth=-1`);
  await page.click('[data-testid="cp-card-type:behavioral"] >> nth=-1');
  await page.fill('form[data-testid="cp-form"] label:has-text("Role") input', 'Product Manager');
  await page.click('form[data-testid="cp-form"] button[type="submit"]');
  await page.waitForFunction(() => /Practice/.test(document.querySelector('[data-testid="cp-anchor"]')?.textContent || ''));
  const practice = await page.textContent(tid('cp-anchor'));
  check('5 Add an interview and Create one for me set the anchor pill', /Globex/.test(added) && /Added by you/.test(added) && /made by Cora/.test(practice), `${added.trim()} | ${practice.trim()}`);
  await ctx.close();
  return errors;
}

async function flowSheets(browser) {
  const { ctx, page, errors, api } = await newPage(browser);
  await page.goto(`${BASE}/portal/career/room#offers`);
  await page.waitForSelector(tid('cp-sheet-offers'));
  const onTop = async (sel) => page.evaluate((s) => { const el = document.querySelector(s); const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + 5, r.top + r.height / 2); return !!hit && (hit === el || el.contains(hit)); }, sel);
  const titleTop = await onTop('#cp-sheet-title');
  const offersText = await page.textContent(tid('cp-sheet-offers'));
  const bg = await page.$eval('.cp-sheet', (el) => getComputedStyle(el).backgroundColor);
  await page.keyboard.press('Control+k');
  await page.waitForSelector(tid('cp-jump-input'));
  const jumpTop = await onTop('[data-testid="cp-jump-input"]');
  await page.fill(tid('cp-jump-input'), 'resume');
  await page.keyboard.press('Enter');
  await page.waitForSelector(tid('cp-sheet-resume'));
  const linkH = await page.$eval('[data-testid="cp-resume-sheet"] a', (el) => el.getBoundingClientRect().height);
  check('6b a link styled as a button in a sheet is at least 44px tall', linkH >= 44, `${linkH}px`);
  const fee = /\bfees?\b/i.test(offersText) ? 1 : 0;
  check('6 sheets open from the URL and the jump bar, drawn above the room; the Offers sheet shows no fee',
    titleTop && jumpTop && !/rgba\(0, 0, 0, 0\)/.test(bg) && fee === 0, `title ${titleTop}, jump ${jumpTop}, bg ${bg}, fee words ${fee}`);
  await ctx.close();
  return errors;
}

async function flowIframe(browser) {
  const { ctx, page, errors } = await newPage(browser);
  await page.goto(`${BASE}/__iframe`);
  const frame = await (await page.waitForSelector('#f')).contentFrame();
  await frame.waitForSelector(tid('cp-room'), { timeout: 15_000 });
  await frame.click(tid('cp-card-i1'));
  await frame.waitForSelector('[data-testid="cp-card-plan:days"]');
  await ctx.close();
  return errors;
}

async function layout(browser) {
  const bad = [];
  const sizes = [[1600, 960], [1440, 900], [390, 844]];
  for (const [w, h] of sizes) {
    for (const dark of [false, true]) {
      const { ctx, page } = await newPage(browser, { viewport: { width: w, height: h }, dark });
      await page.goto(`${BASE}/portal/career/room`);
      await page.click(tid('cp-card-i1'));
      await page.click('[data-testid="cp-card-plan:days"]');
      for (const tab of ['progress', 'plan']) {
        // No silent catches: a renamed tab or block must fail the run, not quietly measure the wrong view.
        await page.click(`#cp-tab-${tab}`);
        await page.waitForSelector(tid(`cp-panel-${tab}`));
        // The LAST block of a plan row, focused, so its tooltip is on screen while the room is measured.
        if (tab === 'plan') await page.focus('.cp-day:first-of-type .cp-seg:last-of-type');
        if (SELFTEST === 'tip' && tab === 'plan') await page.addStyleTag({ content: '.cp-seg-tip{position:fixed!important;left:auto!important;right:-300px!important;max-width:none!important}' });
        if (SELFTEST === 'contrast') await page.addStyleTag({ content: '.cp-room h3{color:rgb(26,26,26)!important}' });
        if (SELFTEST === 'wide') await page.evaluate(() => { const d = document.createElement('div'); d.style.width = '2000px'; d.style.height = '4px'; document.querySelector('.cp-tabs-col').appendChild(d); });
        const m = await page.evaluate(() => {
          // The room is position:fixed and scrolls INSIDE itself, so measure every scroll container in it (and the page),
          // every visible tooltip's box against the viewport, and clipped text.
          const vw = document.documentElement.clientWidth;
          const scrollers = [document.documentElement, ...document.querySelectorAll('.cp-room, .cp-room *')]
            .filter((e) => e === document.documentElement || /(auto|scroll|hidden)/.test(getComputedStyle(e).overflowX))
            .filter((e) => e.clientWidth > 1 && e.scrollWidth > e.clientWidth + 1 && !(e.textContent.trim() && getComputedStyle(e).textOverflow === 'ellipsis'))
            .map((e) => `${e.className || e.tagName} ${e.scrollWidth}/${e.clientWidth}`);
          const tips = [...document.querySelectorAll('[role="tooltip"]')].filter((t) => getComputedStyle(t).display !== 'none')
            .map((t) => t.getBoundingClientRect()).filter((r) => r.left < 0 || r.right > vw).map((r) => `tooltip ${Math.round(r.left)}..${Math.round(r.right)} of ${vw}`);
          // Every visible heading in the room must read at 4.5:1 or better against the background behind it.
          const rgb = (c) => (c.match(/[\d.]+/g) || []).map(Number);
          const lum = ([r, g, b]) => [r, g, b].map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
          const bgOf = (e) => { for (let n = e; n; n = n.parentElement) { const c = rgb(getComputedStyle(n).backgroundColor); if (c.length >= 3 && (c[3] === undefined || c[3] > 0.5)) return c; } return [255, 255, 255]; };
          const dim = [...document.querySelectorAll('.cp-room h1, .cp-room h2, .cp-room h3, .cp-room h4')].filter((h) => h.getClientRects().length && h.textContent.trim())
            .map((h) => { const a = lum(rgb(getComputedStyle(h).color)); const b = lum(bgOf(h)); return { t: h.textContent.trim().slice(0, 30), r: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) }; })
            .filter((x) => x.r < 4.5).map((x) => `heading "${x.t}" contrast ${x.r.toFixed(2)}`);
          return [...scrollers, ...tips, ...dim];
        });
        if (m.length) bad.push(`room ${tab} ${w}${dark ? ' dark' : ''}: ${m.join(', ')}`);
      }
      if (w !== 1600 && !dark) {
        await page.goto(`${BASE}/portal/career`);
        await page.waitForSelector(tid('cp-floor'));
        const f = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, rows: new Set([...document.querySelector('[data-testid="cp-trail"]').children].map((c) => Math.round(c.getBoundingClientRect().top))).size }));
        if (f.sw > f.cw || f.rows !== 1) bad.push(`floor ${w}: scroll ${f.sw}/${f.cw}, trail rows ${f.rows}`);
      }
      await ctx.close();
    }
  }
  check('layout: no horizontal scroll, no tooltip off screen, every room heading at 4.5:1 (room 1600/1440/390 light+dark, floor 1440/390)', bad.length === 0, bad.join('; '));
  // R1.1: the tab strip never scrolls (Ali saw up/down arrows on it). Production had PortfolioPage.css loaded (its global
  // .cp-tabs has overflow-x:auto), so measure with it on: no overflow either way, at every width.
  const portfolioCss = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'frontend', 'src', 'pages', 'portal', 'portfolio', 'PortfolioPage.css'), 'utf8');
  const strip = [];
  for (const [w, h] of sizes) {
    const { ctx, page } = await newPage(browser, { viewport: { width: w, height: h } });
    await page.goto(`${BASE}/portal/career/room`);
    await page.waitForSelector(tid('cp-dashboard'));
    await page.addStyleTag({ content: portfolioCss });
    for (const tab of ['progress', 'plan', 'session']) {
      await page.click(`#cp-tab-${tab}`);
      const m = await page.$eval('.cp-tabs', (el) => ({ sh: el.scrollHeight, ch: el.clientHeight, sw: el.scrollWidth, cw: el.clientWidth }));
      if (m.sh > m.ch || m.sw > m.cw) strip.push(`${w} ${tab}: ${m.sh}/${m.ch} high, ${m.sw}/${m.cw} wide`);
    }
    await ctx.close();
  }
  check('10h the tab strip never overflows or scrolls (1600/1440/390, PortfolioPage.css loaded)', strip.length === 0, strip.join('; '));
}

runSuite(20, async (browser) => {
  const errs = [];
  errs.push(...await flowFloorAndRoom(browser));
  errs.push(...await flowAnchors(browser));
  errs.push(...await flowSheets(browser));
  errs.push(...await flowDesign(browser));
  errs.push(...await flowR11(browser));
  errs.push(...await flowR12(browser));
  const frameErrs = await flowIframe(browser);
  check('8 zero console errors in every flow, and inside a sandboxed iframe', errs.length === 0 && frameErrs.length === 0, [...errs, ...frameErrs].slice(0, 3).join(' | '));
  await layout(browser);
});
