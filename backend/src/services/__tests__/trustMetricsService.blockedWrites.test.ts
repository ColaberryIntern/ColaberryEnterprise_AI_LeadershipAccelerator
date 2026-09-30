/**
 * trustMetricsService — blocked-agent-writes detail (T010, Phase B Trust 90+ drill-down).
 * Backs Governance's "Blocked agent writes 24h" tile with the real denied AgentWriteAudit
 * rows. Verifies the PII-scoping rule: before_state/after_state (raw row payloads) must
 * never appear in the response, only governance-decision metadata.
 */

jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../models/ContentGenerationLog', () => ({ __esModule: true, default: { count: jest.fn(), findAll: jest.fn() } }));
jest.mock('../../models/AiAgentActivityLog', () => ({ __esModule: true, default: { findOne: jest.fn(), findAll: jest.fn(), count: jest.fn() } }));
jest.mock('../../models/ChatConversation', () => ({ __esModule: true, default: { count: jest.fn(), findAll: jest.fn() } }));
jest.mock('../../models/AgentWriteAudit', () => ({ __esModule: true, default: { count: jest.fn(), findAll: jest.fn() } }));
jest.mock('../../models/AiEvent', () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock('../../models/AiAgent', () => ({ __esModule: true, default: { findAll: jest.fn(), findOne: jest.fn() } }));
jest.mock('../launchSafety', () => ({ isKillSwitchActive: jest.fn() }));
jest.mock('../systemControlService', () => ({ isSafeModeActive: jest.fn() }));
jest.mock('../agentPermissionService', () => ({ getAgentPermission: jest.fn() }));
jest.mock('../trustRubric', () => ({
  collectLiveSignals: jest.fn(), evaluateAll: jest.fn(), evaluateDimension: jest.fn(), collectOpenActions: jest.fn(),
}));

import AgentWriteAudit from '../../models/AgentWriteAudit';
import { getBlockedWrites } from '../trustMetricsService';

const auditFindAll = AgentWriteAudit.findAll as jest.Mock;

const BANNED_KEY_SUBSTRINGS = ['content', 'body', 'message', 'text', 'prompt', 'transcript', 'state', 'payload'];

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getBlockedWrites', () => {
  it('happy path: returns denied-write rows, most recent first, capped at 50, governance metadata only', async () => {
    auditFindAll.mockResolvedValue([
      {
        created_at: new Date('2026-07-30T10:00:00Z'),
        agent_id: 'agent-1',
        agent_name: 'WorkforceCareerDirector',
        operation: 'update_lead_status',
        target_table: 'leads',
        permission_tier: 'proposal_only',
        blocked_reason: 'kill switch active',
        trace_id: 'trace-1',
        before_state: { secret: 'raw row payload' },
        after_state: { secret: 'raw row payload' },
      },
    ]);

    const result = await getBlockedWrites();

    expect(result.windowHours).toBe(24);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual({
      timestamp: '2026-07-30T10:00:00.000Z',
      agentId: 'agent-1',
      agentName: 'WorkforceCareerDirector',
      operation: 'update_lead_status',
      targetTable: 'leads',
      permissionTier: 'proposal_only',
      denialReason: 'kill switch active',
      traceId: 'trace-1',
    });

    for (const row of result.rows) {
      for (const key of Object.keys(row)) {
        const lower = key.toLowerCase();
        expect(BANNED_KEY_SUBSTRINGS.find((b) => lower.includes(b))).toBeUndefined();
      }
    }

    const [[opts]] = auditFindAll.mock.calls;
    expect(opts.where.was_allowed).toBe(false);
    expect(opts.limit).toBe(50);
    expect(opts.order).toEqual([['created_at', 'DESC']]);
  });

  it('failure path: a query error yields an empty row list, not a throw', async () => {
    auditFindAll.mockRejectedValue(new Error('db down'));
    const result = await getBlockedWrites();
    expect(result.rows).toEqual([]);
  });

  it('boundary: a missing denial reason degrades to null, not undefined/throw', async () => {
    auditFindAll.mockResolvedValue([
      { created_at: new Date(), agent_id: 'a', agent_name: 'n', operation: 'op', target_table: 't', permission_tier: 'p', blocked_reason: null, trace_id: null },
    ]);
    const result = await getBlockedWrites();
    expect(result.rows[0].denialReason).toBeNull();
  });
});
