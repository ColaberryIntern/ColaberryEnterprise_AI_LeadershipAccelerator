/**
 * The selection is the contract: who gets told, and who must never be told twice.
 *
 * The runner itself touches the database, the gateway and a transport, so it is
 * exercised against production by dry run rather than mocked into a shape that
 * proves nothing. What IS asserted here is the SQL, because every way this job
 * can hurt someone is visible in it:
 *
 *   - dropping the "never sent this kind" guard mails a member the same news
 *     every month
 *   - dropping DISTINCT ON mails a member once per active row, and 10 members
 *     currently hold two
 *   - dropping the schedule filter mails auto-pay news to people paying by hand
 */
import { AUTOPAY_NOTICE_SELECT, AUTOPAY_NOTICE_KIND } from '../autopayNotice';

describe('nobody is told twice, ever', () => {
  it('excludes any subscription already sent this kind, at any period', () => {
    // The unique index is (subscription_id, period_end, reminder_kind), so it
    // alone would let the notice go out again next period. "Your membership now
    // renews automatically" is only true as news once.
    expect(AUTOPAY_NOTICE_SELECT).toContain('NOT EXISTS');
    expect(AUTOPAY_NOTICE_SELECT).toContain(`r.reminder_kind = '${AUTOPAY_NOTICE_KIND}'`);
    expect(AUTOPAY_NOTICE_SELECT).toContain('r.subscription_id = s.id');
  });

  it('does not scope that exclusion to the current period', () => {
    // If a period_end comparison appears in the NOT EXISTS, the guard becomes
    // per-period and the notice repeats.
    const notExists = AUTOPAY_NOTICE_SELECT.slice(AUTOPAY_NOTICE_SELECT.indexOf('NOT EXISTS'));
    expect(notExists).not.toContain('r.period_end');
  });
});

describe('one email per person, not per row', () => {
  it('dedupes to the member, because a manual renewal leaves two rows active', () => {
    expect(AUTOPAY_NOTICE_SELECT).toContain('DISTINCT ON (s.enrollment_id)');
    expect(AUTOPAY_NOTICE_SELECT).toContain('ORDER BY s.enrollment_id, s.current_period_end DESC');
  });
});

describe('only people who are actually on auto-pay', () => {
  it('requires a schedule', () => {
    expect(AUTOPAY_NOTICE_SELECT).toContain('s.paysimple_schedule_id IS NOT NULL');
  });

  it('ignores cancelled subscriptions and comped seats', () => {
    expect(AUTOPAY_NOTICE_SELECT).toContain("s.status IN ('active', 'past_due')");
    expect(AUTOPAY_NOTICE_SELECT).toContain("s.plan <> 'comp'");
  });

  it('will not try to mail a row with no address', () => {
    expect(AUTOPAY_NOTICE_SELECT).toContain('e.email IS NOT NULL');
  });
});

describe('the kind fits the column it is stored in', () => {
  it('is at most 24 characters', () => {
    // reminder_kind is VARCHAR(24). A longer value would throw at insert time,
    // after the mail had already gone out.
    expect(AUTOPAY_NOTICE_KIND.length).toBeLessThanOrEqual(24);
  });

  it('does not collide with the period reminder kinds', () => {
    expect(['advance_7d', 'final_1d', 'after_lapse_1d', 'after_lapse_7d'])
      .not.toContain(AUTOPAY_NOTICE_KIND);
  });
});
