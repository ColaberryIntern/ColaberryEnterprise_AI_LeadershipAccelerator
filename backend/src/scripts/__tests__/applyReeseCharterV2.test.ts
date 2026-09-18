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
const mockGetRoleCharter = jest.fn();
jest.mock('../../services/agentRoleCharterService', () => ({
  recordCharterVersion: (...a: any[]) => mockRecordCharterVersion(...a),
  getRoleCharter: (...a: any[]) => mockGetRoleCharter(...a),
}));

jest.mock('../../services/agents/tools/agentToolRegistry', () => ({
  listAgentTools: jest.fn(() => ['read_attachments']),
}));

import { plan, apply, ReeseCharterRowMissingError } from '../applyReeseCharterV2';
import {
  REESE_CHARTER_V2_BOUNDARIES,
  REESE_CHARTER_V2_AUTHORITY_AUTONOMOUS,
  REESE_CHARTER_V2_AUTHORITY_FORBIDDEN,
  REESE_CHARTER_V2_ESCALATION_POLICY,
} from '../lib/reeseCharterV2Content';

const REESE_ID = 'reese-agent-1';
const CREATED_AT = new Date('2026-09-10T15:48:04.488Z');

function reeseRow(overrides: Record<string, any> = {}) {
  return {
    agent_id: REESE_ID,
    role_title: 'AI Mentor — Student Success & Retention',
    mission: 'Reese reports through workforce_intelligence_engine to Kes.',
    responsibilities: ['Answer student DMs'],
    kpis: ['Response time to a student DM'],
    updated_by_email: 'ali@colaberry.com',
    created_at: CREATED_AT,
    version: null,
    update: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAiAgentFindOne.mockResolvedValue({ id: REESE_ID });
});

describe('plan (dry run)', () => {
  it('reads the current row and writes nothing', async () => {
    mockCharterFindOne.mockResolvedValue(reeseRow());

    const result = await plan();

    expect(result).toEqual({ status: 'planned', agentId: REESE_ID, currentVersion: null, targetVersion: 2 });
    expect(mockRecordCharterVersion).not.toHaveBeenCalled();
  });

  it('BREAK: Reese has no charter row yet — throws rather than fabricating one', async () => {
    mockCharterFindOne.mockResolvedValue(null);

    await expect(plan()).rejects.toBeInstanceOf(ReeseCharterRowMissingError);
    expect(mockRecordCharterVersion).not.toHaveBeenCalled();
  });
});

describe('apply', () => {
  it('happy path: records version 1 byte for byte from the live row, then writes version 2 with the reviewed additions', async () => {
    const row = reeseRow();
    mockCharterFindOne.mockResolvedValue(row);

    const result = await apply();

    expect(result.status).toBe('applied');
    expect(mockRecordCharterVersion).toHaveBeenCalledTimes(2);

    const [, version1Arg] = mockRecordCharterVersion.mock.calls[0];
    expect(version1Arg).toMatchObject({
      version: 1,
      effectiveAt: CREATED_AT,
      roleTitle: row.role_title,
      mission: row.mission,
      responsibilities: row.responsibilities,
      kpis: row.kpis,
      boundaries: [],
      authorityAutonomous: [],
      authorityApprovalRequired: [],
      authorityForbidden: [],
      escalationPolicy: null,
      updatedByEmail: 'ali@colaberry.com',
    });

    const [, version2Arg] = mockRecordCharterVersion.mock.calls[1];
    expect(version2Arg).toMatchObject({
      version: 2,
      roleTitle: row.role_title, // unchanged from version 1 — never retyped
      mission: row.mission,
      boundaries: REESE_CHARTER_V2_BOUNDARIES,
      authorityAutonomous: REESE_CHARTER_V2_AUTHORITY_AUTONOMOUS,
      authorityForbidden: REESE_CHARTER_V2_AUTHORITY_FORBIDDEN,
      escalationPolicy: REESE_CHARTER_V2_ESCALATION_POLICY,
    });

    expect(row.update).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 2,
        boundaries: REESE_CHARTER_V2_BOUNDARIES,
        authority_autonomous: REESE_CHARTER_V2_AUTHORITY_AUTONOMOUS,
        authority_forbidden: REESE_CHARTER_V2_AUTHORITY_FORBIDDEN,
        escalation_policy: REESE_CHARTER_V2_ESCALATION_POLICY,
      }),
    );
  });

  it('idempotency: --apply twice writes once — already at version 2 is a no-op', async () => {
    mockCharterFindOne.mockResolvedValue(reeseRow({ version: 2 }));

    const result = await apply();

    expect(result.status).toBe('already_applied');
    expect(mockRecordCharterVersion).not.toHaveBeenCalled();
  });

  it('BREAK: Reese has no charter row yet — throws rather than fabricating one', async () => {
    mockCharterFindOne.mockResolvedValue(null);

    await expect(apply()).rejects.toBeInstanceOf(ReeseCharterRowMissingError);
    expect(mockRecordCharterVersion).not.toHaveBeenCalled();
  });
});
