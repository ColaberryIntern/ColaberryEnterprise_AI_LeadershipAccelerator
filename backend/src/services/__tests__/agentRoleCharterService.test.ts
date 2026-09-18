/**
 * agentRoleCharterService — AI Workforce Management, Checkpoint B. Pins the
 * honest-empty-state contract (a real agent with no charter yet returns
 * `{ agentId, charter: null }`, never a fabricated default) and the
 * agent-existence guard on writes (an agent that doesn't exist can't be
 * given a charter, regardless of what the caller sends).
 */
const mockAiAgentFindByPk = jest.fn();
jest.mock('../../models/AiAgent', () => ({
  __esModule: true,
  default: { findByPk: (...a: any[]) => mockAiAgentFindByPk(...a) },
}));

const mockCharterFindOne = jest.fn();
const mockCharterUpsert = jest.fn();
jest.mock('../../models/AgentRoleCharter', () => ({
  __esModule: true,
  default: {
    findOne: (...a: any[]) => mockCharterFindOne(...a),
    upsert: (...a: any[]) => mockCharterUpsert(...a),
  },
}));

const mockVersionFindOne = jest.fn();
const mockVersionCreate = jest.fn();
jest.mock('../../models/AgentRoleCharterVersion', () => ({
  __esModule: true,
  default: {
    findOne: (...a: any[]) => mockVersionFindOne(...a),
    create: (...a: any[]) => mockVersionCreate(...a),
  },
}));

import {
  getRoleCharter,
  upsertRoleCharter,
  activateCharterVersion,
  recordCharterVersion,
  AgentNotFoundError,
  CharterVersionNotFoundError,
} from '../agentRoleCharterService';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getRoleCharter', () => {
  it('happy path: returns the real charter for an agent that has one', async () => {
    mockAiAgentFindByPk.mockResolvedValue({ id: 'agent-1' });
    mockCharterFindOne.mockResolvedValue({
      role_title: 'Student Retention Specialist',
      mission: 'Recover students showing dropout risk.',
      responsibilities: ['Monitor engagement signals'],
      kpis: ['Retention recovered'],
      updated_by_email: 'ali@colaberry.com',
      updated_at: new Date('2026-08-28T00:00:00Z'),
    });

    const result = await getRoleCharter('agent-1');

    expect(result).toEqual({
      agentId: 'agent-1',
      charter: {
        roleTitle: 'Student Retention Specialist',
        mission: 'Recover students showing dropout risk.',
        responsibilities: ['Monitor engagement signals'],
        kpis: ['Retention recovered'],
        updatedByEmail: 'ali@colaberry.com',
        updatedAt: new Date('2026-08-28T00:00:00Z'),
        // Reese Product Phase 1, R4 — a charter written before this phase has
        // none of the new columns; getRoleCharter() reports them as explicit
        // nulls, never fabricated defaults.
        version: null,
        effectiveAt: null,
        boundaries: null,
        authorityAutonomous: null,
        authorityApprovalRequired: null,
        authorityForbidden: null,
        escalationPolicy: null,
      },
    });
  });

  it('boundary: a real agent with no charter yet returns charter: null, not a fabricated default', async () => {
    mockAiAgentFindByPk.mockResolvedValue({ id: 'agent-1' });
    mockCharterFindOne.mockResolvedValue(null);

    const result = await getRoleCharter('agent-1');

    expect(result).toEqual({ agentId: 'agent-1', charter: null });
  });

  it('boundary: an agent that does not exist returns null (the controller turns this into 404)', async () => {
    mockAiAgentFindByPk.mockResolvedValue(null);

    const result = await getRoleCharter('does-not-exist');

    expect(result).toBeNull();
    expect(mockCharterFindOne).not.toHaveBeenCalled();
  });
});

describe('upsertRoleCharter', () => {
  const input = {
    roleTitle: 'Student Retention Specialist',
    mission: 'Recover students showing dropout risk.',
    responsibilities: ['Monitor engagement signals'],
    kpis: ['Retention recovered'],
  };

  it('happy path: creates/updates the one row for this agent and returns it', async () => {
    mockAiAgentFindByPk.mockResolvedValue({ id: 'agent-1' });
    mockCharterUpsert.mockResolvedValue([
      {
        role_title: input.roleTitle,
        mission: input.mission,
        responsibilities: input.responsibilities,
        kpis: input.kpis,
        updated_by_email: 'manager@colaberry.com',
        updated_at: new Date('2026-08-28T00:00:00Z'),
      },
      true,
    ]);

    const result = await upsertRoleCharter('agent-1', input, 'manager@colaberry.com');

    expect(mockCharterUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        agent_id: 'agent-1',
        role_title: input.roleTitle,
        updated_by_email: 'manager@colaberry.com',
      }),
    );
    expect(result.charter?.updatedByEmail).toBe('manager@colaberry.com');
  });

  it('BREAK: an agent that does not exist throws AgentNotFoundError (404) and never writes', async () => {
    mockAiAgentFindByPk.mockResolvedValue(null);

    await expect(upsertRoleCharter('does-not-exist', input, 'manager@colaberry.com')).rejects.toBeInstanceOf(
      AgentNotFoundError,
    );
    expect(mockCharterUpsert).not.toHaveBeenCalled();
  });

  it('Product Phase 1, R4: a payload without the new fields never touches those columns (no clobber)', async () => {
    mockAiAgentFindByPk.mockResolvedValue({ id: 'agent-1' });
    mockCharterUpsert.mockResolvedValue([
      { role_title: input.roleTitle, mission: input.mission, responsibilities: input.responsibilities, kpis: input.kpis, updated_by_email: 'manager@colaberry.com', updated_at: new Date() },
      true,
    ]);

    await upsertRoleCharter('agent-1', input, 'manager@colaberry.com');

    const written = mockCharterUpsert.mock.calls[0][0];
    expect(written).not.toHaveProperty('version');
    expect(written).not.toHaveProperty('boundaries');
    expect(written).not.toHaveProperty('authority_autonomous');
    expect(written).not.toHaveProperty('escalation_policy');
  });

  it('Product Phase 1, R4: a payload WITH the new fields writes exactly those columns', async () => {
    mockAiAgentFindByPk.mockResolvedValue({ id: 'agent-1' });
    mockCharterUpsert.mockResolvedValue([{ ...input, updated_by_email: 'ali@colaberry.com', updated_at: new Date() }, true]);

    await upsertRoleCharter(
      'agent-1',
      {
        ...input,
        version: 2,
        effectiveAt: '2026-09-18T00:00:00.000Z',
        boundaries: ['Never message a student outside DM'],
        authorityAutonomous: ['Reply to inbound DMs'],
        authorityApprovalRequired: ['Autonomous outreach beyond the pilot cohort'],
        authorityForbidden: ['Promise a refund'],
        escalationPolicy: 'Escalate to Ali after 3 failed attempts.',
      },
      'ali@colaberry.com',
    );

    expect(mockCharterUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 2,
        boundaries: ['Never message a student outside DM'],
        authority_autonomous: ['Reply to inbound DMs'],
        authority_approval_required: ['Autonomous outreach beyond the pilot cohort'],
        authority_forbidden: ['Promise a refund'],
        escalation_policy: 'Escalate to Ali after 3 failed attempts.',
      }),
    );
  });
});

describe('recordCharterVersion', () => {
  it('writes one immutable snapshot row', async () => {
    mockVersionCreate.mockResolvedValue({ id: 'v-1' });

    await recordCharterVersion('agent-1', {
      version: 1,
      effectiveAt: new Date('2026-09-10T15:48:00Z'),
      roleTitle: 'AI Mentor, Student Success & Retention',
      mission: 'Recover students showing dropout risk.',
      responsibilities: ['Monitor engagement signals'],
      kpis: ['Retention recovered'],
      boundaries: [],
      authorityAutonomous: [],
      authorityApprovalRequired: [],
      authorityForbidden: [],
      escalationPolicy: null,
      updatedByEmail: 'ali@colaberry.com',
    });

    expect(mockVersionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ agent_id: 'agent-1', version: 1, updated_by_email: 'ali@colaberry.com' }),
    );
  });
});

describe('activateCharterVersion', () => {
  it('happy path: restores agent_role_charters from a recorded snapshot', async () => {
    mockAiAgentFindByPk.mockResolvedValue({ id: 'agent-1' });
    mockVersionFindOne.mockResolvedValue({
      version: 1,
      effective_at: new Date('2026-09-10T15:48:00Z'),
      role_title: 'AI Mentor, Student Success & Retention',
      mission: 'Recover students showing dropout risk.',
      responsibilities: ['Monitor engagement signals'],
      kpis: ['Retention recovered'],
      boundaries: [],
      authority_autonomous: [],
      authority_approval_required: [],
      authority_forbidden: [],
      escalation_policy: null,
      updated_by_email: 'ali@colaberry.com',
    });
    mockCharterUpsert.mockResolvedValue([
      { role_title: 'AI Mentor, Student Success & Retention', mission: 'Recover students showing dropout risk.', responsibilities: ['Monitor engagement signals'], kpis: ['Retention recovered'], updated_by_email: 'ali@colaberry.com', updated_at: new Date(), version: 1 },
      false,
    ]);

    const result = await activateCharterVersion('agent-1', 1);

    expect(mockVersionFindOne).toHaveBeenCalledWith({ where: { agent_id: 'agent-1', version: 1 } });
    expect(mockCharterUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ role_title: 'AI Mentor, Student Success & Retention', updated_by_email: 'ali@colaberry.com', version: 1 }),
    );
    expect(result.charter?.updatedByEmail).toBe('ali@colaberry.com');
  });

  it('BREAK: a version never recorded throws CharterVersionNotFoundError and never writes', async () => {
    mockAiAgentFindByPk.mockResolvedValue({ id: 'agent-1' });
    mockVersionFindOne.mockResolvedValue(null);

    await expect(activateCharterVersion('agent-1', 99)).rejects.toBeInstanceOf(CharterVersionNotFoundError);
    expect(mockCharterUpsert).not.toHaveBeenCalled();
  });

  it('BREAK: an agent that does not exist throws AgentNotFoundError before any lookup', async () => {
    mockAiAgentFindByPk.mockResolvedValue(null);

    await expect(activateCharterVersion('does-not-exist', 1)).rejects.toBeInstanceOf(AgentNotFoundError);
    expect(mockVersionFindOne).not.toHaveBeenCalled();
  });
});
