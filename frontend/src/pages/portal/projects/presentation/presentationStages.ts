/**
 * The six stages of the Presentation Studio, and which one a given demo-prep task
 * opens on.
 *
 * WHY A MAP AND NOT A RENAME. PREP-1..PREP-6 keep their ids, their titles, their
 * historical evidence, their points and their verified state — the Studio is a
 * workspace laid over them, not a replacement for them. A student who already
 * completed PREP-2 must not be asked to redo anything; they simply get better tools
 * around the same task. So this file maps, it never rewrites.
 *
 * The stage a task OPENS on is a starting point, not a restriction: every stage stays
 * reachable from the rail, because a student rehearsing PREP-4 often needs to reread
 * the Learn material or re-copy the Build prompt.
 */

export const PRESENTATION_STAGES = [
  'learn', 'prepare', 'build', 'practice', 'present', 'reflect',
] as const;

export type PresentationStage = (typeof PRESENTATION_STAGES)[number];

export interface StageMeta {
  id: PresentationStage;
  label: string;
  /** What the student is doing here, in their words — shown under the heading. */
  blurb: string;
}

export const STAGE_META: Record<PresentationStage, StageMeta> = {
  learn: {
    id: 'learn',
    label: 'Learn',
    blurb: 'Pick the kind of presentation this is, then see what good looks like for it.',
  },
  prepare: {
    id: 'prepare',
    label: 'Prepare',
    blurb: 'Decide who you are talking to and what story you are telling them.',
  },
  build: {
    id: 'build',
    label: 'Build',
    blurb: 'Turn that story into slides and a demo you can actually run.',
  },
  practice: {
    id: 'practice',
    label: 'Practice',
    blurb: 'Say it out loud, record it, and watch it back before anyone else does.',
  },
  present: {
    id: 'present',
    label: 'Present',
    blurb: 'Deliver it live to the audience you prepared for.',
  },
  reflect: {
    id: 'reflect',
    label: 'Reflect & Share',
    blurb: 'Pick the take you are proud of, and decide who gets to see it.',
  },
};

/**
 * Where each prep task starts. Derived from what the task actually asks for —
 * see `demoPrepGuide.ts`, which is still the source of truth for the instructions
 * themselves.
 */
const OPENS_ON: Record<string, PresentationStage> = {
  'PREP-1': 'prepare',  // write the narrative
  'PREP-2': 'practice', // first recorded walkthrough
  'PREP-3': 'build',    // the slides
  'PREP-4': 'practice', // rehearse with a person
  'PREP-5': 'reflect',  // the portfolio take, and who sees it
  'PREP-6': 'present',  // Demo Day itself
};

export function openingStageFor(storyId: string | undefined | null): PresentationStage {
  return (storyId && OPENS_ON[storyId]) || 'learn';
}

/**
 * Student-facing titles for the six prep tasks.
 *
 * A DISPLAY OVERRIDE, NOT A RENAME. The stored titles in `student_tasks` are untouched,
 * and so are the story ids, the evidence, the points, the due dates and the verified
 * state. Two reasons it is done here rather than in `buildSchedule.ts`:
 *
 * 1. Changing the schedule would only affect NEWLY materialised tasks, so a cohort
 *    mid-programme would end up with some students on old titles and some on new —
 *    worse than either option alone.
 * 2. It is reversible with the feature flag. Flag off, the student sees exactly the
 *    title they see today, because this module is never loaded.
 *
 * The PREP id stays visible alongside the title, so a student mentioning "PREP-3" to a
 * mentor and a mentor searching for it still meet in the middle.
 */
const STUDENT_TITLES: Record<string, string> = {
  'PREP-1': "Tell Your Project's Story",
  'PREP-2': 'Your First Recorded Walkthrough',
  'PREP-3': 'Build Your AI Presentation',
  'PREP-4': 'Rehearse With an Audience',
  'PREP-5': 'Create Your Portfolio Demo',
  'PREP-6': 'Present Your Project Live',
};

/**
 * The student-facing title, or null when there is no override — in which case the
 * caller shows the stored title rather than inventing one.
 */
export function studentTitleFor(storyId: string | undefined | null): string | null {
  return (storyId && STUDENT_TITLES[storyId]) || null;
}

export function isPresentationStage(value: unknown): value is PresentationStage {
  return typeof value === 'string'
    && (PRESENTATION_STAGES as readonly string[]).includes(value);
}

/**
 * Per-viewer convenience only: which stage this student last had open, so returning to
 * a task does not dump them back at the start. Deliberately localStorage and not the
 * server — it is a cursor, not evidence, and losing it costs a click.
 *
 * Every access is wrapped: storage throws in a private window and can come back empty
 * after a cache clear, and neither should break the workspace.
 */
const key = (projectId: string, storyId: string) => `cb.studio.stage.${projectId}.${storyId}`;

export function readSavedStage(projectId: string, storyId: string): PresentationStage | null {
  try {
    const v = window.localStorage.getItem(key(projectId, storyId));
    return isPresentationStage(v) ? v : null;
  } catch {
    return null;
  }
}

export function saveStage(projectId: string, storyId: string, stage: PresentationStage): void {
  try {
    window.localStorage.setItem(key(projectId, storyId), stage);
  } catch {
    /* private window or storage disabled — the cursor is a nicety, never a requirement */
  }
}
