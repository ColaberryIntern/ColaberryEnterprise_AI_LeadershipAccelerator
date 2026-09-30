const query = jest.fn();

jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => query(...a) } }));

import {
  getEligibility,
  getLearnerDecisions,
  getLearnerProfile,
  getLearnerScores,
  getLearnerSignals,
} from '../explorerLearnerService';

/**
 * The learner drawer.
 *
 * The assertions that matter most here are the NULL ones. Every 404 in the
 * Command Center rests on these functions returning `null` for an unknown
 * learner rather than an empty object — and "absent" and "empty" are different
 * answers. A learner who exists with no decisions is not the same as a learner
 * who does not exist, and a drawer that renders both as blank is lying about one
 * of them.
 *
 * Fixtures carry production values measured 2026-09-02: 153 profiles with
 * `signal_summary` populated on all of them, 918 snapshots across 153 learners
 * and 6 dates, and 0 of 612 decisions carrying `triggering_signals`.
 */

const ID = '2039513d-307a-4749-ab99-c666a33794d3';
const sqls = () => query.mock.calls.map((c) => String(c[0]));
const find = (needle: string) => sqls().find((s) => s.includes(needle)) ?? '';
const optsFor = (needle: string) => {
  const i = sqls().findIndex((s) => s.includes(needle));
  return query.mock.calls[i]?.[1] as { replacements?: Record<string, unknown> };
};

/** Routes each query to a fixture by what it selects, so call order is not load-bearing. */
function route(handlers: { match: string; rows: unknown[] }[]) {
  query.mockImplementation((sql: string) => {
    for (const h of handlers) if (String(sql).includes(h.match)) return Promise.resolve(h.rows);
    return Promise.resolve([]);
  });
}

const PROFILE = {
  enrollment_id: ID,
  lead_id: 24481,
  email_normalized: 'learner@example.com',
  primary_state: 'CONNECTED_TO_COMMUNITY',
  overlays: ['EVENT_READY'],
  e_score: 9,
  i_score: 0,
  f_score: 0,
  contactability: { email: { eligible: true } },
  affinities: [],
  signal_summary: { engagement: { recency: 0, progress: 0, achievement: 0 }, highestIntentTier: 2 },
  days_since_last_activity: 7,
  state_entered_at: '2026-08-23',
  last_decision_at: '2026-09-02',
  last_contacted_at: null,
  scores_computed_at: '2026-09-02',
};

/** Real series for this learner: a genuine E-score decay, 11 -> 9 over six dates. */
const SERIES = [
  { as_of_date: '2026-08-22', e_score: 11, i_score: 0, f_score: 0, primary_state: 'CONVERTED', overlays: [] },
  { as_of_date: '2026-08-31', e_score: 9, i_score: 0, f_score: 0, primary_state: 'CONNECTED_TO_COMMUNITY', overlays: [] },
];

const EXISTS = [{ n: '1' }];
const ABSENT: unknown[] = [];

beforeEach(() => query.mockReset());

describe('getLearnerProfile', () => {
  it('returns the profile row', async () => {
    route([{ match: 'FROM explorer_journey_profiles', rows: [PROFILE] }]);
    const p = await getLearnerProfile(ID);
    expect(p?.enrollment_id).toBe(ID);
    expect(p?.signal_summary).toBeTruthy();
  });

  it('returns NULL for an unknown learner, not an empty object', async () => {
    // The boundary every 404 in this epic rests on. `{}` would render as a
    // learner with no data instead of "no such learner".
    route([{ match: 'FROM explorer_journey_profiles', rows: ABSENT }]);
    expect(await getLearnerProfile('00000000-0000-4000-8000-000000000000')).toBeNull();
  });

  it('binds the id rather than interpolating it', async () => {
    route([{ match: 'FROM explorer_journey_profiles', rows: [PROFILE] }]);
    await getLearnerProfile(ID);
    expect(find('FROM explorer_journey_profiles')).toContain('enrollment_id = :id');
    expect(find('FROM explorer_journey_profiles')).not.toContain(ID);
    expect(optsFor('FROM explorer_journey_profiles').replacements).toEqual({ id: ID });
  });
});

describe('getLearnerScores', () => {
  it('returns the series with numeric scores', async () => {
    // Postgres returns these through the driver as strings in some shapes;
    // `"11" > 9` is false but `"11" + 1` is "111", and a chart plotting strings
    // renders a flat line.
    route([
      { match: 'COUNT(*) AS n FROM explorer_journey_profiles', rows: EXISTS },
      { match: 'FROM explorer_score_snapshots', rows: SERIES },
    ]);
    const r = await getLearnerScores(ID, 90);
    expect(r?.series).toHaveLength(2);
    expect(typeof r?.series[0].e_score).toBe('number');
    expect(r?.series[0].e_score).toBe(11);
  });

  it('returns NULL for an unknown learner rather than an empty series', async () => {
    // An empty series would read as "this learner has never been scored", which
    // is a claim about a learner who does not exist.
    route([{ match: 'COUNT(*) AS n FROM explorer_journey_profiles', rows: [{ n: '0' }] }]);
    expect(await getLearnerScores(ID, 90)).toBeNull();
  });

  it('returns an EMPTY series for a real learner with no snapshots', async () => {
    // The other half of the distinction: absent vs empty.
    route([
      { match: 'COUNT(*) AS n FROM explorer_journey_profiles', rows: EXISTS },
      { match: 'FROM explorer_score_snapshots', rows: ABSENT },
    ]);
    const r = await getLearnerScores(ID, 90);
    expect(r).not.toBeNull();
    expect(r?.series).toEqual([]);
  });

  it('binds the window as an integer cast', async () => {
    route([
      { match: 'COUNT(*) AS n FROM explorer_journey_profiles', rows: EXISTS },
      { match: 'FROM explorer_score_snapshots', rows: SERIES },
    ]);
    await getLearnerScores(ID, 90);
    expect(find('FROM explorer_score_snapshots')).toContain('CAST(:days AS integer)');
    expect(optsFor('FROM explorer_score_snapshots').replacements).toMatchObject({ days: 90 });
  });
});

describe('getLearnerSignals — the honest absence', () => {
  beforeEach(() =>
    route([
      { match: 'FROM explorer_journey_profiles', rows: [PROFILE] },
      { match: 'FROM explorer_score_snapshots', rows: SERIES },
    ]),
  );

  it('reports the per-signal timeline as UNAVAILABLE, with a reason', async () => {
    // §27 calls this route a "signal timeline with weights + decay". That
    // timeline does not exist: `triggering_signals` is declared on the decisions
    // table, defaults to `[]`, and NO code path writes it — 0 of 612 production
    // rows are populated, and `runGovernor.ts` never references the column.
    //
    // Returning `signals: []` would read as "this learner produced no signals",
    // which is false about a learner whose E-score demonstrably moved 11 -> 9.
    // Refuse and report, rather than substitute something shaped like data.
    const s = await getLearnerSignals(ID, 90);
    expect(s?.per_signal_timeline_available).toBe(false);
    expect(s?.timeline_absent_reason).toContain('triggering_signals');
    expect(s?.timeline_absent_reason.length).toBeGreaterThan(60);
  });

  it('returns the summary that DOES exist, populated on all 153 learners', async () => {
    const s = await getLearnerSignals(ID, 90);
    expect(s?.summary).toMatchObject({ highestIntentTier: 2 });
  });

  it('returns the score series as the observable signal history', async () => {
    const s = await getLearnerSignals(ID, 90);
    expect(s?.series).toHaveLength(2);
    expect(s?.series[0].e_score).toBe(11);
  });

  it('returns NULL for an unknown learner', async () => {
    route([{ match: 'FROM explorer_journey_profiles', rows: ABSENT }]);
    expect(await getLearnerSignals(ID, 90)).toBeNull();
  });
});

describe('getLearnerDecisions', () => {
  const ROWS = [
    { id: 'd1', decision_date: '2026-09-02', mode: 'shadow', selected_action: 'RECOMMEND_LESSON', channel: 'email', executed: false, reason: 'r', suppressed_count: 2, asset_count: 0 },
  ];

  it('reports the total BEFORE pagination', async () => {
    route([
      { match: 'COUNT(*) AS n FROM explorer_journey_profiles', rows: EXISTS },
      { match: 'COUNT(*) AS n FROM explorer_journey_decisions', rows: [{ n: '4' }] },
      { match: 'jsonb_array_length', rows: ROWS },
    ]);
    const r = await getLearnerDecisions(ID, 50, 0);
    expect(r?.total).toBe(4);
    expect(r?.rows).toHaveLength(1);
  });

  it('returns NULL for an unknown learner', async () => {
    route([{ match: 'COUNT(*) AS n FROM explorer_journey_profiles', rows: [{ n: '0' }] }]);
    expect(await getLearnerDecisions(ID, 50, 0)).toBeNull();
  });

  it('is BOUNDED — limit and offset are bound, not spliced', async () => {
    // Without a bound this list ships unbounded while every sibling caps at 200.
    route([
      { match: 'COUNT(*) AS n FROM explorer_journey_profiles', rows: EXISTS },
      { match: 'COUNT(*) AS n FROM explorer_journey_decisions', rows: [{ n: '4' }] },
      { match: 'jsonb_array_length', rows: ROWS },
    ]);
    await getLearnerDecisions(ID, 25, 50);
    expect(find('jsonb_array_length')).toContain('LIMIT :limit OFFSET :offset');
    expect(optsFor('jsonb_array_length').replacements).toMatchObject({ limit: 25, offset: 50 });
  });

  it('orders newest first with a unique tiebreaker', async () => {
    route([
      { match: 'COUNT(*) AS n FROM explorer_journey_profiles', rows: EXISTS },
      { match: 'COUNT(*) AS n FROM explorer_journey_decisions', rows: [{ n: '4' }] },
      { match: 'jsonb_array_length', rows: ROWS },
    ]);
    await getLearnerDecisions(ID, 50, 0);
    expect(find('jsonb_array_length')).toContain('ORDER BY decision_date DESC, id');
  });
});

describe('getEligibility', () => {
  it('returns the last decision’s candidates and suppressions', async () => {
    route([
      { match: 'FROM explorer_journey_profiles', rows: [PROFILE] },
      {
        match: 'candidate_actions, suppressed_actions',
        rows: [
          {
            decision_date: '2026-09-02',
            candidate_actions: [{ action_type: 'RECOMMEND_LESSON' }],
            suppressed_actions: [{ action_type: 'SEND_EMAIL', reason: 'lower priority' }],
          },
        ],
      },
    ]);
    const e = await getEligibility(ID);
    expect(e?.as_of_decision_date).toBe('2026-09-02');
    expect(e?.candidates).toHaveLength(1);
    expect(e?.suppressed).toHaveLength(1);
    expect(e?.note).toBeNull();
  });

  it('states a NOTE when the learner exists but was never decided on', async () => {
    // The branch that distinguishes "evaluated and nothing qualified" from
    // "never evaluated". Empty arrays alone cannot tell those apart.
    route([
      { match: 'FROM explorer_journey_profiles', rows: [PROFILE] },
      { match: 'candidate_actions, suppressed_actions', rows: ABSENT },
    ]);
    const e = await getEligibility(ID);
    expect(e?.as_of_decision_date).toBeNull();
    expect(e?.candidates).toEqual([]);
    expect(e?.note).toContain('no decision has been recorded');
  });

  it('returns NULL for an unknown learner', async () => {
    route([{ match: 'FROM explorer_journey_profiles', rows: ABSENT }]);
    expect(await getEligibility(ID)).toBeNull();
  });

  it('does NOT re-evaluate — it reads the recorded decision', async () => {
    // §27 calls this "dry-run candidate evaluation". A genuine dry run would
    // invoke the Governor, which is a recompute: it would answer "what would we
    // decide now" while the page reports on what was decided.
    route([
      { match: 'FROM explorer_journey_profiles', rows: [PROFILE] },
      { match: 'candidate_actions, suppressed_actions', rows: ABSENT },
    ]);
    await getEligibility(ID);
    expect(find('candidate_actions, suppressed_actions')).toContain(
      'FROM explorer_journey_decisions',
    );
    expect(find('candidate_actions, suppressed_actions')).toContain('ORDER BY decision_date DESC');
  });
});

describe('every statement is read-only', () => {
  it('issues no mutating SQL across all five entry points', async () => {
    route([
      { match: 'FROM explorer_journey_profiles', rows: [PROFILE] },
      { match: 'FROM explorer_score_snapshots', rows: SERIES },
      { match: 'candidate_actions, suppressed_actions', rows: ABSENT },
      { match: 'jsonb_array_length', rows: [] },
      { match: 'COUNT(*) AS n FROM explorer_journey_decisions', rows: [{ n: '0' }] },
    ]);
    await getLearnerProfile(ID);
    await getLearnerScores(ID, 90);
    await getLearnerSignals(ID, 90);
    await getLearnerDecisions(ID, 50, 0);
    await getEligibility(ID);

    for (const sql of sqls()) {
      expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|CREATE)\b/i);
    }
    expect(sqls().length).toBeGreaterThan(5);
  });
});
