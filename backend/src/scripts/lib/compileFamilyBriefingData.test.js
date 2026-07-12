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
const { categorize, detectCreedConflicts, buildTodaySnapshot, buildWeek, ctDayBounds, ctDateISO, parseDayToISO, shortLabel, fmtCtTimeParts, truncate, cleanBody, buildNewSince, isPromoTravel, buildRecap, buildMoments, buildCosts, heuristicProcareItems, toCreedAction, validGridDate, itemsToActionsAndGrid, dedupeActions, conflictGrid } = _internals;

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

// ---- detectCreedConflicts: work conflicts only for Creed, never work rows ----
test('detectCreedConflicts: flags a CREED event overlapping Ali work', () => {
  const family = [{ summary: 'Creed pickup', start: '2026-06-10T20:00:00Z', end: '2026-06-10T21:00:00Z', allDay: false }];
  const work = [{ summary: 'AegisFX call', start: '2026-06-10T20:00:00Z', end: '2026-06-10T20:30:00Z', allDay: false }];
  const conflicts = detectCreedConflicts(family, work);
  assert.strictEqual(conflicts.length, 1);
  assert.strictEqual(conflicts[0].work.summary, 'AegisFX call');
});
test('detectCreedConflicts: Addison/Jayse overlap with work is NOT a family conflict', () => {
  const work = [{ summary: 'Colaberry.AI', start: '2026-06-10T20:00:00Z', end: '2026-06-10T21:00:00Z', allDay: false }];
  assert.strictEqual(detectCreedConflicts([{ summary: 'Addison ortho appt', start: '2026-06-10T20:00:00Z', end: '2026-06-10T21:00:00Z', allDay: false }], work).length, 0);
  assert.strictEqual(detectCreedConflicts([{ summary: 'Jayse swim', start: '2026-06-10T20:00:00Z', end: '2026-06-10T21:00:00Z', allDay: false }], work).length, 0);
});
test('detectCreedConflicts: no conflict when Creed event does not overlap', () => {
  const family = [{ summary: 'Creed soccer', start: '2026-06-10T22:00:00Z', end: '2026-06-10T23:00:00Z', allDay: false }];
  const work = [{ summary: 'Standup', start: '2026-06-10T14:00:00Z', end: '2026-06-10T14:30:00Z', allDay: false }];
  assert.strictEqual(detectCreedConflicts(family, work).length, 0);
});

// ---- buildTodaySnapshot: time-sorted, Daily for no-time, no work rows ----
test('buildTodaySnapshot: sorts by time, all-day first as Daily, includes extras', () => {
  const now = new Date('2026-06-10T17:00:00Z');
  const todayISO = ctDateISO(now);
  const family = [
    { summary: 'Sand VB Addison', start: '2026-06-10T23:00:00Z', end: '2026-06-11T00:00:00Z', allDay: false }, // 6pm CT
    { summary: 'Addison ortho appt', start: '2026-06-10T17:30:00Z', end: '2026-06-10T18:30:00Z', allDay: false }, // 12:30pm CT
  ];
  const extras = [{ dateISO: todayISO, colorKey: 'creed', label: 'Kona Ice' }, { dateISO: todayISO, colorKey: 'action', label: '! conflict' }];
  const { events } = buildTodaySnapshot(now, family, [], extras);
  // Daily (Kona Ice) first, then ortho 12:30, then VB 6:00. Conflict marker excluded.
  assert.strictEqual(events.length, 3, 'no work rows, conflict marker not a row');
  assert.strictEqual(events[0].time, 'Daily');
  assert.strictEqual(events[0].title, 'Kona Ice');
  assert.strictEqual(events[1].title, 'Addison ortho appt');
  assert.strictEqual(events[2].title, 'Sand VB Addison');
  assert.ok(events.every(e => e.categoryColorKey !== 'work'), 'never a work row');
});
test('buildTodaySnapshot: Creed conflict adds a coverage note, not a separate row', () => {
  const now = new Date('2026-06-10T17:00:00Z');
  const family = [{ summary: 'Creed pickup', start: '2026-06-10T20:00:00Z', end: '2026-06-10T21:00:00Z', allDay: false }];
  const conflicts = [{ family: family[0], work: { summary: 'AegisFX call' } }];
  const { events } = buildTodaySnapshot(now, family, conflicts, []);
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].conflict, true);
  assert.ok(/coverage/.test(events[0].meta));
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
  const now = new Date('2026-06-10T17:00:00Z');
  const { actions, grid } = heuristicProcareItems(rows, now);
  assert.ok(actions.length >= 2, 'extracts multiple items');
  assert.ok(actions.every(i => i.ico === 'CRD' && i.colorKey === 'creed'), 'tagged to Creed');
  const titles = actions.map(i => i.title).join(' | ');
  assert.ok(/Ms\. Brenda/.test(titles), 'keeps teacher-out announcement');
  assert.ok(/Jersey Day/.test(titles), 'keeps Jersey Day');
  assert.ok(!/reply in the Procare/i.test(titles), 'drops app boilerplate');
  assert.ok(!/Good Afternoon Parents/i.test(titles), 'drops greeting');
  // heuristic also places dated items on the grid (Thursday -> Jun 11)
  assert.ok(grid.some(g => g.dateISO === '2026-06-11' && /Jersey Day|Kona Ice/.test(g.label)), 'places Thursday item on grid');
});

// ---- parseDayToISO + shortLabel ----
test('parseDayToISO: resolves weekday/today/tomorrow within the week', () => {
  const now = new Date('2026-06-10T17:00:00Z'); // Wed Jun 10 CT
  assert.strictEqual(parseDayToISO('Jersey Day on Thursday', now), '2026-06-11');
  assert.strictEqual(parseDayToISO('returns Monday', now), '2026-06-15');
  assert.strictEqual(parseDayToISO('Teddy Bear Day is tomorrow', now), '2026-06-11');
  assert.strictEqual(parseDayToISO('no day mentioned here', now), null);
});
test('shortLabel: produces tidy calendar labels', () => {
  assert.strictEqual(shortLabel('There will be Kona Ice on Thursday for the schoolers'), 'Kona Ice');
  assert.strictEqual(shortLabel('Thursday is Jersey Day in celebration of FIFA Opening Day'), 'Jersey Day');
  assert.strictEqual(shortLabel('Ms. Brenda will be on vacation and will return on Monday'), 'Ms. Brenda back');
});

// ---- toCreedAction shape ----
test('toCreedAction: maps extracted item to action shape with tone clamp', () => {
  const a = toCreedAction({ title: 'Jersey Day', detail: 'wear a jersey', when: 'Thu Jun 11', tone: 'upcoming' });
  assert.deepStrictEqual(a, { tone: 'upcoming', ico: 'CRD', colorKey: 'creed', title: 'Jersey Day', sub: 'wear a jersey', due: 'Thu Jun 11' });
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

// ---- buildWeek with dated extras (Procare/travel/conflicts on the grid) ----
test('buildWeek: places dated extras on the matching day, extras before calendar', () => {
  const now = new Date('2026-06-10T17:00:00Z'); // Wed Jun 10 CT
  const thuISO = ctDateISO(ctDayBounds(now, 1).start); // Thu Jun 11
  const week = buildWeek(now, [{ summary: 'Addison game', start: '2026-06-11T23:00:00Z' }], [
    { dateISO: thuISO, colorKey: 'creed', label: 'Jersey Day' },
    { dateISO: ctDateISO(now), colorKey: 'action', label: '! conflict' },
  ]);
  const thu = week.days[1]; // Thu Jun 11
  assert.ok(thu.events.some(e => e.label === 'Jersey Day' && e.colorKey === 'creed'), 'Procare item on Thu');
  assert.strictEqual(thu.events[0].label, 'Jersey Day', 'extra rendered before calendar event');
  const wed = week.days.find(d => d.today);
  assert.ok(wed.events.some(e => e.colorKey === 'action'), 'conflict marker on today');
});

// ---- validGridDate ----
test('validGridDate: accepts near dates, rejects far/garbage', () => {
  const now = new Date('2026-06-10T17:00:00Z');
  assert.ok(validGridDate('2026-06-11', now));
  assert.ok(!validGridDate('2026-08-01', now), 'too far out');
  assert.ok(!validGridDate('not-a-date', now));
  assert.ok(!validGridDate('', now));
});

// ---- itemsToActionsAndGrid ----
test('itemsToActionsAndGrid: builds colored actions + dated grid, dedups', () => {
  const now = new Date('2026-06-10T17:00:00Z');
  const { actions, grid } = itemsToActionsAndGrid([
    { title: 'Jersey Day Thursday', detail: 'wear a jersey', when: 'Thu Jun 11', dateISO: '2026-06-11', gridLabel: 'Jersey Day', tone: 'upcoming' },
    { title: 'No-date info item', tone: 'info' },
  ], now, { ico: 'CRD', colorKey: 'creed' });
  assert.ok(actions.every(a => a.colorKey === 'creed' && a.ico === 'CRD'));
  assert.strictEqual(grid.length, 1, 'only the dated item goes on the grid');
  assert.strictEqual(grid[0].label, 'Jersey Day');
});

// ---- isPromoTravel ----
test('isPromoTravel: drops marketing, keeps confirmations', () => {
  assert.ok(isPromoTravel('Up to 40% off hotels and vacation rentals this summer'));
  assert.ok(isPromoTravel('Prepare for your upcoming trip to'));
  assert.ok(!isPromoTravel('Expedia flight purchase confirmation - DFW - Sat, Jun 13'));
  assert.ok(!isPromoTravel("It's time to check in - NRWCUO"));
});

// ---- cleanBody: strips CSS/asterisk/dash junk ----
test('cleanBody: strips CSS @import + asterisk/dash runs + Hello boilerplate', () => {
  assert.strictEqual(cleanBody('* * American Airlines @import url(https://fonts.googleapis.com/css2?family=Roboto); display:swap;'), undefined, 'css junk -> no quote');
  const ds = cleanBody('Procare ******** Hello Ali Muwwakkil! ******** Below are recent activities for Creed -------- Signed out at 5:29 PM.');
  assert.ok(ds && /Signed out at 5:29/.test(ds), 'keeps the real line');
  assert.ok(!/\*\*|----|Hello Ali/.test(ds), 'drops asterisks/dashes/greeting');
});

// ---- conflictGrid ----
test('conflictGrid: one red marker per conflict on the conflict day', () => {
  const now = new Date('2026-06-10T17:00:00Z');
  const today = { conflicts: [{ family: { start: '2026-06-10T20:00:00Z', summary: 'x' }, work: { summary: 'y' } }] };
  const g = conflictGrid(now, today);
  assert.strictEqual(g.length, 1);
  assert.strictEqual(g[0].colorKey, 'action');
  assert.strictEqual(g[0].dateISO, ctDateISO(now));
});

// ---- Relative-date anchoring: "tomorrow" is relative to the email's SEND date,
//      not the briefing date (regression for the Jun-18 ice-cream/menu-swap bug). ----
test('parseDayToISO: relative words anchor to the provided reference (send) date', () => {
  const wed = new Date('2026-06-17T22:22:00Z'); // Wed Jun 17, 5:22 PM CT
  assert.strictEqual(parseDayToISO('ice cream party tomorrow', wed), '2026-06-18', '"tomorrow" from Wed -> Thu');
  assert.strictEqual(parseDayToISO('menu switch today', wed), '2026-06-17', '"today" from Wed -> Wed');
  assert.strictEqual(parseDayToISO('Donuts with Dad this Friday', wed), '2026-06-19', '"this Friday" from Wed -> Fri');
});
test('heuristicProcareItems: "tomorrow" in a Wed email is Thu even when the briefing runs Thu', () => {
  // Reproduces the real bug: a Wed-Jun-17 Office Chat said "tomorrow ... Ice Cream Party";
  // the briefing ran Thu Jun 18. Correct date is Thu Jun 18 (today), NOT Fri Jun 19.
  const rows = [{
    subject: '(New) Office Chat from Liberty Private School',
    body_text: "Hello Ali,\n\nYou've received a new Office Chat message (re: Creed Muwwakkil): We are also excited to let everyone know that tomorrow we will be having an Ice Cream Party during snack time.",
    received_at: '2026-06-17T22:22:00Z', // Wed Jun 17, 5:22 PM CT
  }];
  const now = new Date('2026-06-18T13:00:00Z'); // Thu Jun 18, 8:00 AM CT (briefing time)
  const { grid, actions } = heuristicProcareItems(rows, now);
  assert.ok(grid.some(g => g.dateISO === '2026-06-18'), 'Ice Cream Party lands on Thu Jun 18 (tomorrow-from-Wed)');
  assert.ok(!grid.some(g => g.dateISO === '2026-06-19'), 'NOT pushed forward to Fri Jun 19');
  assert.ok(actions.some(a => a.tone === 'urgent'), 'an item dated today is toned urgent');
});
test('heuristicProcareItems: "this Friday" in a Wed email still resolves to that Friday', () => {
  // The sibling case that was already correct must stay correct: Donuts with Dad on Fri.
  const rows = [{
    subject: '(New) Office Chat from Liberty Private School',
    body_text: "Hello Ali,\n\nYou've received a new Office Chat message (re: Creed): Just a reminder that Donuts with Dad is this Friday from 6:30 AM to 9:30 AM.",
    received_at: '2026-06-17T18:18:00Z', // Wed Jun 17, 1:18 PM CT
  }];
  const now = new Date('2026-06-18T13:00:00Z'); // Thu Jun 18
  const { grid } = heuristicProcareItems(rows, now);
  assert.ok(grid.some(g => g.dateISO === '2026-06-19'), 'Donuts with Dad stays on Fri Jun 19');
});
test('heuristicProcareItems: missing received_at falls back to briefing date (no crash, prior behavior)', () => {
  // The original test row carries no received_at; "Thursday" must still land on Thu Jun 11.
  const rows = [{
    subject: '(New) Office Chat',
    body_text: "Hello Ali,\n\nYou've received a new Office Chat message (re: Creed): There will be Kona Ice on Thursday for the schoolers.",
  }];
  const now = new Date('2026-06-10T17:00:00Z'); // Wed Jun 10
  const { grid } = heuristicProcareItems(rows, now);
  assert.ok(grid.some(g => g.dateISO === '2026-06-11'), 'falls back to now-anchored Thursday');
});

console.log(`\n${passed} passed${process.exitCode ? ', SOME FAILED' : ', all green'}`);
