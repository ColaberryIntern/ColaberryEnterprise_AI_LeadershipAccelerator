/**
 * trustMetricsService — 24h activity detail (T009, Phase B Trust 90+ drill-down).
 * Covers all 4 kinds (conversations/generations/agent-runs/errors) plus the PII-scoping
 * rule: every row must be METADATA ONLY, never raw prompt/response/message body text.
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

import ChatConversation from '../../models/ChatConversation';
import ContentGenerationLog from '../../models/ContentGenerationLog';
import AiAgentActivityLog from '../../models/AiAgentActivityLog';
import { getActivityDetail, getActivityDetailForDay, ActivityDetailRow } from '../trustMetricsService';

const convoFindAll = ChatConversation.findAll as jest.Mock;
const convoCount = ChatConversation.count as jest.Mock;
const genFindAll = ContentGenerationLog.findAll as jest.Mock;
const genCount = ContentGenerationLog.count as jest.Mock;
const logFindAll = AiAgentActivityLog.findAll as jest.Mock;
const logCount = AiAgentActivityLog.count as jest.Mock;

// The exact set of banned raw-content key names the PII-scoping rule forbids anywhere in a
// drill-down response row (case-insensitive substring match against every key name).
const BANNED_KEY_SUBSTRINGS = ['content', 'body', 'message', 'text', 'prompt', 'transcript'];

function assertNoRawContentKeys(rows: ActivityDetailRow[]): void {
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      const lower = key.toLowerCase();
      const hit = BANNED_KEY_SUBSTRINGS.find((banned) => lower.includes(banned));
      expect(hit).toBeUndefined();
    }
  }
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getActivityDetail', () => {
  it('conversations: returns metadata-only rows, most recent first, capped at 50', async () => {
    convoFindAll.mockResolvedValue([
      { started_at: new Date('2026-07-30T10:00:00Z'), status: 'ended', trigger_type: 'visitor_initiated', visitor_id: 'visitor-1' },
    ]);

    const result = await getActivityDetail('conversations');

    expect(result.kind).toBe('conversations');
    expect(result.windowHours).toBe(24);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual(expect.objectContaining({ outcome: 'ended', userId: 'visitor-1' }));
    assertNoRawContentKeys(result.rows);
    const [[opts]] = convoFindAll.mock.calls;
    expect(opts.limit).toBe(50);
    expect(opts.order).toEqual([['started_at', 'DESC']]);
  });

  it('generations: returns metadata-only rows including model + duration', async () => {
    genFindAll.mockResolvedValue([
      { created_at: new Date('2026-07-30T10:00:00Z'), generation_type: 'admin_structure', success: true, model_used: 'claude-sonnet-5', duration_ms: 1200 },
    ]);

    const result = await getActivityDetail('generations');

    expect(result.rows[0]).toEqual(expect.objectContaining({ outcome: 'success', model: 'claude-sonnet-5', durationMs: 1200 }));
    assertNoRawContentKeys(result.rows);
  });

  it('agent-runs: returns metadata-only rows including agentId + traceId', async () => {
    logFindAll.mockResolvedValue([
      { created_at: new Date('2026-07-30T10:00:00Z'), action: 'flag_student_success', result: 'success', agent_id: 'agent-1', trace_id: 'trace-1', duration_ms: 300 },
    ]);

    const result = await getActivityDetail('agent-runs');

    expect(result.rows[0]).toEqual(expect.objectContaining({ agentId: 'agent-1', traceId: 'trace-1', outcome: 'success' }));
    assertNoRawContentKeys(result.rows);
  });

  it('errors: mirrors getActivityMetrics()\'s errors24h query — ContentGenerationLog rows with success=false in the last 24h', async () => {
    genFindAll.mockResolvedValue([
      { created_at: new Date('2026-07-30T10:00:00Z'), generation_type: 'participant_content', success: false, model_used: 'claude-sonnet-5', duration_ms: 400 },
    ]);

    const result = await getActivityDetail('errors');

    expect(result.rows[0].outcome).toBe('failure');
    assertNoRawContentKeys(result.rows);
    const [[where]] = genFindAll.mock.calls;
    expect(where.where.success).toBe(false);
  });

  it('failure path: a query error yields an empty row list, not a throw', async () => {
    convoFindAll.mockRejectedValue(new Error('db down'));
    const result = await getActivityDetail('conversations');
    expect(result.rows).toEqual([]);
  });
});

describe('getActivityDetailForDay', () => {
  it('returns per-category counts + rows for one calendar day, metadata-only', async () => {
    convoCount.mockResolvedValue(2);
    genCount.mockResolvedValue(1);
    logCount.mockResolvedValue(3);
    convoFindAll.mockResolvedValue([{ started_at: new Date('2026-07-30T01:00:00Z'), status: 'ended', trigger_type: 'visitor_initiated', visitor_id: 'v-1' }]);
    genFindAll.mockResolvedValue([{ created_at: new Date('2026-07-30T02:00:00Z'), generation_type: 'admin_structure', success: true, model_used: 'm', duration_ms: 1 }]);
    logFindAll.mockResolvedValue([{ created_at: new Date('2026-07-30T03:00:00Z'), action: 'a', result: 'success', agent_id: 'a-1', trace_id: null, duration_ms: 1 }]);

    const result = await getActivityDetailForDay('2026-07-30');

    expect(result.date).toBe('2026-07-30');
    expect(result.counts).toEqual({ conversations: 2, generations: 1, agentRuns: 3 });
    assertNoRawContentKeys(result.conversations);
    assertNoRawContentKeys(result.generations);
    assertNoRawContentKeys(result.agentRuns);
  });

  it('boundary: a malformed date string degrades to an empty, typed result rather than throwing', async () => {
    const result = await getActivityDetailForDay('not-a-date');
    expect(result.counts).toEqual({ conversations: 0, generations: 0, agentRuns: 0 });
    expect(result.conversations).toEqual([]);
    expect(convoCount).not.toHaveBeenCalled();
  });
});
