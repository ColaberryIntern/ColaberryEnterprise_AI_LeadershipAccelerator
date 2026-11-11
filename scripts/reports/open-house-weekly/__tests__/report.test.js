// C123: unit tests for the weekly Open House report. Run: node --test scripts/reports/open-house-weekly/__tests__
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../lib/model');
const I = require('../lib/insights');
const { buildHtml } = require('../render');
const targets = require('../targets');

// Shaped like collect.sql output; numbers are production's first 21 hours (11 Nov 2026).
function win(over = {}) {
  return {
    from_ct: '2026-11-10 15:10', to_ct: '2026-11-11 12:20', hours: 21.2, visitors: 52,
    engagement: { seat: 16, start: 0, read: 5, skimmed: 5, bounced: 26 },
    scroll: { d25: 15, d50: 11, d75: 7, d90: 6, d100: 6 }, median_visit_s: 25,
    by_source: [{ label: 'Facebook', visitors: 27, clicked_seat: 12, signups: 11 }, { label: 'Instagram', visitors: 22, clicked_seat: 2, signups: 2 },
      { label: 'Direct / untagged', visitors: 3, clicked_seat: 2, signups: 0 }],
    by_device: [{ label: 'mobile', visitors: 48, clicked_seat: 13, signups: 12 }, { label: 'desktop', visitors: 3, clicked_seat: 2, signups: 0 }],
    start_path: { clicks: 1, accounts: 0 },
    signups: { total: 17, landing_page: 14, training_site: 3, other_door: 0, lp_linked_to_visit: 13, lp_from_seat_click: 13 },
    journey: { signups: 14, new_account: 13, existing_account: 1, email_sent: 13, entered: 4, entered_button: 4, entered_link: 0,
      played: 0, finished: 0, took_check: 0, aced: 0, kept_going: 0, returned_later: 0, exits: [],
      median_min_signup_to_enter: 0.1, median_min_enter_to_finish: null },
    daily: [{ day: '2026-11-10', visitors: 20, signups: 4, entered: 0, finished: 0 }, { day: '2026-11-11', visitors: 32, signups: 10, entered: 4, finished: 0 }],
    ...over,
  };
}
const snap = (over = {}) => ({ generated_ct: '2026-11-11 12:20', launch_ct: '2026-11-10 15:10', windows: { cur: win() }, email: null, ...over });

test('grade: green / amber / red against the floors, grey under minSample', () => {
  assert.equal(M.grade('signup', 30, 100, targets).status, 'good');
  assert.equal(M.grade('signup', 12, 100, targets).status, 'ok');
  assert.equal(M.grade('signup', 5, 100, targets).status, 'bad');
  assert.equal(M.grade('signup', 4, 4, targets).status, 'low');      // 100% of 4 people is not "on target"
  assert.equal(M.grade('signup', 0, 0, targets).status, 'none');
});

test('grade: lowerIsBetter flips the comparison (bounce)', () => {
  assert.equal(M.grade('bounce', 30, 100, targets).status, 'good');
  assert.equal(M.grade('bounce', 50, 100, targets).status, 'ok');
  assert.equal(M.grade('bounce', 70, 100, targets).status, 'bad');
});

test('boundary: a rate exactly on the floor counts as meeting it', () => {
  assert.equal(M.grade('signup', 20, 100, targets).status, 'good');
  assert.equal(M.grade('signup', 10, 100, targets).status, 'ok');
});

test('funnel: % of step before and of visitors; Entered is measured against new accounts', () => {
  const f = M.funnel(win(), targets);
  const by = Object.fromEntries(f.map((r) => [r.step, r]));
  assert.equal(by['Clicked “Save my seat”'].pctPrev, 30.8);
  assert.equal(by['Signed up for Open House'].pctPrev, 87.5);
  assert.equal(by['Entered the account'].prevN, 13);
  assert.equal(by['Entered the account'].pctPrev, 30.8);
  assert.equal(by['Entered the account'].status, 'bad');
  assert.equal(by['Pressed play on the video'].status, 'low');       // 0 of 4: too few to judge
  assert.equal(f[0].pctTop, 100);
});

test('funnel: Entered is a share of new accounts even when fewer welcome emails went out', () => {
  const f = M.funnel(win({ journey: { ...win().journey, email_sent: 11 } }), targets);
  const entered = f.find((r) => r.step === 'Entered the account');
  assert.equal(entered.prevN, 13);
  assert.equal(entered.pctPrev, 30.8);
});

test('forks: options add up to the fork total, shares add to ~100%', () => {
  for (const f of M.forks(win(), { emails: 13, found: 11, delivered: 11, opened: 2, clicked: 0 }, targets)) {
    assert.equal(f.options.reduce((a, o) => a + o.n, 0), f.total, f.id);
    if (f.total) assert.ok(Math.abs(f.options.reduce((a, o) => a + o.pct, 0) - 100) < 0.5, f.id);
  }
});

test('forks: the email fork appears only when Mandrill was read', () => {
  assert.equal(M.forks(win(), null, targets).some((f) => f.id === 'email'), false);
  assert.equal(M.forks(win(), { emails: 13, found: 11, delivered: 11, opened: 2, clicked: 0 }, targets).some((f) => f.id === 'email'), true);
});

test('people: every person counted once = tracked visitors + untracked sign-ups', () => {
  const p = M.people(win());
  assert.equal(p.untracked, 1);
  assert.equal(p.total, 53);
  assert.equal(p.stages.find((s) => s.key === 'noplay').n, 4);
});

test('people: linked sign-ups outside the seat-click tier are not double counted', () => {
  const w = win({ signups: { ...win().signups, lp_linked_to_visit: 15, lp_from_seat_click: 13, landing_page: 15 },
    journey: { ...win().journey, signups: 15, new_account: 14 } });
  assert.equal(M.people(w).total, 52);                               // 52 visitors, all sign-ups tracked
});

test('sankey: no zero edges; what flows into a node flows out of it', () => {
  const e = M.sankey(win());
  assert.ok(e.every((x) => x[2] > 0));
  const sum = (pred) => e.filter(pred).reduce((a, x) => a + x[2], 0);
  for (const node of ['Landing page', 'Signed up', 'New account']) assert.equal(sum((x) => x[1] === node), sum((x) => x[0] === node), node);
});

test('exitBins: buckets by second, first 15 s separate', () => {
  assert.deepEqual(M.exitBins([5, 6, 12, 15, 18, 46, 100]).map((b) => b.n), [3, 2, 1, 0, 1]);
  assert.deepEqual(M.exitBins([]).map((b) => b.n), [0, 0, 0, 0, 0]);
});

test('findings: a below-target step outranks a lower on-target one; zero plays is called out', () => {
  const f = I.findings(win(), targets);
  assert.match(f[0].text, /^Biggest leak: Entered the account/);
  assert.ok(f.some((x) => /none pressed play/.test(x.text)));
  assert.ok(f.some((x) => /Facebook converts best/.test(x.text)));
});

test('kpis: no week before means no deltas; a week before yields signed changes', () => {
  assert.ok(I.kpis(win(), null, targets).every((k) => k.delta === null));
  const k = I.kpis(win(), win({ visitors: 40, signups: { ...win().signups, landing_page: 8 } }), targets);
  assert.equal(k[0].delta, 12);
  assert.equal(k[1].delta, 6);
});

test('empty window: renders without throwing and says so', () => {
  const z = win({ visitors: 0, engagement: { seat: 0, start: 0, read: 0, skimmed: 0, bounced: 0 }, scroll: { d25: 0, d50: 0, d75: 0, d90: 0, d100: 0 },
    by_source: [], by_device: [], signups: { total: 0, landing_page: 0, training_site: 0, other_door: 0, lp_linked_to_visit: 0, lp_from_seat_click: 0 },
    journey: { ...win().journey, signups: 0, new_account: 0, existing_account: 0, email_sent: 0, entered: 0, entered_button: 0 }, daily: [], median_visit_s: null });
  const html = buildHtml(snap({ windows: { cur: z } }));
  assert.match(html, /No traffic in this window/);
  assert.match(html, /Not enough traffic yet/);
});

test('render: deterministic, escaped, no "free", American spelling, Mermaid pinned', () => {
  const a = buildHtml(snap()), b = buildHtml(snap());
  assert.equal(a, b);
  const evil = snap();
  evil.windows.cur.by_source[0].label = '<script>alert(1)</script>';
  assert.doesNotMatch(buildHtml(evil), /<script>alert/);
  assert.doesNotMatch(a.replace(/is_free/g, ''), /\bfree\b/i);
  assert.doesNotMatch(a, /\b(colour|behaviour|analyse|optimise)/i);
  assert.match(a, /mermaid@10\.9\.1/);
  assert.match(a, /sankey-beta/);
  assert.match(a, /first week/);
});

test('render: with a week before, the comparison shows', () => {
  const html = buildHtml(snap({ windows: { cur: win(), prev: win({ from_ct: '2026-11-03 12:20', visitors: 40 }) } }));
  assert.match(html, /compared with 2026-11-03 12:20/);
  assert.match(html, /▲ 12/);
});
