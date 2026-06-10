// Unit tests for the deterministic logic in compileFamilyBriefingData.js.
// Pure functions only — no network. Run: `node backend/src/scripts/lib/compileFamilyBriefingData.test.js`
// Exits non-zero on failure.
//
// Covers (per root CLAUDE.md test rules): happy path, failure/empty path, boundary
// cases, for the parts that gate correctness of the briefing (category mapping,
// cross-calendar conflict detection, CT-correct day bucketing).
//
// Session originator: CC-20260610-k7m2

const assert = require('node:assert');
const { _internals, hasFamilyData } = require('./compileFamilyBriefingData');
const { categorize, buildToday, buildWeek, ctDayBounds, fmtCtTimeParts, truncate, cleanBody, buildNewSince, buildRecap, buildMoments, buildCosts, heuristicProcareItems, toCreedAction, dedupeActions } = _internals;

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ok  - ${name}`); }
  catch (e) { console.error(`  FAIL - ${name}\n        ${e.message}`); process.exitCode = 1; }
}

// ---- categorize ----
test('categorize: matches child names case-insensitively', () => {
  assert.strictEqual(categorize('Creed dentist').key, 'creed');
  assert.strictEqual(categorize('ADDISON volleyball').key, 'addison');
  assert.strictEqual(categorize('addison ortho').label, 'Addison');
});
test('categorize: travel + parents keywords', () => {
  assert.strictEqual(categorize('Flight DFW to BNA').key, 'travel');
  assert.strictEqual(categorize('School drop off').key, 'parents');
});
test('categorize: unknown -> neutral/Family', () => {
  const c = categorize('Dinner with the Smiths');
  assert.strictEqual(c.key, 'neutral');
  assert.strictEqual(c.label, 'Family');
});

// ---- buildToday: cross-calendar conflict detection ----
test('buildToday: flags a family event overlapping a timed work event', () => {
  const family = [{ summary: 'Addison ortho', start: '2026-06-10T20:00:00Z', end: '2026-06-10T21:00:00Z', allDay: false }];
  const work = [{ summary: 'AegisFX call', start: '2026-06-10T20:00:00Z', end: '2026-06-10T20:30:00Z', allDay: false }];
  const { events, conflicts } = buildToday(family, work);
  assert.strictEqual(conflicts.length, 1);
  // family event flagged + a "work (conflict only)" row appended
  assert.strictEqual(events.length, 2);
  assert.strictEqual(events[0].conflict, true);
  assert.strictEqual(events[1].categoryColorKey, 'work');
});
test('buildToday: no conflict when work event does not overlap', () => {
  const family = [{ summary: 'Creed soccer', start: '2026-06-10T22:00:00Z', end: '2026-06-10T23:00:00Z', allDay: false }];
  const work = [{ summary: 'Standup', start: '2026-06-10T14:00:00Z', end: '2026-06-10T14:30:00Z', allDay: false }];
  const { events, conflicts } = buildToday(family, work);
  assert.strictEqual(conflicts.length, 0);
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].conflict, false);
});
test('buildToday: all-day family events never conflict and render as All day', () => {
  const family = [{ summary: 'Nashville trip', start: '2026-06-10', end: '2026-06-11', allDay: true }];
  const work = [{ summary: 'Call', start: '2026-06-10T15:00:00Z', end: '2026-06-10T15:30:00Z', allDay: false }];
  const { events, conflicts } = buildToday(family, work);
  assert.strictEqual(conflicts.length, 0);
  assert.strictEqual(events[0].time, 'All');
  assert.strictEqual(events[0].ampm, 'day');
});
test('buildToday: empty family list -> empty events', () => {
  const { events, conflicts } = buildToday([], [{ summary: 'x', start: '2026-06-10T15:00:00Z', end: '2026-06-10T16:00:00Z', allDay: false }]);
  assert.strictEqual(events.length, 0);
  assert.strictEqual(conflicts.length, 0);
});

// ---- ctDayBounds: 24h windows, ordered, day offset ----
test('ctDayBounds: produces a 24h window and offsets by whole days', () => {
  const now = new Date('2026-06-10T17:00:00Z'); // noon CT
  const d0 = ctDayBounds(now, 0);
  const d1 = ctDayBounds(now, 1);
  assert.strictEqual(d0.end.getTime() - d0.start.getTime(), 24 * 3600 * 1000);
  assert.strictEqual(d1.start.getTime() - d0.start.getTime(), 24 * 3600 * 1000);
  assert.ok(d0.start <= now && now < d0.end, 'now falls within day 0');
});

// ---- buildWeek: 7 days, today flagged once, bucketing ----
test('buildWeek: 7 days, exactly one marked today, events bucketed by CT day', () => {
  const now = new Date('2026-06-10T17:00:00Z');
  const week = buildWeek(now, [
    { summary: 'Creed Jersey Day', start: '2026-06-11T14:00:00Z', allDay: false },
    { summary: 'Addison game', start: '2026-06-10T23:00:00Z', allDay: false },
  ]);
  assert.strictEqual(week.days.length, 7);
  assert.strictEqual(week.days.filter(d => d.today).length, 1);
  const todayCell = week.days.find(d => d.today);
  assert.ok(todayCell.events.some(e => /Addison/.test(e.label)), 'today has Addison event');
});

// ---- fmtCtTimeParts ----
test('fmtCtTimeParts: converts UTC instant to CT time + am/pm', () => {
  const p = fmtCtTimeParts('2026-06-10T20:00:00Z'); // 3 PM CT
  assert.strictEqual(p.time, '3:00');
  assert.strictEqual(p.ampm, 'pm');
});

// ---- truncate ----
test('truncate: caps length with ellipsis', () => {
  assert.strictEqual(truncate('hello world', 5), 'hell…');
  assert.strictEqual(truncate('hi', 5), 'hi');
});

// ---- hasFamilyData ----
test('hasFamilyData: false on empty, true with any content', () => {
  assert.strictEqual(hasFamilyData({}), false);
  assert.strictEqual(hasFamilyData({ today: { events: [] }, week: { days: [] } }), false);
  assert.strictEqual(hasFamilyData({ newSince: [{ title: 'x' }] }), true);
  assert.strictEqual(hasFamilyData({ today: { events: [{ title: 'x' }] } }), true);
});

// ---- cleanBody: extract Office Chat message from Procare boilerplate ----
test('cleanBody: strips Kinderlime/Office-Chat boilerplate to the message', () => {
  const body = "Kinderlime\n\nHello Ali Muwwakkil,\n\nYou've received a new Office Chat message (re: Creed Muwwakkil): \n\nGood Afternoon Parents! Ms. Brenda will be on vacation. Kona Ice Thursday.";
  const out = cleanBody(body);
  assert.ok(/Good Afternoon Parents/.test(out), 'keeps the real message');
  assert.ok(!/Kinderlime/.test(out) && !/You've received/.test(out), 'drops boilerplate');
});
test('cleanBody: non-office-chat returns cleaned snippet; empty -> undefined', () => {
  assert.strictEqual(cleanBody(''), undefined);
  assert.strictEqual(cleanBody('   '), undefined);
  assert.ok(/Itinerary/.test(cleanBody('Your trip   Itinerary   confirmed')));
});
test('cleanBody: strips literal &zwnj; padding + zero-width chars (Procare daily summary)', () => {
  // Procare daily-summary bodies are padded with inbox-preview filler.
  const padded = 'Daily summary &zwnj; &zwnj; &zwnj; &nbsp;‌‌‌ for Creed: 2 naps, ate well.';
  const out = cleanBody(padded);
  assert.ok(!/&zwnj;|&nbsp;/.test(out), 'no literal entity padding remains');
  assert.ok(!/[​‌‍]/.test(out), 'no zero-width unicode remains');
  assert.ok(/Daily summary for Creed/.test(out), 'real text preserved');
});
test('cleanBody: padding-only body yields no quote', () => {
  assert.strictEqual(cleanBody('&zwnj; &zwnj; &zwnj; ‌‌'), undefined);
});

// ---- buildNewSince: shapes DB rows into change-rows ----
test('buildNewSince: maps inbox_emails rows to label/title/src/quote', () => {
  const rows = [{
    from_name: 'Liberty Private School', from_address: 'connect-notification@online.procaresoftware.com',
    subject: '(New) Office Chat from Liberty Private School',
    body_text: "Hello Ali,\n\nYou've received a new Office Chat message (re: Creed): Jersey Day Thursday!",
    received_at: '2026-06-09T19:31:00Z', label: 'School',
  }];
  const items = buildNewSince(rows);
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].label, 'School');
  assert.ok(/Office Chat/.test(items[0].title));
  assert.ok(/Jersey Day Thursday/.test(items[0].quote));
  assert.ok(/Liberty Private School/.test(items[0].src));
});
test('buildNewSince: empty/undefined rows -> empty array', () => {
  assert.strictEqual(buildNewSince([]).length, 0);
  assert.strictEqual(buildNewSince(undefined).length, 0);
});

// ---- buildRecap / buildMoments from past calendar ----
test('buildRecap: collapses repeats and labels the week range', () => {
  const now = new Date('2026-06-10T17:00:00Z');
  const past = [
    { summary: 'Sand VB Addison', start: '2026-06-07T23:00:00Z' },
    { summary: 'Sand VB Addison', start: '2026-06-08T23:00:00Z' },
    { summary: 'Mom Dr appt.', start: '2026-06-09T15:00:00Z' },
  ];
  const r = buildRecap(now, past);
  assert.ok(/Last 7 days/.test(r.rangeLabel));
  assert.ok(/Sand VB Addison \(2x\)/.test(r.text), 'collapses repeats');
  assert.ok(/Mom Dr appt/.test(r.text));
});
test('buildRecap: empty week -> quiet message', () => {
  const r = buildRecap(new Date('2026-06-10T17:00:00Z'), []);
  assert.ok(/quiet week/i.test(r.text));
});
test('buildMoments: most-recent-first, ago labels, capped at 8', () => {
  const now = new Date('2026-06-10T17:00:00Z');
  const past = Array.from({ length: 10 }, (_, i) => ({ summary: `Event ${i}`, start: new Date(now.getTime() - (i + 1) * 86400000).toISOString() }));
  const m = buildMoments(now, past);
  assert.strictEqual(m.length, 8);
  assert.strictEqual(m[0][2], 'yesterday');
  assert.ok(/days ago/.test(m[2][2]));
});

// ---- buildCosts ----
test('buildCosts: returns labeled projection rows + summary', () => {
  const c = buildCosts(new Date('2026-06-10T17:00:00Z'));
  assert.ok(/projected/i.test(c.intro));
  assert.strictEqual(c.rows.length, 2);
  assert.ok(c.summary.some(s => s.label === 'Due this week' && s.value === '$0'));
});

// ---- categorize: Jayse (3rd child) ----
test('categorize: Jayse maps to its own key', () => {
  assert.strictEqual(categorize('Jayse swim lesson').key, 'jayse');
  assert.strictEqual(categorize('JAYSE checkup').label, 'Jayse');
  // still distinguishes the other two
  assert.strictEqual(categorize('Creed nap').key, 'creed');
  assert.strictEqual(categorize('Addison game').key, 'addison');
});

// ---- Procare heuristic fallback extraction ----
test('heuristicProcareItems: pulls announcement sentences, drops boilerplate', () => {
  const rows = [{
    subject: '(New) Office Chat from Liberty Private School',
    body_text: "Hello Ali,\n\nYou've received a new Office Chat message (re: Creed Muwwakkil): \n\nGood Afternoon Parents! Ms. Brenda will be on vacation and will return on Monday. There will be Kona Ice on Thursday instead of an Ice Cream Party. Thursday is Jersey Day for FIFA Opening Day. You can reply in the Procare app.",
  }];
  const items = heuristicProcareItems(rows);
  assert.ok(items.length >= 2, 'extracts multiple items');
  assert.ok(items.every(i => i.ico === 'CRD'), 'tagged to Creed');
  const titles = items.map(i => i.title).join(' | ');
  assert.ok(/Ms\. Brenda/.test(titles), 'keeps teacher-out announcement');
  assert.ok(/Jersey Day/.test(titles), 'keeps Jersey Day');
  assert.ok(!/reply in the Procare/i.test(titles), 'drops app boilerplate');
  assert.ok(!/Good Afternoon Parents/i.test(titles), 'drops greeting');
});

// ---- toCreedAction shape ----
test('toCreedAction: maps extracted item to action shape with tone clamp', () => {
  const a = toCreedAction({ title: 'Jersey Day', detail: 'wear a jersey', when: 'Thu Jun 11', tone: 'upcoming' });
  assert.deepStrictEqual(a, { tone: 'upcoming', ico: 'CRD', title: 'Jersey Day', sub: 'wear a jersey', due: 'Thu Jun 11' });
  assert.strictEqual(toCreedAction({ title: 'x', tone: 'bogus' }).tone, 'info');
});

// ---- dedupeActions: collapse the same announcement re-sent across days ----
test('dedupeActions: merges near-duplicate Procare titles', () => {
  const items = [
    { title: 'Ms. Brenda out, returns Monday', ico: 'CRD' },
    { title: 'Ms. Brenda will be on vacation and will return on Monday', ico: 'CRD' },
    { title: 'Kona Ice on Thursday', ico: 'CRD' },
    { title: 'Kona Ice on Thursday for the schoolers', ico: 'CRD' },
    { title: 'Jersey Day on Thursday', ico: 'CRD' },
  ];
  const out = dedupeActions(items);
  assert.strictEqual(out.length, 3, 'Brenda x2 -> 1, Kona x2 -> 1, Jersey -> 1');
  assert.ok(out.some(i => /Brenda/.test(i.title)));
  assert.ok(out.some(i => /Kona/.test(i.title)));
  assert.ok(out.some(i => /Jersey/.test(i.title)));
});

console.log(`\n${passed} passed${process.exitCode ? ', SOME FAILED' : ', all green'}`);
