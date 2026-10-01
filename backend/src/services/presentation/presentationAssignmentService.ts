import { getOwnedProjectTree } from '../projects/projectReadService';
import PresentationAssignment from '../../models/PresentationAssignment';
import { templateById } from '.';
import { defaultTemplateIdFor } from './presentationPromptService';

/**
 * The learner's Prepare answers for one demo-prep task: which template, who the
 * audience is, what the presentation is for, and how far through the checklist they
 * are.
 *
 * WHY A ROW RATHER THAN localStorage. The stage cursor is a per-viewer convenience and
 * lives in the browser. These answers are not: they feed the generated deck prompt, an
 * instructor needs to see them, and losing them to a cleared cache would cost the
 * student real work. The split is deliberate.
 *
 * IDEMPOTENT BY CONSTRUCTION. `findOrCreate` on `(project_id, story_id)` is backed by
 * the real unique index `presentation_assignments_unique_task`, so a double-submitted
 * "start preparing" produces one row rather than two competing assignments — and it is
 * a constraint, not a read-then-write that two concurrent requests can both win.
 *
 * NOTHING HERE COMPLETES A TASK. `markTaskVerifiedComplete` remains the only writer
 * that may set a prep task complete, and `prep_state` is the learner's own progress
 * through Prepare, never a claim that the task is done.
 */

/** What a learner may set. Everything else on the row is derived or server-owned. */
export interface AssignmentPatch {
  templateId?: string | null;
  audience?: string | null;
  purpose?: string | null;
  checklist?: Record<string, boolean> | null;
}

export interface AssignmentView {
  storyId: string;
  templateId: string;
  templateLabel: string;
  audience: string | null;
  purpose: string | null;
  checklist: Record<string, boolean>;
  prepState: string;
  /** Checklist items for the selected template, so the UI never invents its own. */
  checklistItems: string[];
}

export type AssignmentResult =
  | { ok: true; view: AssignmentView }
  | { ok: false; reason: 'not_found' | 'unknown_template' };

function toView(row: PresentationAssignment): AssignmentResult {
  const template = templateById(row.template_slug);
  // A row pointing at a template that no longer ships is a real inconsistency, not
  // something to paper over with a default — say so rather than silently re-scoping
  // the learner's work.
  if (!template) return { ok: false, reason: 'unknown_template' };
  return {
    ok: true,
    view: {
      storyId: row.story_id,
      templateId: row.template_slug,
      templateLabel: template.label,
      audience: row.audience,
      purpose: (row.checklist_json as Record<string, unknown>)?.purpose as string ?? null,
      checklist: ((row.checklist_json as Record<string, unknown>)?.items as Record<string, boolean>) || {},
      prepState: row.prep_state,
      checklistItems: template.checklist,
    },
  };
}

/**
 * Loads the learner's assignment for a task, creating it on first visit.
 *
 * The ownership check is `getOwnedProjectTree`, the same one the rest of the projects
 * surface uses: it compares the project's `enrollment_id` against the caller and
 * returns null otherwise. A miss is reported as `not_found` so the caller can 404 —
 * never 403, so probing another learner's project ids reveals nothing.
 */
export async function getOrCreateAssignment(
  enrollmentId: string,
  projectId: string,
  storyId: string,
): Promise<AssignmentResult> {
  const tree = await getOwnedProjectTree(enrollmentId, projectId);
  if (!tree) return { ok: false, reason: 'not_found' };

  const [row] = await PresentationAssignment.findOrCreate({
    where: { project_id: projectId, story_id: storyId },
    defaults: {
      project_id: projectId,
      story_id: storyId,
      enrollment_id: enrollmentId,
      template_slug: defaultTemplateIdFor(storyId),
      template_version: 1,
      // `required` stays false: an assignment existing because a student opened the
      // page is not the same as an instructor requiring it of them.
      required: false,
      prep_state: 'not_started',
      checklist_json: {},
    },
  });
  return toView(row);
}

export async function updateAssignment(
  enrollmentId: string,
  projectId: string,
  storyId: string,
  patch: AssignmentPatch,
): Promise<AssignmentResult> {
  const existing = await getOrCreateAssignment(enrollmentId, projectId, storyId);
  if (!existing.ok) return existing;

  if (patch.templateId && !templateById(patch.templateId)) {
    // Refused rather than ignored: silently keeping the old template would leave the
    // learner preparing for a presentation they did not choose.
    return { ok: false, reason: 'unknown_template' };
  }

  const row = await PresentationAssignment.findOne({ where: { project_id: projectId, story_id: storyId } });
  if (!row) return { ok: false, reason: 'not_found' };

  const current = (row.checklist_json || {}) as Record<string, unknown>;
  const nextChecklist: Record<string, unknown> = { ...current };
  if (patch.purpose !== undefined) nextChecklist.purpose = patch.purpose;
  if (patch.checklist !== undefined) nextChecklist.items = patch.checklist || {};

  // Derived, never client-set: a learner cannot declare themselves ready, and the
  // state is recomputed from what they have actually filled in.
  const items = (nextChecklist.items as Record<string, boolean>) || {};
  const ticked = Object.values(items).filter(Boolean).length;
  const audience = patch.audience !== undefined ? patch.audience : row.audience;
  const prepState = ticked > 0 || audience ? (ticked >= 3 ? 'ready' : 'preparing') : 'not_started';

  await row.update({
    ...(patch.templateId ? { template_slug: patch.templateId } : {}),
    ...(patch.audience !== undefined ? { audience: patch.audience } : {}),
    checklist_json: nextChecklist,
    prep_state: prepState,
  });

  return toView(row);
}
