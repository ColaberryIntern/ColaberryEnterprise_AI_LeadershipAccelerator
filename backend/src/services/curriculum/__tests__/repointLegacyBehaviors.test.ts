/**
 * repointCurriculumLegacyBehaviors — AI Employee Consolidation Program,
 * Employee #1 (Curriculum/Dara), Phase 4. Per CLAUDE.md's mandatory
 * idempotency-validation test type: proves the exact fix for Discovery F1
 * (reports_to) and Risk R1, without silently overwriting a value already
 * set (human or a prior run).
 */
jest.mock('../../../models/AiAgent', () => ({ findOne: jest.fn() }));
jest.mock('../daraIdentitySeed', () => ({
  getDaraAgentId: jest.fn(),
  DARA_REPORTS_TO_ORG_MEMBER_ID: '5db87b51-4554-4e52-93d7-c61f9887352c',
}));

import AiAgent from '../../../models/AiAgent';
import { getDaraAgentId } from '../daraIdentitySeed';
import { repointCurriculumLegacyBehaviors } from '../repointLegacyBehaviors';

const mockFindOne = AiAgent.findOne as unknown as jest.Mock;
const mockGetDaraAgentId = getDaraAgentId as unknown as jest.Mock;

function makeRow(name: string, overrides: Record<string, any> = {}) {
  return {
    agent_name: name,
    parent_agent_id: null,
    record_kind: null,
    migration_status: null,
    reports_to_type: null,
    update: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetDaraAgentId.mockResolvedValue('dara-real-agent-id');
});

describe('repointCurriculumLegacyBehaviors', () => {
  it('happy path: sets parent_agent_id/record_kind/migration_status on all 4 absorbed rows', async () => {
    const rows: Record<string, ReturnType<typeof makeRow>> = {
      WorkforceCurriculumDirector: makeRow('WorkforceCurriculumDirector'),
      WorkforceCertificationDirector: makeRow('WorkforceCertificationDirector'),
      CurriculumVideoLinkHealth: makeRow('CurriculumVideoLinkHealth'),
      CurriculumQAAgent: makeRow('CurriculumQAAgent'),
    };
    mockFindOne.mockImplementation(({ where }: any) => Promise.resolve(rows[where.agent_name]));

    await repointCurriculumLegacyBehaviors();

    expect(rows.WorkforceCurriculumDirector.update).toHaveBeenCalledWith(
      expect.objectContaining({ parent_agent_id: 'dara-real-agent-id', record_kind: 'behavior', migration_status: 'absorbed' }),
    );
    expect(rows.CurriculumQAAgent.update).toHaveBeenCalledWith(
      expect.objectContaining({ parent_agent_id: 'dara-real-agent-id', record_kind: 'tool', migration_status: 'absorbed' }),
    );
  });

  it("Discovery F1 fix: the 2 Directors get reports_to_type='human'/reports_to_id=Swati's real id, fixing the throw enforceReportsToGate would otherwise raise", async () => {
    const rows: Record<string, ReturnType<typeof makeRow>> = {
      WorkforceCurriculumDirector: makeRow('WorkforceCurriculumDirector'),
      WorkforceCertificationDirector: makeRow('WorkforceCertificationDirector'),
      CurriculumVideoLinkHealth: makeRow('CurriculumVideoLinkHealth'),
      CurriculumQAAgent: makeRow('CurriculumQAAgent'),
    };
    mockFindOne.mockImplementation(({ where }: any) => Promise.resolve(rows[where.agent_name]));

    await repointCurriculumLegacyBehaviors();

    expect(rows.WorkforceCurriculumDirector.update).toHaveBeenCalledWith(
      expect.objectContaining({ reports_to_type: 'human', reports_to_id: '5db87b51-4554-4e52-93d7-c61f9887352c' }),
    );
    expect(rows.WorkforceCertificationDirector.update).toHaveBeenCalledWith(
      expect.objectContaining({ reports_to_type: 'human', reports_to_id: '5db87b51-4554-4e52-93d7-c61f9887352c' }),
    );
  });

  it('CurriculumVideoLinkHealth and CurriculumQAAgent never get a reports_to fix — neither creates a ticket, so F1 never applied to them', async () => {
    const rows: Record<string, ReturnType<typeof makeRow>> = {
      WorkforceCurriculumDirector: makeRow('WorkforceCurriculumDirector'),
      WorkforceCertificationDirector: makeRow('WorkforceCertificationDirector'),
      CurriculumVideoLinkHealth: makeRow('CurriculumVideoLinkHealth'),
      CurriculumQAAgent: makeRow('CurriculumQAAgent'),
    };
    mockFindOne.mockImplementation(({ where }: any) => Promise.resolve(rows[where.agent_name]));

    await repointCurriculumLegacyBehaviors();

    expect(rows.CurriculumVideoLinkHealth.update.mock.calls[0][0]).not.toHaveProperty('reports_to_type');
    expect(rows.CurriculumQAAgent.update.mock.calls[0][0]).not.toHaveProperty('reports_to_type');
  });

  it('idempotency: a row already fully re-pointed (from a prior run) is never updated again', async () => {
    const alreadyDone = makeRow('WorkforceCurriculumDirector', {
      parent_agent_id: 'dara-real-agent-id',
      record_kind: 'behavior',
      migration_status: 'absorbed',
      reports_to_type: 'human',
    });
    mockFindOne.mockImplementation(({ where }: any) =>
      Promise.resolve(where.agent_name === 'WorkforceCurriculumDirector' ? alreadyDone : makeRow(where.agent_name)));

    await repointCurriculumLegacyBehaviors();

    expect(alreadyDone.update).not.toHaveBeenCalled();
  });

  it("never overwrites a human's deliberate migration_status choice (e.g. manually set to something other than the program's default)", async () => {
    const humanEdited = makeRow('WorkforceCurriculumDirector', { migration_status: 'legacy' });
    mockFindOne.mockImplementation(({ where }: any) =>
      Promise.resolve(where.agent_name === 'WorkforceCurriculumDirector' ? humanEdited : makeRow(where.agent_name)));

    await repointCurriculumLegacyBehaviors();

    // parent_agent_id/record_kind still get set (both genuinely unset), but
    // migration_status is never included in the update payload.
    const [[updatePayload]] = humanEdited.update.mock.calls;
    expect(updatePayload).not.toHaveProperty('migration_status');
  });

  it("boundary: Dara's identity not yet seeded — skips entirely rather than writing a null parent_agent_id anywhere", async () => {
    mockGetDaraAgentId.mockResolvedValue(null);

    await repointCurriculumLegacyBehaviors();

    expect(mockFindOne).not.toHaveBeenCalled();
  });

  it('boundary: a row not yet in the registry (wrong boot order) is skipped, not thrown', async () => {
    mockFindOne.mockResolvedValue(null);

    await expect(repointCurriculumLegacyBehaviors()).resolves.toBeUndefined();
  });

  it("DaraPresenceHeartbeat gets parent_agent_id/record_kind too, but no reports_to fix (it creates no ticket)", async () => {
    const heartbeat = makeRow('DaraPresenceHeartbeat');
    mockFindOne.mockImplementation(({ where }: any) =>
      Promise.resolve(where.agent_name === 'DaraPresenceHeartbeat' ? heartbeat : makeRow(where.agent_name)));

    await repointCurriculumLegacyBehaviors();

    expect(heartbeat.update).toHaveBeenCalledWith(
      expect.objectContaining({ parent_agent_id: 'dara-real-agent-id', record_kind: 'behavior' }),
    );
    expect(heartbeat.update.mock.calls[0][0]).not.toHaveProperty('reports_to_type');
  });
});
