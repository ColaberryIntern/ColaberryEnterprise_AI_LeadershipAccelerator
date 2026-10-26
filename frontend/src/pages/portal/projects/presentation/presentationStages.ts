/**
 * The five stages of the Presentation Studio, and which one a given demo-prep task
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
  'learn', 'prepare', 'build', 'practice', 'present',
] as const;

export type PresentationStage = (typeof PRESENTATION_STAGES)[number];

/**
 * `reflect` WAS A STAGE AND IS NOT ANY MORE.
 *
 * Present and Reflect & Share were two placeholder steps that each rendered a
 * "not built yet" notice and read and wrote nothing. They are now one step,
 * Present & Share, which holds the portfolio and the rehearsal notes.
 *
 * The id has to keep resolving rather than 404 or silently fall back to Learn.
 * Three things still point at it: bookmarks, `readSavedStage` in a learner's
 * localStorage, and PREP-5's own opening stage. Mapping it is one line; failing
 * to map it drops a student on the wrong screen with no explanation.
 */
const RETIRED_STAGES: Record<string, PresentationStage> = {
  reflect: 'present',
};

/** A current stage id, or the stage a retired id now means. Null if neither. */
export function resolveStage(value: unknown): PresentationStage | null {
  if (typeof value !== 'string') return null;
  if ((PRESENTATION_STAGES as readonly string[]).includes(value)) {
    return value as PresentationStage;
  }
  return RETIRED_STAGES[value] ?? null;
}

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
    label: 'Present & Share',
    // Both halves of what used to be two steps: the portfolio of what you have
    // recorded, and the decision about who sees each one.
    blurb: 'Your portfolio, one video per kind of presentation — and who gets to see each.',
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
  'PREP-5': 'present',  // the portfolio take, and who sees it - 'reflect' was merged in
  'PREP-6': 'present',  // Demo Day itself
};

export function openingStageFor(storyId: string | undefined | null): PresentationStage {
  return (storyId && OPENS_ON[storyId]) || 'learn';
}

/**
 * Student-facing titles for the six prep tasks.
 *
 * THESE NOW MATCH THE STORED TITLES RATHER THAN REPLACING THEM, since
 * 2026-10-24. The override began as a display-only rename, on the reasoning
 * that changing `buildSchedule` would only affect newly materialised tasks and
 * split a mid-programme cohort between old names and new.
 *
 * What that reasoning missed is that exactly ONE component calls
 * `studentTitleFor` — the Studio sidebar. So PREP-1 was "Tell Your Project's
 * Story" in the sidebar and "Write the Demo Narrative: the Problem, the One
 * Moment, the Guardrail" everywhere else: two names for one task, which is
 * worse than either name. Ali saw both and said the step names do not match
 * the video names.
 *
 * The real fix was to rename the tasks for real — `buildSchedule` for new
 * builds, a backfill for the 294 existing rows — so every surface says the
 * same thing. This map is kept, aligned to those names, so the sidebar keeps
 * working if a stored title is ever missing, and so there is one obvious place
 * to look when the names are questioned again.
 *
 * The PREP id stays visible alongside the title, so a student mentioning "PREP-3" to a
 * mentor and a mentor searching for it still meet in the middle.
 */
const STUDENT_TITLES: Record<string, string> = {
  'PREP-1': 'Record Your Project Introduction',
  'PREP-2': 'Record Your Working-System Demo',
  'PREP-3': 'Record Your AI Visual Presentation',
  'PREP-4': 'Record Your Stakeholder Update',
  'PREP-5': 'Record Your Final Showcase',
  'PREP-6': 'Present at Demo Day',
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
    // `resolveStage`, not `isPresentationStage`: a learner who last had Reflect
    // open has `reflect` sitting in their browser, and discarding it would drop
    // them back on Learn with no explanation.
    return resolveStage(v);
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
