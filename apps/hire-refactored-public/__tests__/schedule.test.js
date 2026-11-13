/**
 * The schedule page's rules (kit Part 2), from schedule-model.js: the path, the week grid in the
 * viewer's zone, the stepper, the details validation, the summary rows, the employer's hold and
 * what the address asks for. schedule.js only renders these.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const M = require('../src/assets/schedule-model.js');

describe('the address', () => {
  test('only /talent/<slug>/schedule/ is a schedule page', () => {
    assert.equal(M.slugFromPath('/talent/kesetebirhan-delele/schedule/'), 'kesetebirhan-delele');
    assert.equal(M.slugFromPath('/talent/ann/schedule'), 'ann');
    for (const p of ['/talent/ann/', '/talent/record/schedule/', '/talent/-x/schedule/', '/talent/a/schedule/x']) assert.equal(M.slugFromPath(p), null, p);
  });

  test('reads a returning post, a preselected slot and a suggested-time link, rejecting junk', () => {
    assert.deepEqual(M.fromQuery('?sent=1'), { sent: true, error: null, slot: null, accept: null });
    assert.equal(M.fromQuery('?slot=2026-11-16T15:00:00Z').slot, '2026-11-16T15:00:00.000Z');
    assert.equal(M.fromQuery('?slot=tomorrow').slot, null);
    const id = '33333333-3333-4333-8333-333333333333';
    assert.deepEqual(M.fromQuery(`?accept=${id}&t=${'a'.repeat(64)}`).accept, { id, t: 'a'.repeat(64) });
    assert.equal(M.fromQuery(`?accept=${id}&t=short`).accept, null);
    assert.equal(M.fromQuery('?accept=../../x&t=' + 'a'.repeat(64)).accept, null);
    assert.equal(M.fromQuery('?error=unavailable').error, 'unavailable');
  });
});

describe('the week', () => {
  test('Monday of any day, and a label across a month', () => {
    assert.equal(M.mondayOf('2026-11-19'), '2026-11-16');
    assert.equal(M.mondayOf('2026-11-16'), '2026-11-16');
    assert.equal(M.mondayOf('2026-11-22'), '2026-11-16');
    assert.equal(M.weekLabel('2026-11-16'), 'Nov 16 – 20');
    assert.equal(M.weekLabel('2026-11-30'), 'Nov 30 – Dec 4');
  });

  test('Mon to Fri always, a weekend only when a slot lands there, times in the viewer zone', () => {
    const slots = [
      { start: '2026-11-16T15:00:00.000Z', day: '2026-11-16' },
      { start: '2026-11-21T01:00:00.000Z', day: '2026-11-21' }, // Fri evening Central is Sat in UTC
    ];
    const cols = M.weekColumns(slots, '2026-11-16', 'America/Chicago');
    assert.deepEqual(cols.map((c) => c.dow), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    assert.deepEqual(cols[0].slots, [{ start: '2026-11-16T15:00:00.000Z', time: '9:00 AM' }]);
    assert.deepEqual(cols[1].slots, []);
    assert.equal(cols[0].label, 'Nov 16');
    assert.equal(M.weekColumns([], '2026-11-16', 'America/Chicago').length, 5);
  });

  test('the stepper marks done, current and to-do', () => {
    assert.deepEqual(M.stepItems(3).map((s) => s.state), ['done', 'done', 'current', 'todo']);
    assert.deepEqual(M.STEPS, ['Format', 'Time', 'Your details', 'Done']);
  });
});

describe('your details', () => {
  const ok = { name: 'Jane', email: 'jane@acme.com', company: 'Acme', role: 'CTO', interviewers: '' };
  test('a complete form has no problems', () => assert.deepEqual(M.validateDetails(ok), []));

  test('problems come back in form order, so focus moves to the first one', () => {
    const out = M.validateDetails({ ...ok, name: ' ', email: 'jane', role: '' });
    assert.deepEqual(out.map((e) => e.field), ['name', 'email', 'role']);
    assert.match(out[1].message, /doesn’t look right/);
  });

  test('at most 5 other interviewers, each a real address', () => {
    assert.deepEqual(M.interviewerList(' a@x.com, ,b@x.com '), ['a@x.com', 'b@x.com']);
    assert.equal(M.validateDetails({ ...ok, interviewers: 'a@x.com,b@x.com,c@x.com,d@x.com,e@x.com' }).length, 0);
    assert.equal(M.validateDetails({ ...ok, interviewers: 'a@x.com,b@x.com,c@x.com,d@x.com,e@x.com,f@x.com' })[0].field, 'interviewers');
    assert.equal(M.validateDetails({ ...ok, interviewers: 'a@x.com; b@x.com' })[0].field, 'interviewers');
  });
});

describe('the summary and the hold', () => {
  const formats = [{ id: 'intro', name: 'Intro call', minutes: 20 }, { id: 'walkthrough', name: 'Case study walkthrough', minutes: 45 }];
  const cases = [{ slug: 'a', title: 'Churn model' }];

  test('Format, Length, the case study only for a walkthrough, When in the viewer zone, Where', () => {
    const rows = M.summaryRows({ format: 'walkthrough', caseSlug: 'a', slot: '2026-11-16T15:00:00.000Z' }, formats, cases, 'America/New_York');
    assert.deepEqual(rows.map((r) => [r.k, r.v]), [
      ['Format', 'Case study walkthrough'], ['Length', '45 min'], ['Case study', 'Churn model'],
      ['When', 'Mon, Nov 16 · 10:00 AM'], ['Where', 'Refactored room'],
    ]);
    assert.deepEqual(M.summaryRows({ format: null, slot: null }, formats, cases, 'UTC').map((r) => r.v), ['Not picked yet', 'Not picked yet', 'Refactored room']);
  });

  test('the employer\'s own hold is a tentative, CRLF calendar file with no addresses', () => {
    const ics = M.holdIcs({ start: '2026-11-16T15:00:00.000Z', minutes: 20, name: 'Ann Lee', formatName: 'Intro call', slug: 'ann-lee', now: new Date('2026-11-13T00:00:00Z') });
    assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
    assert.match(ics, /DTSTART:20261116T150000Z\r\nDTEND:20261116T152000Z/);
    assert.match(ics, /STATUS:TENTATIVE/);
    assert.match(ics, /SUMMARY:Requested: Intro call with Ann Lee/);
    assert.doesNotMatch(ics, /mailto:|ATTENDEE|ORGANIZER/);
  });

  test('every error code the API redirects with has a sentence', () => {
    for (const c of ['unavailable', 'invalid', 'not_found', 'failed', 'whatever']) assert.ok(M.errorText(c).length > 10);
  });
});

describe('the shell', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'schedule', 'index.html'), 'utf8');
  test('is noindex, labelled, loads its scripts in dependency order, and says what to do without JS', () => {
    assert.match(html, /<meta name="robots" content="noindex, nofollow"/);
    const order = ['common.js', 'page.js', 'profile-extras.js', 'schedule-model.js', 'schedule.js'].map((f) => html.indexOf('/assets/' + f));
    assert.ok(order.every((x, i) => x > 0 && (i === 0 || x > order[i - 1])), String(order));
    assert.match(html, /<noscript>[\s\S]*request an intro[\s\S]*<\/noscript>/);
    assert.match(html, /Talk to the person who shipped it\./);
  });

  test('the step 3 form is a real POST to the API, so it works when the script cannot intercept it', () => {
    const js = fs.readFileSync(path.join(__dirname, '..', 'src', 'assets', 'schedule.js'), 'utf8');
    assert.match(js, /<form id="details" method="post" action="' \+ esc\(api\) \+ '\/api\/public\/hire\/interviews"/);
    for (const name of ['talentSlug', 'format', 'startsAt', 'name', 'email', 'company', 'role', 'message', 'interviewers', 'record']) {
      assert.match(js, new RegExp(`name="${name}"|k: '${name}'`), name);
    }
  });

  test('no sideways scroll: the day grid and the case picker wrap', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'assets', 'schedule.css'), 'utf8');
    assert.match(css, /\.days\{display:grid;grid-template-columns:repeat\(auto-fit,minmax\(120px,1fr\)\)/);
    assert.match(css, /\.pick-cases\{display:grid;grid-template-columns:repeat\(auto-fill,minmax\(76px,1fr\)\)/);
    assert.doesNotMatch(css, /overflow-x/);
  });
});
