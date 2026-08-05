import { sequelize } from '../../../config/database';
import { getWorkLedgerHealth, getGovernanceShadowSummary } from '../../../services/workLedger/workLedgerHealthService';

jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));

const mockQuery = sequelize.query as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getWorkLedgerHealth — happy path', () => {
  it('computes completeness % and orphan count from a mixed matched/unmatched breakdown', async () => {
    mockQuery.mockResolvedValue([
      { action: 'agent_output', total: '10', matched: '8' },
      { action: 'created', total: '5', matched: '5' },
      { action: 'status_changed', total: '5', matched: '2' },
    ]);

    const result = await getWorkLedgerHealth(24);

    expect(result.total_actions).toBe(20);
    expect(result.matched_actions).toBe(15);
    expect(result.orphan_count).toBe(5);
    expect(result.completeness_pct).toBe(75);
    expect(result.breakdown).toEqual([
      { action: 'agent_output', total: 10, matched: 8, orphan: 2 },
      { action: 'created', total: 5, matched: 5, orphan: 0 },
      { action: 'status_changed', total: 5, matched: 2, orphan: 3 },
    ]);
  });
});

describe('getWorkLedgerHealth — boundary: no activity in window', () => {
  it('returns 0% completeness (not NaN/divide-by-zero) and zero orphans', async () => {
    mockQuery.mockResolvedValue([]);

    const result = await getWorkLedgerHealth(24);

    expect(result.total_actions).toBe(0);
    expect(result.matched_actions).toBe(0);
    expect(result.orphan_count).toBe(0);
    expect(result.completeness_pct).toBe(0);
    expect(Number.isNaN(result.completeness_pct)).toBe(false);
  });
});

describe('getWorkLedgerHealth — boundary: 100% matched', () => {
  it('reports zero orphans and 100% completeness', async () => {
    mockQuery.mockResolvedValue([{ action: 'created', total: '3', matched: '3' }]);

    const result = await getWorkLedgerHealth(24);

    expect(result.orphan_count).toBe(0);
    expect(result.completeness_pct).toBe(100);
  });
});

describe('getWorkLedgerHealth — invalid window falls back to 24h default', () => {
  it('uses 24 when given a non-positive window', async () => {
    mockQuery.mockResolvedValue([]);

    const result = await getWorkLedgerHealth(-5);

    expect(result.window_hours).toBe(24);
  });
});

// ProofDesk Governance — Milestone 4 (shadow mode). Read-only would-allow/
// would-require-approval/would-block breakdown — see the service function's own
// header for what this proves (nothing here gates any real action).
describe('getGovernanceShadowSummary — happy path (mixed R0/R3 rows)', () => {
  it('computes correct verdict totals and a per-action/risk-tier breakdown', async () => {
    mockQuery.mockResolvedValue([
      { action: 'ticket_dispatch', risk_tier: 'R0', verdict: 'would_allow', count: '42' },
      { action: 'ticket_dispatch', risk_tier: 'R1', verdict: 'would_allow', count: '8' },
      { action: 'ticket_dispatch', risk_tier: 'R3', verdict: 'would_require_approval', count: '3' },
      { action: 'ticket_dispatch', risk_tier: 'R4', verdict: 'would_block', count: '1' },
    ]);

    const result = await getGovernanceShadowSummary(24);

    expect(result.would_allow).toBe(50);
    expect(result.would_require_approval).toBe(3);
    expect(result.would_block).toBe(1);
    expect(result.total_decisions).toBe(54);
    expect(result.breakdown).toEqual([
      { action: 'ticket_dispatch', risk_tier: 'R0', verdict: 'would_allow', count: 42 },
      { action: 'ticket_dispatch', risk_tier: 'R1', verdict: 'would_allow', count: 8 },
      { action: 'ticket_dispatch', risk_tier: 'R3', verdict: 'would_require_approval', count: 3 },
      { action: 'ticket_dispatch', risk_tier: 'R4', verdict: 'would_block', count: 1 },
    ]);
  });
});

describe('getGovernanceShadowSummary — boundary: zero rows in window', () => {
  it('returns an all-zero response, no crash', async () => {
    mockQuery.mockResolvedValue([]);

    const result = await getGovernanceShadowSummary(24);

    expect(result).toEqual({
      window_hours: 24,
      total_decisions: 0,
      would_allow: 0,
      would_require_approval: 0,
      would_block: 0,
      breakdown: [],
    });
  });
});

describe('getGovernanceShadowSummary — invalid window falls back to 24h default', () => {
  it('uses 24 when given a non-positive window', async () => {
    mockQuery.mockResolvedValue([]);

    const result = await getGovernanceShadowSummary(0);

    expect(result.window_hours).toBe(24);
  });
});
