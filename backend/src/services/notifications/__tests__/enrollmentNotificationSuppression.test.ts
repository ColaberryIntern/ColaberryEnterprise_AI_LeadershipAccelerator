import {
  isNotificationSuppressed,
  partitionNotifiable,
  filterNotifiable,
  SUPPRESSION_COLUMN,
  SuppressibleEnrollment,
} from '../enrollmentNotificationSuppression';

/**
 * Regression cover for the 2026-08-17 report: a student who had switched
 * cohorts kept receiving her previous cohort's class reminders after staff
 * "enabled DND". No enrollment-keyed suppression existed, so nothing they could
 * have set would have stopped it. These assert that a paused enrollment is
 * excluded from the mail list, and — just as importantly — that an unpaused one
 * still gets mailed.
 */

const roster = (...rows: SuppressibleEnrollment[]) => rows;
const notPaused = (email: string): SuppressibleEnrollment => ({ id: email, email });
const paused = (email: string, at: Date | string): SuppressibleEnrollment => ({
  id: email,
  email,
  notifications_paused_at: at,
  notifications_paused_reason: 'switched cohorts',
});

describe('isNotificationSuppressed', () => {
  // -- happy path: the default state of every existing row mails as before
  it('treats a null pause as notifiable', () => {
    expect(isNotificationSuppressed({ email: 'a@b.com', notifications_paused_at: null })).toBe(false);
  });

  it('treats an absent field as notifiable', () => {
    expect(isNotificationSuppressed({ email: 'a@b.com' })).toBe(false);
  });

  // -- the behaviour that was missing entirely
  it('suppresses when a pause instant is set (Date)', () => {
    expect(isNotificationSuppressed(paused('a@b.com', new Date('2026-08-18T12:00:00Z')))).toBe(true);
  });

  it('suppresses when a pause instant is set (ISO string from a raw query)', () => {
    expect(isNotificationSuppressed(paused('a@b.com', '2026-08-18T12:00:00.000Z'))).toBe(true);
  });

  // -- boundary cases
  it('treats an empty/whitespace string as notifiable, not as a pause', () => {
    expect(isNotificationSuppressed({ email: 'a@b.com', notifications_paused_at: '' })).toBe(false);
    expect(isNotificationSuppressed({ email: 'a@b.com', notifications_paused_at: '   ' })).toBe(false);
  });

  it('fails CLOSED on an unparseable pause value (withholding is the recoverable error)', () => {
    expect(isNotificationSuppressed({ email: 'a@b.com', notifications_paused_at: 'not-a-date' })).toBe(true);
  });

  it('is safe on null/undefined input', () => {
    expect(isNotificationSuppressed(null)).toBe(false);
    expect(isNotificationSuppressed(undefined)).toBe(false);
  });

  it('does not consider a past pause expired (no silent auto-resume)', () => {
    expect(isNotificationSuppressed(paused('a@b.com', new Date('2020-01-01T00:00:00Z')))).toBe(true);
  });
});

describe('partitionNotifiable', () => {
  it('excludes only the paused student from a real-shaped cohort roster', () => {
    const rows = roster(
      notPaused('classmate1@example.com'),
      paused('switched@example.com', new Date('2026-08-18T12:00:00Z')),
      notPaused('classmate2@example.com')
    );

    const { notifiable, suppressed } = partitionNotifiable(rows);

    expect(notifiable.map((e) => e.email)).toEqual(['classmate1@example.com', 'classmate2@example.com']);
    expect(suppressed.map((e) => e.email)).toEqual(['switched@example.com']);
  });

  /**
   * The caller stamps live_sessions.reminder_24h_sent_at only when the roster it
   * looked at was non-empty. If it were to key that off the NOTIFIABLE list
   * instead, a cohort in which everyone is paused would never arm, and the
   * half-hourly cron would re-enter that session every tick forever. This
   * invariant is what lets the caller arm from the full roster safely.
   */
  it('preserves the full roster across both halves so arming can key off the total', () => {
    const rows = roster(
      paused('a@example.com', new Date()),
      paused('b@example.com', new Date())
    );
    const { notifiable, suppressed } = partitionNotifiable(rows);

    expect(notifiable).toHaveLength(0);
    expect(suppressed).toHaveLength(2);
    expect(notifiable.length + suppressed.length).toBe(rows.length);
  });

  it('handles an empty roster', () => {
    expect(partitionNotifiable([])).toEqual({ notifiable: [], suppressed: [] });
  });

  it('mails the whole cohort when nobody is paused (no behaviour change on rollout)', () => {
    const rows = roster(notPaused('a@example.com'), notPaused('b@example.com'), notPaused('c@example.com'));
    expect(partitionNotifiable(rows).notifiable).toHaveLength(3);
    expect(partitionNotifiable(rows).suppressed).toHaveLength(0);
  });

  // -- idempotency: same input, same decision, no matter how often it runs
  it('is deterministic across repeated evaluation', () => {
    const rows = roster(notPaused('a@example.com'), paused('b@example.com', new Date('2026-08-18T12:00:00Z')));
    const first = partitionNotifiable(rows);
    const second = partitionNotifiable(rows);
    expect(second.notifiable.map((e) => e.email)).toEqual(first.notifiable.map((e) => e.email));
    expect(second.suppressed.map((e) => e.email)).toEqual(first.suppressed.map((e) => e.email));
  });

  it('does not mutate the input roster', () => {
    const rows = roster(notPaused('a@example.com'), paused('b@example.com', new Date()));
    const snapshot = JSON.parse(JSON.stringify(rows));
    partitionNotifiable(rows);
    expect(JSON.parse(JSON.stringify(rows))).toEqual(snapshot);
  });
});

describe('filterNotifiable', () => {
  it('returns just the sendable half', () => {
    const rows = roster(notPaused('a@example.com'), paused('b@example.com', new Date()));
    expect(filterNotifiable(rows).map((e) => e.email)).toEqual(['a@example.com']);
  });
});

describe('SUPPRESSION_COLUMN', () => {
  it('matches the column the schema guard adds and the model declares', () => {
    expect(SUPPRESSION_COLUMN).toBe('notifications_paused_at');
  });
});
