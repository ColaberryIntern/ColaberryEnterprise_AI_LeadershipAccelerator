const query = jest.fn();

jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => query(...a) } }));

import { getDistribution, getLearners, getSummary } from '../explorerOverviewService';
import type { LearnersQuery } from '../../../schemas/explorerGrowthSchema';

/**
 * The aggregate tabs.
 *
 * Every SQL string asserted here was executed against production on 2026-09-02
 * before the service was written, and the fixtures below carry the values it
 * returned — 153 decisions, 11 waited, 142 actionable, 130 with content, 12
 * gaps; ACTIVATING 131 / CONVERTED 10 / ACTIVE_LEARNER 7. A tab whose query
 * returns nothing is this programme's signature failure, so the numbers are real
 * rather than plausible.
 *
 * Postgres returns COUNT() as a STRING through the pg driver. Several assertions
 * below exist only to pin the coercion: `"153" + 1` is `"1531"`, and a total that
 * renders as a concatenation is the kind of defect that reaches a screenshot.
 */

const q = () => query.mock.calls.map((c) => String(c[0]));
const opts = (i: number) => query.mock.calls[i][1] as { replacements?: Record<string, unknown> };

beforeEach(() => query.mockReset());

describe('getSummary', () => {
  beforeEach(() => {
    query
      .mockResolvedValueOnce([
        {
          decision_date: '2026-09-02',
          modes: ['shadow'],
          total: '153',
          waited: '11',
          actionable: '142',
          with_content: '130',
          executed: '0',
          gaps: '12',
        },
      ])
      .mockResolvedValueOnce([{ count: '153' }]);
  });

  it('returns the production numbers as NUMBERS, not strings', async () => {
    const s = await getSummary();
    expect(s).toMatchObject({
      decision_date: '2026-09-02',
      modes: ['shadow'],
      total: 153,
      waited: 11,
      actionable: 142,
      with_content: 130,
      executed: 0,
      gaps: 12,
      learners_with_profile: 153,
    });
    for (const v of [s.total, s.waited, s.actionable, s.gaps]) expect(typeof v).toBe('number');
  });

  it('anchors on MAX(decision_date), never CURRENT_DATE', async () => {
    // The recompute runs nightly. Anchoring on "today" returns zeroes on a
    // morning before it has run, which reads as "the system decided nothing"
    // rather than "it has not run yet" — a false statement about the system.
    await getSummary();
    const sql = q()[0];
    expect(sql).toContain('SELECT MAX(decision_date) FROM explorer_journey_decisions');
    expect(sql).not.toContain('CURRENT_DATE');
  });

  it('counts a WAIT as waited and everything else as actionable', async () => {
    await getSummary();
    expect(q()[0]).toContain("FILTER (WHERE d.selected_action = 'WAIT')");
    expect(q()[0]).toContain("FILTER (WHERE d.selected_action <> 'WAIT')");
  });
});

describe('getSummary with no decisions at all', () => {
  it('returns zeroes and a null date rather than throwing', async () => {
    // An empty table is a real state — before the first nightly run — and the
    // page must render it as "no run yet", not as a 500.
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: '0' }]);
    const s = await getSummary();
    expect(s.decision_date).toBeNull();
    expect(s.total).toBe(0);
    expect(s.modes).toEqual([]);
  });
});

describe('getDistribution', () => {
  beforeEach(() => {
    query
      .mockResolvedValueOnce([
        { primary_state: 'ACTIVATING', count: '131' },
        { primary_state: 'CONVERTED', count: '10' },
      ])
      .mockResolvedValueOnce([
        { as_of_date: '2026-08-31', primary_state: 'ACTIVATING', count: '134' },
        { as_of_date: '2026-08-31', primary_state: 'CONVERTED', count: '9' },
        { as_of_date: '2026-09-02', primary_state: 'ACTIVATING', count: '131' },
      ])
      .mockResolvedValueOnce([
        { overlay: 'EVENT_READY', count: '152' },
        { overlay: 'DORMANT', count: '139' },
      ]);
  });

  it('groups the trend by date', async () => {
    const d = await getDistribution(30);
    expect(d.trend).toHaveLength(2);
    expect(d.trend[0].as_of_date).toBe('2026-08-31');
    expect(d.trend[0].counts).toHaveLength(2);
    expect(d.trend[1].counts[0]).toEqual({ primary_state: 'ACTIVATING', count: 131 });
  });

  it('reads the trend from SNAPSHOTS, not from current profiles', async () => {
    // Snapshots are append-only, one row per learner per day. Deriving the trend
    // from current profiles would redraw history every night with today's
    // values, so every past point would silently become a copy of the present.
    await getDistribution(30);
    expect(q()[1]).toContain('FROM explorer_score_snapshots');
    expect(q()[1]).not.toContain('explorer_journey_profiles');
  });

  it('binds the window rather than interpolating it', async () => {
    await getDistribution(30);
    expect(q()[1]).toContain('CAST(:days AS integer)');
    expect(opts(1).replacements).toEqual({ days: 30 });
  });

  it('returns overlay counts, which are independent of primary state', async () => {
    const d = await getDistribution(30);
    expect(d.overlays).toEqual([
      { overlay: 'EVENT_READY', count: 152 },
      { overlay: 'DORMANT', count: 139 },
    ]);
  });
});

describe('getLearners', () => {
  const base: LearnersQuery = { limit: 50, offset: 0 } as LearnersQuery;

  beforeEach(() => {
    query.mockResolvedValueOnce([{ count: '131' }]).mockResolvedValueOnce([]);
  });

  it('reports the total BEFORE pagination', async () => {
    // "50 of 131" is a different statement from "50". A page that reports only
    // what fits on it implies the filter matched that much.
    const page = await getLearners(base);
    expect(page.total).toBe(131);
    expect(page.limit).toBe(50);
    expect(page.offset).toBe(0);
  });

  it('applies no WHERE when there are no filters', async () => {
    await getLearners(base);
    expect(q()[0]).not.toContain('WHERE');
  });

  it('matches an overlay against the array, not by equality', async () => {
    // `overlays` is a text[]. `p.overlays = :overlay` would match only a learner
    // whose entire overlay set is that one value — 1 learner instead of 152.
    await getLearners({ ...base, overlay: 'EVENT_READY' } as LearnersQuery);
    expect(q()[0]).toContain(':overlay = ANY(p.overlays)');
    expect(opts(0).replacements).toMatchObject({ overlay: 'EVENT_READY' });
  });

  it('BINDS the search term instead of interpolating it', async () => {
    // Caller-supplied and reaches SQL. Interpolating it would be an injection
    // vector from a query string.
    await getLearners({ ...base, search: "o'brien" } as LearnersQuery);
    expect(q()[0]).toContain('p.email_normalized ILIKE :search');
    expect(q()[0]).not.toContain("o'brien");
    expect(opts(0).replacements).toMatchObject({ search: "%o'brien%" });
  });

  it('binds every score bound it was given, and none it was not', async () => {
    await getLearners({ ...base, e_min: 10, i_max: 80 } as LearnersQuery);
    const sql = q()[0];
    expect(sql).toContain('p.e_score >= :e_min');
    expect(sql).toContain('p.i_score <= :i_max');
    expect(sql).not.toContain('f_min');
    expect(opts(0).replacements).toMatchObject({ e_min: 10, i_max: 80 });
  });

  it('binds limit and offset rather than splicing them in', async () => {
    await getLearners({ ...base, limit: 25, offset: 100 } as LearnersQuery);
    expect(q()[1]).toContain('LIMIT :limit OFFSET :offset');
    expect(opts(1).replacements).toMatchObject({ limit: 25, offset: 100 });
  });

  it('orders deterministically so pages cannot repeat or skip a learner', async () => {
    // Without a unique tiebreaker, two learners with equal scores can swap
    // between page 1 and page 2 — one appears twice, another never.
    await getLearners(base);
    expect(q()[1]).toContain('p.enrollment_id');
    expect(q()[1]).toContain('NULLS LAST');
  });

  it('counts with the same WHERE as it lists', async () => {
    // A count that ignores the filter reports 131 next to 7 filtered rows.
    await getLearners({ ...base, state: 'ACTIVE_LEARNER' } as LearnersQuery);
    expect(q()[0]).toContain('p.primary_state = :state');
    expect(q()[1]).toContain('p.primary_state = :state');
  });
});
