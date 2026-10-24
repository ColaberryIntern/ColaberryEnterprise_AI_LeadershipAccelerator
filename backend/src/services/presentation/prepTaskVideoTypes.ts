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

/** Demo Day is live and staff-marked. It is not a video and has no type. */
export const DEMO_DAY_PREP_ID = 'PREP-8';

export const PREP_TASK_VIDEO_TYPES: ReadonlyArray<{ storyId: string; typeId: string }> = [
  { storyId: 'PREP-1', typeId: 'project_introduction' },
  { storyId: 'PREP-2', typeId: 'working_system_demo' },
  { storyId: 'PREP-3', typeId: 'ai_visual_presentation' },
  { storyId: 'PREP-4', typeId: 'stakeholder_update' },
  { storyId: 'PREP-5', typeId: 'final_showcase' },
  { storyId: 'PREP-6', typeId: 'architecture_review' },
  { storyId: 'PREP-7', typeId: 'client_handoff' },
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
  for (const t of known) {
    if (!mapped.includes(t)) problems.push(`type with no task: ${t}`);
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
