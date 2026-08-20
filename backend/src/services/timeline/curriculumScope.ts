/**
 * curriculumScope — which cards belong to the ONE shared student curriculum.
 *
 * `timeline_cards` is a shared table. A card is addressed by (program_id, week,
 * bucket, order); `program_id` is what selects the *course*, exactly as the
 * admin timeline already treats it (`timelineAdminService.listTimeline`, where
 * "program_id selects the course").
 *
 * The student-side readers, however, historically selected only on
 * `cohort_id IS NULL AND status='active' AND visibility='published'`, on the
 * assumption — written into their doc comments — that the platform ran exactly
 * one curriculum, so global scope and "the Accelerator" were the same set.
 *
 * That assumption ended on 2026-08-19, when a second program was authored into
 * the same table at global scope. Its published cards immediately matched the
 * student query and rendered inside the Accelerator classroom, interleaved with
 * the real weeks 1-3 as apparent empty duplicates. Scoping is therefore not a
 * refinement here, it is the correctness boundary between two courses.
 *
 * Legacy rows with `program_id IS NULL` (authored before the column existed)
 * remain in scope, so this narrows the result set by exactly one thing: cards
 * that explicitly declare a different program.
 */
import { Op } from 'sequelize';
import { CANONICAL_PROGRAM_ID } from '../../data/weekBlueprints';

export { CANONICAL_PROGRAM_ID };

/**
 * Does a card's `program_id` place it inside the shared student curriculum?
 * True for the canonical program and for legacy nulls; false for any other
 * program. Pure — the predicate form of {@link sharedCurriculumProgramWhere}.
 */
export function isSharedCurriculumProgram(programId: string | null | undefined): boolean {
  const p = programId ?? null;
  return p === null || p === CANONICAL_PROGRAM_ID;
}

/**
 * The `program_id` fragment of a student-curriculum query:
 * `program_id = <canonical> OR program_id IS NULL`.
 */
export function sharedCurriculumProgramWhere(): Record<symbol, unknown> {
  return { [Op.or]: [CANONICAL_PROGRAM_ID, null] };
}

/**
 * The full WHERE for the published, active cards of the shared student
 * curriculum. Single source of truth for every student-facing reader, so the
 * Classroom and the gating choke point cannot drift apart again.
 */
export function globalCurriculumWhere(): Record<string, unknown> {
  return {
    cohort_id: null,
    status: 'active',
    visibility: 'published',
    program_id: sharedCurriculumProgramWhere(),
  };
}
