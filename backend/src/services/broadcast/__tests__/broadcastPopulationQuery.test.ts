/**
 * The population and rollup SQL, asserted as TEXT.
 *
 * Same reasoning as `broadcastTelemetryQuery.test.ts`: the properties that matter here are
 * invisible to a behavioural test against a small fixture, and all of them fail quietly.
 *
 *   1. COUNT(DISTINCT enrollment_id), not COUNT(*). Identical on a fixture where every
 *      person attended once; different the moment someone attends two airings, which is
 *      the normal case for a weekly broadcast and the whole reason the unit is a person.
 *   2. The staff/test exclusion lives in the JOIN. A fixture with no staff in it cannot
 *      tell whether the clause is there, and the first real number would silently include
 *      the producer watching their own broadcast.
 *   3. The month boundary is converted AT TIME ZONE. A UTC boundary returns the same
 *      answer for every airing except the ones near midnight at the end of a month, which
 *      is precisely when a Tuesday evening class in Texas lands.
 *   4. A LEFT JOIN, not an INNER one. An inner join drops an airing nobody watched, and
 *      then "two airings, no audience" becomes indistinguishable from "no airings" - the
 *      conflation the policy module exists to prevent.
 *
 * No database: `sequelize` is mocked and the SQL it was handed is the artefact under test.
 */
jest.mock('../../../config/database', () => ({
  sequelize: { query: jest.fn(), transaction: jest.fn() },
}));

import { sequelize } from '../../../config/database';
import {
  POPULATION_SQL,
  ROLLUP_SQL,
  UNROLLED_SQL,
  listOccurrencesNeedingRollup,
  monthWindow,
  readMonthlyPopulation,
  rollUpOccurrence,
} from '../broadcastPopulationService';

const query = sequelize.query as unknown as jest.Mock;

beforeEach(() => query.mockReset());

describe('monthWindow', () => {
  it('is closed-open and rolls the year at December', () => {
    expect(monthWindow(2026, 10)).toEqual({ from: '2026-10-01', to: '2026-11-01' });
    expect(monthWindow(2026, 12)).toEqual({ from: '2026-12-01', to: '2027-01-01' });
    expect(monthWindow(2026, 1)).toEqual({ from: '2026-01-01', to: '2026-02-01' });
  });

  it('refuses a month that is not a month', () => {
    expect(() => monthWindow(2026, 0)).toThrow(/not 1-12/);
    expect(() => monthWindow(2026, 13)).toThrow(/not 1-12/);
    expect(() => monthWindow(1999, 6)).toThrow(/out of range/);
  });
});

describe('the population query text', () => {
  it('counts people, never rows', () => {
    expect(POPULATION_SQL).toMatch(/COUNT\(DISTINCT p\.enrollment_id\)/);
    expect(POPULATION_SQL).not.toMatch(/COUNT\(\*\)/);
  });

  it('excludes staff and test viewers in the join, not afterwards', () => {
    expect(POPULATION_SQL).toMatch(/p\.is_staff\s*=\s*FALSE/);
    expect(POPULATION_SQL).toMatch(/p\.is_test\s*=\s*FALSE/);
  });

  it('keeps an airing that nobody watched', () => {
    expect(POPULATION_SQL).toMatch(/LEFT JOIN broadcast_viewer_people/);
    expect(POPULATION_SQL).not.toMatch(/INNER JOIN broadcast_viewer_people/);
  });

  it('bounds the month in the house timezone', () => {
    expect(POPULATION_SQL).toMatch(/AT TIME ZONE 'America\/Chicago'/);
    expect(POPULATION_SQL).toMatch(/interval '1 month'/);
  });

  it('counts an airing only if it actually started', () => {
    // scheduled_start_at would count a broadcast that was announced and never went live.
    expect(POPULATION_SQL).toMatch(/o\.content_started_at IS NOT NULL/);
    expect(POPULATION_SQL).not.toMatch(/o\.scheduled_start_at\s*>=/);
  });
});

describe('readMonthlyPopulation', () => {
  it('splits deliberate and auto so they sum to the total', async () => {
    query.mockResolvedValueOnce([
      { airings: '3', learners: '10', deliberate: '4', watch_seconds: '1800' },
    ]);
    const r = await readMonthlyPopulation(2026, 11);
    expect(r.learners).toBe(10);
    expect(r.deliberate).toBe(4);
    expect(r.auto).toBe(6);
    expect(r.deliberate + r.auto).toBe(r.learners);
    expect(r.watchSeconds).toBe(1800);
  });

  it('never returns a negative auto count if the two queries disagree', async () => {
    query.mockResolvedValueOnce([
      { airings: '1', learners: '2', deliberate: '5', watch_seconds: '0' },
    ]);
    const r = await readMonthlyPopulation(2026, 11);
    expect(r.auto).toBe(0);
  });

  it('carries the coverage verdict for the month it read', async () => {
    query.mockResolvedValueOnce([
      { airings: '2', learners: '0', deliberate: '0', watch_seconds: '0' },
    ]);
    // October 2026 overlaps the recorded beat-write outage.
    const oct = await readMonthlyPopulation(2026, 10);
    expect(oct.coverage).toBe('partially_blind');

    query.mockResolvedValueOnce([
      { airings: '0', learners: '0', deliberate: '0', watch_seconds: '0' },
    ]);
    const nov = await readMonthlyPopulation(2026, 11);
    expect(nov.coverage).toBe('clean');
  });

  it('survives an empty result set without inventing numbers', async () => {
    query.mockResolvedValueOnce([]);
    const r = await readMonthlyPopulation(2026, 11);
    expect(r).toMatchObject({ airings: 0, learners: 0, deliberate: 0, auto: 0 });
  });
});

describe('the rollup', () => {
  it('writes the five columns that have never been written', () => {
    for (const col of ['unique_attendees', 'watch_seconds', 'deliberate_viewers',
      'auto_viewers', 'rolled_up_at']) {
      expect(ROLLUP_SQL).toContain(col);
    }
  });

  it('overwrites rather than accumulates, so running it twice is a no-op', () => {
    // The idempotency requirement in CLAUDE.md, expressed as the thing that makes it
    // true: EXCLUDED.x, never broadcast_occurrence_metrics.x + EXCLUDED.x.
    expect(ROLLUP_SQL).toMatch(/unique_attendees\s*=\s*EXCLUDED\.unique_attendees/);
    expect(ROLLUP_SQL).toMatch(/watch_seconds\s*=\s*EXCLUDED\.watch_seconds/);
    expect(ROLLUP_SQL).not.toMatch(/broadcast_occurrence_metrics\.\w+\s*\+/);
  });

  it('leaves the sampled peak alone, because it cannot be recomputed', () => {
    expect(ROLLUP_SQL).not.toMatch(/peak_concurrency\s*=/);
    expect(ROLLUP_SQL).not.toMatch(/peak_at\s*=/);
  });

  it('excludes staff and test from the frozen numbers too', () => {
    expect(ROLLUP_SQL).toMatch(/p\.is_staff = FALSE AND p\.is_test = FALSE/);
  });

  it('upserts rather than inserting, because the peak sampler may have made the row', () => {
    expect(ROLLUP_SQL).toMatch(/ON CONFLICT \(occurrence_id\) DO UPDATE/);
  });

  it('passes the occurrence and the clock through', async () => {
    query.mockResolvedValueOnce([]);
    await rollUpOccurrence('occ-1', 1_700_000_000_000);
    const [, opts] = query.mock.calls[0];
    expect(opts.replacements.occ).toBe('occ-1');
    expect(opts.replacements.now).toEqual(new Date(1_700_000_000_000));
  });
});

describe('finding what still needs a rollup', () => {
  it('re-rolls anything whose rollup predates its own end', () => {
    // A beat can land while a player drains after ended_at, so a rollup taken at the
    // moment of ending can be short. Staleness, not just absence, is the trigger.
    expect(UNROLLED_SQL).toMatch(/m\.rolled_up_at IS NULL OR m\.rolled_up_at < o\.ended_at/);
    expect(UNROLLED_SQL).toMatch(/o\.ended_at IS NOT NULL/);
  });

  it('returns ids', async () => {
    query.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]);
    expect(await listOccurrencesNeedingRollup(10)).toEqual(['a', 'b']);
  });
});
