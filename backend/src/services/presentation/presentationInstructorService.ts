import { getSetting, setSetting } from '../settingsService';
import PresentationAssignment from '../../models/PresentationAssignment';
import { templateById, PRESENTATION_TEMPLATES, DEFAULT_REQUIRED_TEMPLATE_ID } from '.';

/**
 * Instructor controls for the Presentation Studio.
 *
 * SCOPED, NOT GLOBAL. The build spec is explicit that instructor settings must override
 * defaults "without moving every legacy curriculum instance globally", so the required
 * template is stored per cohort rather than on the curriculum type. Setting it for one
 * cohort cannot touch another cohort, an existing card, or any already-materialised task.
 *
 * STORED AS AN OPERATOR SETTING, NOT A NEW TABLE. `settingsService` is this repo's
 * convention for operator-tunable runtime behaviour, and a per-cohort key needs no
 * schema change and no migration. It is also the difference between an instructor
 * changing the required template before class and an instructor filing a ticket.
 *
 * CHANGING IT IS NOT RETROACTIVE. An assignment already created keeps the template the
 * learner has been preparing against — silently re-pointing it would throw away their
 * Prepare answers and the deck they may already have built. The new default applies to
 * assignments created after the change, and an instructor who genuinely wants to move a
 * student does it per assignment, deliberately.
 */

const key = (cohortId: string) => `presentation_required_template:${cohortId}`;

export interface CohortTemplateSetting {
  cohortId: string;
  templateId: string;
  /** False when nothing has been configured and the programme default is in force. */
  configured: boolean;
}

export async function getCohortRequiredTemplate(cohortId: string): Promise<CohortTemplateSetting> {
  const raw = await getSetting(key(cohortId));
  const value = typeof raw === 'string' ? raw : '';
  // A setting naming a template that no longer ships falls back rather than breaking
  // every student in the cohort — but `configured` stays true so the instructor view
  // can show that what they chose is gone.
  if (value && templateById(value)) return { cohortId, templateId: value, configured: true };
  return { cohortId, templateId: DEFAULT_REQUIRED_TEMPLATE_ID, configured: Boolean(value) };
}

export type SetResult =
  | { ok: true; setting: CohortTemplateSetting }
  | { ok: false; reason: 'unknown_template' };

export async function setCohortRequiredTemplate(cohortId: string, templateId: string): Promise<SetResult> {
  if (!templateById(templateId)) return { ok: false, reason: 'unknown_template' };
  await setSetting(key(cohortId), templateId);
  return { ok: true, setting: { cohortId, templateId, configured: true } };
}

export function listTemplatesForInstructor() {
  return PRESENTATION_TEMPLATES.map((t) => ({
    id: t.id,
    label: t.label,
    prominent: t.prominent,
    outcome: t.outcome,
    speaking_seconds: t.defaultSeconds,
    qa_seconds: t.qaSeconds,
    structure: t.structure,
  }));
}

export interface CohortReadinessRow {
  projectId: string;
  storyId: string;
  enrollmentId: string | null;
  templateId: string;
  prepState: string;
  hasAudience: boolean;
}

/**
 * Who in this cohort has actually started preparing.
 *
 * Counts are derived from persisted answers, never from intent: `prep_state` is the
 * value the server computed from what a learner filled in, and `hasAudience` is a fact
 * about a stored field. Nothing here infers readiness from a student having opened a page.
 */
export async function cohortReadiness(cohortId: string): Promise<CohortReadinessRow[]> {
  const rows = await PresentationAssignment.findAll({
    where: { cohort_id: cohortId },
    order: [['story_id', 'ASC'], ['created_at', 'ASC']],
  });
  return rows.map((r) => ({
    projectId: r.project_id,
    storyId: r.story_id,
    enrollmentId: r.enrollment_id,
    templateId: r.template_slug,
    prepState: r.prep_state,
    hasAudience: Boolean((r.audience || '').trim()),
  }));
}
