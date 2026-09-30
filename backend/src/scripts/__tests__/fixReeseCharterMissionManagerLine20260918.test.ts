jest.mock('../../config/database', () => ({
  sequelize: { transaction: jest.fn((cb: any) => cb({})), authenticate: jest.fn() },
}));

const mockAiAgentFindOne = jest.fn();
jest.mock('../../models/AiAgent', () => ({
  __esModule: true,
  default: { findOne: (...a: any[]) => mockAiAgentFindOne(...a) },
}));

const mockCharterFindOne = jest.fn();
jest.mock('../../models/AgentRoleCharter', () => ({
  __esModule: true,
  default: { findOne: (...a: any[]) => mockCharterFindOne(...a) },
}));

const mockRecordCharterVersion = jest.fn();
jest.mock('../../services/agentRoleCharterService', () => ({
  recordCharterVersion: (...a: any[]) => mockRecordCharterVersion(...a),
}));

import { plan, apply, ReeseCharterRowMissingError } from '../fixReeseCharterMissionManagerLine20260918';

const REESE_ID = 'reese-agent-1';
const OLD_MISSION =
  "Reese is Colaberry's AI mentor. Reese reports through workforce_intelligence_engine to Kes, and every reply is logged.";
const FIXED_MISSION = "Reese is Colaberry's AI mentor. Reese reports directly to Ali, and every reply is logged.";

function reeseRow(overrides: Record<string, any> = {}) {
  return {
    agent_id: REESE_ID,
    role_title: 'AI Mentor — Student Success & Retention',
    mission: OLD_MISSION,
    responsibilities: ['Answer student DMs'],
    kpis: ['Response time'],
    boundaries: ['No new authority'],
    authority_autonomous: ['Reply to an inbound DM'],
    authority_approval_required: [],
    authority_forbidden: [],
    escalation_policy: 'Escalate after 3 attempts.',
    updated_by_email: 'ali@colaberry.com',
    version: 2,
    update: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAiAgentFindOne.mockResolvedValue({ id: REESE_ID });
});

describe('plan (dry run)', () => {
  it('reports the old clause present and the target version, writes nothing', async () => {
    mockCharterFindOne.mockResolvedValue(reeseRow());

    const result = await plan();

    expect(result).toEqual({ agentId: REESE_ID, currentVersion: 2, oldClausePresent: true, targetVersion: 3 });
    expect(mockRecordCharterVersion).not.toHaveBeenCalled();
  });

  it('BREAK: no charter row throws rather than fabricating one', async () => {
    mockCharterFindOne.mockResolvedValue(null);

    await expect(plan()).rejects.toBeInstanceOf(ReeseCharterRowMissingError);
  });
});

describe('apply', () => {
  it('happy path: replaces only the manager-chain clause, preserves everything else including authority/boundaries, bumps to version 3', async () => {
    const row = reeseRow();
    mockCharterFindOne.mockResolvedValue(row);

    const result = await apply();

    expect(result).toEqual({ status: 'applied', agentId: REESE_ID, newVersion: 3 });
    expect(mockRecordCharterVersion).toHaveBeenCalledWith(
      REESE_ID,
      expect.objectContaining({
        version: 3,
        mission: FIXED_MISSION,
        roleTitle: row.role_title,
        responsibilities: row.responsibilities,
        kpis: row.kpis,
        boundaries: row.boundaries,
        authorityAutonomous: row.authority_autonomous,
        escalationPolicy: row.escalation_policy,
        updatedByEmail: 'ali@colaberry.com',
      }),
    );
    expect(row.update).toHaveBeenCalledWith(expect.objectContaining({ mission: FIXED_MISSION, version: 3 }));
  });

  it('idempotency: already fixed is a no-op, never writes a duplicate version', async () => {
    const row = reeseRow({ mission: FIXED_MISSION });
    mockCharterFindOne.mockResolvedValue(row);

    const result = await apply();

    expect(result.status).toBe('already_correct');
    expect(mockRecordCharterVersion).not.toHaveBeenCalled();
    expect(row.update).not.toHaveBeenCalled();
  });

  it('BREAK: no charter row throws rather than fabricating one', async () => {
    mockCharterFindOne.mockResolvedValue(null);

    await expect(apply()).rejects.toBeInstanceOf(ReeseCharterRowMissingError);
    expect(mockRecordCharterVersion).not.toHaveBeenCalled();
  });
});
