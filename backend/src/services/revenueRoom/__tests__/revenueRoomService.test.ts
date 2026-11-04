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

interface DbOpts {
  tables?: Record<string, boolean>;
  columns?: Record<string, boolean>;
  /** Bids approved for pursuit AND holding a live assignment. The card's number. */
  inMotion?: number;
  /** Flagged bids with nobody assigned, so excluded from the count. */
  excluded?: number;
  lastActivity?: string | null;
  withDocuments?: number;
  submitted?: number;
}

function mockDb(opts: DbOpts = {}) {
  const tables = {
    gov_qualifications: true, delivery_project_members: true,
    gov_proposal_documents: true, gov_submission: true, ...(opts.tables ?? {}),
  };
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
    // The in-motion classification CTE. Matched before the document count below, because
    // both mention delivery_project_id and this one is the headline number.
    if (/WITH flagged AS/.test(sql)) {
      return Promise.resolve([{
        in_motion: opts.inMotion ?? 0,
        excluded: opts.excluded ?? 0,
        last_activity: opts.lastActivity ?? null,
      }]);
    }
    if (/COUNT\(DISTINCT q\.delivery_project_id\)/.test(sql)) {
      return Promise.resolve([{ n: opts.withDocuments ?? 0 }]);
    }
    if (/FROM gov_submission/.test(sql)) {
      return Promise.resolve([{ n: opts.submitted ?? 0 }]);
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

describe('the government card counts bids in motion, not flagged rows', () => {
  it('reports the in-motion count as measured, and says what was excluded', async () => {
    // Ali, 2026-11-04: only the projects in motion and assigned right now. Measured that
    // day: 2 of 12 flagged bids hold a live assignment, and they are the two he names.
    mockDb({ inMotion: 2, excluded: 10, withDocuments: 2, submitted: 0, lastActivity: '2026-11-04' });
    const card = find(await getRevenueRoomBoard(), 'gov_bid_pursuit');
    expect(card.status).toBe('live');
    expect(card.value).toBe('2');
    expect(card.caveat).toMatch(/2 bid\(s\) are in motion/);
    expect(card.caveat).toMatch(/assignment has not been revoked/);
    expect(card.caveat).toMatch(/10 further bid\(s\).*NOT\s+counted here/s);
    expect(card.caveat).toMatch(/nothing has ever been submitted/);
    expect(card.caveat).toMatch(/not a value/);
  });

  it('requires a LIVE assignment in the SQL, so the flag alone cannot qualify a bid', async () => {
    mockDb({ inMotion: 2, excluded: 10 });
    await getRevenueRoomBoard();
    const sqls = m.query.mock.calls.map((c) => String(c[0])).join('\n');
    expect(sqls).toMatch(/delivery_project_members m/);
    expect(sqls).toMatch(/m\.revoked_at IS NULL/);
  });

  it('counts projects DISTINCT, so a duplicated RFP is not two bids', async () => {
    mockDb({ inMotion: 2 });
    await getRevenueRoomBoard();
    const sqls = m.query.mock.calls.map((c) => String(c[0])).join('\n');
    expect(sqls).toMatch(/SELECT DISTINCT q\.delivery_project_id/);
  });

  it('reports a measured zero when bids are flagged but none is assigned', async () => {
    // A meaningful state, not an edge case: plenty approved for pursuit and nobody
    // working any of it. Worth saying out loud rather than rendering a bare 0.
    mockDb({ inMotion: 0, excluded: 12 });
    const card = find(await getRevenueRoomBoard(), 'gov_bid_pursuit');
    expect(card.status).toBe('measured_zero');
    expect(card.value).toBe('0');
    expect(card.caveat).toMatch(/No bid is in motion/);
    expect(card.caveat).toMatch(/12 bid\(s\) carry the pursuit flag but none has a live assignment/);
  });

  it('says so differently when nothing is even flagged', async () => {
    mockDb({ inMotion: 0, excluded: 0 });
    const card = find(await getRevenueRoomBoard(), 'gov_bid_pursuit');
    expect(card.caveat).toMatch(/No bid is flagged for pursuit at all/);
  });

  // The distinction the whole five-state vocabulary exists for.
  it.each(['gov_qualifications', 'delivery_project_members'])(
    'DEGRADES to unmeasurable when %s is absent, rather than falling back to the flag count',
    async (missing) => {
      mockDb({ tables: { [missing]: false } });
      const card = find(await getRevenueRoomBoard(), 'gov_bid_pursuit');
      expect(card.status).toBe('unmeasurable');
      expect(card.value).toBeNull();
      expect(card.caveat).toMatch(/A missing source is not an empty one/);
    },
  );

  it('leaves the deadline null, because no column records one', async () => {
    mockDb({ inMotion: 2 });
    const card = find(await getRevenueRoomBoard(), 'gov_bid_pursuit');
    expect(card.nextDeadline).toBeNull();
    expect(card.nextDeadlineMeans).toBeNull();
  });

  it('survives a schema with no updated_at instead of crashing on it', async () => {
    mockDb({ inMotion: 2, columns: { updated_at: false } });
    const card = find(await getRevenueRoomBoard(), 'gov_bid_pursuit');
    expect(card.status).toBe('live');
    expect(card.lastActivity).toBeNull();
  });

  it('says plainly when an in-motion bid has no document yet', async () => {
    mockDb({ inMotion: 2, withDocuments: 0 });
    const card = find(await getRevenueRoomBoard(), 'gov_bid_pursuit');
    expect(card.caveat).toMatch(/None of them holds a proposal document yet/);
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
    mockDb({ inMotion: 2, withDocuments: 2 });
    await getRevenueRoomBoard();
    const sqls = m.query.mock.calls.map((c) => String(c[0])).join('\n');
    expect(sqls).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER)\b/i);
  });

  it('returns the same board twice for the same inputs', async () => {
    mockDb({ inMotion: 2, excluded: 10, withDocuments: 2 });
    const at = new Date('2026-11-03T12:00:00Z');
    const a = await getRevenueRoomBoard(at);
    const b = await getRevenueRoomBoard(at);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
