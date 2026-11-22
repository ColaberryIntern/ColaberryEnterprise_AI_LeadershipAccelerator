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
const OH_KEYS = ['oh_held', 'oh_upcoming', 'attended', 'followup_sent', 'held_watched', 'attended_watched', 'interacted',
  'paid', 'paid_held', 'paid_attended', 'paid_interacted', 'checkout_held', 'already_paid'];
const legacy = () => { const w = win(); for (const k of OH_KEYS) delete w.journey[k]; return w; };
// Second ask (interaction, paid, every message). Numbers shaped like production on 22 Nov, with one made-up payer.
const full = (over = {}) => win({ interacted: 3, paid: 1, paid_held: 1, paid_attended: 1, paid_interacted: 1, checkout_held: 2, checkout: 2, already_paid: 0, ...over });
// Every payer this window, any source. Shaped like production, 15-22 Nov 2026.
const PAYERS = { total: 6, monthly: 4, annual: 2, oh_registered: 1, came_before_paying: 0, by_origin: [
  { origin: 'earlier_oh_lead', n: 3, came: 0 }, { origin: 'winback', n: 2, came: 0 }, { origin: 'oh_other_door', n: 1, came: 0 }] };
const COMMS = { people: 139, reached: 131, median_per_person: 2, max_per_person: 4, messages: [
  { key: 'event:open_house_welcome:email', channel: 'email', kind: 'system', source: 'open_house_welcome', step: null, sent: 125, not_sent: 0, people: 125, subject: "You're in. Your first assignment takes 2 minutes.", subjects: 1, first_ct: '2026-11-15', last_ct: '2026-11-22' },
  { key: 'campaign:x:2:email', channel: 'email', kind: 'campaign', source: 'Open House Countdown (Maya)', step: 3, sent: 71, not_sent: 0, people: 71, subject: null, subjects: 15, first_ct: '2026-11-19', last_ct: '2026-11-19' },
  { key: 'campaign:x:9:email', channel: 'email', kind: 'campaign', source: 'One-off', step: 1, sent: 1, not_sent: 0, people: 1, subject: 'Your Open House is Tonight, Victoria', subjects: 1, first_ct: '2026-11-19', last_ct: '2026-11-19' },
  { key: 'campaign:x:3:sms', channel: 'sms', kind: 'campaign', source: 'Open House Countdown (Maya)', step: 4, sent: 39, not_sent: 2, not_sent_status: 'failed', people: 39, subject: null, subjects: 0, first_ct: '2026-11-19', last_ct: '2026-11-19' }],
  queued: [{ source: 'Open House Countdown (Maya)', channel: 'email', sends: 195, people: 65, next_ct: '2026-11-26 18:30' }] };

test('funnel: the Open House rows are measured against sign-ups, then against those whose session happened', () => {
  const rows = M.funnel(win(), targets);
  const held = rows.find((r) => r.step === 'Their Open House has happened');
  const came = rows.find((r) => r.step === 'Came to the Open House');
  assert.equal(held.prevN, 139, 'held is a share of landing-page sign-ups, not of the Quick check');
  assert.equal(came.prevN, 74);
  assert.equal(came.pctPrev, 5.4);
  assert.equal(came.status, 'bad');
  assert.match(came.note, /floor/);
});

test('funnel: a snapshot from before attendance existed has no Open House rows and the rest is unchanged', () => {
  const rows = M.funnel(legacy(), targets);
  assert.ok(!rows.some((r) => /Open House has happened|Came to the Open House|Paid to enroll/.test(r.step)));
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
  assert.ok(f.some((t) => /4 of 74 sign-ups whose Open House has happened came \(5\.4%\)\..*floor/.test(t)));
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

test('funnel: took part is a share of those who came; paid is a share of every ad sign-up', () => {
  const rows = M.funnel(full(), targets);
  const steps = rows.map((r) => r.step);
  const i = steps.indexOf('Came to the Open House');
  assert.equal(steps[i + 1], 'Took part (poll, question or status)');
  assert.equal(steps[i + 2], 'Paid to enroll (of every ad sign-up)');
  assert.equal(rows[i + 1].prevN, 4);
  assert.equal(rows[i + 1].status, 'low', '3 of 4 is too few to judge, never "75%" in green');
  assert.equal(rows[i + 2].prevN, 139, 'paid is measured against every ad sign-up: paying before the Open House counts');
  assert.equal(rateOf('interact', full(), null).d, 4);
  assert.deepEqual(rateOf('paid', full(), null), { n: 1, d: 139 });
});

test('forks: which ad sign-ups paid adds up to every ad sign-up', () => {
  const f = M.forks(full(), null, targets).find((x) => x.id === 'paid');
  assert.equal(f.total, 139);
  assert.deepEqual(f.options.map((o) => o.n), [1, 0, 0, 1, 137]);
  const none = M.forks(full({ paid: 0, paid_attended: 0, paid_interacted: 0, checkout: 1 }), null, targets).find((x) => x.id === 'paid');
  assert.equal(none.total, 139);
});

test('findings: ad sign-ups who paid, took part, and every payer from every source', () => {
  const w = full();
  w.payers = PAYERS;
  const f = I.findings(w, targets).map((x) => x.text);
  assert.ok(f.some((t) => /3 of the 4 who came took part/.test(t)));
  assert.ok(f.some((t) => /1 of 139 ad sign-ups paid to enroll \(0\.7%\): 1 took part at the Open House, 0 came and watched, 0 paid without coming\. 1 more started checkout and did not pay\./.test(t)));
  assert.ok(f.some((t) => /6 people paid to enroll this week \(4 monthly, 2 annual\): Earlier Open House lead \(before the ads\): 3; Win-back or alumni campaign: 2; Open House registrant, another door: 1\. 0 had come to an Open House before paying\./.test(t)));
  const none = I.findings(full({ paid: 0, paid_attended: 0, paid_interacted: 0, checkout: 1 }), targets).map((x) => x.text);
  assert.ok(none.some((t) => /No ad sign-up has paid to enroll yet \(0 of 139\)\. 1 started checkout/.test(t)));
  const tile = I.kpis(w, null, targets).find((t) => t.label === 'Paid to enroll, every source');
  assert.equal(tile.value, 6);
  assert.match(tile.sub, /1 of them came from the ads/);
});

test('who paid: the report and the email show every payer, and "too few to judge" replaces a 4-person %', () => {
  const w = full();
  w.payers = PAYERS;
  const html = buildHtml(snap(w), targets, [], []);
  assert.match(html, /id="sec-paid"/);
  assert.match(html, /<b>6<\/b> people paid to enroll \(4 monthly, 2 annual\)/);
  assert.match(html, /<td>Earlier Open House lead \(before the ads\)<\/td><td class="num">3<\/td>/);
  const { buildView } = require('../lib/view');
  const { renderEmail } = require('../lib/emailRender');
  const e = renderEmail(buildView(snap(w), targets, []));
  assert.match(e.text, /WHO PAID THIS WEEK\n- 6 paid to enroll \(4 monthly, 2 annual\); 0 came to an Open House first\.\n- Earlier Open House lead \(before the ads\): 3\n- Win-back or alumni campaign: 2/);
  assert.match(e.text, /- Took part at the Open House: too few to judge \(3\/4\), target 60%/);
  assert.doesNotMatch(e.text, /Took part at the Open House: 75%/);
  const nobody = full(); nobody.payers = { total: 0, monthly: 0, annual: 0, oh_registered: 0, came_before_paying: 0, by_origin: [] };
  assert.match(buildHtml(snap(nobody), targets, [], []), /Nobody paid to enroll in this window/);
});

test('messages: every one listed in order with plain names; a one-person subject never shows', () => {
  const html = buildHtml(snap(full(), { comms: COMMS }), targets, [], []);
  assert.match(html, /id="sec-comms"/);
  assert.match(html, /Welcome email, right after sign-up/);
  assert.match(html, /“You&#39;re in\. Your first assignment takes 2 minutes\.”|“You’re in|You&#x27;re in/);
  assert.match(html, /Open House Countdown \(Maya\), step 3/);
  assert.match(html, /written for each person, 15 versions/);
  assert.doesNotMatch(html, /Victoria/, 'a subject sent to one person is not shown');
  assert.match(html, /\(text, no subject\)/);
  assert.match(html, /2 <span class="muted">\(failed\)<\/span>/);
  assert.match(html, /Still to go out/);
  assert.match(html, /131 of 139 sign-ups got at least one message\. Each got a median of 2 \(most: 4\)/);
  assert.doesNotMatch(buildHtml(snap(full()), targets, [], []), /sec-comms/, 'no comms block, no section');
});

test('email: lists every message in the body, plain text too, without per-person subjects', () => {
  const { buildView } = require('../lib/view');
  const { renderEmail } = require('../lib/emailRender');
  const e = renderEmail(buildView(snap(full(), { comms: COMMS }), targets, []));
  assert.match(e.text, /EVERY MESSAGE THEY RECEIVED\n- 2026-11-15 to 2026-11-22 · Email · Welcome email, right after sign-up · 125 people/);
  assert.match(e.text, /Text · Open House Countdown \(Maya\), step 4 · 39 people \(2 not sent\)/);
  assert.match(e.html, /131 of 139 sign-ups got at least one/);
  assert.match(e.html, /Still to go out/);
  assert.doesNotMatch(e.html + e.text, /Victoria/);
  const none = renderEmail(buildView(snap(full()), targets, []));
  assert.doesNotMatch(none.text, /EVERY MESSAGE/);
});

test('collect.sql: interaction, payment and messages come from the tables that hold them', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'collect.sql'), 'utf8');
  assert.match(sql, /CREATE TEMP TABLE oh_did/);
  assert.match(sql, /session_guest_poll_responses[\s\S]*session_guest_questions[\s\S]*session_pulse/);
  assert.match(sql, /sb\.paysimple_payment_id IS NOT NULL AND sb\.started_at >= g\.reg_at/);
  assert.match(sql, /sb\.plan::text <> 'comp'/);
  assert.match(sql, /CREATE TEMP TABLE commz/);
  assert.match(sql, /p\.email_lower = lower\(c\.to_address\)[\s\S]*cl\.lead_id = c\.lead_id/, 'texts are matched by lead');
  assert.match(sql, /session_presence_events pe[\s\S]*classroom_enter/, 'in the room = the follow-up rule');
  assert.match(sql, /CREATE TEMP TABLE payers[\s\S]*p\.paid_at >= w\.s AND p\.paid_at < w\.e/, 'every payer in the window, any source');
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
