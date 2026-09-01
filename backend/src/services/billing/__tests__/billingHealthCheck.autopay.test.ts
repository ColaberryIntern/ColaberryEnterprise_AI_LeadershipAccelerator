/**
 * The billing watch must not describe a two-model book as if it were one.
 *
 * ── WHAT CHANGED UNDERNEATH IT ──────────────────────────────────────────────
 *
 * This watch was written on 2026-08-23, when every paid term on the platform was
 * a manual hosted checkout and "period end is in the past" reliably meant "nobody
 * is collecting". On 2026-09-01, 20 members were migrated onto standing PaySimple
 * schedules, taking auto-pay from 1 member to 21 of 56 active subscriptions.
 *
 * Both models are now live at once, and every check that reads the subscriptions
 * table has to say which one it means.
 *
 * ── THE BUG THESE TESTS EXIST FOR ───────────────────────────────────────────
 *
 * Members were promised auto-pay would begin at their NEXT cycle, not the one
 * already collected by hand. So a member whose period ended 30 Aug has a schedule
 * that first fires 30 Sep, and for that month they look exactly like someone who
 * lapsed and was never chased.
 *
 * Verified against production on 2026-09-01: the unguarded query flagged 2 members
 * as `act_now`, and 1 of them — VICTOR CHUKWUKERE, schedule 4511896, period ended
 * 31 Aug — was on a standing schedule. The finding's stated action is "confirm
 * these members were mailed", so acting on it means sending a payment link to
 * someone PaySimple is about to charge. That is a double charge, which is worse
 * than the silence this check was built to catch.
 */
import { MILESTONES, milestonesFor, LAPSED_WITHOUT_FOLLOWUP_SQL } from '../billingHealthCheck';

describe('the lapsed check leaves auto-pay members alone', () => {
  it('excludes anyone on a standing schedule', () => {
    // The load-bearing predicate. Without it the watch chases members whose
    // money is already coming.
    expect(LAPSED_WITHOUT_FOLLOWUP_SQL).toContain('s.paysimple_schedule_id IS NULL');
  });

  it('still catches a manual member with no follow-up recorded', () => {
    // The guard must narrow the query, not gut it: the original conditions that
    // define "lapsed and unchased" have to survive alongside it.
    expect(LAPSED_WITHOUT_FOLLOWUP_SQL).toContain("s.status = 'active'");
    expect(LAPSED_WITHOUT_FOLLOWUP_SQL).toContain('s.current_period_end < now()');
    expect(LAPSED_WITHOUT_FOLLOWUP_SQL).toContain("r.reminder_kind LIKE 'after_lapse%'");
  });

  it('still ignores a member who already renewed into a later period', () => {
    // Manual renewal leaves the old row active too. Dropping this would flag
    // every renewing member as lapsed.
    expect(LAPSED_WITHOUT_FOLLOWUP_SQL).toContain('s2.current_period_end > s.current_period_end');
  });
});

describe('milestones tell the truth about automatic billing', () => {
  it('marks the first automatic charge this platform has ever taken', () => {
    // Confirmed at the gateway on 2026-09-01: two $199 schedules fire 2026-09-04.
    const m = milestonesFor('2026-09-04');
    expect(m).toHaveLength(1);
    expect(m[0].why).toMatch(/never taken money|without a member clicking/i);
  });

  it('no longer claims nothing has ever charged automatically before December', () => {
    // The old 2026-12-12 entry said exactly that. It was true when written and
    // the migration falsified it, three months before the date it referred to.
    const dec = MILESTONES.find((x) => x.on === '2026-12-12');
    expect(dec).toBeDefined();
    expect(dec!.why).not.toMatch(/nothing has ever charged automatically/i);
  });

  it('does not promise automatic charges before the day they can actually land', () => {
    // Guards the reverse error: a milestone dated earlier than the earliest real
    // schedule would have someone hunting for a charge that was never due.
    const FIRST_CHARGE = '2026-09-04';
    MILESTONES.filter((m) => /automatic/i.test(m.what))
      .forEach((m) => expect(m.on >= FIRST_CHARGE).toBe(true));
  });

  it('keeps every milestone dated and explained', () => {
    MILESTONES.forEach((m) => {
      expect(m.on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(m.why.length).toBeGreaterThan(30);
    });
  });
});
