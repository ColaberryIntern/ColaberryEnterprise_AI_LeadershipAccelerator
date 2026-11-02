/**
 * AF3.10 — the Command Center the verifier judges on an agent-domain board.
 *
 * Quincy Ninying found this by reading the code, 1 November 2026: the verifier
 * appended the BARE `STORY-000`, no domain board carries that row, so it found
 * no task, logged `sbp_verification_task_missing`, and his first story could
 * never be verified however he wrote the commit. Production agreed the same day
 * — the event fired on the platform project at 15:00:05Z and on marketing at
 * 16:08:35Z.
 *
 * Measured across the ten domain projects at the time: bare `STORY-000` rows
 * = 0, namespaced rows = 10.
 *
 * ── THE SECOND HALF, WHICH THE FIRST DRAFT OF THIS FIX MISSED ───────────────
 *
 * Two different constants are named `COMMAND_CENTER_ACCEPTANCE`: the SBP's with
 * FIVE generic lines, and the agent-domain one with SIX. Resolving only the id
 * would have judged `platform.STORY-000` against the SBP's five, grading a
 * builder against criteria they were never shown — a quiet wrong answer in
 * place of a loud missing one. The id and its criteria therefore come from one
 * call. The `six criteria` case below is the one that caught it.
 */
const mockGetPublishedPlan = jest.fn();
const mockGetBudgetPerUnitXp = jest.fn();
const mockDomainKeyForProject = jest.fn();

jest.mock('../../planStore', () => ({
  getPublishedPlan: (...a: any[]) => mockGetPublishedPlan(...a),
}));
jest.mock('../../../progression/pointsConfigService', () => ({
  getBudgetPerUnitXp: (...a: any[]) => mockGetBudgetPerUnitXp(...a),
}));
jest.mock('../../../agentDomain/agentDomainCommandCenterForSync', () => ({
  domainKeyForProject: (...a: any[]) => mockDomainKeyForProject(...a),
}));

import {
  planStorySpecs,
  storyPointsForProject,
  commandCenterSpecForProject,
} from '../storyPoints';
import { COMMAND_CENTER_STORY_ID, COMMAND_CENTER_ACCEPTANCE } from '../../commandCenterStory';
import {
  domainCommandCenterStoryId,
  COMMAND_CENTER_ACCEPTANCE as DOMAIN_ACCEPTANCE,
} from '../../../agentDomain/agentDomainCommandCenterStory';

const DOMAIN_PROJECT = '9424aa6e-f754-521a-ace7-ae17fb2a5ff4'; // platform, in production
const PLAIN_PROJECT = '11111111-1111-1111-1111-111111111111';
const plan = (ids: string[]) => ({ stories: ids.map((id) => ({ id, acceptance: ['x'] })) });

beforeEach(() => {
  jest.clearAllMocks();
  mockGetBudgetPerUnitXp.mockResolvedValue({ per_unit: 10, budget: 100, reason: null });
});

describe('the two acceptance constants really do differ — the premise of this fix', () => {
  it('SBP has five lines and the agent domains have six, so one cannot stand in for the other', () => {
    expect(COMMAND_CENTER_ACCEPTANCE).toHaveLength(5);
    expect(DOMAIN_ACCEPTANCE).toHaveLength(6);
    expect([...DOMAIN_ACCEPTANCE]).not.toEqual([...COMMAND_CENTER_ACCEPTANCE]);
  });
});

describe('commandCenterSpecForProject — resolved, never assumed', () => {
  it('namespaces the id on an agent-domain project', async () => {
    mockDomainKeyForProject.mockResolvedValue('platform');
    expect((await commandCenterSpecForProject(DOMAIN_PROJECT)).id).toBe('platform.STORY-000');
  });

  it('carries the SIX domain criteria, not the SBP five', async () => {
    mockDomainKeyForProject.mockResolvedValue('platform');
    const spec = await commandCenterSpecForProject(DOMAIN_PROJECT);
    expect(spec.acceptance).toEqual([...DOMAIN_ACCEPTANCE]);
    expect(spec.acceptance).toHaveLength(6);
  });

  it('uses the SAME id builder the board and the repo use, so the three cannot drift', async () => {
    mockDomainKeyForProject.mockResolvedValue('marketing');
    expect((await commandCenterSpecForProject(DOMAIN_PROJECT)).id)
      .toBe(domainCommandCenterStoryId('marketing'));
  });

  it('leaves a non-domain project on the bare id and the SBP five — unchanged behaviour', async () => {
    mockDomainKeyForProject.mockResolvedValue(null);
    const spec = await commandCenterSpecForProject(PLAIN_PROJECT);
    expect(spec.id).toBe(COMMAND_CENTER_STORY_ID);
    expect(spec.acceptance).toEqual([...COMMAND_CENTER_ACCEPTANCE]);
  });

  it('falls back to the bare spec when the lookup THROWS, rather than failing the run', async () => {
    mockDomainKeyForProject.mockRejectedValue(new Error('connection terminated'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect((await commandCenterSpecForProject(DOMAIN_PROJECT)).id).toBe(COMMAND_CENTER_STORY_ID);
    // It fails soft, but it is never silent: a swallowed catch is a defect.
    expect(warn).toHaveBeenCalled();
    const line = JSON.parse(String(warn.mock.calls[0][0]));
    expect(line.event).toBe('command_center_spec_lookup_failed');
    expect(line.error_class).toBe('Error');
    expect(line.outcome).toBe('partial');
    warn.mockRestore();
  });

  it('does not query at all for an empty project id', async () => {
    expect((await commandCenterSpecForProject('')).id).toBe(COMMAND_CENTER_STORY_ID);
    expect(mockDomainKeyForProject).not.toHaveBeenCalled();
  });

  it('returns a fresh array each time, so no caller can mutate the shared constant', async () => {
    mockDomainKeyForProject.mockResolvedValue('platform');
    const a = await commandCenterSpecForProject(DOMAIN_PROJECT);
    a.acceptance.push('tampered');
    const b = await commandCenterSpecForProject(DOMAIN_PROJECT);
    expect(b.acceptance).toHaveLength(6);
  });
});

describe('planStorySpecs — the judged set carries the namespaced Command Center', () => {
  const domainSpec = { id: 'platform.STORY-000', acceptance: [...DOMAIN_ACCEPTANCE] };

  it('appends the namespaced id, and NO bare STORY-000 beside it', () => {
    const specs = planStorySpecs(plan(['platform.CAP.a']) as any, domainSpec);
    expect(specs.map((s) => s.id)).toEqual(['platform.CAP.a', 'platform.STORY-000']);
    expect(specs.some((s) => s.id === COMMAND_CENTER_STORY_ID)).toBe(false);
  });

  it('gives the namespaced story the SAME six criteria as the board row and the repo doc', () => {
    const specs = planStorySpecs(plan([]) as any, domainSpec);
    expect(specs[0].acceptance).toEqual([...DOMAIN_ACCEPTANCE]);
    expect(specs[0].acceptance).toHaveLength(6);
  });

  it('still defaults to the bare id and the SBP five when no caller supplies a spec', () => {
    const specs = planStorySpecs(plan(['STORY-001']) as any);
    expect(specs.map((s) => s.id)).toEqual(['STORY-001', COMMAND_CENTER_STORY_ID]);
    expect(specs[1].acceptance).toEqual([...COMMAND_CENTER_ACCEPTANCE]);
  });

  it('lets a plan that already lists the namespaced story win, without duplicating it', () => {
    const specs = planStorySpecs(
      { stories: [{ id: 'platform.STORY-000', acceptance: ['mine'] }] } as any,
      domainSpec,
    );
    expect(specs.filter((s) => s.id === 'platform.STORY-000')).toHaveLength(1);
    expect(specs[0].acceptance).toEqual(['mine']);
  });
});

describe('storyPointsForProject — a domain Command Center is priced and therefore payable', () => {
  it('prices the namespaced story, so verifying it can actually pay', async () => {
    mockDomainKeyForProject.mockResolvedValue('platform');
    mockGetPublishedPlan.mockResolvedValue({ plan: plan(['platform.CAP.a', 'platform.CAP.b']) });
    const sp = await storyPointsForProject(DOMAIN_PROJECT);
    expect(sp!.story_ids).toEqual(new Set(['platform.CAP.a', 'platform.CAP.b', 'platform.STORY-000']));
    // The bare id earns nothing on a domain board, because no such task exists.
    expect(sp!.story_ids.has(COMMAND_CENTER_STORY_ID)).toBe(false);
    expect(sp!.stories_in_plan).toBe(3);
  });

  it('prices a non-domain build exactly as before', async () => {
    mockDomainKeyForProject.mockResolvedValue(null);
    mockGetPublishedPlan.mockResolvedValue({ plan: plan(['STORY-001']) });
    const sp = await storyPointsForProject(PLAIN_PROJECT);
    expect(sp!.story_ids).toEqual(new Set(['STORY-001', COMMAND_CENTER_STORY_ID]));
  });
});
