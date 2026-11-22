// OH1y: the Open House step (attendance + follow-up) and the visitor_sessions timeout guard.
// Run: node --test scripts/reports/open-house-weekly/__tests__
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const M = require('../lib/model');
const I = require('../lib/insights');
const { rateOf } = require('../lib/metrics');
const R = require('../lib/recommend');
const { buildHtml } = require('../render');
const targets = require('../targets');

const ROOT = path.join(__dirname, '..', '..', '..', '..');

// Shaped like collect.sql output; the attendance numbers are production's, 22 Nov 2026 (week of 15-22 Nov).
function win(journeyOver = {}) {
  return {
    from_ct: '2026-11-15 13:49', to_ct: '2026-11-22 13:49', hours: 168, visitors: 700,
    engagement: { seat: 180, start: 10, read: 60, skimmed: 90, bounced: 360 },
    scroll: { d25: 340, d50: 250, d75: 160, d90: 120, d100: 100 }, median_visit_s: 28,
    by_source: [{ label: 'Facebook', visitors: 400, clicked_seat: 110, signups: 90 }, { label: 'Instagram', visitors: 300, clicked_seat: 70, signups: 49 }],
    by_device: [{ label: 'mobile', visitors: 650, clicked_seat: 170, signups: 130 }],
    start_path: { clicks: 10, accounts: 2 },
    signups: { total: 150, landing_page: 139, training_site: 11, other_door: 0, lp_linked_to_visit: 130, lp_from_seat_click: 128 },
    journey: { signups: 139, new_account: 120, existing_account: 19, email_sent: 120, entered: 70, entered_button: 60, entered_link: 10,
      played: 50, finished: 30, credited: 27, took_check: 20, aced: 12, kept_going: 15, returned_later: 8, exits: [5, 12, 40],
      median_min_signup_to_enter: 0.2, median_min_enter_to_finish: 3.1,
      oh_held: 74, oh_upcoming: 65, attended: 4, followup_sent: 0, held_watched: 21, attended_watched: 1, ...journeyOver },
    daily: [],
  };
}
const SESSIONS = [
  { date: '2026-11-19', status: 'completed', held: true, registered: 228, registered_lp: 123, checked_in: 11, checked_in_lp: 5, walk_ins: 7, followups_booked: 0, followups_sent: 0 },
  { date: '2026-12-03', status: 'scheduled', held: false, registered: 70, registered_lp: 65, checked_in: 0, checked_in_lp: 0, walk_ins: 0, followups_booked: 0, followups_sent: 0 },
];
const snap = (w = win(), over = {}) => ({ generated_ct: '2026-11-22 13:49', launch_ct: '2026-11-10 15:10', windows: { cur: w }, email: null, sessions: SESSIONS, ...over });
const legacy = () => { const w = win(); for (const k of ['oh_held', 'oh_upcoming', 'attended', 'followup_sent', 'held_watched', 'attended_watched']) delete w.journey[k]; return w; };

test('funnel: the Open House rows are measured against sign-ups, then against those whose session happened', () => {
  const rows = M.funnel(win(), targets);
  const held = rows.find((r) => r.step === 'Their Open House has happened');
  const came = rows.find((r) => r.step === 'Checked in at the Open House');
  assert.equal(held.prevN, 139, 'held is a share of landing-page sign-ups, not of the Quick check');
  assert.equal(came.prevN, 74);
  assert.equal(came.pctPrev, 5.4);
  assert.equal(came.status, 'bad');
  assert.match(came.note, /floor/);
});

test('funnel: a snapshot from before attendance existed has no Open House rows and the rest is unchanged', () => {
  const rows = M.funnel(legacy(), targets);
  assert.ok(!rows.some((r) => /Open House has happened|Checked in/.test(r.step)));
  assert.equal(rows.length, 11);
  assert.equal(rateOf('attend', legacy(), null), null, 'no data is null, never zero');
});

test('forks: the attendance fork adds up to the people whose Open House happened', () => {
  const f = M.forks(win(), null, targets).find((x) => x.id === 'attend');
  assert.equal(f.total, 74);
  assert.deepEqual(f.options.map((o) => o.n), [4, 70]);
  assert.equal(f.grade.status, 'bad');
});

test('rateOf attend: attended over held, and graded grey under minSample', () => {
  assert.deepEqual(rateOf('attend', win(), null), { n: 4, d: 74 });
  const small = win({ oh_held: 3, attended: 1 });
  assert.equal(M.grade('attend', 1, 3, targets).status, 'low');
  assert.deepEqual(rateOf('attend', small, null), { n: 1, d: 3 });
});

test('findings: attendance is stated with its floor, and the video comparison only with enough people', () => {
  const f = I.findings(win(), targets).map((x) => x.text);
  assert.ok(f.some((t) => /4 of 74 sign-ups whose Open House has happened checked in \(5\.4%\)\..*floor/.test(t)));
  assert.ok(f.some((t) => /Finished the welcome video before the session: 4\.8% checked in \(1 of 21\)\. Did not: 5\.7% \(3 of 53\)\. No real difference yet\./.test(t)));
  assert.ok(f.some((t) => /65 more sign-ups are waiting/.test(t)));
  const few = I.findings(win({ held_watched: 3, attended_watched: 0 }), targets).map((x) => x.text);
  assert.ok(few.some((t) => /too few to say yet/.test(t)));
  assert.ok(!few.some((t) => /Did not:/.test(t)));
});

test('kpis: a "Came to the Open House" tile only when attendance exists', () => {
  assert.ok(I.kpis(win(), null, targets).some((t) => t.label === 'Came to the Open House' && t.value === 4));
  assert.ok(!I.kpis(legacy(), null, targets).some((t) => t.label === 'Came to the Open House'));
});

test('recommend: attendance is a candidate move with a measurable hypothesis, and its files exist', () => {
  const c = R.candidates(win(), null, targets).find((x) => x.key === 'attend');
  assert.ok(c, 'attend is scored');
  assert.equal(c.hypothesis.metric, 'attend');
  for (const f of R.PLAYBOOK.attend.files) assert.ok(fs.existsSync(path.join(ROOT, f)), `playbook file exists: ${f}`);
  assert.ok(R.topTen(win(), null, targets).some((x) => x.id === 'attend' && /floor/.test(x.text)));
});

test('render: the Open House section and session table appear, escaped and without banned words', () => {
  const html = buildHtml(snap(), targets, [], []);
  assert.match(html, /id="sec-openhouse"/);
  assert.match(html, /<td>2026-11-19<\/td><td>Happened<\/td><td class="num">228<\/td><td class="num">123<\/td>/);
  assert.match(html, /<td class="num">4\.8%<\/td>/);
  assert.match(html, /Upcoming/);
  assert.doesNotMatch(html, /\bfree\b/i);
  const old = buildHtml(snap(legacy(), { sessions: undefined }), targets, [], []);
  assert.doesNotMatch(old, /sec-openhouse/);
});

test('collect.sql reads visitor_sessions once, never per visitor (it timed out on 22 Nov 2026)', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'collect.sql'), 'utf8').split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
  assert.equal((sql.match(/\bvisitor_sessions\b/g) || []).length, 1, 'one read of visitor_sessions');
  assert.match(sql, /CREATE TEMP TABLE lpsess/);
  assert.match(sql, /FROM lpsess s\s+WHERE s\.visitor_id = v\.visitor_id/);
});

test('collect.sql: attendance uses the same check-in rule as the follow-up email', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'collect.sql'), 'utf8');
  assert.match(sql, /session_guests sg[\s\S]*NOT sg\.awaiting_class/);
  assert.match(sql, /attendance_records ar[\s\S]*ar\.status::text IN \('present', 'late'\)/);
  assert.match(sql, /'sessions', \(SELECT coalesce\(json_agg/);
});
