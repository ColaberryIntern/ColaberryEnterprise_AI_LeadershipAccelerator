import { loadUnresolvedBucket } from '../capabilityRecord';

/**
 * AF3.3 / AF6.1 — Ali's ruling of 2026-11-01, encoded against the undomained bucket.
 *
 * ## The thing this suite exists to stop
 *
 * **Sixteen rulings are not sixteen resolved rows.** Ali ruled on all 21 agents: retire eight,
 * absorb eight, park five. Only the eight retirements reach a terminal disposition. `absorb`
 * cannot resolve a row on its own, because absorbing an agent means naming the domain that
 * absorbs it, and these eight are undomained precisely because they serve two domains at once.
 * `parked` is an explicit deferral.
 *
 * So the honest count is EIGHT of twenty-one resolved, and the tempting one is sixteen. A
 * reconciliation that counted rulings would go green over thirteen agents that still have no
 * home -- including `visitor_tracker`, which has run over 1.3 million times.
 *
 * That failure mode is the same one AF3.3 already caught once on this exact bucket, where "five"
 * (the count of rows whose proposed kind was `unresolved`) was being read as the count of LIVE
 * rows, when thirteen are live. A number that is nearly right about the wrong thing survives
 * review; these assertions do not let it.
 *
 * ## What this suite does NOT assert
 *
 * Which domain absorbs each of the eight. Nobody has decided that, and inventing it here is the
 * precise thing AF3.3's own ticket names as making the work untrustworthy.
 */

const bucket = loadUnresolvedBucket() as any;
const ruled = (r: string) => bucket.rows.filter((x: any) => x.owner_decision?.ruling === r);

describe('the AF6.1 owner ruling is recorded against every undomained agent', () => {
  it('all 21 carry a ruling, with a decider and a date', () => {
    for (const r of bucket.rows) {
      expect(r.owner_decision).toBeDefined();
      expect(r.owner_decision.decided_by).toBe('Ali Muwwakkil');
      expect(r.owner_decision.decided_on).toBe('2026-11-01');
    }
  });

  it('splits exactly as ruled: retire 8, absorb 8, park 5', () => {
    expect(ruled('retire')).toHaveLength(8);
    expect(ruled('absorb')).toHaveLength(8);
    expect(ruled('parked')).toHaveLength(5);
    expect(bucket.rows).toHaveLength(21);
  });

  /**
   * THE LOAD-BEARING ONE. Sixteen rulings, eight resolutions.
   */
  it('only the eight retirements actually RESOLVE a row', () => {
    const terminal = bucket.rows.filter((r: any) => r.disposition === 'retired');
    expect(terminal).toHaveLength(8);
    expect(terminal.map((r: any) => r.owner_decision.ruling)).toEqual(Array(8).fill('retire'));

    const open = bucket.rows.filter((r: any) => r.disposition === 'unresolved');
    expect(open).toHaveLength(13);
    expect(bucket.needs_owner_decision).toBe(true);
  });

  it('every unfinished ruling NAMES what it is blocked on, so nothing reads as done', () => {
    for (const r of [...ruled('absorb'), ...ruled('parked')]) {
      expect(typeof r.owner_decision.blocked_on).toBe('string');
      expect(r.owner_decision.blocked_on.trim().length).toBeGreaterThan(30);
    }
  });

  it('the eight ruled retire are the eight that were dark, not merely eight of them', () => {
    // Guards against the ruling being applied to the wrong set and still counting to eight.
    for (const r of ruled('retire')) {
      expect(r.measured.enabled).toBe(false);
      expect(r.measured.run_count).toBe(0);
      expect(r.proposed_kind).toBe('retire');
    }
  });

  it('nothing ruled absorb or parked was retired, because both are still live work', () => {
    for (const r of [...ruled('absorb'), ...ruled('parked')]) {
      expect(r.disposition).toBe('unresolved');
      expect(r.capability_id).toBeNull();
    }
  });

  it('the bucket summary agrees with the rows rather than restating the ruling', () => {
    expect(bucket.owner_ruling.retired).toBe(ruled('retire').length);
    expect(bucket.owner_ruling.absorb_pending_domain).toBe(ruled('absorb').length);
    expect(bucket.owner_ruling.parked).toBe(ruled('parked').length);
  });

  /**
   * POSITIVE CONTROL. Every assertion above would also pass if "resolved" quietly meant
   * "ruled on", which is the mistake the suite is here to prevent. This proves the two counts
   * are genuinely different, so a future change that conflates them fails rather than passes.
   */
  it('POSITIVE CONTROL: ruled-on and resolved are different numbers', () => {
    const rulings = bucket.rows.filter((r: any) => r.owner_decision).length;
    const resolved = bucket.rows.filter((r: any) => r.disposition === 'retired').length;
    expect(rulings).toBe(21);
    expect(resolved).toBe(8);
    expect(resolved).not.toBe(rulings);
    expect(resolved).not.toBe(16);
  });

  /**
   * The parked five are the live, production-only rows with no owner. Naming the busiest one
   * here keeps the scale of what is still undecided in the test output rather than in a PDF.
   */
  it('parking leaves the busiest agent in the fleet without a home', () => {
    const parked = ruled('parked').map((r: any) => r.agent_name);
    expect(parked).toContain('visitor_tracker');
    const vt = bucket.rows.find((r: any) => r.agent_name === 'visitor_tracker');
    expect(vt.disposition).toBe('unresolved');
    expect(vt.measured.run_count).toBeGreaterThan(1000000);
  });
});
