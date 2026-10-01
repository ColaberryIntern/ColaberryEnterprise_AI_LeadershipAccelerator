jest.mock('../../projects/projectReadService', () => ({ getOwnedProjectTree: jest.fn() }));
jest.mock('../../../models/PresentationAssignment', () => ({
  __esModule: true,
  default: { findOrCreate: jest.fn(), findOne: jest.fn() },
}));

import fs from 'fs';
import path from 'path';
import { getOwnedProjectTree } from '../../projects/projectReadService';
import PresentationAssignment from '../../../models/PresentationAssignment';
import { getOrCreateAssignment, updateAssignment } from '../presentationAssignmentService';

const mockTree = getOwnedProjectTree as unknown as jest.Mock;
const model = PresentationAssignment as unknown as { findOrCreate: jest.Mock; findOne: jest.Mock };

function row(over: Record<string, unknown> = {}) {
  const r: Record<string, unknown> = {
    project_id: 'p1',
    story_id: 'PREP-3',
    template_slug: 'ai_visual_presentation',
    audience: null,
    checklist_json: {},
    prep_state: 'not_started',
    ...over,
  };
  (r as any).update = jest.fn(async (patch: Record<string, unknown>) => { Object.assign(r, patch); return r; });
  return r;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockTree.mockResolvedValue({ id: 'p1', name: 'Load Intake Agent', lists: [] });
});

describe('presentation assignment service — authorization', () => {
  it('a project that is not yours is indistinguishable from one that does not exist', async () => {
    mockTree.mockResolvedValue(null);
    const r = await getOrCreateAssignment('e1', 'someone-elses', 'PREP-3');
    expect(r).toEqual({ ok: false, reason: 'not_found' });
    // And nothing was written on the way to finding that out.
    expect(model.findOrCreate).not.toHaveBeenCalled();
  });
});

describe('presentation assignment service — get or create', () => {
  it('creates on first visit, keyed on (project, story) so a double click yields ONE row', async () => {
    const r0 = row();
    model.findOrCreate.mockResolvedValue([r0, true]);
    const r = await getOrCreateAssignment('e1', 'p1', 'PREP-3');
    expect(r.ok).toBe(true);
    const call = model.findOrCreate.mock.calls[0][0];
    // The unique index presentation_assignments_unique_task backs this — a constraint,
    // not a read-then-write that two concurrent requests can both win.
    expect(call.where).toEqual({ project_id: 'p1', story_id: 'PREP-3' });
  });

  it('defaults the template from the task, and does NOT mark it required', async () => {
    model.findOrCreate.mockResolvedValue([row(), false]);
    await getOrCreateAssignment('e1', 'p1', 'PREP-1');
    const defaults = model.findOrCreate.mock.calls[0][0].defaults;
    expect(defaults.template_slug).toBe('project_introduction');
    // A row existing because a student opened the page is not an instructor
    // requiring the presentation of them.
    expect(defaults.required).toBe(false);
    expect(defaults.prep_state).toBe('not_started');
  });

  it('surfaces a row pointing at a template that no longer ships, rather than silently re-scoping it', async () => {
    model.findOrCreate.mockResolvedValue([row({ template_slug: 'retired_template' }), false]);
    const r = await getOrCreateAssignment('e1', 'p1', 'PREP-3');
    expect(r).toEqual({ ok: false, reason: 'unknown_template' });
  });

  it('exposes the template checklist so the UI never invents its own items', async () => {
    model.findOrCreate.mockResolvedValue([row(), false]);
    const r = await getOrCreateAssignment('e1', 'p1', 'PREP-3');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.view.checklistItems.length).toBeGreaterThan(3);
  });
});

describe('presentation assignment service — updates', () => {
  it('refuses an unknown template instead of quietly keeping the old one', async () => {
    const r0 = row();
    model.findOrCreate.mockResolvedValue([r0, false]);
    const r = await updateAssignment('e1', 'p1', 'PREP-3', { templateId: 'nope' });
    expect(r).toEqual({ ok: false, reason: 'unknown_template' });
    expect((r0 as any).update).not.toHaveBeenCalled();
  });

  it('derives prep_state server-side — a client cannot declare itself ready', async () => {
    const r0 = row();
    model.findOrCreate.mockResolvedValue([r0, false]);
    model.findOne.mockResolvedValue(r0);
    await updateAssignment('e1', 'p1', 'PREP-3', { audience: 'Hiring managers' });
    expect((r0 as any).update).toHaveBeenCalledWith(expect.objectContaining({ prep_state: 'preparing' }));
  });

  it('reaches "ready" only once enough of the checklist is actually ticked', async () => {
    const r0 = row();
    model.findOrCreate.mockResolvedValue([r0, false]);
    model.findOne.mockResolvedValue(r0);
    await updateAssignment('e1', 'p1', 'PREP-3', { checklist: { a: true, b: true, c: true } });
    expect((r0 as any).update).toHaveBeenCalledWith(expect.objectContaining({ prep_state: 'ready' }));
  });

  it('preserves other keys when one field is patched', async () => {
    const r0 = row({ checklist_json: { purpose: 'Keep me', items: { a: true } } });
    model.findOrCreate.mockResolvedValue([r0, false]);
    model.findOne.mockResolvedValue(r0);
    await updateAssignment('e1', 'p1', 'PREP-3', { audience: 'New audience' });
    const patch = (r0 as any).update.mock.calls[0][0];
    expect(patch.checklist_json.purpose).toBe('Keep me');
    expect(patch.checklist_json.items).toEqual({ a: true });
  });
});

/**
 * THE SINGLE-WRITER GUARD.
 *
 * `purpose` is a durable learner fact living inside the shared `checklist_json` JSONB
 * column. This repo has already lost a durable fact exactly this way: a hand-off stored
 * inside a JSONB column that ANOTHER module cached by replacing the column whole was
 * silently erased, and every unit test passed because each writer was correct on its own.
 *
 * The right long-term shape is its own column. It is not that today because
 * `ensurePresentationStudioSchema.ts` sits at the 500-line hard ceiling, so adding one
 * requires splitting the module — a change that would also invalidate an
 * already-verified task mid-phase. The trade is recorded in the session log.
 *
 * What makes the current shape safe is this test, which is the mitigation that incident
 * recommended: it reads the source and fails if a SECOND runtime writer of
 * `checklist_json` appears, or if any writer replaces the column instead of merging into
 * it. A future whole-column write fails CI rather than erasing a student's answers.
 */
describe('checklist_json has exactly one writer, and that writer merges', () => {
  const serviceDir = path.join(__dirname, '..');
  const sources = fs.readdirSync(serviceDir)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => ({ file: f, text: fs.readFileSync(path.join(serviceDir, f), 'utf8') }));

  it('positive control: the source scan actually read the service files', () => {
    // Without this, a readdir that silently returned nothing would make the
    // assertions below vacuously true.
    expect(sources.length).toBeGreaterThan(3);
    expect(sources.some((s) => s.file === 'presentationAssignmentService.ts')).toBe(true);
  });

  it('only presentationAssignmentService writes checklist_json', () => {
    const writers = sources
      .filter((s) => /checklist_json\s*:/.test(s.text))
      .map((s) => s.file);
    expect(writers).toEqual(['presentationAssignmentService.ts']);
  });

  it('that writer spreads the existing value rather than replacing the column', () => {
    const src = sources.find((s) => s.file === 'presentationAssignmentService.ts')!.text;
    // The merge is what stops a patch of one field wiping the others.
    expect(src).toMatch(/\{\s*\.\.\.current\s*\}/);
    expect(src).toMatch(/checklist_json:\s*nextChecklist/);
  });
});
