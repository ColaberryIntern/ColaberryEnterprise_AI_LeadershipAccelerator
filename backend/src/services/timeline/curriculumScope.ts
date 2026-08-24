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
 * The one `visibility` value a student may be served or may act against.
 *
 * `timeline_cards.visibility` is a plain VARCHAR(20) with no CHECK constraint —
 * the four contract values (`draft` | `scheduled` | `published` | `archived`,
 * per `TimelineCard.TimelineCardVisibility`) are enforced only at the
 * TypeScript/zod layer, so the database will accept any short string. The
 * predicate below is therefore written as an ALLOW-LIST ("is published"), never
 * as a deny-list ("is not archived"): a value nobody anticipated must fail
 * closed, not sail through.
 */
export const SERVABLE_CARD_VISIBILITY = 'published';

/**
 * May this card be served to a student, and will an action against it succeed?
 *
 * Pure — the predicate form of {@link servableCardWhere}. This is the single
 * shared answer for BOTH sides of the contract, which is the whole point:
 *
 *   - the READ side (what reaches a student's feed), and
 *   - the WRITE side (`openCard`, `dwell`, `watch`, the assessment, field-guide,
 *     build-artifact and architect handlers), which all 404 "Card not available"
 *     on anything else.
 *
 * WHY THIS EXISTS: those two sides disagreed. The Today feed is an append-only
 * snapshot (`today_feed_impressions`), and its serve path replayed a card id
 * forever without ever re-consulting the live row — while the retention job
 * (`generatedContentRetention.pruneGeneratedContent`) flips cards to `archived`
 * on an 18-day cycle. The card kept rendering and every action against it 404'd:
 * Collect Points froze at "0s of 120s" because the dwell beats were rejected,
 * so the gate could never be satisfied and the button never appeared. Half of a
 * sampled 40-item feed was dead this way.
 *
 * Kept in this leaf module, next to {@link globalCurriculumWhere}, for the
 * reason that helper was centralised in the first place: two copies of the rule
 * drift apart, and the drift is invisible until a student hits it.
 */
export function isCardServable(visibility: string | null | undefined): boolean {
  return visibility === SERVABLE_CARD_VISIBILITY;
}

/**
 * The `visibility` fragment of a student-facing query. Use wherever a reader
 * selects cards a student may actually act on.
 */
export function servableCardWhere(): Record<string, unknown> {
  return { visibility: SERVABLE_CARD_VISIBILITY };
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
    ...servableCardWhere(),
    program_id: sharedCurriculumProgramWhere(),
  };
}
