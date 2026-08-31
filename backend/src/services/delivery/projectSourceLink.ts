/**
 * projectSourceLink — attach an existing student `Project` to a delivery context.
 *
 * `DeliveryProjectSourceLink` shipped as a model and a table with **no service and no
 * route**: nothing in the codebase referenced it outside schema tests. Scenario E's chain
 * (*existing Project → linked to delivery context → enrollment/program intact*) therefore
 * had no writer to exercise.
 *
 * ## The whole design is "do not touch the student row"
 *
 * Master plan §24 lists *"student `Project` behavior regresses"* as a stop condition. The
 * safest way to keep a row unchanged is for the code that links it to have no ability to
 * change it, so this module **never loads the student project through a writable path and
 * never calls update, save or destroy on it.** The link lives entirely in its own table.
 *
 * That is stronger than being careful. A service that read the row, mutated a
 * `delivery_project_id` field on it and saved would satisfy every other requirement of the
 * feature while breaking the one property that matters — and it would look completely
 * reasonable in review.
 *
 * ## Existence is checked, not assumed
 *
 * A link to a student project that does not exist is a dangling reference that only
 * surfaces later, in whatever tries to follow it. Both ends are verified before the row is
 * written.
 */

export type SourceLinkRefusalReason =
  | 'no_such_delivery_project'
  | 'no_such_student_project'
  | 'reason_required';

export interface SourceLinkRefusal {
  ok: false;
  reason: SourceLinkRefusalReason;
  message: string;
}

export interface SourceLinkResult {
  ok: true;
  linkId: string;
  /** False when the link already existed. Replaying a link is not an error. */
  created: boolean;
}

/**
 * Link an existing student project into a delivery project.
 *
 * Idempotent on `(delivery_project_id, student_project_id)`: linking the same pair twice
 * returns the existing row rather than creating a second one. Two links between the same
 * pair would make "where did this project come from" ambiguous, and an operator clicking
 * twice is the normal case, not the exceptional one.
 */
export async function linkStudentProject(input: {
  deliveryProjectId: string;
  studentProjectId: string;
  reason: string;
  actorIdentityId?: string | null;
  models: any;
}): Promise<SourceLinkResult | SourceLinkRefusal> {
  const { models } = input;

  // Free text, but not optional. "Why is this student's coursework inside a client
  // engagement" is a question with real consequences, and the moment of linking is the
  // only time anybody knows the answer.
  if (!input.reason || !input.reason.trim()) {
    return {
      ok: false,
      reason: 'reason_required',
      message: 'A link must record why this student project was pulled into a delivery context.',
    };
  }

  const deliveryProject = await models.DeliveryProject.findOne({
    where: { id: input.deliveryProjectId },
  });
  if (!deliveryProject) {
    return {
      ok: false,
      reason: 'no_such_delivery_project',
      message: 'No such delivery project.',
    };
  }

  // Read-only, and only to prove it exists. Nothing below writes to this row, and nothing
  // in this module ever should — see the header.
  const studentProject = await models.Project.findOne({
    where: { id: input.studentProjectId },
    attributes: ['id'],
  });
  if (!studentProject) {
    return {
      ok: false,
      reason: 'no_such_student_project',
      message: 'No such student project.',
    };
  }

  const existing = await models.DeliveryProjectSourceLink.findOne({
    where: {
      delivery_project_id: input.deliveryProjectId,
      student_project_id: input.studentProjectId,
    },
  });
  if (existing) return { ok: true, linkId: existing.id, created: false };

  const row = await models.DeliveryProjectSourceLink.create({
    delivery_project_id: input.deliveryProjectId,
    student_project_id: input.studentProjectId,
    linked_by_identity_id: input.actorIdentityId ?? null,
    link_reason: input.reason.trim(),
  });

  return { ok: true, linkId: row.id, created: true };
}

/** The student projects linked into a delivery project. */
export async function linkedStudentProjects(input: {
  deliveryProjectId: string;
  models: any;
}): Promise<Array<{ studentProjectId: string; reason: string | null; linkedAt: Date }>> {
  const rows = await input.models.DeliveryProjectSourceLink.findAll({
    where: { delivery_project_id: input.deliveryProjectId },
  });
  return rows.map((r: any) => ({
    studentProjectId: r.student_project_id,
    reason: r.link_reason ?? null,
    linkedAt: r.created_at,
  }));
}
