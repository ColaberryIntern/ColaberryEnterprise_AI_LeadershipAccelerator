jest.mock('../../projects/projectReadService', () => ({ getOwnedProjectTree: jest.fn() }));
// The service reads the learner's saved Prepare answers through this model. Mocked so
// the suite needs no database — CI provisions none.
jest.mock('../../../models/PresentationAssignment', () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}));

import { getOwnedProjectTree } from '../../projects/projectReadService';
import PresentationAssignment from '../../../models/PresentationAssignment';
import {
  buildPresentationPrompt,
  contextFromTree,
  defaultTemplateIdFor,
} from '../presentationPromptService';

const mockTree = getOwnedProjectTree as unknown as jest.Mock;
const mockAssignment = (PresentationAssignment as unknown as { findOne: jest.Mock }).findOne;

const tree = {
  id: 'p1',
  name: 'Load Intake Agent',
  organization_name: 'Acme Freight',
  industry: 'Logistics',
  project_stage: 'build',
  lists: [
    {
      id: 'l1', cluster: 'plan', title: 'Release 1', status: 'active', position: 0,
      tasks: [
        { id: 't1', story_id: 'STORY-001', title: 'Parse the booking email', status: 'complete' },
        { id: 't2', story_id: 'STORY-002', title: 'Write to the TMS', status: 'in_progress' },
      ],
    },
    {
      id: 'l2', cluster: 'prep', title: 'Demo prep', status: 'active', position: 1,
      tasks: [
        { id: 't3', story_id: 'PREP-1', title: 'Write the demo narrative', status: 'not_started' },
        { id: 't4', story_id: 'PREP-3', title: 'Build the slides', status: 'not_started' },
      ],
    },
  ],
} as any;

beforeEach(() => {
  jest.clearAllMocks();
  mockTree.mockResolvedValue(tree);
  // Default: the learner has saved no Prepare answers yet.
  mockAssignment.mockResolvedValue(null);
});

/**
 * The ownership boundary is the point of this service, so it is the first thing
 * tested. Everything else in the prompt is read server-side from the learner's own
 * project precisely so a crafted request cannot put words into the prompt it gets back.
 */
describe('presentation prompt service — authorization', () => {
  it('a project that is not yours is indistinguishable from one that does not exist', async () => {
    // getOwnedProjectTree returns null for BOTH cases, and the service passes that
    // through as one reason — so probing another student's project ids reveals nothing.
    mockTree.mockResolvedValue(null);
    const r = await buildPresentationPrompt({ enrollmentId: 'e1', projectId: 'someone-elses', storyId: 'PREP-3' });
    expect(r).toEqual({ ok: false, reason: 'not_found' });
  });

  it('always resolves context through the ownership-checked read, never from the caller', async () => {
    await buildPresentationPrompt({ enrollmentId: 'e1', projectId: 'p1', storyId: 'PREP-3' });
    expect(mockTree).toHaveBeenCalledWith('e1', 'p1');
    expect(mockTree).toHaveBeenCalledTimes(1);
  });
});

describe('presentation prompt service — template selection', () => {
  it.each([
    ['PREP-1', 'project_introduction'],
    ['PREP-3', 'ai_visual_presentation'],
    ['PREP-5', 'final_showcase'],
    ['PREP-6', 'final_showcase'],
  ])('%s defaults to the %s template', (storyId, expected) => {
    expect(defaultTemplateIdFor(storyId)).toBe(expected);
  });

  it('an unknown story id still yields a usable default', () => {
    expect(defaultTemplateIdFor('PREP-99')).toBe('final_showcase');
    expect(defaultTemplateIdFor(null)).toBe('final_showcase');
  });

  it('an explicit template overrides the default', async () => {
    const r = await buildPresentationPrompt({
      enrollmentId: 'e1', projectId: 'p1', storyId: 'PREP-1', templateId: 'architecture_review',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.template.id).toBe('architecture_review');
  });

  it('an unknown template is REFUSED, not silently swapped for the default', async () => {
    // Quietly building the wrong presentation is worse than saying the id is wrong.
    const r = await buildPresentationPrompt({
      enrollmentId: 'e1', projectId: 'p1', storyId: 'PREP-1', templateId: 'not_a_template',
    });
    expect(r).toEqual({ ok: false, reason: 'unknown_template' });
  });
});

describe('presentation prompt service — context mapping', () => {
  it('uses the plan stories, not the prep tasks', () => {
    // A presentation is about the thing the student built. Listing "Write the demo
    // narrative" as project content would be circular.
    const ctx = contextFromTree(tree);
    const titles = (ctx.stories || []).map((s) => s.title);
    expect(titles).toContain('Parse the booking email');
    expect(titles).toContain('Write to the TMS');
    expect(titles).not.toContain('Write the demo narrative');
    expect(titles).not.toContain('Build the slides');
  });

  it('counts only completed work as evidence', () => {
    const ctx = contextFromTree(tree);
    expect(ctx.evidence).toEqual([{ label: 'Parse the booking email', status: 'complete' }]);
  });

  it('boundary: a project with no lists still produces a usable context', () => {
    const ctx = contextFromTree({ id: 'p', name: 'Bare', lists: [] } as any);
    expect(ctx.stories).toEqual([]);
    expect(ctx.evidence).toEqual([]);
    expect(ctx.projectDescription).toBeNull();
  });

  it('a project with no org/industry/stage reports a real gap, not an empty string', () => {
    // "(not supplied)" in the prompt is the honest signal; a blank line reads as
    // "nothing to say here", which is a different and wrong message.
    const ctx = contextFromTree({ id: 'p', name: 'Bare', lists: [] } as any);
    expect(ctx.projectDescription).toBeNull();
  });

  it('the assembled prompt carries the real project and flags what is missing', async () => {
    const r = await buildPresentationPrompt({ enrollmentId: 'e1', projectId: 'p1', storyId: 'PREP-3' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.prompt.text).toContain('Load Intake Agent');
    expect(r.prompt.text).toContain('Acme Freight · Logistics · build');
    expect(r.prompt.text).toContain('Parse the booking email');
    // Nothing supplied an audience, so it must be named as missing rather than guessed.
    expect(r.prompt.missing).toContain('audience');
  });

  it('uses the learner\'s saved Prepare answers when the request does not override them', async () => {
    // Collecting an audience in Prepare achieves nothing unless it reaches the prompt.
    mockAssignment.mockResolvedValue({
      template_slug: 'architecture_review',
      audience: 'The platform team',
      checklist_json: { purpose: 'Design review before build' },
    });
    const r = await buildPresentationPrompt({ enrollmentId: 'e1', projectId: 'p1', storyId: 'PREP-3' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.template.id).toBe('architecture_review');
    expect(r.prompt.text).toContain('AUDIENCE: The platform team');
    expect(r.prompt.text).toContain('PURPOSE: Design review before build');
    expect(r.prompt.missing).not.toContain('audience');
  });

  it('an explicit request still beats the saved answers', async () => {
    // So an instructor, or a "try another audience" control, can override without
    // destroying what the learner saved.
    mockAssignment.mockResolvedValue({ template_slug: 'architecture_review', audience: 'The platform team', checklist_json: {} });
    const r = await buildPresentationPrompt({
      enrollmentId: 'e1', projectId: 'p1', storyId: 'PREP-3',
      templateId: 'project_introduction', options: { audience: 'Hiring managers' },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.template.id).toBe('project_introduction');
    expect(r.prompt.text).toContain('AUDIENCE: Hiring managers');
  });

  it('reading the prompt never creates an assignment row as a side effect', async () => {
    await buildPresentationPrompt({ enrollmentId: 'e1', projectId: 'p1', storyId: 'PREP-3' });
    expect(mockAssignment).toHaveBeenCalledTimes(1);
    // findOne only — no findOrCreate, no create.
    expect((PresentationAssignment as unknown as Record<string, unknown>).findOrCreate).toBeUndefined();
  });

  it('is deterministic end to end', async () => {
    const a = await buildPresentationPrompt({ enrollmentId: 'e1', projectId: 'p1', storyId: 'PREP-3' });
    const b = await buildPresentationPrompt({ enrollmentId: 'e1', projectId: 'p1', storyId: 'PREP-3' });
    expect(a.ok && b.ok && a.prompt.text === b.prompt.text).toBe(true);
  });
});
