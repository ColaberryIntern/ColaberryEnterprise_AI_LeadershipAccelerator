const query = jest.fn();

jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => query(...a) } }));

import {
  getContentHealth,
  getDecisions,
  getShadow,
  unsupportedPurposes,
} from '../explorerDecisionsService';
import type {
  ContentQuery,
  DecisionsQuery,
  ShadowQuery,
} from '../../../schemas/explorerGrowthSchema';

/**
 * The per-decision tabs.
 *
 * `assetPurposeMap` is deliberately NOT mocked. The declared gaps and their
 * reasons are the thing under test, and a mocked copy of that map would let this
 * file agree with itself while disagreeing with the Governor.
 *
 * Fixtures carry production values measured 2026-09-02: 153 decisions on the
 * latest run, 130 SEND_EMAIL + 12 RECOMMEND_LESSON that would have gone out,
 * 646 assets / 552 active, and the stage x audience matrix
 * (evergreen 299, learning 206, activation 47 full_access + 23 free_preview) —
 * all of it full_access except those 23.
 */

const sqls = () => query.mock.calls.map((c) => String(c[0]));
const find = (needle: string) => sqls().find((s) => s.includes(needle)) ?? '';
const optsFor = (needle: string) => {
  const i = sqls().findIndex((s) => s.includes(needle));
  return query.mock.calls[i]?.[1] as { replacements?: Record<string, unknown> };
};

/** Routes each query to a fixture by what it selects, so call ORDER is not load-bearing. */
function route(handlers: { match: string; rows: unknown[] }[]) {
  query.mockImplementation((sql: string) => {
    for (const h of handlers) if (String(sql).includes(h.match)) return Promise.resolve(h.rows);
    return Promise.resolve([]);
  });
}

beforeEach(() => query.mockReset());

describe('getDecisions', () => {
  beforeEach(() =>
    route([
      { match: 'COUNT(*) AS count', rows: [{ count: '153', decision_date: '2026-09-02' }] },
      {
        match: 'suppressed_count',
        rows: [
          {
            id: 'd1',
            enrollment_id: 'e1',
            decision_date: '2026-09-02',
            mode: 'shadow',
            selected_action: 'RECOMMEND_LESSON',
            channel: 'email',
            executed: false,
            reason: 'r',
            suppressed_count: 2,
            asset_count: 0,
            email_normalized: 'a@b.com',
            primary_state: 'ACTIVE_LEARNER',
            e_score: 33,
            i_score: 0,
            f_score: 0,
          },
        ],
      },
    ]),
  );

  const base = { limit: 50, offset: 0 } as DecisionsQuery;

  it('anchors on the latest run when no date is given', async () => {
    const page = await getDecisions(base);
    expect(page.total).toBe(153);
    expect(page.decision_date).toBe('2026-09-02');
    expect(find('suppressed_count')).toContain(
      'SELECT MAX(decision_date) FROM explorer_journey_decisions',
    );
  });

  it('honours a given date exactly', async () => {
    await getDecisions({ ...base, date: '2026-08-31' } as DecisionsQuery);
    expect(find('suppressed_count')).toContain('d.decision_date = :date');
    expect(optsFor('suppressed_count').replacements).toMatchObject({ date: '2026-08-31' });
  });

  it('binds the action filter', async () => {
    await getDecisions({ ...base, action: 'RECOMMEND_LESSON' } as DecisionsQuery);
    expect(find('suppressed_count')).toContain('d.selected_action = :action');
    expect(optsFor('suppressed_count').replacements).toMatchObject({
      action: 'RECOMMEND_LESSON',
    });
  });

  it('distinguishes executed=false from executed unset', async () => {
    // `if (q.executed)` would drop the filter for `false` and quietly return
    // executed rows to someone reviewing the un-executed ones.
    await getDecisions({ ...base, executed: false } as DecisionsQuery);
    expect(find('suppressed_count')).toContain('d.executed = :executed');
    expect(optsFor('suppressed_count').replacements).toMatchObject({ executed: false });
  });

  it('surfaces the suppressed count so a row advertises its own Why', async () => {
    const page = await getDecisions(base);
    expect(page.rows[0].suppressed_count).toBe(2);
    expect(page.rows[0].asset_count).toBe(0);
  });

  it('LEFT JOINs the profile so a decision without one is not dropped', async () => {
    // An inner join would silently hide any decision whose profile is missing —
    // exactly the rows most worth seeing.
    await getDecisions(base);
    expect(find('suppressed_count')).toContain('LEFT JOIN explorer_journey_profiles');
  });
});

describe('getShadow', () => {
  beforeEach(() =>
    route([
      { match: 'COUNT(*) AS count', rows: [{ count: '142', decision_date: '2026-09-02' }] },
      { match: 'suppressed_count', rows: [] },
    ]),
  );

  it('excludes WAIT and anything already executed', async () => {
    // 142, not 153. Listing the 11 WAITs under "what would have gone out" pads
    // the review with non-events and makes the real number look smaller.
    const page = await getShadow({ limit: 50, offset: 0 } as ShadowQuery);
    expect(page.total).toBe(142);
    const sql = find('suppressed_count');
    expect(sql).toContain("d.selected_action <> 'WAIT'");
    expect(sql).toContain('d.executed = false');
  });

  it('still anchors on the latest run', async () => {
    await getShadow({ limit: 50, offset: 0 } as ShadowQuery);
    expect(find('suppressed_count')).toContain('SELECT MAX(decision_date)');
  });
});

describe('getContentHealth', () => {
  const q = { limit: 50, offset: 0 } as ContentQuery;

  beforeEach(() =>
    route([
      { match: 'FILTER (WHERE active)', rows: [{ total: '646', active: '552', emailable: '552' }] },
      {
        match: 's.stage, u.audience',
        rows: [
          { stage: 'evergreen', audience: 'full_access', count: '299' },
          { stage: 'learning', audience: 'full_access', count: '206' },
          { stage: 'activation', audience: 'full_access', count: '47' },
          { stage: 'activation', audience: 'free_preview', count: '23' },
        ],
      },
      {
        match: 'SELECT u.audience, COUNT(DISTINCT a.id)',
        rows: [
          { audience: 'free_preview', n: '23' },
          { audience: 'full_access', n: '552' },
        ],
      },
      {
        match: 'd.reason LIKE',
        rows: Array.from({ length: 12 }, () => ({
          decision_date: '2026-09-02',
          reason: 'state=X | asset gaps: no_asset_for_purpose:lesson_recommendation:learning',
        })),
      },
    ]),
  );

  it('reports the registry totals as numbers', async () => {
    const h = await getContentHealth(q);
    expect(h).toMatchObject({ total: 646, active: 552, emailable: 552 });
  });

  it('returns the stage x audience matrix that EXPLAINS the gap', async () => {
    // The count alone reads healthy. The matrix is the part that says why a
    // free-tier learner past week 0 has nothing: every learning-stage asset is
    // full_access, and the only free_preview content is 23 activation assets.
    const h = await getContentHealth(q);
    expect(h.matrix).toContainEqual({ stage: 'learning', audience: 'full_access', count: 206 });
    expect(h.matrix).toContainEqual({ stage: 'activation', audience: 'free_preview', count: 23 });
    expect(h.matrix.some((m) => m.stage === 'learning' && m.audience === 'free_preview')).toBe(
      false,
    );
  });

  it('carries each declared gap with the reason PURPOSE_SPECS gives it', async () => {
    const h = await getContentHealth(q);
    const declared = h.purposes.filter((p) => !p.supported);
    expect(declared.length).toBeGreaterThanOrEqual(4);
    for (const p of declared) {
      expect(typeof p.declared_gap_reason).toBe('string');
      expect(p.declared_gap_reason!.length).toBeGreaterThan(20);
    }
    // Sourced from the same map the Governor consults, not a second copy.
    expect(declared.map((p) => p.purpose).sort()).toEqual(
      unsupportedPurposes()
        .map((u) => u.purpose)
        .sort(),
    );
  });

  it('issues no coverage query for a declared gap', async () => {
    await getContentHealth(q);
    const coverage = sqls().filter((s) => s.includes('SELECT u.audience, COUNT(DISTINCT a.id)'));
    // 8 purposes, 4 of them declared gaps -> 4 coverage queries, not 8.
    expect(coverage).toHaveLength(4);
  });

  it('counts DISTINCT assets', async () => {
    await getContentHealth(q);
    expect(find('SELECT u.audience, COUNT(DISTINCT a.id)')).toContain('COUNT(DISTINCT a.id)');
  });

  it('binds kinds as a POSTGRES ARRAY LITERAL, not a JS array', async () => {
    // The defect this assertion exists for, and the reason it checks the bound
    // VALUE rather than the SQL text.
    //
    // Sequelize `replacements` is textual substitution, not a server-side bind.
    // `kinds: ['LESSON']` renders as `CAST('LESSON' AS text[])`, which
    // production rejects with:
    //
    //   ERROR: malformed array literal: "LESSON"
    //   DETAIL: Array value must start with "{" or dimension information.
    //
    // Every supported purpose carries kinds, so all four reject at once,
    // `Promise.all` rejects, and /content 500s — taking the matrix and the gap
    // report down with it even though those two queries are fine.
    //
    // The first version of this file shipped exactly that, and all 33 tests
    // passed, because every one of them asserts on the SQL TEMPLATE. A template
    // assertion cannot see a binding bug. This one can.
    await getContentHealth(q);
    const kinds = optsFor('SELECT u.audience, COUNT(DISTINCT a.id)').replacements!.kinds;
    expect(typeof kinds).toBe('string');
    expect(kinds as string).toMatch(/^\{.*\}$/);
    expect(Array.isArray(kinds)).toBe(false);
  });

  it('binds stages as a literal when a purpose pins one, null when it does not', async () => {
    await getContentHealth(q);
    const stages = query.mock.calls
      .filter((c) => String(c[0]).includes('SELECT u.audience, COUNT(DISTINCT a.id)'))
      .map((c) => (c[1] as { replacements: Record<string, unknown> }).replacements.stages);

    // 4 supported purposes: two pin 'activation', two do not.
    for (const s of stages) {
      if (s !== null) {
        expect(typeof s).toBe('string');
        expect(s as string).toMatch(/^\{.*\}$/);
      }
    }
    expect(stages.filter((s) => s === null).length).toBeGreaterThan(0);
    expect(stages.filter((s) => s !== null).length).toBeGreaterThan(0);
  });

  it('reports a pinned-stage purpose with its pin visible', async () => {
    const h = await getContentHealth(q);
    const first = h.purposes.find((p) => p.purpose === 'activation_first_step');
    expect(first?.pinned_stages).toEqual(['activation']);
    const lesson = h.purposes.find((p) => p.purpose === 'lesson_recommendation');
    // No pin: this purpose follows the learner, which is the whole difference.
    expect(lesson?.pinned_stages).toBeNull();
  });

  it('counts the decision-level gaps and names them', async () => {
    const h = await getContentHealth(q);
    expect(h.decision_gaps.gap_count).toBe(12);
    expect(h.decision_gaps.named).toEqual([
      'no_asset_for_purpose:lesson_recommendation:learning',
    ]);
    expect(h.decision_gaps.decision_date).toBe('2026-09-02');
  });

  it('parses gaps with the SAME rule as the Why drilldown', async () => {
    // Extracting the gap in SQL was the first attempt, and a pattern like
    // `[^|]*` stops at a pipe — while a multi-stage gap token carries its own
    // bare pipe. The tab would have shown a truncated gap while the drilldown
    // showed it whole. One rule, one implementation.
    route([
      { match: 'FILTER (WHERE active)', rows: [{ total: '1', active: '1', emailable: '1' }] },
      { match: 's.stage, u.audience', rows: [] },
      { match: 'SELECT u.audience, COUNT(DISTINCT a.id)', rows: [] },
      {
        match: 'd.reason LIKE',
        rows: [
          {
            decision_date: '2026-09-02',
            reason: 'x | asset gaps: no_asset_for_purpose:lesson_recommendation:learning|deciding',
          },
        ],
      },
    ]);
    const h = await getContentHealth(q);
    expect(h.decision_gaps.named).toEqual([
      'no_asset_for_purpose:lesson_recommendation:learning|deciding',
    ]);
  });

  it('deduplicates a gap reported by many decisions', async () => {
    // 12 decisions, one distinct gap. Listing it twelve times would read as
    // twelve different problems.
    const h = await getContentHealth(q);
    expect(h.decision_gaps.named).toHaveLength(1);
    expect(h.decision_gaps.gap_count).toBe(12);
  });
});
