const m = { query: jest.fn() };

jest.mock('../../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => m.query(...a) },
}));

import { getFunnelSnapshot } from '../funnelStageService';

/**
 * C8.4's implementation half. The behavior that matters is what the funnel does when
 * the evidence is NOT there, because that is the state production is actually in:
 * C8.3 is merged but not deployed, so nothing can be attributed to an account yet.
 *
 * A funnel that answered "0 contacted" in that state would be stating a falsehood with
 * a number, which is the failure mode of the whole C8 series.
 */
interface Opts { replacements?: Record<string, unknown> }

function mockDb(opts: {
  columns?: string[];          // "table.column" present in this database
  tables?: string[];
  targets?: string[];          // strategic account ids
  mapped?: string[];           // org ids with a linked lead
  outcomes?: Array<{ organization_id: string; outcome: string }>;
  opportunities?: string[];
}) {
  const columns = new Set(opts.columns ?? []);
  const tables = new Set(opts.tables ?? []);
  m.query.mockImplementation((sql: string, o: Opts) => {
    if (sql.includes('information_schema.columns')) {
      const key = `${o?.replacements?.table}.${o?.replacements?.column}`;
      return Promise.resolve([{ n: columns.has(key) ? 1 : 0 }]);
    }
    if (sql.includes('information_schema.tables')) {
      return Promise.resolve([{ n: tables.has(String(o?.replacements?.table)) ? 1 : 0 }]);
    }
    if (sql.includes("organization_type = 'strategic_account'")) {
      return Promise.resolve((opts.targets ?? []).map((id) => ({ id })));
    }
    if (sql.includes('DISTINCT organization_id FROM leads')) {
      return Promise.resolve((opts.mapped ?? []).map((id) => ({ organization_id: id })));
    }
    if (sql.includes('FROM interaction_outcomes')) {
      return Promise.resolve(opts.outcomes ?? []);
    }
    if (sql.includes('FROM revenue_opportunities')) {
      return Promise.resolve((opts.opportunities ?? []).map((id) => ({ entity_id: id })));
    }
    return Promise.resolve([]);
  });
}

const ALL_TABLES = ['revenue_opportunities', 'delivery_contracts'];
const DEPLOYED = ['leads.organization_id'];

const stage = (snap: Awaited<ReturnType<typeof getFunnelSnapshot>>, key: string) =>
  snap.stages.find((s) => s.key === key)!;

beforeEach(() => m.query.mockReset());

describe('production today: C8.3 merged, not deployed', () => {
  it('reports attribution as UNAVAILABLE rather than counting zero contacted', async () => {
    mockDb({ columns: [], tables: ALL_TABLES, targets: [] });
    const snap = await getFunnelSnapshot();

    expect(snap.attributionAvailable).toBe(false);
    expect(stage(snap, 'contacted').accountsReached).toBeNull();
    expect(stage(snap, 'contacted').note).toMatch(/not available/);
    expect(snap.caveats.join(' ')).toMatch(/merged is not deployed/i);
  });

  it('still reports Target, which needs no attribution', async () => {
    mockDb({ columns: [], tables: ALL_TABLES, targets: ['a', 'b'] });
    const snap = await getFunnelSnapshot();
    expect(snap.totalAccounts).toBe(2);
    expect(stage(snap, 'target').accountsReached).toBe(2);
  });

  it('never returns a number for a stage with no source at all', async () => {
    mockDb({ columns: DEPLOYED, tables: ALL_TABLES, targets: ['a'] });
    const snap = await getFunnelSnapshot();
    for (const key of ['demo_delivered', 'pilot_running']) {
      expect(stage(snap, key).accountsAtStage).toBeNull();
      expect(stage(snap, key).note).toMatch(/not counted rather than counted as zero/);
    }
  });
});

describe('once deployed, an account sits at its FURTHEST evidenced stage', () => {
  it('advances an account through the stages its evidence supports', async () => {
    mockDb({
      columns: DEPLOYED, tables: ALL_TABLES,
      targets: ['a', 'b', 'c'],
      mapped: ['a', 'b'],
      outcomes: [
        { organization_id: 'a', outcome: 'sent' },
        { organization_id: 'a', outcome: 'replied' },
        { organization_id: 'b', outcome: 'sent' },
      ],
    });
    const snap = await getFunnelSnapshot();

    // a reached Engaged (4), b reached Contacted (3), c is only a Target (1).
    expect(stage(snap, 'engaged').accountsAtStage).toBe(1);
    expect(stage(snap, 'contacted').accountsAtStage).toBe(1);
    expect(stage(snap, 'target').accountsAtStage).toBe(1);
    // "Reached" is cumulative: all three reached Target, two reached Contacted.
    expect(stage(snap, 'target').accountsReached).toBe(3);
    expect(stage(snap, 'contacted').accountsReached).toBe(2);
    expect(stage(snap, 'engaged').accountsReached).toBe(1);
  });

  it('does NOT advance an account on an open or a click', async () => {
    // The service must agree with the definition. If the query ever widened to include
    // opens, this is where it would show up.
    mockDb({
      columns: DEPLOYED, tables: ALL_TABLES, targets: ['a'],
      mapped: ['a'],
      outcomes: [
        { organization_id: 'a', outcome: 'sent' },
        { organization_id: 'a', outcome: 'opened' },
        { organization_id: 'a', outcome: 'clicked' },
      ],
    });
    const snap = await getFunnelSnapshot();
    expect(stage(snap, 'contacted').accountsAtStage).toBe(1);
    expect(stage(snap, 'engaged').accountsAtStage).toBe(0);

    const sql = m.query.mock.calls.map(([s]) => String(s)).join('\n');
    const outcomeQuery = sql.split('\n').filter((l) => l.includes("outcome IN")).join(' ');
    expect(outcomeQuery).not.toContain('opened');
    expect(outcomeQuery).not.toContain('clicked');
  });

  it('places an account at Contract-adjacent evidence even with no recorded contact', async () => {
    // The instrumentation-leak case, kept deliberately: an account with a priced
    // opportunity and no send is at stage 7, and the missing Contacted row is a gap in
    // the recording rather than in the funnel.
    mockDb({
      columns: DEPLOYED, tables: ALL_TABLES, targets: ['a'],
      opportunities: ['a'],
    });
    const snap = await getFunnelSnapshot();
    expect(stage(snap, 'pilot_proposed').accountsAtStage).toBe(1);
    expect(stage(snap, 'contacted').accountsAtStage).toBe(0);
    expect(stage(snap, 'contacted').accountsReached).toBe(1); // cumulative, so it counts
  });

  it('counts a booked meeting above a reply', async () => {
    mockDb({
      columns: DEPLOYED, tables: ALL_TABLES, targets: ['a'],
      mapped: ['a'],
      outcomes: [
        { organization_id: 'a', outcome: 'replied' },
        { organization_id: 'a', outcome: 'booked_meeting' },
      ],
    });
    const snap = await getFunnelSnapshot();
    expect(stage(snap, 'meeting_booked').accountsAtStage).toBe(1);
    expect(stage(snap, 'engaged').accountsAtStage).toBe(0);
  });
});

describe('an empty funnel is not an error', () => {
  it('returns ten stages and a zero denominator with no targets', async () => {
    mockDb({ columns: DEPLOYED, tables: ALL_TABLES, targets: [] });
    const snap = await getFunnelSnapshot();
    expect(snap.stages).toHaveLength(10);
    expect(snap.totalAccounts).toBe(0);
    expect(stage(snap, 'target').accountsReached).toBe(0);
  });

  it('names a missing deal table in the caveats instead of reporting zero', async () => {
    mockDb({ columns: DEPLOYED, tables: [], targets: ['a'] });
    const snap = await getFunnelSnapshot();
    expect(snap.caveats.join(' ')).toMatch(/revenue_opportunities is absent/);
    expect(snap.caveats.join(' ')).toMatch(/delivery_contracts is absent/);
    expect(stage(snap, 'pilot_proposed').accountsReached).toBeNull();
  });
});
