/**
 * L13.4: platform-built projects open on the plan's own stories. Who is retired, who keeps the row,
 * and that nothing student-facing still points at a story that does not exist.
 */
const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a) } }));
const mockDemoPublish = jest.fn(async (..._a: unknown[]) => true);
const mockDemoRow = jest.fn(async (..._a: unknown[]) => false);
jest.mock('../connectedDemoFlag', () => ({
  ...jest.requireActual('../connectedDemoFlag'),
  connectedDemoForPublish: (...a: unknown[]) => mockDemoPublish(...a),
  connectedDemoMaterializedFor: (...a: unknown[]) => mockDemoRow(...a),
}));

jest.mock('../planStore', () => ({ getPublishedPlan: jest.fn() }));
jest.mock('../../progression/pointsConfigService', () => ({ getBudgetPerUnitXp: jest.fn() }));

import { setupForPublish, setupStoriesRetiredFor } from '../setupStories';
import { planStorySpecs } from '../verification/storyPoints';
import { renderDocs } from '../renderDocs';
import { buildStoryPrompt } from '../buildStoryPrompt';
import { platformCommandCenterPrompt, platformDemoPrompt } from '../platformBuild/prompts';
import type { BuildPlan } from '../planContract';

const P = '3f2b6c1e-8a1d-4c2b-9d3e-1a2b3c4d5e6f';
const E = 'aced5b39-0b47-496a-b172-e1f5c042bf8a';
const facts = (has_row: boolean, has_run: boolean, is_domain = false) => mockQuery.mockResolvedValue([{ has_row, has_run, is_domain }]);

const plan = {
  project_name: 'ShiftFill', tier: 'starter',
  requirements: [{ id: 'REQ-001', statement: 'Fill a gap', priority: 'must', category: 'functional' }],
  releases: [{ key: 'r0', name: 'First', week_start: 4, week_end: 5, demo: 'x', goal: 'g' }],
  stories: [{
    id: 'STORY-001', release: 'r0', title: 'Open a gap', narrative: 'As Dana', fulfills: ['REQ-001'],
    acceptance: ['Given a call-out, then a gap opens.'], failure_paths: ['bad input'], task_guidance: 'Do it.', owner_agent: 'Opener',
  }],
  agents: [],
} as unknown as BuildPlan;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('setupStoriesRetiredFor (read)', () => {
  it('needs a platform run and no STORY-000 row', async () => {
    facts(false, true);
    expect(await setupStoriesRetiredFor(P)).toBe(true);
    facts(true, true);
    expect(await setupStoriesRetiredFor(P)).toBe(false);
    facts(false, false);
    expect(await setupStoriesRetiredFor(P)).toBe(false);
  });

  it('never retires an agent-domain board', async () => {
    facts(false, true, true);
    expect(await setupStoriesRetiredFor(P)).toBe(false);
  });

  it('answers "not retired" when the lookup fails or says nothing, and asks nothing without a project', async () => {
    mockQuery.mockRejectedValue(new Error('db down'));
    expect(await setupStoriesRetiredFor(P)).toBe(false);
    mockQuery.mockResolvedValue([]);
    expect(await setupStoriesRetiredFor(P)).toBe(false);
    mockQuery.mockClear();
    expect(await setupStoriesRetiredFor('')).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('setupForPublish (write)', () => {
  const settings = { platformBuild: E, connectedDemo: 'all' };

  it('retires both stories for a covered new project, even when the demo flag is on', async () => {
    facts(false, false);
    expect(await setupForPublish(P, E, settings)).toEqual({ setupRetired: true, connectedDemo: false });
    expect(mockDemoPublish).not.toHaveBeenCalled();
  });

  it('keeps the rows of a project that already has them', async () => {
    facts(true, true);
    expect(await setupForPublish(P, E, settings)).toEqual({ setupRetired: false, connectedDemo: true });
  });

  it('changes nothing for an enrollment the flag does not cover', async () => {
    facts(false, false);
    expect((await setupForPublish(P, 'someone-else', settings)).setupRetired).toBe(false);
  });

  it('stays retired on a republish after the flag is turned off', async () => {
    facts(false, true);
    expect((await setupForPublish(P, E, { ...settings, platformBuild: 'off' })).setupRetired).toBe(true);
  });

  it('publishes as today when the lookup fails', async () => {
    mockQuery.mockRejectedValue(new Error('db down'));
    expect((await setupForPublish(P, E, settings)).setupRetired).toBe(false);
  });
});

describe('what a retired project is judged on and shown', () => {
  it('is judged on exactly the plan stories', () => {
    expect(planStorySpecs(plan, null).map((s) => s.id)).toEqual(['STORY-001']);
    expect(planStorySpecs(plan).map((s) => s.id)).toEqual(['STORY-001', 'STORY-000']);
  });

  it('renders no document, seed or index entry that names STORY-000 or STORY-900', () => {
    const files = renderDocs(plan, { setupRetired: true });
    const naming = files.filter((f) => /STORY-(000|900)/.test(`${f.path}\n${f.content}`)).map((f) => f.path);
    expect(naming).toEqual([]);
  });

  it('still renders STORY-000 when the flag is omitted', () => {
    expect(renderDocs(plan, {}).map((f) => f.path)).toContain('docs/stories/STORY-000.md');
  });

  it('gives a story prompt that does not point at a missing document', () => {
    expect(buildStoryPrompt(plan, plan.stories[0], { projectId: P, setupRetired: true })).not.toMatch(/STORY-(000|900)/);
    expect(buildStoryPrompt(plan, plan.stories[0], { projectId: P })).toContain('docs/stories/STORY-000.md');
  });

  it('tells the runner those stories do not exist, only when they do not', () => {
    expect(platformCommandCenterPrompt(plan, null, { setupRetired: true })).toContain('no STORY-000 and no STORY-900');
    expect(platformDemoPrompt(plan, { setupRetired: true })).toContain('no STORY-000 and no STORY-900');
    expect(platformCommandCenterPrompt(plan, null)).not.toContain('no STORY-000 and no STORY-900');
  });
});
