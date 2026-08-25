/**
 * The selection rules decide who gets mailed about their money. Everything
 * asserted here is a way this could mail the wrong person, so the cases are
 * drawn from the real production book measured 2026-08-15: one renewal on
 * 08-18, clusters on 08-30/08-31/09-12/09-13, three annuals in 2027, and ten
 * comped staff seats sitting at $0 with period ends in 2036.
 */

import {
  selectRenewalReminders,
  reminderKindFor,
  latestActiveByEnrollment,
  centralDayNumber,
  isUsableEmail,
  ADVANCE_LEAD_DAYS,
  FINAL_LEAD_DAYS,
  type RenewalSubscriptionRow,
} from '../renewalReminderSelection';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-08-15T02:00:00.000Z');

let seq = 0;
function sub(over: Partial<RenewalSubscriptionRow> = {}): RenewalSubscriptionRow {
  seq += 1;
  return {
    id: `sub-${seq}`,
    enrollment_id: `enr-${seq}`,
    plan: 'monthly',
    status: 'active',
    amount_cents: 19900,
    current_period_end: new Date(NOW + 3 * DAY),
    email: `student${seq}@example.com`,
    full_name: 'Test Student',
    ...over,
  };
}

const emails = (rows: { email: string }[]) => rows.map((r) => r.email).sort();
const reasonFor = (result: ReturnType<typeof selectRenewalReminders>, id: string) =>
  result.skipped.find((s) => s.subscription_id === id)?.reason;

describe('the reminder window', () => {
  test('picks up a subscription inside the advance window', () => {
    const row = sub({ current_period_end: new Date(NOW + 5 * DAY) });
    const { due } = selectRenewalReminders([row], NOW);
    expect(due).toHaveLength(1);
    expect(due[0].kind).toBe('advance_7d');
    expect(due[0].days_until).toBe(5);
  });

  test('leaves a subscription outside the window alone', () => {
    const row = sub({ current_period_end: new Date(NOW + 20 * DAY) });
    const result = selectRenewalReminders([row], NOW);
    expect(result.due).toHaveLength(0);
    expect(reasonFor(result, row.id)).toBe('not_yet_due');
  });

  test('the final notice wins when a subscription satisfies both windows', () => {
    const row = sub({ current_period_end: new Date(NOW + 0.5 * DAY) });
    const { due } = selectRenewalReminders([row], NOW);
    expect(due[0].kind).toBe('final_1d');
  });

  test.each([
    [0.1, 0, 'final_1d'],
    [0.9, 1, 'final_1d'],
    [1.19, 1, 'final_1d'],
    [1.6, 2, 'advance_7d'],
    [6.9, 7, 'advance_7d'],
    [7, 7, 'advance_7d'],
    [7.01, 7, 'advance_7d'],   // late in the day 7 days out is still 7 sleeps
    [7.6, 8, null],
    [30, 30, null],
    [0, 0, null],              // exactly at the boundary is lapsed, not due
    [-2, -2, null],
  ])('%sd elapsed / %s calendar days maps to %s', (days, delta, expected) => {
    expect(reminderKindFor(days as number, delta as number)).toBe(expected);
  });

  test('the final window is counted in calendar days, not elapsed hours', () => {
    // The live 2026-08-18 anchor is at 18:26Z. The daily job fires at 9am
    // Central (14:00Z). On the eve that is 1.19 elapsed days away, which an
    // hours-based rule misses entirely, pushing the "final" notice to the
    // morning of the renewal where it would read "tomorrow" on the day itself.
    const row = sub({ current_period_end: '2026-08-18T18:26:46.821Z' });
    const eveRun = Date.parse('2026-08-17T14:00:00.000Z');
    const { due } = selectRenewalReminders([row], eveRun);
    expect(due[0].days_until).toBeGreaterThan(1);
    expect(due[0].day_delta).toBe(1);
    expect(due[0].kind).toBe('final_1d');
  });

  test('day_delta is 0 on the renewal day itself', () => {
    const row = sub({ current_period_end: '2026-08-18T18:26:46.821Z' });
    const { due } = selectRenewalReminders([row], Date.parse('2026-08-18T14:00:00.000Z'));
    expect(due[0].day_delta).toBe(0);
    expect(due[0].kind).toBe('final_1d');
  });

  test('calendar days are counted in Central, not UTC', () => {
    // 2026-09-01T02:00Z is still 2026-08-31 in Texas, so a run at that instant
    // is on the SAME calendar day as an 2026-08-31T23:00Z period end.
    expect(centralDayNumber(Date.parse('2026-09-01T02:00:00.000Z')))
      .toBe(centralDayNumber(Date.parse('2026-08-31T13:00:00.000Z')));
  });

  test('the windows are inclusive upper bounds, not exact days', () => {
    // The whole point: this shipped inside the 2026-08-18 lead window, so an
    // exact-day rule would have skipped the first renewal in the book.
    const firstInTheBook = sub({ current_period_end: '2026-08-18T18:26:46.821Z' });
    const { due } = selectRenewalReminders([firstInTheBook], NOW);
    expect(due).toHaveLength(1);
    expect(due[0].kind).toBe('advance_7d');
    expect(due[0].days_until).toBeLessThan(ADVANCE_LEAD_DAYS);
    expect(due[0].days_until).toBeGreaterThan(FINAL_LEAD_DAYS);
  });

  test('the annual subscribers a year out are not in any window', () => {
    const annuals = [
      sub({ plan: 'annual', amount_cents: 178800, current_period_end: '2027-07-23T00:00:00.000Z' }),
      sub({ plan: 'annual', amount_cents: 178800, current_period_end: '2027-07-30T00:00:00.000Z' }),
      sub({ plan: 'annual', amount_cents: 178800, current_period_end: '2027-08-12T20:57:48.909Z' }),
    ];
    expect(selectRenewalReminders(annuals, NOW).due).toHaveLength(0);
  });

  test('an annual subscriber inside the window is reminded like anyone else', () => {
    const row = sub({ plan: 'annual', amount_cents: 178800, current_period_end: new Date(NOW + 4 * DAY) });
    const { due } = selectRenewalReminders([row], NOW);
    expect(due[0].amount_cents).toBe(178800);
    expect(due[0].plan).toBe('annual');
  });

  test('due reminders come back soonest first', () => {
    const rows = [
      sub({ email: 'later@example.com', current_period_end: new Date(NOW + 6 * DAY) }),
      sub({ email: 'sooner@example.com', current_period_end: new Date(NOW + 2 * DAY) }),
      sub({ email: 'soonest@example.com', current_period_end: new Date(NOW + 0.5 * DAY) }),
    ];
    const { due } = selectRenewalReminders(rows, NOW);
    expect(due.map((d) => d.email)).toEqual(['soonest@example.com', 'sooner@example.com', 'later@example.com']);
  });
});

describe('who must never be mailed', () => {
  test('a comped staff seat is excluded even when its period end is near', () => {
    const comp = sub({ plan: 'comp', amount_cents: 0, current_period_end: new Date(NOW + 2 * DAY) });
    const result = selectRenewalReminders([comp], NOW);
    expect(result.due).toHaveLength(0);
    expect(reasonFor(result, comp.id)).toBe('comped');
  });

  test('all ten real comped staff seats are excluded', () => {
    const comps = Array.from({ length: 10 }, () =>
      sub({ plan: 'comp', amount_cents: 0, current_period_end: '2036-07-18T20:15:16.067Z' }));
    const result = selectRenewalReminders(comps, NOW);
    expect(result.due).toHaveLength(0);
    expect(result.skipped.filter((s) => s.reason === 'comped')).toHaveLength(10);
  });

  test('a zero-amount paid-plan row is excluded, because PaySimple cannot charge $0', () => {
    const free = sub({ plan: 'monthly', amount_cents: 0 });
    const result = selectRenewalReminders([free], NOW);
    expect(result.due).toHaveLength(0);
    expect(reasonFor(result, free.id)).toBe('zero_amount');
  });

  test.each(['canceled', 'pending', 'failed'])('a %s subscription is excluded', (status) => {
    const row = sub({ status });
    const result = selectRenewalReminders([row], NOW);
    expect(result.due).toHaveLength(0);
    expect(reasonFor(result, row.id)).toBe('not_active');
  });

  test('a cancelled subscriber inside the window is never asked to pay again', () => {
    const rows = [
      sub({ email: 'quit@example.com', status: 'canceled', canceled_at: new Date(NOW - DAY) }),
      sub({ email: 'staying@example.com' }),
    ];
    expect(emails(selectRenewalReminders(rows, NOW).due)).toEqual(['staying@example.com']);
  });

  test('an already-renewed subscription is excluded, and the new row is the one reminded', () => {
    // Renewal on this platform is a fresh checkout, so it creates a NEW active
    // row and the old one keeps its passed date forever. Mailing the old row
    // would chase somebody who paid us last week.
    const old = sub({ id: 'old', enrollment_id: 'enr-x', email: 'renewed@example.com', current_period_end: new Date(NOW + 2 * DAY) });
    const fresh = sub({ id: 'new', enrollment_id: 'enr-x', email: 'renewed@example.com', current_period_end: new Date(NOW + 32 * DAY) });
    const result = selectRenewalReminders([old, fresh], NOW);
    expect(result.due).toHaveLength(0);
    expect(reasonFor(result, 'old')).toBe('superseded');
    expect(reasonFor(result, 'new')).toBe('not_yet_due');
  });

  test('a lapsed subscription is reported but never mailed, so nothing is charged retroactively', () => {
    const lapsed = sub({ current_period_end: new Date(NOW - 4 * DAY) });
    const result = selectRenewalReminders([lapsed], NOW);
    expect(result.due).toHaveLength(0);
    expect(reasonFor(result, lapsed.id)).toBe('already_lapsed');
    expect(result.skipped[0].detail).toContain('4.0d ago');
  });

  test('a subscription exactly at its period end is treated as lapsed, not due', () => {
    const row = sub({ current_period_end: new Date(NOW) });
    expect(reasonFor(selectRenewalReminders([row], NOW), row.id)).toBe('already_lapsed');
  });

  test.each([null, '', '   ', 'not-an-email', 'missing@domain'])('an unusable address (%s) is refused', (email) => {
    const row = sub({ email });
    const result = selectRenewalReminders([row], NOW);
    expect(result.due).toHaveLength(0);
    expect(reasonFor(result, row.id)).toBe('unusable_email');
    expect(isUsableEmail(email)).toBe(false);
  });

  test('a row with no period end is refused rather than guessed at', () => {
    const row = sub({ current_period_end: null });
    expect(reasonFor(selectRenewalReminders([row], NOW), row.id)).toBe('no_period_end');
  });

  test('an unparseable period end is refused', () => {
    const row = sub({ current_period_end: 'not a date' });
    expect(reasonFor(selectRenewalReminders([row], NOW), row.id)).toBe('no_period_end');
  });
});

describe('the whole live book, as measured 2026-08-15', () => {
  // 28 monthly + 3 annual + 10 comp. Only the 2026-08-18 monthly is inside a
  // window on the day this shipped.
  const book: RenewalSubscriptionRow[] = [
    sub({ email: 'first@example.com', current_period_end: '2026-08-18T18:26:46.821Z' }),
    ...Array.from({ length: 2 }, () => sub({ current_period_end: '2026-08-30T12:00:00.000Z' })),
    ...Array.from({ length: 7 }, () => sub({ current_period_end: '2026-08-31T12:00:00.000Z' })),
    ...Array.from({ length: 9 }, () => sub({ current_period_end: '2026-09-12T12:00:00.000Z' })),
    ...Array.from({ length: 4 }, () => sub({ current_period_end: '2026-09-13T12:00:00.000Z' })),
    ...Array.from({ length: 5 }, () => sub({ current_period_end: '2026-09-05T12:00:00.000Z' })),
    ...Array.from({ length: 3 }, () => sub({ plan: 'annual', amount_cents: 178800, current_period_end: '2027-07-23T00:00:00.000Z' })),
    ...Array.from({ length: 10 }, () => sub({ plan: 'comp', amount_cents: 0, current_period_end: '2036-07-18T20:15:16.067Z' })),
  ];

  test('exactly one student is due on the day this shipped', () => {
    const { due } = selectRenewalReminders(book, NOW);
    expect(due).toHaveLength(1);
    expect(due[0].email).toBe('first@example.com');
    expect(due[0].amount_cents).toBe(19900);
  });

  test('the 08-31 cluster of seven comes due together seven days out', () => {
    const at = Date.parse('2026-08-24T14:00:00.000Z');
    const { due } = selectRenewalReminders(book, at);
    const cluster = due.filter((d) => d.period_end.startsWith('2026-08-31'));
    expect(cluster).toHaveLength(7);
    expect(cluster.every((d) => d.kind === 'advance_7d')).toBe(true);
  });

  test('no comped seat is ever due, at any point across the next ten years', () => {
    for (const at of ['2026-08-15', '2026-09-12', '2027-07-20', '2036-07-15', '2036-07-18']) {
      const { due } = selectRenewalReminders(book, Date.parse(`${at}T12:00:00.000Z`));
      expect(due.filter((d) => d.plan === 'comp')).toHaveLength(0);
      expect(due.filter((d) => d.amount_cents === 0)).toHaveLength(0);
    }
  });

  test('--only narrows to a single recipient without changing any other rule', () => {
    const at = Date.parse('2026-08-24T14:00:00.000Z');
    const all = selectRenewalReminders(book, at).due;
    const one = selectRenewalReminders(book, at, { onlyEmail: 'first@example.com' }).due;
    expect(all.length).toBeGreaterThan(1);
    expect(one).toHaveLength(0); // 08-18 has already lapsed by 08-24
    const earlier = selectRenewalReminders(book, NOW, { onlyEmail: 'FIRST@EXAMPLE.COM' }).due;
    expect(earlier).toHaveLength(1);
  });
});

describe('latestActiveByEnrollment', () => {
  test('picks the furthest period end per enrollment', () => {
    const rows = [
      sub({ id: 'a', enrollment_id: 'e1', current_period_end: new Date(NOW + DAY) }),
      sub({ id: 'b', enrollment_id: 'e1', current_period_end: new Date(NOW + 40 * DAY) }),
      sub({ id: 'c', enrollment_id: 'e2', current_period_end: new Date(NOW + DAY) }),
    ];
    const latest = latestActiveByEnrollment(rows);
    expect(latest.get('e1')).toBe('b');
    expect(latest.get('e2')).toBe('c');
  });

  test('ignores non-active rows, so a stack of failed checkouts cannot win', () => {
    // One real student had 14 checkout rows on a single day, 12 of them failed.
    const rows = [
      sub({ id: 'active', enrollment_id: 'e1', current_period_end: new Date(NOW + 2 * DAY) }),
      ...Array.from({ length: 12 }, (_, i) =>
        sub({ id: `failed-${i}`, enrollment_id: 'e1', status: 'failed', current_period_end: new Date(NOW + 99 * DAY) })),
      sub({ id: 'pending', enrollment_id: 'e1', status: 'pending', current_period_end: new Date(NOW + 99 * DAY) }),
    ];
    expect(latestActiveByEnrollment(rows).get('e1')).toBe('active');
    expect(selectRenewalReminders(rows, NOW).due).toHaveLength(1);
  });

  test('is stable when two active rows share a period end', () => {
    const rows = [
      sub({ id: 'aaa', enrollment_id: 'e1', current_period_end: new Date(NOW + 2 * DAY) }),
      sub({ id: 'bbb', enrollment_id: 'e1', current_period_end: new Date(NOW + 2 * DAY) }),
    ];
    expect(latestActiveByEnrollment(rows).get('e1')).toBe('bbb');
    expect(latestActiveByEnrollment([...rows].reverse()).get('e1')).toBe('bbb');
    expect(selectRenewalReminders(rows, NOW).due).toHaveLength(1);
  });
});

describe('empty and degenerate input', () => {
  test('an empty book is not an error', () => {
    expect(selectRenewalReminders([], NOW)).toEqual({ due: [], skipped: [] });
  });

  test('every due reminder carries a full, usable payload', () => {
    const { due } = selectRenewalReminders([sub()], NOW);
    for (const d of due) {
      expect(d.subscription_id).toBeTruthy();
      expect(d.enrollment_id).toBeTruthy();
      expect(d.period_end).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(d.amount_cents).toBeGreaterThan(0);
      expect(isUsableEmail(d.email)).toBe(true);
    }
  });
});

/**
 * Regression: the enrollment lifecycle gates.
 *
 * Origin, 2026-08-25. A student who had been deferred to the November cohort in
 * writing was mailed "your membership payment is due tomorrow" twice, because
 * the selector's only notion of a live obligation was `subscriptions.status`,
 * and nothing retires that row when a person is moved. These assert the three
 * signals that describe the human rather than the term.
 */
describe('enrollment lifecycle gates', () => {
  it.each(['withdrawn', 'suspended', 'completed'])(
    'never mails a %s enrollment, even with a live subscription row',
    (enrollment_status) => {
      const row = sub({ enrollment_status });
      const result = selectRenewalReminders([row], NOW);
      expect(result.due).toHaveLength(0);
      expect(reasonFor(result, row.id)).toBe('enrollment_not_active');
    },
  );

  it('still mails an active enrollment', () => {
    const row = sub({ enrollment_status: 'active' });
    expect(selectRenewalReminders([row], NOW).due).toHaveLength(1);
  });

  it('treats a missing enrollment_status as notifiable, so the gate is additive', () => {
    const row = sub({ enrollment_status: null });
    expect(selectRenewalReminders([row], NOW).due).toHaveLength(1);
  });

  it('honours notifications_paused_at, the per-student kill switch', () => {
    const row = sub({ notifications_paused_at: new Date(NOW - 5 * DAY) });
    const result = selectRenewalReminders([row], NOW);
    expect(result.due).toHaveLength(0);
    expect(reasonFor(result, row.id)).toBe('notifications_paused');
  });

  it('does not suppress when notifications_paused_at is null or empty', () => {
    expect(selectRenewalReminders([sub({ notifications_paused_at: null })], NOW).due).toHaveLength(1);
    expect(selectRenewalReminders([sub({ notifications_paused_at: '' })], NOW).due).toHaveLength(1);
  });

  it('does not bill ahead of delivery when access_starts_at is in the future', () => {
    const row = sub({ access_starts_at: '2026-11-12' });
    const result = selectRenewalReminders([row], NOW);
    expect(result.due).toHaveLength(0);
    expect(reasonFor(result, row.id)).toBe('access_not_started');
  });

  it('mails once access_starts_at has arrived', () => {
    expect(selectRenewalReminders([sub({ access_starts_at: '2026-08-01' })], NOW).due).toHaveLength(1);
    // Today counts as started: the gate is "not yet", not "not today".
    expect(selectRenewalReminders([sub({ access_starts_at: '2026-08-14' })], NOW).due).toHaveLength(1);
  });

  it('excludes a deferred student before a checkout link could be minted', () => {
    // The real shape from 2026-08-25: paid July, deferred to November, the
    // subscription row left active with its period ending inside the window.
    const kepha = sub({
      enrollment_status: 'withdrawn',
      access_starts_at: '2026-11-12',
      current_period_end: new Date(NOW + 1 * DAY),
    });
    const result = selectRenewalReminders([kepha], NOW);
    expect(result.due).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
  });
});

