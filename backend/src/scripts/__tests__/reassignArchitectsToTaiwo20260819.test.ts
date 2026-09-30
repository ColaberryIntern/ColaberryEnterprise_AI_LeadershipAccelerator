jest.mock('../../config/database', () => ({
  sequelize: { transaction: jest.fn((cb: any) => cb({})), authenticate: jest.fn() },
}));
jest.mock('../../models', () => ({
  AiAgent: { findAll: jest.fn(), update: jest.fn(), findByPk: jest.fn() },
}));
// ticketCreatorIdentitySeed.ts (imported below for its real, static
// ORG_MEMBER/REASSIGNED_TO_TAIWO_AGENT_NAMES constants — pure data, no I/O)
// itself imports agentIdentitySeed.ts, which imports AdminUser/Enrollment/
// CommunityMember/AiAgent/Cohort DIRECTLY from their model files (not the
// barrel this test already mocks) — each real model file calls
// Sequelize's Model.init({...}, {sequelize}) against whatever '../config/
// database' resolves to, which would be this test's bare mock object and
// crash at import time. Mocked at the SAME boundary
// ticketCreatorIdentitySeed.test.ts itself already uses for exactly this
// reason, so this test never touches a real Sequelize model.
jest.mock('../../services/agentBlueprint/agentIdentitySeed', () => ({
  seedAgentIdentity: jest.fn(),
  getAgentAdminUserId: jest.fn(),
}));
jest.mock('fs');

import fs from 'fs';
import { Op } from 'sequelize';
import { AiAgent } from '../../models';
import { ORG_MEMBER, REASSIGNED_TO_TAIWO_AGENT_NAMES } from '../../services/agentBlueprint/ticketCreatorIdentitySeed';
import { parseArgs, computeDiff, runPlan, runCommit, runRevert } from '../reassignArchitectsToTaiwo20260819';

const mockAgentFindAll = AiAgent.findAll as unknown as jest.Mock;
const mockAgentUpdate = AiAgent.update as unknown as jest.Mock;
const mockAgentFindByPk = AiAgent.findByPk as unknown as jest.Mock;
const mockWriteFileSync = fs.writeFileSync as unknown as jest.Mock;
const mockReadFileSync = fs.readFileSync as unknown as jest.Mock;

/**
 * Companion script for T2's ticketCreatorIdentitySeed.ts config change —
 * created after this run's own task-verifier found that
 * agentIdentitySeed.ts::seedAgentIdentity()'s boot-time self-heal only
 * fills reports_to_type/reports_to_id when they are currently NULL, so a
 * config change alone would silently no-op for these 4 already-populated
 * rows. This script is the explicit write that makes it real.
 */

function agentRow(overrides: Record<string, any> = {}) {
  return {
    id: 'agent-1',
    agent_name: 'FinanceIntelligenceArchitect',
    reports_to_type: 'agent',
    reports_to_id: 'corybrain-id',
    update: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAgentFindAll.mockResolvedValue([]);
});

describe('parseArgs', () => {
  it('defaults to plan mode', () => {
    expect(parseArgs([]).mode).toBe('plan');
  });

  it('--commit and --revert are mutually exclusive', () => {
    expect(() => parseArgs(['--commit', '--revert', '--undo-log', 'x.json'])).toThrow(/mutually exclusive/);
  });

  it('--revert requires --undo-log', () => {
    expect(() => parseArgs(['--revert'])).toThrow(/requires --undo-log/);
  });
});

describe('computeDiff', () => {
  it('an agent already reports_to_type=human/reports_to_id=Taiwo is NOT in the diff (already correct)', async () => {
    mockAgentFindAll.mockResolvedValue([agentRow({ reports_to_type: 'human', reports_to_id: ORG_MEMBER.TAIWO })]);

    const rows = await computeDiff();

    expect(rows).toEqual([]);
  });

  it('an agent still pointing at CoryBrain (the pre-T2 state) IS in the diff, with its real previous values captured', async () => {
    mockAgentFindAll.mockResolvedValue([agentRow({ id: 'finance-id', reports_to_type: 'agent', reports_to_id: 'corybrain-id' })]);

    const rows = await computeDiff();

    expect(rows).toEqual([
      { agent_id: 'finance-id', agent_name: 'FinanceIntelligenceArchitect', previous_reports_to_type: 'agent', previous_reports_to_id: 'corybrain-id' },
    ]);
  });

  it('queries exactly the 4 real agent names from ticketCreatorIdentitySeed.ts — never a hand-typed, possibly-drifted second list', async () => {
    await computeDiff();

    const [[{ where }]] = mockAgentFindAll.mock.calls;
    expect(where.agent_name[Op.in]).toEqual([...REASSIGNED_TO_TAIWO_AGENT_NAMES]);
  });
});

describe('runPlan', () => {
  it('makes ZERO DB writes', async () => {
    mockAgentFindAll.mockResolvedValue([agentRow()]);

    await runPlan('/tmp', 'test-session');

    expect(mockAgentUpdate).not.toHaveBeenCalled();
  });

  it('writes the undo log and report to disk even when nothing needs to change (idempotent artifact, never skipped)', async () => {
    mockAgentFindAll.mockResolvedValue([agentRow({ reports_to_type: 'human', reports_to_id: ORG_MEMBER.TAIWO })]);

    const result = await runPlan('/tmp', 'test-session');

    expect(mockWriteFileSync).toHaveBeenCalledTimes(2);
    expect(result.totalToChange).toBe(0);
  });
});

describe('runCommit', () => {
  it('happy path: sets reports_to_type=human/reports_to_id=Taiwo for an agent still pointing at CoryBrain', async () => {
    mockAgentFindAll.mockResolvedValue([agentRow({ id: 'finance-id', reports_to_type: 'agent', reports_to_id: 'corybrain-id' })]);

    const result = await runCommit('/tmp', 'test-session');

    expect(mockAgentUpdate).toHaveBeenCalledWith(
      { reports_to_type: 'human', reports_to_id: ORG_MEMBER.TAIWO },
      expect.objectContaining({ where: { id: 'finance-id' } }),
    );
    expect(result.updated).toBe(1);
  });

  it('idempotency: a second commit with every agent already correct writes zero updates', async () => {
    mockAgentFindAll.mockResolvedValue([
      agentRow({ id: 'finance-id', reports_to_type: 'human', reports_to_id: ORG_MEMBER.TAIWO }),
      agentRow({ id: 'ops-id', agent_name: 'OperationsOptimizationArchitect', reports_to_type: 'human', reports_to_id: ORG_MEMBER.TAIWO }),
    ]);

    const result = await runCommit('/tmp', 'test-session');

    expect(mockAgentUpdate).not.toHaveBeenCalled();
    expect(result.updated).toBe(0);
  });

  it('writes the undo log to disk BEFORE any DB write (ordering)', async () => {
    mockAgentFindAll.mockResolvedValue([agentRow({ id: 'finance-id' })]);
    const writeOrder: string[] = [];
    mockWriteFileSync.mockImplementation(() => writeOrder.push('undo-log-written'));
    mockAgentUpdate.mockImplementation(async () => writeOrder.push('db-updated'));

    await runCommit('/tmp', 'test-session');

    expect(writeOrder[0]).toBe('undo-log-written');
    expect(writeOrder.indexOf('db-updated')).toBeGreaterThan(writeOrder.indexOf('undo-log-written'));
  });

  it('boundary: never touches an agent outside the 4 named Architects (findAll is scoped to exactly that list)', async () => {
    await runCommit('/tmp', 'test-session');

    const [[{ where }]] = mockAgentFindAll.mock.calls;
    const queriedNames = where.agent_name[Op.in];
    expect(queriedNames).toEqual([...REASSIGNED_TO_TAIWO_AGENT_NAMES]);
    expect(queriedNames).not.toContain('CoryBrain');
    expect(queriedNames).not.toContain('workforce_intelligence_engine');
  });
});

describe('runRevert', () => {
  it('restores an agent\'s reports_to_type/reports_to_id to CoryBrain (the pre-T2 state)', async () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        generated_at: '2026-08-19T00:00:00Z',
        session_id: 'test-session',
        rows: [{ agent_id: 'finance-id', agent_name: 'FinanceIntelligenceArchitect', previous_reports_to_type: 'agent', previous_reports_to_id: 'corybrain-id' }],
      }),
    );
    const agent = agentRow({ id: 'finance-id', reports_to_type: 'human', reports_to_id: ORG_MEMBER.TAIWO });
    mockAgentFindByPk.mockResolvedValue(agent);

    const result = await runRevert('/tmp/undo.json');

    expect(result.reverted).toBe(1);
    expect(agent.update).toHaveBeenCalledWith(
      { reports_to_type: 'agent', reports_to_id: 'corybrain-id' },
      expect.anything(),
    );
  });

  it('idempotency: an agent already at its previous state is skipped', async () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        generated_at: '2026-08-19T00:00:00Z',
        session_id: 'test-session',
        rows: [{ agent_id: 'finance-id', agent_name: 'FinanceIntelligenceArchitect', previous_reports_to_type: 'agent', previous_reports_to_id: 'corybrain-id' }],
      }),
    );
    const agent = agentRow({ id: 'finance-id', reports_to_type: 'agent', reports_to_id: 'corybrain-id' });
    mockAgentFindByPk.mockResolvedValue(agent);

    const result = await runRevert('/tmp/undo.json');

    expect(result.reverted).toBe(0);
    expect(result.skippedAlreadyAtPreviousState).toBe(1);
    expect(agent.update).not.toHaveBeenCalled();
  });
});
