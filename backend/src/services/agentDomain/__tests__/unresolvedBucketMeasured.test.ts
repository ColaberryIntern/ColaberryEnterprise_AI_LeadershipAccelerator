import { loadUnresolvedBucket } from '../capabilityRecord';

/**
 * AF3.3 — the measured production evidence attached to the 21 undomained legacy agents.
 *
 * ## Why this suite exists
 *
 * The bucket's own comment used to say *"Five of these are live production rows"*, and that number
 * is what an owner would weigh when deciding AF6.1. Measured against production on 2026-10-28,
 * **thirteen of the 21 are enabled**, and between them they have run 1,491,129 times. Five is the
 * count of rows whose *proposed kind* is `unresolved`; it was being read as the count of live
 * rows, which understated the decision by a factor of two and a half.
 *
 * A corrected sentence in a JSON comment rots. These assertions do not.
 *
 * ## What this suite deliberately does NOT assert
 *
 * It does not check any disposition, because deciding them is AF6.1 and belongs to Ali.
 * `capabilityRecord.test.ts` already pins every disposition to `unresolved` and
 * `needs_owner_decision` to true, and that is the correct state until he decides.
 */

const bucket = loadUnresolvedBucket() as any;

describe('the undomained bucket carries measured production evidence', () => {
  it('still holds exactly 21 rows, reconciling with the 225 domained ones', () => {
    expect(bucket.rows).toHaveLength(21);
    expect(bucket.legacy_row_count).toBe(21);
  });

  it('every row records what production said, and when', () => {
    const missing = bucket.rows
      .filter((r: any) => !r.measured || typeof r.measured.enabled !== 'boolean')
      .map((r: any) => r.agent_name);
    expect(missing).toEqual([]);
    for (const r of bucket.rows) {
      expect(r.measured.on).toBe('2026-10-28');
      expect(typeof r.measured.run_count).toBe('number');
    }
  });

  it('THE CORRECTION: thirteen are live, not five', () => {
    const live = bucket.rows.filter((r: any) => r.measured.enabled);
    expect(live).toHaveLength(13);
    expect(bucket.measured_live_rows).toBe(13);
  });

  it('the live rows carry the run count that makes the decision weigh something', () => {
    const runs = bucket.rows
      .filter((r: any) => r.measured.enabled)
      .reduce((a: number, r: any) => a + r.measured.run_count, 0);
    expect(runs).toBe(1491129);
    expect(bucket.measured_live_runs).toBe(runs);
  });

  it('EVERY row proposed for retirement is dark, which is what makes retiring them safe', () => {
    // The single most useful fact in this bucket. If one of these ever comes back enabled, the
    // retirement proposal stops being free and this test is how anybody finds out.
    const retireable = bucket.rows.filter((r: any) => r.proposed_kind === 'retire');
    expect(retireable).toHaveLength(8);
    expect(retireable.filter((r: any) => r.measured.enabled)).toEqual([]);
    expect(retireable.filter((r: any) => r.measured.run_count > 0)).toEqual([]);
  });

  it('every row proposed as a behavior IS live, so none of them can be dropped quietly', () => {
    const behaviors = bucket.rows.filter((r: any) => r.proposed_kind === 'behavior');
    expect(behaviors).toHaveLength(8);
    expect(behaviors.filter((r: any) => !r.measured.enabled)).toEqual([]);
  });

  it('names the busiest undomained agent, because scale is part of the decision', () => {
    const busiest = [...bucket.rows].sort(
      (a: any, b: any) => b.measured.run_count - a.measured.run_count,
    )[0];
    // visitor_tracker alone accounts for the overwhelming majority of the 1.49M runs.
    expect(busiest.agent_name).toBe('visitor_tracker');
    expect(busiest.measured.run_count).toBeGreaterThan(1000000);
    expect(busiest.measured.enabled).toBe(true);
  });

  it('POSITIVE CONTROL: the live count is derived from the rows, not copied from a field', () => {
    // Proves the assertion above can fail. If `measured_live_rows` and the row data ever
    // disagree, one of them is stale and this is where it surfaces.
    const derived = bucket.rows.filter((r: any) => r.measured.enabled).length;
    expect(derived).toBe(bucket.measured_live_rows);
    expect(derived).not.toBe(5);
  });

  it('leaves the decision open, because thirteen of the rulings did not resolve a row', () => {
    // Was `every row is unresolved` until Ali ruled on 2026-11-01. Eight are now terminally
    // retired; the other thirteen carry a ruling that could not finish the job.
    expect(bucket.needs_owner_decision).toBe(true);
    const open = bucket.rows.filter((r: any) => r.disposition === 'unresolved');
    expect(open).toHaveLength(13);
  });
});
