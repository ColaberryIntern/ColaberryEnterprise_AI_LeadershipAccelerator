// Tests for cb-context-budget + the backlog enforcer's edge-triggered tagging.
// Run: node scripts/ops-engine/__tests__/cb-context-budget.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { estimateTokens, fitToBudget } = require('../cb-context-budget');

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('  ok ' + name); };

console.log('cb-context-budget');

ok('short text passes through untouched', () => {
  const r = fitToBudget('hello world', { budgetTokens: 1000 });
  assert.strictEqual(r.text, 'hello world');
  assert.strictEqual(r.trimmed, false);
  assert.strictEqual(r.droppedLines, 0);
});

ok('empty and null are safe', () => {
  assert.strictEqual(fitToBudget('', { budgetTokens: 10 }).text, '');
  assert.strictEqual(fitToBudget(null, { budgetTokens: 10 }).text, '');
});

ok('oversized input is brought UNDER the budget', () => {
  const big = Array.from({ length: 40000 }, (_, i) => `- [2026-10-0${i % 9}] Other: comment number ${i} padding padding padding`).join('\n');
  const budget = 5000;
  assert.ok(estimateTokens(big) > budget * 10, 'fixture must be far over budget');
  const r = fitToBudget(big, { budgetTokens: budget });
  assert.strictEqual(r.trimmed, true);
  assert.ok(r.finalTokens <= budget, `final ${r.finalTokens} must be <= budget ${budget}`);
  assert.ok(r.droppedLines > 0);
});

ok('the real failure size (177k tokens) fits a 90k budget', () => {
  // Reproduces recording 10049371244: ~177k tokens of assembled thread.
  const line = '- [2026-10-12T12:03:23Z] CB: Got your message. I tried to handle it but ran out of steps. Queued for review.';
  const big = Array.from({ length: 28000 }, () => line).join('\n');
  assert.ok(estimateTokens(big) > 170000, 'fixture should be ~177k tokens, got ' + estimateTokens(big));
  const r = fitToBudget(big, { budgetTokens: 90000 });
  assert.strictEqual(r.trimmed, true);
  assert.ok(r.finalTokens <= 90000, `final ${r.finalTokens} exceeds 90000`);
});

ok('head and tail both survive; the middle is what goes', () => {
  const lines = ['HEAD-MARKER', ...Array.from({ length: 20000 }, (_, i) => 'middle filler line ' + i), 'TAIL-MARKER'];
  const r = fitToBudget(lines.join('\n'), { budgetTokens: 2000 });
  assert.ok(r.text.startsWith('HEAD-MARKER'), 'head must survive');
  assert.ok(r.text.trimEnd().endsWith('TAIL-MARKER'), 'tail must survive');
  assert.ok(!r.text.includes('middle filler line 10000'), 'the middle must be dropped');
});

ok('the trim is announced in the text, not silent', () => {
  const big = Array.from({ length: 20000 }, (_, i) => 'line ' + i).join('\n');
  const r = fitToBudget(big, { budgetTokens: 1500 });
  assert.ok(/context trimmed to budget/i.test(r.text), 'must carry a visible marker');
});

ok('lines are never cut mid-line', () => {
  const big = Array.from({ length: 9000 }, (_, i) => 'ABCDEFGHIJ-' + i).join('\n');
  const r = fitToBudget(big, { budgetTokens: 900 });
  for (const l of r.text.split('\n')) {
    if (!l || /context trimmed/.test(l) || l === '...') continue;
    assert.ok(/^(\.\.\. )?ABCDEFGHIJ-\d+$/.test(l.trim()) || l.trim() === '', 'partial line: ' + JSON.stringify(l));
  }
});

ok('budget is honoured across a range of sizes', () => {
  for (const b of [200, 1000, 5000, 20000]) {
    const big = Array.from({ length: 30000 }, (_, i) => 'padding padding padding line ' + i).join('\n');
    const r = fitToBudget(big, { budgetTokens: b });
    assert.ok(r.finalTokens <= b, `budget ${b}: got ${r.finalTokens}`);
  }
});

console.log('\nbacklog-enforcer edge trigger');

const src = fs.readFileSync(path.resolve(__dirname, '../backlog-enforcer.js'), 'utf8');

ok('shouldTag is edge-triggered, not a level check', () => {
  assert.ok(/const shouldTag = crossedOverdue \|\| crossedSingleOld \|\| isDailyTick;/.test(src),
    'shouldTag must be built from crossings');
  assert.ok(!/const shouldTag = overdue\.length >= OVERDUE_TRIGGER \|\| maxOverdueDays >= SINGLE_OLD_TRIGGER_DAYS/.test(src),
    'the old level check must be gone');
});

ok('a crossing compares against the PREVIOUS tick', () => {
  assert.ok(/crossedOverdue\s*=\s*overdue\.length >= OVERDUE_TRIGGER && prevOverdue < OVERDUE_TRIGGER/.test(src));
  assert.ok(/crossedSingleOld\s*=\s*maxOverdueDays >= SINGLE_OLD_TRIGGER_DAYS && prevMaxOverdueDays < SINGLE_OLD_TRIGGER_DAYS/.test(src));
});

ok('maxOverdueDays is persisted so the next tick can see the edge', () => {
  assert.ok(/counts:\s*\{[^}]*maxOverdueDays[^}]*\}/.test(src),
    'maxOverdueDays must be stored in state.ticks[].counts');
});

// Simulation of the exact production state: 2 overdue, oldest 12d, trigger 7d, holding steady.
ok('a standing 12d backlog tags ONCE on the crossing, then goes quiet', () => {
  const OVERDUE_TRIGGER = 3, SINGLE_OLD = 7;
  const decide = (overdue, maxDays, prev, is9am) => {
    const prevOverdue = Number.isFinite(prev.overdue) ? prev.overdue : overdue;
    const prevMax = Number.isFinite(prev.maxOverdueDays) ? prev.maxOverdueDays : maxDays;
    return (overdue >= OVERDUE_TRIGGER && prevOverdue < OVERDUE_TRIGGER)
        || (maxDays >= SINGLE_OLD && prevMax < SINGLE_OLD)
        || is9am;
  };
  // day the oldest todo crosses 7d: tags once
  assert.strictEqual(decide(2, 7, { overdue: 2, maxOverdueDays: 6 }, false), true, 'crossing must tag');
  // every 4-hourly tick after that, same day, not 9am: silent
  assert.strictEqual(decide(2, 7, { overdue: 2, maxOverdueDays: 7 }, false), false);
  assert.strictEqual(decide(2, 12, { overdue: 2, maxOverdueDays: 12 }, false), false, 'a 12d standing backlog must NOT re-tag');
  // the 9am tick still carries one nudge a day
  assert.strictEqual(decide(2, 12, { overdue: 2, maxOverdueDays: 12 }, true), true, '9am tick must still tag');
  // first run with no prior state invents nothing
  assert.strictEqual(decide(2, 12, {}, false), false, 'missing prior state must not fabricate a crossing');
});

ok('the OLD code would have tagged all six ticks a day (regression guard)', () => {
  const oldDecide = (overdue, maxDays, is9am) => overdue >= 3 || maxDays >= 7 || is9am;
  const ticks = [false, false, false, false, false, true]; // 6 ticks, one of them 9am
  const oldTags = ticks.filter((is9am) => oldDecide(2, 12, is9am)).length;
  assert.strictEqual(oldTags, 6, 'old logic tagged every tick, which is the bug');
});

console.log('\nbacklog-enforcer daily tick');

ok('the dead getUTCHours()===14 tick is gone', () => {
  assert.ok(!/getUTCHours\(\) === 14/.test(src),
    'cron runs 0 */4 (UTC 00/04/08/12/16/20) so hour 14 never occurs; that test never fired');
});

ok('the daily tick is keyed to the Central calendar date, not a UTC hour', () => {
  assert.ok(/timeZone: 'America\/Chicago'/.test(src), 'must resolve Central via the IANA zone so DST is handled');
  assert.ok(/state\.last_daily_ct_date !== ctDate/.test(src), 'must fire once per Central day');
  assert.ok(/if \(isDailyTick\) state\.last_daily_ct_date = ctDate;/.test(src), 'must record the day it fired');
});

ok('no cron tick lands on 9am CT, so a >= hour test is required', () => {
  // 0 */4 UTC maps to these Central hours under CDT (UTC-5)
  const ctHoursCDT = [19, 23, 3, 7, 11, 15];
  assert.strictEqual(ctHoursCDT.includes(9), false, 'nothing runs at exactly 9am CT');
  assert.ok(ctHoursCDT.some((h) => h >= 8), 'but ticks do land at or after 8am CT');
});

ok('a standing backlog gets exactly one nudge per Central day', () => {
  const HOUR = 8;
  let last = null, fired = 0;
  for (const day of ['2026-10-13', '2026-10-14', '2026-10-15']) {
    for (const h of [3, 7, 11, 15, 19, 23]) {
      if (h >= HOUR && last !== day) { fired++; last = day; }
    }
  }
  assert.strictEqual(fired, 3, 'three days should produce three nudges, got ' + fired);
});

console.log(`\n${n} assertions passed`);
