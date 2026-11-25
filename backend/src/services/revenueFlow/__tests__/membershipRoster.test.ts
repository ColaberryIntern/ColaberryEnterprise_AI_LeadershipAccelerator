const m = { query: jest.fn() };

jest.mock('../../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => m.query(...a) },
}));

import { getMembershipStageRoster } from '../membershipRoster';

/**
 * R26 — the people behind one membership funnel count.
 *
 * Taiwo Oludimimu, 25 Nov 2026: "can you make the data points clickable so they show a list
 * of students or leads that fall within each category? I would like to look further into
 * this data."
 *
 * These cover the ways a roster quietly stops matching the number above it, which is the
 * failure that would cost the page its credibility:
 *
 *   - a row dropped because it does not resolve to a person
 *   - an INNER JOIN silently shortening the list
 *   - a stage filtered by different rules than the count
 *   - a missing table reported as "nobody is here"
 *   - an unknown stage answered with an empty list instead of a 404
 */
const NOW = new Date('2026-11-25T12:00:00.000Z');
const tableThere = (yes: boolean) => [{ n: yes ? 1 : 0 }];

const row = (over: Record<string, unknown> = {}) => ({
  id: 'sub-1',
  plan: 'monthly',
  status: 'active',
  amount_cents: 19900,
  has_payment: true,
  current_period_end: '2026-12-25T00:00:00.000Z',
  started_at: '2026-10-01T00:00:00.000Z',
  canceled_at: null,
  full_name: 'Dana Okafor',
  email: 'dana@example.com',
  ...over,
});

beforeEach(() => {
  m.query.mockReset();
});

const roster = async (stage: string, rows: unknown[]) => {
  m.query
    .mockResolvedValueOnce(tableThere(true))
    .mockResolvedValueOnce(rows);
  return getMembershipStageRoster(stage, NOW);
};

describe('an unknown stage is a 404, not an empty list', () => {
  it('returns null for a stage this funnel does not have', async () => {
    // An empty list would say the stage exists and nobody is in it, which is a different
    // and wrong answer.
    await expect(getMembershipStageRoster('not_a_stage', NOW)).resolves.toBeNull();
    expect(m.query).not.toHaveBeenCalled();
  });

  it('accepts every stage the funnel really has', async () => {
    for (const stage of ['signed_up', 'never_paid', 'failed', 'comped', 'paying', 'lapsed',
      'renewal_due', 'churned']) {
      m.query.mockReset();
      const r = await roster(stage, []);
      expect(r).not.toBeNull();
      expect(r?.stageKey).toBe(stage);
    }
  });
});

describe('the list matches the count, and is filtered by the shared classifier', () => {
  it('reports a count equal to the number of people it lists', async () => {
    const r = await roster('paying', [row(), row({ id: 'sub-2', full_name: 'Amir Haddad' })]);
    expect(r?.count).toBe(2);
    expect(r?.people).toHaveLength(2);
    expect(r?.count).toBe(r?.people.length);
  });

  it('puts an ended term in lapsed and keeps it out of paying', async () => {
    const ended = row({ id: 'sub-3', current_period_end: '2026-01-01T00:00:00.000Z' });

    const lapsed = await roster('lapsed', [row(), ended]);
    expect(lapsed?.people.map((p) => p.rowId)).toEqual(['sub-3']);

    m.query.mockReset();
    const paying = await roster('paying', [row(), ended]);
    expect(paying?.people.map((p) => p.rowId)).toEqual(['sub-1']);
  });

  it('lists a failed row under BOTH failed and never paid', async () => {
    const failed = row({ id: 'sub-9', status: 'failed', has_payment: false });

    expect((await roster('failed', [failed]))?.count).toBe(1);
    m.query.mockReset();
    expect((await roster('never_paid', [failed]))?.count).toBe(1);
  });
});

describe('nobody is dropped for failing to resolve', () => {
  it('lists a row with no name and says why, instead of omitting it', async () => {
    const r = await roster('paying', [row({ full_name: null, email: null })]);

    // The count must still be 1. A list quietly shorter than its own count is the failure
    // this whole module is built to prevent.
    expect(r?.count).toBe(1);
    expect(r?.people[0].name).toBeNull();
    expect(r?.people[0].unresolvedReason).toContain('does not resolve to an enrollment');
  });

  it('says nothing about resolution when the row resolves', async () => {
    const r = await roster('paying', [row()]);
    expect(r?.people[0].unresolvedReason).toBeNull();
    expect(r?.people[0].name).toBe('Dana Okafor');
  });

  it('reads the people with a LEFT JOIN, so the join cannot shorten the list', async () => {
    await roster('paying', [row()]);
    const sql = String(m.query.mock.calls[1][0]);
    expect(sql).toContain('LEFT JOIN enrollments');
    expect(sql).not.toMatch(/\bINNER JOIN\b/);
  });

  it('sorts unresolved rows last, where they read as the exception', async () => {
    const r = await roster('paying', [
      row({ id: 'a', full_name: null }),
      row({ id: 'b', full_name: 'Zara Idris' }),
      row({ id: 'c', full_name: 'Adeola Bello' }),
    ]);
    expect(r?.people.map((p) => p.rowId)).toEqual(['c', 'b', 'a']);
  });
});

describe('empty and missing are different answers', () => {
  it('calls an empty stage a measured zero', async () => {
    const r = await roster('churned', []);
    expect(r?.count).toBe(0);
    expect(r?.emptyNote).toContain('measured zero');
  });

  it('says the SOURCE is missing when the table is not there', async () => {
    m.query.mockResolvedValueOnce(tableThere(false));
    const r = await getMembershipStageRoster('paying', NOW);

    expect(r?.count).toBe(0);
    expect(r?.emptyNote).toContain('not present in this database');
    expect(r?.emptyNote).toContain('missing source, not an empty stage');
    // And it does not go on to query for people.
    expect(m.query).toHaveBeenCalledTimes(1);
  });
});

describe('refunds are a different population, read their own way', () => {
  const refund = (over: Record<string, unknown> = {}) => ({
    id: 'ref-1',
    amount_cents: 19900,
    status: 'succeeded',
    created_at: '2026-11-02T00:00:00.000Z',
    reason: 'Withdrew in week one',
    full_name: 'Priya Raman',
    enrollment_email: 'priya@example.com',
    customer_email: 'billing@example.com',
    ...over,
  });

  it('reads the refunds table, not subscriptions', async () => {
    const r = await roster('refunded', [refund()]);
    const sql = String(m.query.mock.calls[1][0]);
    expect(sql).toContain('FROM refunds');
    expect(sql).not.toContain('FROM subscriptions');
    expect(r?.count).toBe(1);
  });

  it('excludes failed refund attempts, which never returned any money', async () => {
    await roster('refunded', [refund()]);
    expect(String(m.query.mock.calls[1][0])).toContain("<> 'failed'");
  });

  it('falls back to the email the refund itself carries', async () => {
    // Not a guess: it is the address the refund was issued against.
    const r = await roster('refunded', [refund({ full_name: null, enrollment_email: null })]);
    expect(r?.people[0].email).toBe('billing@example.com');
    expect(r?.people[0].unresolvedReason).toContain('does not resolve to an enrollment');
  });

  it('prefers the enrollment email when there is one', async () => {
    const r = await roster('refunded', [refund()]);
    expect(r?.people[0].email).toBe('priya@example.com');
  });

  it('says a missing refunds table is a missing source', async () => {
    m.query.mockResolvedValueOnce(tableThere(false));
    const r = await getMembershipStageRoster('refunded', NOW);
    expect(r?.emptyNote).toContain('missing source, not an absence of refunds');
  });
});

describe('what this service structurally does not do', () => {
  it('only reads, so opening a roster cannot change anything', async () => {
    await roster('paying', [row()]);
    for (const call of m.query.mock.calls) {
      const sql = String(call[0]).toUpperCase();
      expect(sql).toMatch(/^\s*SELECT/);
      expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP)\b/);
    }
  });

  it('never invents a name for a row that has none', async () => {
    const r = await roster('paying', [row({ full_name: null, email: null })]);
    const p = r?.people[0];
    expect(p?.name).toBeNull();
    expect(p?.email).toBeNull();
    // Not "Unknown", not the row id dressed up as a person.
    expect(JSON.stringify(p)).not.toContain('Unknown');
    expect(p?.name).not.toBe(p?.rowId);
  });
});
