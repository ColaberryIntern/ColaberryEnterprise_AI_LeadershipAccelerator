jest.mock('../../config/database', () => ({
  sequelize: { transaction: jest.fn((cb: any) => cb({})), authenticate: jest.fn() },
}));
const mockAiAgentFindOne = jest.fn();
const mockAiAgentUpdate = jest.fn();
const mockAiAgentFindByPk = jest.fn();
jest.mock('../../models/AiAgent', () => ({
  __esModule: true,
  default: {
    findOne: (...a: any[]) => mockAiAgentFindOne(...a),
    update: (...a: any[]) => mockAiAgentUpdate(...a),
    findByPk: (...a: any[]) => mockAiAgentFindByPk(...a),
  },
}));
// ticketCreatorIdentitySeed.ts (imported below for its real, static ORG_MEMBER
// constant — pure data, no I/O) itself imports agentIdentitySeed.ts, which
// imports AdminUser/Enrollment/CommunityMember/AiAgent/Cohort DIRECTLY from
// their model files (not the barrel) — each real model file calls Sequelize's
// Model.init({...}, {sequelize}) against whatever '../config/database'
// resolves to, which would be this test's bare mock object and crash at
// import time. Mocked at the SAME boundary
// reassignArchitectsToTaiwo20260819.test.ts itself already uses for exactly
// this reason, so this test never touches a real Sequelize model.
jest.mock('../../services/agentBlueprint/agentIdentitySeed', () => ({
  seedAgentIdentity: jest.fn(),
  getAgentAdminUserId: jest.fn(),
}));
jest.mock('fs');

import fs from 'fs';
import { ORG_MEMBER } from '../../services/agentBlueprint/ticketCreatorIdentitySeed';
import { parseArgs, computeDiff, runPlan, runCommit, runRevert } from '../reassignReeseToAli20260918';

const mockWriteFileSync = fs.writeFileSync as unknown as jest.Mock;
const mockReadFileSync = fs.readFileSync as unknown as jest.Mock;

function reeseRow(overrides: Record<string, any> = {}) {
  return {
    id: 'reese-agent-1',
    agent_name: 'Reese',
    reports_to_type: 'agent',
    reports_to_id: 'workforce-intelligence-engine-id',
    reports_to_org_member_id: ORG_MEMBER.TAIWO,
    update: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('parseArgs', () => {
  it('defaults to plan mode', () => {
    expect(parseArgs([]).mode).toBe('plan');
  });

  it('--commit selects commit mode', () => {
    expect(parseArgs(['--commit']).mode).toBe('commit');
  });

  it('--revert requires --undo-log', () => {
    expect(() => parseArgs(['--revert'])).toThrow(/requires --undo-log/);
  });

  it('--commit and --revert together throws', () => {
    expect(() => parseArgs(['--commit', '--revert', '--undo-log', 'x.json'])).toThrow(/mutually exclusive/);
  });
});

describe('computeDiff', () => {
  it('reports the real drift: still workforce_intelligence_engine, and reports_to_org_member_id still Taiwo', async () => {
    mockAiAgentFindOne.mockResolvedValue(reeseRow());

    const diff = await computeDiff();

    expect(diff.wouldChange).toBe(true);
    expect(diff.previousReportsToType).toBe('agent');
    expect(diff.previousReportsToId).toBe('workforce-intelligence-engine-id');
    expect(diff.previousReportsToOrgMemberId).toBe(ORG_MEMBER.TAIWO);
  });

  it('boundary: already correct reports no change needed', async () => {
    mockAiAgentFindOne.mockResolvedValue(
      reeseRow({ reports_to_type: 'human', reports_to_id: ORG_MEMBER.ALI, reports_to_org_member_id: ORG_MEMBER.ALI }),
    );

    const diff = await computeDiff();

    expect(diff.wouldChange).toBe(false);
  });

  it('BREAK: no Reese row exists throws rather than silently no-opping', async () => {
    mockAiAgentFindOne.mockResolvedValue(null);

    await expect(computeDiff()).rejects.toThrow(/No ai_agents row/);
  });
});

describe('runPlan', () => {
  it('writes an undo log and a dry-run report, makes zero writes', async () => {
    mockAiAgentFindOne.mockResolvedValue(reeseRow());

    const result = await runPlan('/tmp', 'CC-test');

    expect(result.wouldChange).toBe(true);
    expect(mockWriteFileSync).toHaveBeenCalledTimes(2);
    expect(mockAiAgentUpdate).not.toHaveBeenCalled();

    const [, undoLogContent] = mockWriteFileSync.mock.calls.find(([p]: [string]) => p.includes('undo-log'))!;
    const parsed = JSON.parse(undoLogContent);
    expect(parsed.previous_reports_to_type).toBe('agent');
    expect(parsed.previous_reports_to_org_member_id).toBe(ORG_MEMBER.TAIWO);
  });
});

describe('runCommit', () => {
  it('happy path: writes the undo log first, then sets Reese to report to Ali', async () => {
    mockAiAgentFindOne.mockResolvedValue(reeseRow());

    const result = await runCommit('/tmp', 'CC-test');

    expect(result.changed).toBe(true);
    expect(mockWriteFileSync).toHaveBeenCalledTimes(1); // undo log only, no report
    expect(mockAiAgentUpdate).toHaveBeenCalledWith(
      { reports_to_type: 'human', reports_to_id: ORG_MEMBER.ALI, reports_to_org_member_id: ORG_MEMBER.ALI },
      { where: { id: 'reese-agent-1' } },
    );
  });

  it('idempotency: already correct is a no-op write (undo log still recorded, but no AiAgent.update)', async () => {
    mockAiAgentFindOne.mockResolvedValue(
      reeseRow({ reports_to_type: 'human', reports_to_id: ORG_MEMBER.ALI, reports_to_org_member_id: ORG_MEMBER.ALI }),
    );

    const result = await runCommit('/tmp', 'CC-test');

    expect(result.changed).toBe(false);
    expect(mockAiAgentUpdate).not.toHaveBeenCalled();
  });
});

describe('runRevert', () => {
  it('happy path: restores all three previous fields verbatim', async () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        agent_id: 'reese-agent-1',
        previous_reports_to_type: 'agent',
        previous_reports_to_id: 'workforce-intelligence-engine-id',
        previous_reports_to_org_member_id: ORG_MEMBER.TAIWO,
      }),
    );
    const agent = reeseRow({ reports_to_type: 'human', reports_to_id: ORG_MEMBER.ALI, reports_to_org_member_id: ORG_MEMBER.ALI });
    mockAiAgentFindByPk.mockResolvedValue(agent);

    const result = await runRevert('undo-log.json');

    expect(result.reverted).toBe(true);
    expect(agent.update).toHaveBeenCalledWith({
      reports_to_type: 'agent',
      reports_to_id: 'workforce-intelligence-engine-id',
      reports_to_org_member_id: ORG_MEMBER.TAIWO,
    });
  });

  it('idempotency: already at the previous state is a no-op', async () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        agent_id: 'reese-agent-1',
        previous_reports_to_type: 'agent',
        previous_reports_to_id: 'workforce-intelligence-engine-id',
        previous_reports_to_org_member_id: ORG_MEMBER.TAIWO,
      }),
    );
    const agent = reeseRow();
    mockAiAgentFindByPk.mockResolvedValue(agent);

    const result = await runRevert('undo-log.json');

    expect(result.reverted).toBe(false);
    expect(agent.update).not.toHaveBeenCalled();
  });
});
