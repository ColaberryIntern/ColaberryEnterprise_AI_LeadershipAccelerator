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
import {
  MILESTONES, milestonesFor, LAPSED_WITHOUT_FOLLOWUP_SQL, SCHEDULE_STOPPED_COLLECTING_SQL,
} from '../billingHealthCheck';

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

/**
 * The exclusion above leaves a hole, and this is the check that fills it.
 *
 * A scheduled member is skipped by the lapsed check (the schedule is the follow-up) and
 * passes the schedule/book match (the ID exists on both sides), so a schedule that has
 * simply stopped charging was visible to no check at all. Four real members were in that
 * state on 2026-11-16, three of them 48 days past the date their schedule was due to fire.
 */
describe('a schedule that stopped collecting is caught by something', () => {
  it('looks only at rows that actually hold a schedule', () => {
    // The mirror image of the lapsed check's predicate. Between the two, every active
    // row past its date is the business of exactly one check.
    expect(SCHEDULE_STOPPED_COLLECTING_SQL).toContain('s.paysimple_schedule_id IS NOT NULL');
  });

  it('waits a full cadence plus settlement slack before saying anything', () => {
    // Firing earlier re-creates the double-charge this file's autopay guard exists to
    // prevent: the 2026-09-01 migration left members legitimately looking like this for
    // one cycle, because auto-pay was promised from their NEXT boundary.
    expect(SCHEDULE_STOPPED_COLLECTING_SQL).toContain("INTERVAL '1 year'");
    expect(SCHEDULE_STOPPED_COLLECTING_SQL).toContain("INTERVAL '1 month'");
    expect(SCHEDULE_STOPPED_COLLECTING_SQL).toContain("INTERVAL '3 days'");
  });

  it('uses each plan\'s own cadence rather than one interval for both', () => {
    // A year of silence on an annual schedule is one missed charge; a month of silence on
    // a monthly one is also one missed charge. A single threshold gets one of them wrong.
    expect(SCHEDULE_STOPPED_COLLECTING_SQL).toMatch(/CASE WHEN s\.plan = 'annual'/);
  });

  it('ignores a member who has already renewed into a later period', () => {
    // Same reason as the lapsed check: a manual renewal leaves the old row behind, and the
    // old row holding a dead schedule is not a member who stopped being charged.
    expect(SCHEDULE_STOPPED_COLLECTING_SQL).toContain('s2.current_period_end > s.current_period_end');
  });

  it('reports one row per member, not one per subscription', () => {
    expect(SCHEDULE_STOPPED_COLLECTING_SQL).toContain('DISTINCT ON (s.enrollment_id)');
  });

  it('carries the schedule id, because the action is to open it at the gateway', () => {
    // A finding that says "someone stopped paying" without the schedule id makes the
    // reader go and find it. The id is the whole lead.
    expect(SCHEDULE_STOPPED_COLLECTING_SQL).toContain('s.paysimple_schedule_id AS schedule_id');
  });

  it('leaves comp seats alone', () => {
    expect(SCHEDULE_STOPPED_COLLECTING_SQL).toContain("s.plan <> 'comp'");
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
