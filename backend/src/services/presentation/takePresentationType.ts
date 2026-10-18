import { PRESENTATION_TEMPLATE_IDS, templateById } from './index';

/**
 * WHAT KIND OF PRESENTATION A TAKE IS, as the learner classifies it.
 *
 * Ali asked for Practice to make the learner choose, so demos can be categorised
 * and so the kind travels with the post: a cohort scrolling the feed should be
 * able to tell a 90-second project introduction from a full showcase before
 * pressing play.
 *
 * ONE VOCABULARY, REUSED. These are the same seven template ids the Learn stage
 * already offers — `project_introduction`, `working_system_demo`, `final_showcase`
 * and the rest. A second, parallel list of "video kinds" would drift from the
 * templates within a month and then mean two different things in two places.
 *
 * PER TAKE, NOT PER TASK. The task carries a template, but a learner records
 * several takes against it and may deliberately record a short introduction and a
 * full showcase in the same booked room. Storing it on the task would make the
 * second one a lie.
 *
 * NULL IS A REAL STATE, not a default. A take recorded before this existed, or one
 * the learner has not classified yet, genuinely has no type — and the UI uses that
 * to insist on a choice before the take can be shared, rather than silently filing
 * everything as whatever the task happened to be set to.
 */

export interface PresentationTypeOption {
  id: string;
  label: string;
  /** The four the chooser shows first; the rest sit behind "more types". */
  prominent: boolean;
  /** Speaking time the template expects, so the chooser can show it. */
  defaultSeconds: number;
}

export function isPresentationType(value: unknown): value is string {
  return typeof value === 'string' && PRESENTATION_TEMPLATE_IDS.includes(value);
}

/** The label a learner reads. Null for an unknown or unset id, never a guess. */
export function presentationTypeLabel(id: unknown): string | null {
  if (!isPresentationType(id)) return null;
  return templateById(id)?.label ?? null;
}

/** The chooser's options, prominent ones first, in template order. */
export function presentationTypeOptions(): PresentationTypeOption[] {
  const all = PRESENTATION_TEMPLATE_IDS
    .map((id) => templateById(id))
    .filter((t): t is NonNullable<typeof t> => Boolean(t))
    .map((t) => ({
      id: t.id,
      label: t.label,
      prominent: Boolean((t as any).prominent),
      defaultSeconds: Number((t as any).defaultSeconds) || 0,
    }));
  // Stable: prominent first, otherwise template order. `sort` is stable in Node,
  // so equal keys keep the order the registry declared.
  return [...all].sort((a, b) => Number(b.prominent) - Number(a.prominent));
}

async function db() {
  const { sequelize } = await import('../../config/database');
  return sequelize;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SetTypeResult =
  | { ok: true; recordingId: string; presentationType: string; label: string }
  | { ok: false; reason: 'not_found' | 'bad_type' };

/**
 * Record what kind of presentation this take is.
 *
 * OWNERSHIP IS IN THE WHERE CLAUSE, not checked separately and then written: a
 * read-then-write would let a learner classify somebody else's rehearsal if the
 * two statements ever drifted apart. Not theirs is indistinguishable from not
 * there.
 */
export async function setTakePresentationType(
  enrollmentId: string,
  projectId: string,
  storyId: string,
  recordingId: string,
  presentationType: string,
): Promise<SetTypeResult> {
  if (!isPresentationType(presentationType)) return { ok: false, reason: 'bad_type' };
  if (!UUID.test(recordingId)) return { ok: false, reason: 'not_found' };

  const sequelize = await db();
  const [rows] = await sequelize.query(
    `UPDATE presentation_recordings r
        SET presentation_type = :presentationType, updated_at = NOW()
       FROM presentation_attempts    a,
            presentation_assignments asg
      WHERE r.id = :recordingId
        AND a.id = r.attempt_id
        AND asg.id = a.assignment_id
        AND asg.enrollment_id = :enrollmentId
        AND asg.project_id    = :projectId
        AND asg.story_id      = :storyId
      RETURNING r.id`,
    {
      replacements: {
        presentationType, recordingId, enrollmentId, projectId, storyId,
      },
    },
  ) as [Array<{ id: string }>, unknown];

  if (!rows?.length) return { ok: false, reason: 'not_found' };
  return {
    ok: true,
    recordingId: String(rows[0].id),
    presentationType,
    label: presentationTypeLabel(presentationType) || presentationType,
  };
}
