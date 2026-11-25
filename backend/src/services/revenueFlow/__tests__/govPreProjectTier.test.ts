const m = { query: jest.fn() };

jest.mock('../../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => m.query(...a) },
}));

import { buildPreProjectTier } from '../govPreProjectTier';

/**
 * R12 — the government pipeline behind the pipeline.
 *
 * The ticket's gate was "establish why the rows are orphaned before linking any of them",
 * and the diagnosis on production was that a delivery project is created at approval: 0 of
 * 246 rows at the two pre-approval stages has ever carried one, against 19 of 26 at approval.
 * So this is a lifecycle stage, and the ticket's branch for that case is to render a count
 * with no names rather than pretend the rows are nameable.
 *
 * These tests cover the ways that rendering could quietly become a lie:
 *
 *   - a missing table reported as a measured zero, which reads as "everything is assessed"
 *   - the copy claiming nothing can be named after somebody has named something
 *   - a dollar figure appearing beside a count of unassessed opportunities
 *   - a nameable count larger than the population it is counted from
 *   - a write escaping from something documented as read-only and re-runnable
 */
const qualificationsExist = (yes: boolean) => [{ n: yes ? 1 : 0 }];
const aliasesExist = (yes: boolean) => [{ n: yes ? 1 : 0 }];

/** The live production shape on 2026-11-25: 14 rows, none linked, none nameable. */
const LIVE = [{ live: 14, linked: 0, with_snapshot: 0, with_alias: 0 }];

beforeEach(() => {
  m.query.mockReset();
});

describe('a missing table is not an empty stage', () => {
  it('returns null when gov_qualifications is absent, rather than a count of zero', async () => {
    m.query.mockResolvedValueOnce(qualificationsExist(false));

    // Null makes the page omit the block. A zero would render as "every opportunity has been
    // assessed", which is the opposite of "the instrument is missing".
    await expect(buildPreProjectTier()).resolves.toBeNull();
  });

  it('asks nothing else once the table is missing', async () => {
    m.query.mockResolvedValueOnce(qualificationsExist(false));
    await buildPreProjectTier();
    expect(m.query).toHaveBeenCalledTimes(1);
  });
});

describe('the count, and why it has no names', () => {
  const live = async () => {
    m.query
      .mockResolvedValueOnce(qualificationsExist(true))
      .mockResolvedValueOnce(aliasesExist(true))
      .mockResolvedValueOnce(LIVE);
    return buildPreProjectTier();
  };

  it('reports the measured count', async () => {
    const t = await live();
    expect(t?.count).toBe(14);
    expect(t?.linkedCount).toBe(0);
    expect(t?.nameableCount).toBe(0);
  });

  it('says plainly that none of them can be named, and why', async () => {
    const t = await live();
    expect(t?.whyNoNames).toContain('None of these 14 can be named yet');
    expect(t?.whyNoNames).toContain('internal opportunity id');
    // The specific trap: showing the id would look like a name.
    expect(t?.whyNoNames).toContain('look like a name without being one');
  });

  it('names the human action that would make one nameable, and refuses to guess', async () => {
    const t = await live();
    expect(t?.unlockedBy).toContain('approved for pursuit');
    expect(t?.unlockedBy).toContain('records who linked it and why');
    expect(t?.unlockedBy).toContain('nothing here is guessed');
  });

  it('calls the stage what the schema calls it, not "orphaned"', async () => {
    const t = await live();
    expect(t?.definition).toContain('needs_evidence');
    expect(t?.definition).toContain('not a pursuit');
    // It is also not a rejection, which is the other way a reader could misfile it.
    expect(t?.definition).toContain('not a rejection');
  });
});

describe('the copy follows the measurement instead of being frozen', () => {
  it('stops claiming none can be named once one can', async () => {
    // The regression this guards: somebody links an opportunity, and the page keeps telling
    // them none of these can be named.
    m.query
      .mockResolvedValueOnce(qualificationsExist(true))
      .mockResolvedValueOnce(aliasesExist(true))
      .mockResolvedValueOnce([{ live: 14, linked: 0, with_snapshot: 3, with_alias: 0 }]);

    const t = await buildPreProjectTier();
    expect(t?.nameableCount).toBe(3);
    expect(t?.whyNoNames).toContain('3 of these 14 could be named');
    expect(t?.whyNoNames).not.toContain('None of these');
  });

  it('says there is nothing to name when the stage is empty', async () => {
    m.query
      .mockResolvedValueOnce(qualificationsExist(true))
      .mockResolvedValueOnce(aliasesExist(true))
      .mockResolvedValueOnce([{ live: 0, linked: 0, with_snapshot: 0, with_alias: 0 }]);

    const t = await buildPreProjectTier();
    expect(t?.count).toBe(0);
    expect(t?.whyNoNames).toContain('Nothing is at this stage');
    // A measured zero, so the block still renders. It is not null: the table was readable.
    expect(t).not.toBeNull();
  });

  it('never claims more rows are nameable than exist', async () => {
    // A row can be nameable by snapshot AND by alias, so the two counts overlap. Summing them
    // would report 20 of 14, which is not a possible fact about 14 rows.
    m.query
      .mockResolvedValueOnce(qualificationsExist(true))
      .mockResolvedValueOnce(aliasesExist(true))
      .mockResolvedValueOnce([{ live: 14, linked: 0, with_snapshot: 12, with_alias: 8 }]);

    const t = await buildPreProjectTier();
    expect(t?.nameableCount).toBe(14);
    expect(t?.nameableCount).toBeLessThanOrEqual(t?.count ?? 0);
  });

  it('surfaces a linked row at this stage instead of hiding the lifecycle change', async () => {
    m.query
      .mockResolvedValueOnce(qualificationsExist(true))
      .mockResolvedValueOnce(aliasesExist(true))
      .mockResolvedValueOnce([{ live: 14, linked: 2, with_snapshot: 0, with_alias: 0 }]);

    const t = await buildPreProjectTier();
    expect(t?.linkedCount).toBe(2);
  });
});

describe('it still counts when the alias table is not there', () => {
  it('drops the join rather than the count', async () => {
    m.query
      .mockResolvedValueOnce(qualificationsExist(true))
      .mockResolvedValueOnce(aliasesExist(false))
      .mockResolvedValueOnce([{ live: 14, linked: 0, with_snapshot: 0, with_alias: 0 }]);

    const t = await buildPreProjectTier();
    expect(t?.count).toBe(14);

    const sql = String(m.query.mock.calls[2][0]);
    expect(sql).not.toContain('gov_opportunity_aliases');
    expect(sql).toContain('needs_evidence');
  });

  it('joins the alias table when it IS there', async () => {
    // The control for the assertion above: the join is a consequence of the table existing,
    // not something that never happens.
    m.query
      .mockResolvedValueOnce(qualificationsExist(true))
      .mockResolvedValueOnce(aliasesExist(true))
      .mockResolvedValueOnce(LIVE);

    await buildPreProjectTier();
    expect(String(m.query.mock.calls[2][0])).toContain('gov_opportunity_aliases');
  });
});

describe('what this tier structurally cannot do', () => {
  const live = async () => {
    m.query
      .mockResolvedValueOnce(qualificationsExist(true))
      .mockResolvedValueOnce(aliasesExist(true))
      .mockResolvedValueOnce(LIVE);
    return buildPreProjectTier();
  };

  /**
   * The one that matters most. A count of unassessed opportunities beside a dollar figure is
   * how "pipeline behind pipeline" becomes "pipeline", and gov_qualifications holds no value
   * column, so any figure here would be invented.
   */
  it('carries no money figure anywhere on it', async () => {
    const t = await live();
    const keys = Object.keys(t ?? {});
    expect(keys).not.toContain('value');
    expect(keys).not.toContain('headline');
    expect(keys).not.toContain('money');

    // Stronger than a key check: nothing on it is shaped like a Money, and no string on it
    // prints a currency amount.
    for (const v of Object.values(t ?? {})) {
      expect(typeof v === 'object' && v !== null && 'cents' in (v as object)).toBe(false);
      if (typeof v === 'string') expect(v).not.toMatch(/\$[\d,]/);
    }
  });

  it('carries no row list, so no name can leak through one', async () => {
    const t = await live();
    for (const v of Object.values(t ?? {})) expect(Array.isArray(v)).toBe(false);
  });

  it('only reads, so re-running it cannot change what it reports', async () => {
    await live();
    for (const call of m.query.mock.calls) {
      const sql = String(call[0]).toUpperCase();
      expect(sql).toMatch(/^\s*SELECT/);
      expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP)\b/);
    }
  });
});
