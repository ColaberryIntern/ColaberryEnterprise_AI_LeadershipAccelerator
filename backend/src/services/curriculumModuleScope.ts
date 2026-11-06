/**
 * curriculumModuleScope — `curriculum_modules` belongs to the PROGRAM, not to a cohort.
 *
 * Ali settled this on 2026-11-06 (C10.14): "We should not be holding curriculum
 * per cohort - everyone can use the same curriculum until future notice."
 *
 * ── THE DECISION WAS ALREADY TRUE OF THE LIVE CURRICULUM ──────────────────────
 *
 * The curriculum students actually see is `timeline_cards`, and it is already
 * shared. `services/timeline/curriculumScope.globalCurriculumWhere()` selects
 * `cohort_id: null` and is the single source of truth for every student-facing
 * reader; `acceleratorCohortCurriculumService` states the rule outright - "the
 * timeline is COURSE-scoped, not cohort-scoped ... one curriculum is shared
 * across every cohort of that course", reached through `cohorts.program_id` and
 * never through a card's `cohort_id`. So nothing here changes what a student is
 * taught. This module brings the LEGACY authoring table into line with it.
 *
 * ── WHY THE LEGACY TABLE STILL MATTERED ───────────────────────────────────────
 *
 * `curriculum_modules.cohort_id` is NOT NULL, and the table is empty for every
 * live cohort - the repo says so itself in two places (`acceleratorRoutes`: "the
 * pre-Timeline authoring model and is empty for every live cohort";
 * `acceleratorCohortCurriculumService`: "effectively dead: nothing in the
 * Composer writes it"). In production, all 5 rows that exist belong to the
 * COMPLETED April 2026 cohort. That combination had three consequences:
 *
 *   1. `initializeParticipantCurriculum` threw `No curriculum modules found for
 *      cohort <id>` for anyone in a batch without its own rows - which is every
 *      live batch. It is why `/portal/curriculum` is now a redirect to
 *      `/portal/today`: the page "500'd on every open (found 2026-07-30 via a
 *      real student report)".
 *   2. `handleGetProgramModules` - a PROGRAM-wide admin endpoint feeding four
 *      live Orchestration tabs - faked a global scope by filtering on whichever
 *      cohort happened to be oldest (`getFirstCohortId`). It returned the right
 *      answer only because one cohort holds every row.
 *   3. `directives/run-monthly-enrollment-batches.md` therefore told the
 *      operator to materialize modules for each new batch before anyone opened
 *      the portal. Twelve batches a year is twelve copies a year, which is
 *      precisely the thing Ali's decision rules out.
 *
 * So the cohort term was never selecting a cohort's curriculum. It was selecting
 * whether the query found anything at all.
 *
 * ── WHY cohort_id IS LEFT IN THE SCHEMA ───────────────────────────────────────
 *
 * Dropping a NOT NULL column is a schema redesign, which is an ESCALATE-tier
 * decision under the Autonomy Model, and it is not needed to honour the
 * decision: no reader scopes by it any more, and the writers are seeds that each
 * pin their own cohort. `timeline_cards` keeps its own nullable `cohort_id` on
 * the same reasoning - "kept nullable for a possible future per-cohort
 * override". "Until future notice" is a reversible instruction, and leaving the
 * column makes reversing it a code change rather than a migration.
 *
 * Note for anyone adding a writer: there is no database-level uniqueness on
 * `(cohort_id, module_number)` - the four seeds that use `findOrCreate` on that
 * pair are relying on a convention the schema does not enforce.
 */
import CurriculumModule from '../models/CurriculumModule';
import CurriculumLesson from '../models/CurriculumLesson';

/**
 * The include + order every module reader wants: lessons attached, modules in
 * teaching order, lessons in teaching order within each module.
 *
 * Shared because four call sites had written it out separately and had already
 * drifted - two ordered lessons in SQL, one sorted them in JS afterwards, and
 * one did not order them at all.
 */
function moduleQuery(where: Record<string, unknown>, lessonAttributes?: string[]) {
  const lessonInclude: Record<string, unknown> = { model: CurriculumLesson, as: 'lessons' };
  if (lessonAttributes) lessonInclude.attributes = lessonAttributes;
  return {
    where,
    include: [lessonInclude],
    order: [
      ['module_number', 'ASC'],
      [{ model: CurriculumLesson, as: 'lessons' }, 'lesson_number', 'ASC'],
    ],
  } as any;
}

/**
 * Every module of the shared curriculum, in teaching order, lessons attached.
 *
 * There is deliberately no cohort parameter. A caller that has a cohort id in
 * hand does not need it: the curriculum is the same for all of them.
 */
export async function findSharedModules(lessonAttributes?: string[]): Promise<CurriculumModule[]> {
  return CurriculumModule.findAll(moduleQuery({}, lessonAttributes));
}

/**
 * One module of the shared curriculum by its number, lessons attached.
 *
 * Used by the progression unlock, which previously asked for "the next module
 * IN THIS MODULE'S COHORT". With a shared curriculum the cohort is noise, and
 * keeping it would have stalled progression for any learner whose module rows
 * came from a different cohort than their own - the exact situation of the one
 * July 2026 learner in production who holds 25 lesson instances against the
 * April 2026 cohort's modules.
 */
export async function findSharedModuleByNumber(moduleNumber: number): Promise<CurriculumModule | null> {
  return CurriculumModule.findOne(moduleQuery({ module_number: moduleNumber }));
}
