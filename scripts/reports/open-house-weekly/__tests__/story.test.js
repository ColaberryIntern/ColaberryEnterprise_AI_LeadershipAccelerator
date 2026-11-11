// C124: the decision story, the starred move, the prompt, the email and the Wednesday slot.
// Run: node --test scripts/reports/open-house-weekly/__tests__
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../lib/story');
const R = require('../lib/recommend');
const { buildView } = require('../lib/view');
const { buildPromptMd } = require('../lib/promptMd');
const { renderEmail } = require('../lib/emailRender');
const { buildPackage } = require('../sendWeekly');
const { buildHtml } = require('../render');
const { matchSlot } = require('../scheduled');
const targets = require('../targets');

function win(over = {}) {
  return {
    from_ct: '2026-11-10 15:10', to_ct: '2026-11-11 12:26', hours: 21.3, visitors: 53,
    engagement: { seat: 16, start: 0, read: 5, skimmed: 5, bounced: 27 }, scroll: { d25: 15, d50: 11, d75: 7, d90: 6, d100: 6 }, median_visit_s: 26,
    by_source: [{ label: 'Facebook', visitors: 27, clicked_seat: 12, signups: 11 }, { label: 'Instagram', visitors: 22, clicked_seat: 2, signups: 2 }],
    by_device: [{ label: 'mobile', visitors: 49, clicked_seat: 13, signups: 12 }], start_path: { clicks: 1, accounts: 0 },
    signups: { total: 17, landing_page: 14, training_site: 3, other_door: 0, lp_linked_to_visit: 13, lp_from_seat_click: 13 },
    journey: { signups: 14, new_account: 13, existing_account: 1, email_sent: 13, entered: 4, entered_button: 4, entered_link: 0, played: 0,
      finished: 0, credited: 0, took_check: 0, aced: 0, kept_going: 0, returned_later: 0, exits: [], median_min_signup_to_enter: 0.1, median_min_enter_to_finish: null },
    daily: [{ day: '2026-11-11', visitors: 53, signups: 14, entered: 4, finished: 0 }], ...over,
  };
}
const snap = (w = win()) => ({ generated_ct: '2026-11-18 08:00', windows: { cur: w }, email: { emails: 13, found: 11, delivered: 11, opened: 2, clicked: 0 } });
const H = (over) => ({ id: 'H-1', date: '2026-11-11', kind: 'hypothesis', title: 't', test: { metric: 'enter', op: '>=', value: 70 }, status: 'open', ...over });

test('the committed decisions.json is valid and append-only shaped', () => {
  const entries = S.load();
  assert.ok(entries.length >= 10);
  assert.equal(new Set(entries.map((e) => e.id)).size, entries.length);
});

test('validate: refuses duplicate ids, unknown kinds and untestable hypotheses', () => {
  const ok = { id: 'a', date: 'd', kind: 'decision', title: 't' };
  assert.throws(() => S.validate({ entries: [ok, ok] }), /duplicate id/);
  assert.throws(() => S.validate({ entries: [{ ...ok, kind: 'vibe' }] }), /unknown kind/);
  assert.throws(() => S.validate({ entries: [H({ test: { metric: 'enter', op: '>' , value: 1 } })] }), /needs test/);
  assert.throws(() => S.validate({ entries: [{ id: 'x', date: 'd', kind: 'decision' }] }), /missing "title"/);
});

test('hypotheses: holding / not holding / too few / retracted', () => {
  const g = (h, w = win()) => S.gradeHypothesis(h, w, null, targets, new Set()).status;
  assert.equal(g(H()), 'bad');                                                  // 4/13 = 30.8% < 70
  assert.equal(g(H({ test: { metric: 'enter', op: '>=', value: 30 } })), 'good');
  assert.equal(g(H({ test: { metric: 'play', op: '>=', value: 50 } })), 'low'); // 0 of 4
  assert.equal(S.gradeHypothesis(H(), win(), null, targets, new Set(['H-1'])).status, 'retracted');
  assert.equal(g(H({ test: { metric: 'bounce', op: '<=', value: 60 } })), 'good');
});

test('moves in flight: only until measure_until, and never once superseded', () => {
  const b = { id: 'B', date: '2026-11-11', kind: 'build', title: 't', move: 'play', measure_until: '2026-11-18' };
  assert.deepEqual(S.movesInFlight([b], '2026-11-18').map((m) => m.move), ['play']);
  assert.deepEqual(S.movesInFlight([b], '2026-11-19'), []);
  assert.deepEqual(S.movesInFlight([b, { id: 'R', date: '2026-11-12', kind: 'retraction', title: 'r', supersedes: 'B' }], '2026-11-12'), []);
});

test('recommend: the starred move is not one being measured', () => {
  const free = R.recommend(win(), null, targets, [], '2026-11-18');
  const busy = R.recommend(win(), null, targets, [{ move: free.star.key, id: 'B', title: 'x', until: '2026-11-25' }], '2026-11-18');
  assert.notEqual(busy.star.key, free.star.key);
  assert.ok(busy.measuring.some((m) => m.key === free.star.key));
});

test('recommend: buildable wins unless a human move scores 1.5x; ids carry the week', () => {
  const r = R.recommend(win(), null, targets, [], '2026-11-18');
  assert.equal(r.star.executor, 'build');
  assert.match(r.star.id, /^REC-2026-11-18-/);
  // Make the source gap huge: 200 Instagram visitors, 0 sign-ups. Now the human move must win.
  const big = win({ by_source: [{ label: 'Facebook', visitors: 27, clicked_seat: 12, signups: 11 }, { label: 'Instagram', visitors: 200, clicked_seat: 2, signups: 0 }] });
  assert.equal(R.recommend(big, null, targets, [], '2026-11-18').star.key, 'source');
});

test('recommend: top-of-funnel moves are halved when sign-ups are on target', () => {
  const c = R.candidates(win(), null, targets).find((x) => x.key === 'bounce');
  assert.equal(c.top, 0.5);
  const weak = win({ signups: { ...win().signups, landing_page: 3 } });
  assert.equal(R.candidates(weak, null, targets).find((x) => x.key === 'bounce').top, 1);
});

test('topTen: at most 10, ranked 1..n, unique, every stop links to a section', () => {
  const t = R.topTen(win(), snap().email, targets);
  assert.ok(t.length <= 10 && t.length >= 5);
  assert.deepEqual(t.map((x) => x.rank), t.map((_, i) => i + 1));
  assert.equal(new Set(t.map((x) => x.id)).size, t.length);
  const html = buildHtml(snap(), targets, [], S.load());
  for (const s of t) assert.match(html, new RegExp(`id="${s.anchor}"`), s.id);
});

test('one view, three outputs: the star in the email, the report and the prompt is the same move', () => {
  const view = buildView(snap(), targets, S.load());
  const email = renderEmail(view), prompt = buildPromptMd(view, targets), html = buildHtml(snap(), targets, [], S.load());
  assert.ok(email.subject.includes(view.rec.star.title));
  assert.ok(prompt.includes(view.rec.star.id) && prompt.startsWith(`# ONE MOVE: ${view.rec.star.title}`));
  assert.ok(html.includes(view.rec.star.id));
});

test('prompt: the ledger entries it asks for are valid JSON that the validator accepts', () => {
  const view = buildView(snap(), targets, S.load());
  const md = buildPromptMd(view, targets);
  const block = md.match(/```json\n([\s\S]*?)\n```/)[1];
  const entries = JSON.parse(`[${block}]`);
  assert.equal(entries[0].measure_until, '2026-11-25');
  assert.equal(entries[0].recommendation, view.rec.star.id);
  S.validate({ entries: [...S.load(), ...entries] });
});

test('email: passes the Mandrill preflight, under the Gmail clip, no em dash, one signature', () => {
  const pkg = buildPackage(snap(), S.load());
  assert.ok(pkg.bytes < 100 * 1024);
  assert.doesNotMatch(pkg.email.html + pkg.email.text, /—/);
  assert.equal((pkg.email.html.match(/Managing Director/g) || []).length, 1);
  assert.match(pkg.email.text, /THE ONE MOVE/);
  assert.doesNotMatch(pkg.email.html.replace(/is_free/g, ''), /\bfree\b/i);
});

test('slot: Wednesday 08:00 CT in both CDT and CST, within 20 minutes, nowhere else', () => {
  assert.equal(matchSlot(new Date('2026-11-18T14:00:00Z')), 'Wed 2026-11-18 08:00 CT');   // CST: 14:00 UTC
  assert.equal(matchSlot(new Date('2026-11-18T13:00:00Z')), null);                          // 07:00 CST
  assert.equal(matchSlot(new Date('2026-07-15T13:05:00Z')), 'Wed 2026-07-15 08:00 CT');   // CDT: 13:00 UTC
  assert.equal(matchSlot(new Date('2026-07-15T14:00:00Z')), null);                          // 09:00 CDT
  assert.equal(matchSlot(new Date('2026-11-18T14:21:00Z')), null);                          // 21 min late
  assert.equal(matchSlot(new Date('2026-11-19T14:00:00Z')), null);                          // Thursday
});
