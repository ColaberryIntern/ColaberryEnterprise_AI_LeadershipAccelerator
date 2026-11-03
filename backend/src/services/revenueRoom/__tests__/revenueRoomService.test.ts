const m = { query: jest.fn() };
const h = { getHypothesisHealth: jest.fn() };
const r = { annualizedRevenue: jest.fn() };

jest.mock('../../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => m.query(...a) },
}));
jest.mock('../../commercialization/hypothesisHealthService', () => ({
  getHypothesisHealth: (...a: unknown[]) => h.getHypothesisHealth(...a),
}));
jest.mock('../../commercialization/commercializationBoardService', () => ({
  annualizedRevenue: (...a: unknown[]) => r.annualizedRevenue(...a),
}));

import { getRevenueRoomBoard } from '../revenueRoomService';
import type { InitiativeCard, RevenueRoomBoard } from '../revenueRoomService';

/**
 * R1 acceptance: the Room shows real data where it exists and the five-state vocabulary
 * where it does not, and a card never shows a number nobody measured.
 *
 * WHAT THESE TESTS PROVE AND WHAT THEY DO NOT. `sequelize.query` is mocked, so these
 * prove the DECISION LOGIC — which status a card lands on, what its caveat says, what
 * happens when a table is gone. They do NOT prove the SQL is valid, because a mocked
 * query never reaches Postgres and never type-deduces a parameter. The SQL was checked
 * separately by running the same statements read-only against production on 2026-11-03.
 * Saying so here is cheaper than someone later believing a green suite covered it.
 */
const GOV_FILTER = /FROM gov_qualifications\s+WHERE decision/;

interface DbOpts {
  tables?: Record<string, boolean>;
  columns?: Record<string, boolean>;
  flagged?: number;
  withoutProject?: number;
  lastActivity?: string | null;
  withDocuments?: number;
  submitted?: number;
}

function mockDb(opts: DbOpts = {}) {
  const tables = { gov_qualifications: true, gov_proposal_documents: true, gov_submission: true, ...(opts.tables ?? {}) };
  const columns = { updated_at: true, ...(opts.columns ?? {}) };

  m.query.mockImplementation((sql: string, o?: { replacements?: Record<string, string> }) => {
    if (/FROM information_schema\.tables/.test(sql)) {
      const name = o?.replacements?.name ?? '';
      return Promise.resolve([{ n: tables[name as keyof typeof tables] ? 1 : 0 }]);
    }
    if (/FROM information_schema\.columns/.test(sql)) {
      const col = o?.replacements?.column ?? '';
      return Promise.resolve([{ n: columns[col as keyof typeof columns] ? 1 : 0 }]);
    }
    if (/COUNT\(DISTINCT q\.delivery_project_id\)/.test(sql)) {
      return Promise.resolve([{ n: opts.withDocuments ?? 0 }]);
    }
    if (/FROM gov_submission/.test(sql)) {
      return Promise.resolve([{ n: opts.submitted ?? 0 }]);
    }
    if (GOV_FILTER.test(sql)) {
      return Promise.resolve([{
        flagged: opts.flagged ?? 0,
        without_project: opts.withoutProject ?? 0,
        last_activity: opts.lastActivity ?? null,
      }]);
    }
    return Promise.resolve([]);
  });
}

const healthy = (over: Record<string, unknown> = {}) => ({
  asOf: '2026-11-03T00:00:00.000Z',
  caveats: [],
  summary: {},
  hypotheses: [
    'paid_accelerator', 'annual_enterprise', 'workforce_funded',
    'higher_education', 'partner_delivered',
  ].map((key) => ({
    key,
    label: key,
    evidence: 0,
    inFlight: 0,
    verdict: 'no_evidence',
    target: { stage: 'contract', count: 3, by: '2026-12-31' },
    evidenceRequired: '3 paid pilots by 31 Dec',
    note: 'The pipe is empty.',
    tripwires: [{ on: '2026-11-30', survivesIf: 'a pilot has been proposed', due: false }],
    ...over,
  })),
});

/**
 * Typed against the real board rather than a narrow inline shape. An inline
 * `{ cards: Array<{ key: string }> }` compiled fine under ts-jest, which transpiles
 * without checking, and then produced 35 TS2339 errors under the test-file typecheck:
 * every property assertion below was being made against a card the compiler believed
 * had only a `key`. Naming the real type is what makes these assertions checked.
 */
const find = (board: RevenueRoomBoard, key: string): InitiativeCard =>
  board.cards.find((c) => c.key === key)!;

beforeEach(() => {
  jest.clearAllMocks();
  mockDb();
  h.getHypothesisHealth.mockResolvedValue(healthy());
  r.annualizedRevenue.mockResolvedValue({ value: '$120,000' });
});

describe('the happy path', () => {
  it('returns one card per registered initiative', async () => {
    const board = await getRevenueRoomBoard(new Date('2026-11-03T00:00:00Z'));
    expect(board.cards).toHaveLength(7);
    expect(board.asOf).toBe('2026-11-03T00:00:00.000Z');
  });

  it('shows membership revenue from the board service, not its own SQL', async () => {
    const board = await getRevenueRoomBoard();
    const card = find(board, 'membership_subscriptions');
    expect(card.status).toBe('live');
    expect(card.value).toBe('$120,000');
    expect(r.annualizedRevenue).toHaveBeenCalledTimes(1);
  });

  it('summarizes how many cards sit in each state', async () => {
    const board = await getRevenueRoomBoard();
    const total = Object.values(board.summary).reduce((a, b) => a + b, 0);
    expect(total).toBe(board.cards.length);
  });

  it('gives every card a drill-down key, so the shell can be clickable', async () => {
    const board = await getRevenueRoomBoard();
    for (const c of board.cards) expect(c.drillDownKey).toBeTruthy();
  });
});

describe('the government pipeline card tells the reader what the count contains', () => {
  it('reports the flag count as a proxy and discloses the breakdown', async () => {
    mockDb({ flagged: 12, withoutProject: 3, withDocuments: 3, submitted: 0, lastActivity: '2026-11-02' });
    const card = find(await getRevenueRoomBoard(), 'gov_bid_pursuit');
    expect(card.status).toBe('proxy');
    expect(card.value).toBe('12');
    expect(card.caveat).toMatch(/3 of the distinct projects behind them hold a proposal document/);
    expect(card.caveat).toMatch(/3 have no delivery project at all/);
    expect(card.caveat).toMatch(/nothing has ever been submitted/);
    expect(card.caveat).toMatch(/not a pipeline/);
  });

  it('counts documented projects DISTINCT, so a duplicated RFP is not two opportunities', async () => {
    mockDb({ flagged: 12, withDocuments: 3 });
    await getRevenueRoomBoard();
    const sqls = m.query.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((s) => /COUNT\(DISTINCT q\.delivery_project_id\)/.test(s))).toBe(true);
  });

  it('reports a measured zero when the table is present and nothing is flagged', async () => {
    mockDb({ flagged: 0 });
    const card = find(await getRevenueRoomBoard(), 'gov_bid_pursuit');
    expect(card.status).toBe('measured_zero');
    expect(card.value).toBe('0');
    expect(card.caveat).toMatch(/measured rather than assumed/);
  });

  // The distinction the whole five-state vocabulary exists for.
  it('DEGRADES to unmeasurable when the table is absent, rather than reporting zero', async () => {
    mockDb({ tables: { gov_qualifications: false } });
    const card = find(await getRevenueRoomBoard(), 'gov_bid_pursuit');
    expect(card.status).toBe('unmeasurable');
    expect(card.value).toBeNull();
    expect(card.caveat).toMatch(/A missing source is not an empty one/);
  });

  it('leaves the deadline null, because no column records one', async () => {
    mockDb({ flagged: 12 });
    const card = find(await getRevenueRoomBoard(), 'gov_bid_pursuit');
    expect(card.nextDeadline).toBeNull();
    expect(card.nextDeadlineMeans).toBeNull();
  });

  it('survives a schema with no updated_at instead of crashing on it', async () => {
    mockDb({ flagged: 4, columns: { updated_at: false } });
    const card = find(await getRevenueRoomBoard(), 'gov_bid_pursuit');
    expect(card.status).toBe('proxy');
    expect(card.lastActivity).toBeNull();
  });

  it('says so plainly when none of the flagged projects has a document', async () => {
    mockDb({ flagged: 5, withDocuments: 0 });
    const card = find(await getRevenueRoomBoard(), 'gov_bid_pursuit');
    expect(card.caveat).toMatch(/None of them holds a proposal document/);
  });
});

describe('hypothesis cards keep measurability and health separate', () => {
  it('maps an uncountable funnel to unmeasurable with no number', async () => {
    h.getHypothesisHealth.mockResolvedValue(healthy({ verdict: 'uncountable', evidence: null }));
    const card = find(await getRevenueRoomBoard(), 'hypothesis_paid_accelerator');
    expect(card.status).toBe('unmeasurable');
    expect(card.value).toBeNull();
    expect(card.verdict).toBe('uncountable');
  });

  it('maps an empty pipe to a measured zero, which is a finding rather than a gap', async () => {
    const card = find(await getRevenueRoomBoard(), 'hypothesis_paid_accelerator');
    expect(card.status).toBe('measured_zero');
    expect(card.value).toBe('0 of 3');
    expect(card.verdict).toBe('no_evidence');
  });

  it('keeps the verdict when evidence exists, so health is not lost in the status', async () => {
    h.getHypothesisHealth.mockResolvedValue(healthy({ verdict: 'confirmed', evidence: 3 }));
    const card = find(await getRevenueRoomBoard(), 'hypothesis_paid_accelerator');
    expect(card.status).toBe('live');
    expect(card.value).toBe('3 of 3');
    expect(card.verdict).toBe('confirmed');
  });

  it('shows the next undue tripwire as the deadline, not the final target', async () => {
    const card = find(await getRevenueRoomBoard(), 'hypothesis_paid_accelerator');
    expect(card.nextDeadline).toBe('2026-11-30');
    expect(card.nextDeadlineMeans).toMatch(/Survives if a pilot has been proposed/);
  });

  it('falls back to the target date once every tripwire is due', async () => {
    h.getHypothesisHealth.mockResolvedValue(healthy({
      tripwires: [{ on: '2026-11-30', survivesIf: 'x', due: true }],
    }));
    const card = find(await getRevenueRoomBoard(), 'hypothesis_paid_accelerator');
    expect(card.nextDeadline).toBe('2026-12-31');
    expect(card.nextDeadlineMeans).toMatch(/Target date/);
  });
});

describe('the failure path costs a section, never the page', () => {
  it('reports five unmeasurable bets when hypothesis health throws', async () => {
    h.getHypothesisHealth.mockRejectedValue(new Error('funnel unavailable'));
    const board = await getRevenueRoomBoard();
    expect(board.cards).toHaveLength(7);
    const bets = board.cards.filter((c) => c.kind === 'hypothesis');
    expect(bets).toHaveLength(5);
    for (const b of bets) {
      expect(b.status).toBe('unmeasurable');
      expect(b.value).toBeNull();
    }
    expect(board.caveats.join(' ')).toMatch(/rather than as zero: funnel unavailable/);
  });

  it('still renders the page when the revenue figure cannot be read', async () => {
    r.annualizedRevenue.mockRejectedValue(new Error('subscriptions unreadable'));
    const board = await getRevenueRoomBoard();
    const card = find(board, 'membership_subscriptions');
    expect(card.status).toBe('unmeasurable');
    expect(card.value).toBeNull();
    expect(board.caveats.join(' ')).toMatch(/subscriptions unreadable/);
  });

  it('still renders the page when the government pipeline query throws', async () => {
    m.query.mockRejectedValue(new Error('connection dropped'));
    const board = await getRevenueRoomBoard();
    expect(find(board, 'gov_bid_pursuit').status).toBe('unmeasurable');
    expect(board.caveats.join(' ')).toMatch(/connection dropped/);
  });

  it('surfaces the funnel caveats rather than swallowing them', async () => {
    h.getHypothesisHealth.mockResolvedValue({
      ...healthy(), caveats: ['interaction_outcomes is missing'],
    });
    const board = await getRevenueRoomBoard();
    expect(board.caveats).toContain('interaction_outcomes is missing');
  });
});

describe('it is a reporting surface, so reading it changes nothing', () => {
  it('issues no INSERT, UPDATE or DELETE', async () => {
    mockDb({ flagged: 12, withDocuments: 3 });
    await getRevenueRoomBoard();
    const sqls = m.query.mock.calls.map((c) => String(c[0])).join('\n');
    expect(sqls).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER)\b/i);
  });

  it('returns the same board twice for the same inputs', async () => {
    mockDb({ flagged: 12, withoutProject: 3, withDocuments: 3 });
    const at = new Date('2026-11-03T12:00:00Z');
    const a = await getRevenueRoomBoard(at);
    const b = await getRevenueRoomBoard(at);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
