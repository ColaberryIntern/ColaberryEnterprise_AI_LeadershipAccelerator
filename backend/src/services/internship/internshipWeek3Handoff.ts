/**
 * internshipWeek3Handoff — the "your first Colaberry project" moment.
 *
 * The internship's shape (plan §4): weeks 1-3 are training, and the intern's first
 * Colaberry project is assigned once they reach Week 3. This derives, from the
 * intern's own week and their active project's state, which side of that handoff
 * they are on and whose move it is now.
 *
 * ── WHY IT NEVER READS AS STUDENT LATENESS ─────────────────────────────────
 *
 * Two of the phases are Colaberry's to move: the intern has reached Week 3 but no
 * project is assigned yet, or a project is assigned but its repository access is
 * still being set up. The plan is explicit that "waiting on an assignment must not
 * count as student lateness," so those phases carry `owner: 'colaberry'` and
 * `actionable: false`. The only phase that is the intern's turn is the one where
 * the project is assigned AND access is ready.
 *
 * Pure and I/O-free: it takes the week and a minimal project shape and returns the
 * card, so every phase and the Week-3 boundary are unit-testable without a
 * database.
 */

/** The point in the program where the first Colaberry project is assigned. */
export const HANDOFF_WEEK = 3;

export type HandoffPhase =
  | 'unknown' // the intern's week isn't known yet — an honest state, not "late"
  | 'before_week_3' // weeks 1-2: the project is upcoming; training comes first
  | 'awaiting_assignment' // reached Week 3, no project assigned yet — on Colaberry
  | 'access_pending' // project assigned, repository access not yet set up — on Colaberry
  | 'in_progress'; // project assigned and access ready — the intern's to build

export interface Week3Handoff {
  phase: HandoffPhase;
  /** Whose move it is now. 'colaberry' phases are shown as ours, never as the
   *  intern being behind. */
  owner: 'colaberry' | 'intern';
  title: string;
  detail: string;
  /** The assigned project's name when there is one, so the intern sees exactly
   *  which project the card refers to. Null before assignment. */
  project_name: string | null;
  /** True only when there is something for the INTERN to act on (in_progress).
   *  Informational and waiting-on-us phases are false. */
  actionable: boolean;
}

/** The minimal project shape this needs — a subset of the activity payload. */
export interface HandoffProject {
  name: string;
  repo_connected: boolean;
}

export function deriveWeek3Handoff(
  week: number | null,
  project: HandoffProject | null,
): Week3Handoff {
  if (week == null) {
    return {
      phase: 'unknown',
      owner: 'colaberry',
      title: 'Confirming your start',
      detail: "Your internship week isn't set yet. Your manager is confirming your start date.",
      project_name: null,
      actionable: false,
    };
  }

  if (week < HANDOFF_WEEK) {
    const nextWeek = week === HANDOFF_WEEK - 1;
    return {
      phase: 'before_week_3',
      owner: 'intern',
      title: 'Your first Colaberry project',
      detail: `It's assigned once you reach Week ${HANDOFF_WEEK}${nextWeek ? ' — that’s next week' : ''}. Keep building through your training until then; you’re in Week ${week}.`,
      project_name: null,
      actionable: false,
    };
  }

  // Week 3 or later.
  if (!project) {
    return {
      phase: 'awaiting_assignment',
      owner: 'colaberry',
      title: 'Your first project is next',
      detail: `You’ve reached Week ${week}. Your internship manager assigns your first Colaberry project — this one is on us, not a step you are behind on.`,
      project_name: null,
      actionable: false,
    };
  }

  if (!project.repo_connected) {
    return {
      phase: 'access_pending',
      owner: 'colaberry',
      title: 'Project assigned — access being set up',
      detail: `${project.name} is assigned. We’re finishing your repository access before you start building; there’s nothing you need to do yet.`,
      project_name: project.name,
      actionable: false,
    };
  }

  return {
    phase: 'in_progress',
    owner: 'intern',
    title: 'Your project is ready',
    detail: `${project.name} is assigned and your repository is connected. Keep delivering — your current milestone shows up in your next step.`,
    project_name: project.name,
    actionable: true,
  };
}
