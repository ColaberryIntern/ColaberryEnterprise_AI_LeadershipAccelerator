/**
 * A student's portal is pointed at one project while their work is in another.
 *
 * ── THE FAILURE THIS EXISTS TO CATCH ────────────────────────────────────────
 *
 * `enrollments.active_project_id` decides which project the portal renders.
 * Publishing a plan is supposed to move it (`makeActiveProject` in
 * sbpOrchestrator), and when that does not happen the student is trapped: they
 * build in one project and watch a different one, and every screen truthfully
 * reports the wrong thing.
 *
 * Found 2026-09-05 on Farhat Beig. She completed STORY-001 in her SECOND
 * project, pushed a correctly named commit, and the platform verified it three
 * minutes later at 3 of 3. Her portal was still pointed at her first project,
 * so she saw 0 of 3, could not tell why, and emailed a human fifteen minutes
 * after it had already been accepted.
 *
 * `makeActiveProject` catches its own failure into a log line, so nothing
 * surfaced at publish time and nothing surfaced afterwards either. The same
 * shape had already been repaired by hand once before, for Quincy Nkwain
 * Ninying on 2026-08-25 (`backup_quincy_active_project_20260825`). Twice is a
 * pattern, and the second one still cost a student a day.
 *
 * ── WHY THIS ONLY REPORTS, AND NEVER CORRECTS ───────────────────────────────
 *
 * The obvious rule, "point them at their newest project", is WRONG, and the
 * live data says so. On the same day Farhat was stuck, Quincy had:
 *
 *     CoreOps  22 of 28 tasks done, 6 outstanding   <- his active project
 *     Ambit    13 of 13 done, finished, and NEWER
 *
 * Newest-wins would have moved him off the project with unfinished work and
 * onto a completed one. His pointer is plausibly right, and was set by a
 * deliberate repair. So a student with two live projects is not necessarily
 * adrift, and a checker that cannot tell the difference must not be allowed to
 * write. This returns findings; a human, or the student, decides.
 *
 * PURE: takes rows, returns findings. No database, no clock beyond what is
 * passed in, so the judgement can be tested without a fixture project.
 */

/** One project belonging to a student, reduced to what the decision needs. */
export interface ProjectActivity {
  project_id: string;
  name: string | null;
  /** Newest verification on any of its stories, ISO, or null if never. */
  last_verified_at: string | null;
  /** Tasks that still have work left. */
  outstanding_tasks: number;
  /** Whether the project has a published plan at all. */
  published: boolean;
  archived: boolean;
}

export interface DriftInput {
  enrollment_id: string;
  full_name: string | null;
  email: string;
  active_project_id: string | null;
  projects: ProjectActivity[];
}

export type DriftCode =
  /** The portal points at nothing while a published project exists. */
  | 'no_active_project'
  /** Verified work is landing somewhere other than the project on screen. */
  | 'work_elsewhere'
  /** The portal points at a project that has been archived. */
  | 'active_archived';

export interface DriftFinding {
  enrollment_id: string;
  full_name: string | null;
  email: string;
  code: DriftCode;
  /** What the student is looking at. */
  showing: string | null;
  /** Where their recent verified work actually is. */
  working_in: string | null;
  detail: string;
}

/** Newest ISO wins; nulls lose. Returns null when nothing has ever verified. */
function mostRecentlyVerified(projects: ProjectActivity[]): ProjectActivity | null {
  const dated = projects.filter((p) => p.last_verified_at && !p.archived);
  if (!dated.length) return null;
  return [...dated].sort((a, b) => Date.parse(b.last_verified_at!) - Date.parse(a.last_verified_at!))[0];
}

/**
 * @returns one finding per student who is looking at the wrong thing, or [] when
 *          the pointer is defensible. Never returns a finding it cannot explain
 *          in a sentence a human can act on.
 */
export function detectActiveProjectDrift(input: DriftInput): DriftFinding[] {
  const live = input.projects.filter((p) => !p.archived);
  const published = live.filter((p) => p.published);
  if (published.length === 0) return [];

  const base = { enrollment_id: input.enrollment_id, full_name: input.full_name, email: input.email };
  const active = input.projects.find((p) => p.project_id === input.active_project_id) ?? null;

  // Pointing at nothing, with somewhere to point.
  if (!input.active_project_id || !active) {
    return [{
      ...base,
      code: 'no_active_project',
      showing: null,
      working_in: published[0].name,
      detail: `No active project is set, so the portal has nothing to render, `
        + `while ${published.length} published project(s) exist.`,
    }];
  }

  // Pointing at something the student archived.
  if (active.archived) {
    const alt = mostRecentlyVerified(live) ?? published[0];
    return [{
      ...base,
      code: 'active_archived',
      showing: active.name,
      working_in: alt?.name ?? null,
      detail: `The portal is pointed at "${active.name}", which is archived.`,
    }];
  }

  const newest = mostRecentlyVerified(live);
  if (!newest || newest.project_id === active.project_id) return [];

  /**
   * THE GUARD THAT KEEPS QUINCY OUT OF THIS LIST.
   *
   * Work landing in another project is only a problem when the project on
   * screen is not one the student is still working. If the active project has
   * outstanding tasks, having a second, finished project elsewhere is a normal
   * state and not drift.
   */
  if (active.outstanding_tasks > 0) return [];

  return [{
    ...base,
    code: 'work_elsewhere',
    showing: active.name,
    working_in: newest.name,
    detail: `The portal shows "${active.name}", which has no outstanding tasks, `
      + `while verified work is landing in "${newest.name}". `
      + `The student is most likely building one project and watching another.`,
  }];
}
