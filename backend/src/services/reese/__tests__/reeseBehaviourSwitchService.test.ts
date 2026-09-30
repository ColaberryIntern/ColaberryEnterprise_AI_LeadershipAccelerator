const mockAiAgentFindOne = jest.fn();
jest.mock('../../../models/AiAgent', () => ({
  __esModule: true,
  default: { findOne: (...a: any[]) => mockAiAgentFindOne(...a) },
}));

import {
  setReeseBehaviourSwitch,
  ReeseAgentMissingError,
  ReeseSiblingMissingError,
} from '../reeseBehaviourSwitchService';

function fakeRow(overrides: Record<string, any> = {}) {
  return { config: {}, update: jest.fn().mockResolvedValue(undefined), ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('setReeseBehaviourSwitch', () => {
  it('reactive_dm_reply writes Reese\'s own enabled flag and reports health_assessment as also-changed', async () => {
    const reese = fakeRow();
    mockAiAgentFindOne.mockResolvedValue(reese);

    const result = await setReeseBehaviourSwitch('reactive_dm_reply', false);

    expect(mockAiAgentFindOne).toHaveBeenCalledWith({ where: { agent_name: 'Reese' } });
    expect(reese.update).toHaveBeenCalledWith({ enabled: false });
    expect(result).toEqual({ key: 'reactive_dm_reply', enabled: false, alsoChanged: ['reactive_dm_reply', 'health_assessment'] });
  });

  it('health_assessment writes the SAME column and reports reactive_dm_reply as also-changed', async () => {
    const reese = fakeRow();
    mockAiAgentFindOne.mockResolvedValue(reese);

    const result = await setReeseBehaviourSwitch('health_assessment', true);

    expect(reese.update).toHaveBeenCalledWith({ enabled: true });
    expect(result.alsoChanged).toEqual(['health_assessment', 'reactive_dm_reply']);
  });

  it('welcome_dms writes ai_agents.config.welcome_enabled, preserving other config keys', async () => {
    const reese = fakeRow({ config: { pilot_cohort_ids: ['cohort-1'] } });
    mockAiAgentFindOne.mockResolvedValue(reese);

    await setReeseBehaviourSwitch('welcome_dms', false);

    expect(reese.update).toHaveBeenCalledWith({ config: { pilot_cohort_ids: ['cohort-1'], welcome_enabled: false } });
  });

  it('welcome_dms on a row with no config yet does not throw on the spread', async () => {
    const reese = fakeRow({ config: null });
    mockAiAgentFindOne.mockResolvedValue(reese);

    await setReeseBehaviourSwitch('welcome_dms', true);

    expect(reese.update).toHaveBeenCalledWith({ config: { welcome_enabled: true } });
  });

  it.each([
    ['autonomous_outreach_sweep', 'ReeseAutonomousOutreachSweep'],
    ['outreach_follow_ups', 'ReeseOutreachFollowUps'],
    ['presence_heartbeat', 'ReesePresenceHeartbeat'],
    ['student_support_supersession_resolver', 'ReeseStudentSupportSupersessionResolver'],
  ])('%s writes its own real sibling registry row (%s), never Reese\'s own row', async (key, siblingName) => {
    const sibling = fakeRow();
    mockAiAgentFindOne.mockResolvedValue(sibling);

    const result = await setReeseBehaviourSwitch(key as any, true);

    expect(mockAiAgentFindOne).toHaveBeenCalledWith({ where: { agent_name: siblingName } });
    expect(sibling.update).toHaveBeenCalledWith({ enabled: true });
    expect(result.alsoChanged).toEqual([key]);
  });

  it('BREAK: a missing sibling row throws ReeseSiblingMissingError rather than silently no-oping', async () => {
    mockAiAgentFindOne.mockResolvedValue(null);

    await expect(setReeseBehaviourSwitch('presence_heartbeat', true)).rejects.toBeInstanceOf(ReeseSiblingMissingError);
  });

  it('BREAK: Reese\'s own row missing throws ReeseAgentMissingError for the own-row keys', async () => {
    mockAiAgentFindOne.mockResolvedValue(null);

    await expect(setReeseBehaviourSwitch('welcome_dms', true)).rejects.toBeInstanceOf(ReeseAgentMissingError);
  });
});
