import { PRESENTATION_TEMPLATE_IDS } from '.';

/**
 * ONE PREP TASK, ONE PRESENTATION TYPE.
 *
 * Ali, 2026-10-24: "We need to backfill presentation task to make sure they
 * match one per presentation type."
 *
 * WHAT IT WAS BEFORE. The task to type link existed but was a MUTABLE PER
 * LEARNER VALUE on `presentation_assignments.template_slug`, written by whatever
 * the learner last clicked — including the portfolio's empty-slot deep link,
 * which persists a type as a side effect of navigating. So it drifted. Measured
 * across production on 2026-10-23:
 *
 *   PREP-1  project_introduction  x8   final_showcase x2   working_system_demo x1
 *   PREP-2  working_system_demo   x7   project_introduction x1
 *   PREP-3  ai_visual_presentation x4
 *   PREP-5  final_showcase        x4
 *   PREP-6  final_showcase        x4   working_system_demo x1
 *
 * One project had PREP-1 carrying `architecture_review` on a task titled "Write
 * the demo narrative". Nobody decided that; it is where the learner happened to
 * leave the pointer. A curriculum fact cannot live in a field the UI writes to
 * as a side effect, so it lives here instead.
 *
 * THE ORDER, AND WHY THIS ORDER. Two constraints pulled against each other:
 * a ladder that climbs (short and introductory first, the capstone last), and
 * not churning what 49 live projects already have. Where an existing majority
 * was already sensible it is kept — PREP-1 introduction, PREP-2 working demo,
 * PREP-3 visual, PREP-5 final showcase are the mappings most projects already
 * carry. The three that had no settled value take the remaining types.
 *
 * Reordering is a one-line edit here, and it is Ali's call rather than a
 * technical one. Nothing else in the codebase hardcodes the pairing.
 */

/**
 * Demo Day is live and staff-marked. It is not a video and has no type.
 *
 * STILL PREP-6 TODAY. The ladder this table was written for puts Demo Day at
 * PREP-8 and makes 6 and 7 video tasks — but `PREP-6` is hardcoded as Demo Day
 * in eight non-test places across both stacks (points, the evidence panel,
 * instructor metrics, the staff marking route, the prompt service, the admin
 * panel default, and two spots in the Studio). Moving it is a cross-cutting
 * refactor where a single missed reference silently stops Demo Day being
 * staff-verified, so it gets its own change rather than riding along here.
 */
export const DEMO_DAY_PREP_ID = 'PREP-6';

/**
 * THE TWO TYPES WITH NO TASK YET, and why that is stated rather than hidden.
 *
 * Seven types, five task slots: PREP-1..5 are videos, PREP-6 is Demo Day. Until
 * Demo Day moves, `architecture_review` and `client_handoff` are recordable
 * from an empty portfolio slot and paid exactly like the rest — they simply
 * have no task of their own asking for them.
 *
 * A PREVIOUS VERSION OF THIS TABLE MAPPED PREP-6 TO `architecture_review` while
 * the rest of the system still treated PREP-6 as Demo Day. That shipped on
 * 2026-10-24 and made one task claim both things at once: "Staff marks this
 * one", paying 60, while the Studio coached an Architecture Review video on it.
 * Listing the gap is how that stays impossible to reintroduce by accident.
 */
export const TYPES_WITHOUT_A_TASK: readonly string[] = ['architecture_review', 'client_handoff'];

export const PREP_TASK_VIDEO_TYPES: ReadonlyArray<{ storyId: string; typeId: string }> = [
  { storyId: 'PREP-1', typeId: 'project_introduction' },
  { storyId: 'PREP-2', typeId: 'working_system_demo' },
  { storyId: 'PREP-3', typeId: 'ai_visual_presentation' },
  { storyId: 'PREP-4', typeId: 'stakeholder_update' },
  { storyId: 'PREP-5', typeId: 'final_showcase' },
];

/** The type a prep task is about, or null for Demo Day and anything unknown. */
export function videoTypeForPrepTask(storyId: string | null | undefined): string | null {
  if (!storyId) return null;
  return PREP_TASK_VIDEO_TYPES.find((r) => r.storyId === storyId)?.typeId ?? null;
}

/** The task that owns a type, so a portfolio slot can link to its task. */
export function prepTaskForVideoType(typeId: string | null | undefined): string | null {
  if (!typeId) return null;
  return PREP_TASK_VIDEO_TYPES.find((r) => r.typeId === typeId)?.storyId ?? null;
}

/**
 * Every type is spoken for, exactly once.
 *
 * Exported rather than left to the test file because the invariant is the whole
 * point of the table: a type with no task is a video nobody is asked to record,
 * and a type on two tasks is two tasks asking for the same video. Callers that
 * build a ladder from this can assert it cheaply.
 */
export function mappingProblems(): string[] {
  const problems: string[] = [];
  const mapped = PREP_TASK_VIDEO_TYPES.map((r) => r.typeId);
  const known = new Set(PRESENTATION_TEMPLATE_IDS);

  for (const t of mapped) {
    if (!known.has(t)) problems.push(`unknown type: ${t}`);
  }
  // Every type is either on a task or on the declared gap list. A type that is
  // on neither has been forgotten, which is the failure worth catching.
  for (const t of known) {
    if (!mapped.includes(t) && !TYPES_WITHOUT_A_TASK.includes(t)) {
      problems.push(`type with no task and not declared as a gap: ${t}`);
    }
  }
  for (const t of TYPES_WITHOUT_A_TASK) {
    if (!known.has(t)) problems.push(`gap names a type that does not exist: ${t}`);
    if (mapped.includes(t)) problems.push(`type is both mapped and declared a gap: ${t}`);
  }
  // Demo Day is not a video. A table that gave it one is what produced the
  // 2026-10-24 contradiction described above.
  if (PREP_TASK_VIDEO_TYPES.some((r) => r.storyId === DEMO_DAY_PREP_ID)) {
    problems.push(`${DEMO_DAY_PREP_ID} is Demo Day and must not carry a video type`);
  }
  const seenType = new Set<string>();
  for (const t of mapped) {
    if (seenType.has(t)) problems.push(`type on two tasks: ${t}`);
    seenType.add(t);
  }
  const seenStory = new Set<string>();
  for (const { storyId } of PREP_TASK_VIDEO_TYPES) {
    if (seenStory.has(storyId)) problems.push(`task listed twice: ${storyId}`);
    seenStory.add(storyId);
  }
  if (mapped.includes(DEMO_DAY_PREP_ID as string)) problems.push('Demo Day must not carry a type');
  return problems;
}
