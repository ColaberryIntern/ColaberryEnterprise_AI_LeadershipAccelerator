/**
 * projectRiskModel — which student needs help, as opposed to which project is
 * closest to being a case study.
 *
 * WHY THIS IS STUDENT-CENTRIC AND NOT PROJECT-CENTRIC. A production audit on
 * 2026-09-10 found 30 visible projects belonging to only 24 students. Four
 * students hold more than one, and their spare rows are abandoned: Firas holds
 * FOUR projects — Ledgerly Smart Accounting at 21/27, Sifra at 16/22 (his
 * active one), HomeHub at 1/20 and an empty "Ledgerly Accounting" at 0/27.
 * Regina Asafor's active project is moving while her second sits at 0/21.
 *
 * A per-project rule would therefore flag two of the strongest builders in the
 * cohort as needing rescue, and an operator who acted on it would email the
 * wrong people. Nine projects have zero completed tasks; only SEVEN students
 * actually have nothing finished anywhere. That gap is the whole reason this
 * module exists.
 *
 * The abandoned rows are identified from `enrollments.active_project_id`, which
 * the student sets themselves — an authoritative signal, not a heuristic about
 * which project "looks" more real.
 */

/** Statuses a project row can hold on the needs-attention axis. */
export type RiskState =
  /** The student has completed NOTHING, on this or any other project of theirs. */
  | 'stalled'
  /** Overdue work, but the student is demonstrably building. */
  | 'behind'
  /** A spare row the student has moved off. Not a person in trouble. */
  | 'dormant'
  /** Nothing overdue and real progress recorded. */
  | 'on_track'
  /** No build plan exists yet, so there is nothing to be late for. */
  | 'no_plan'
  /** Already published as a case study — out of the running. */
  | 'shipped';

export interface RiskAssessment {
  state: RiskState;
  /** Sort key for "needs attention first". Higher is more urgent. */
  attention: number;
  /** Shown on the row. Says what is true, never what to do. */
  reason: string;
  /** How many visible projects this student holds. 1 for most. */
  owner_projects: number;
  /** Tasks this student has completed across ALL of their projects. */
  owner_complete: number;
}

/** The per-project facts the model needs. Deliberately not the full row type,
 *  so this stays testable without constructing a database record. */
export interface RiskInput {
  project_id: string;
  /** Groups a student's projects. Email is stable; name is the fallback. */
  student_email?: string | null;
  student_name?: string | null;
  tasks_total: number;
  tasks_complete: number;
  tasks_overdue: number;
  already_case_study?: boolean;
  /** True when this is the project the student themselves marked active. */
  is_active_project?: boolean;
}

/** Base urgency per state, before per-project overdue weighting. */
const BASE: Record<RiskState, number> = {
  stalled: 1000,
  behind: 500,
  dormant: 100,
  no_plan: 50,
  on_track: 0,
  shipped: -1,
};

/**
 * Group key for one student. Email first because two people can share a display
 * name; a project with NEITHER falls back to its own id so unowned rows are
 * never silently pooled into one "student" whose totals mean nothing.
 */
export function ownerKey(r: RiskInput): string {
  const email = (r.student_email ?? '').trim().toLowerCase();
  if (email) return `e:${email}`;
  const name = (r.student_name ?? '').trim().toLowerCase();
  if (name) return `n:${name}`;
  return `p:${r.project_id}`;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Assess every project together — the model cannot judge one row in isolation,
 * because "has this student built anything" is a question about the whole set.
 * Returns a map keyed by project_id.
 */
export function assessPortfolio(rows: RiskInput[]): Map<string, RiskAssessment> {
  const byOwner = new Map<string, RiskInput[]>();
  for (const r of rows) {
    const k = ownerKey(r);
    const list = byOwner.get(k);
    if (list) list.push(r); else byOwner.set(k, [r]);
  }

  const out = new Map<string, RiskAssessment>();

  for (const [, owned] of byOwner) {
    const ownerComplete = owned.reduce((n, p) => n + (p.tasks_complete || 0), 0);
    // The student's own choice of where the real work lives.
    const active = owned.find((p) => p.is_active_project);
    const activeMoving = !!active && (active.tasks_complete || 0) > 0;

    for (const r of owned) {
      const complete = r.tasks_complete || 0;
      const overdue = r.tasks_overdue || 0;
      const total = r.tasks_total || 0;
      let state: RiskState;
      let reason: string;

      if (r.already_case_study) {
        state = 'shipped';
        reason = 'Already published as a case study';
      } else if (total === 0) {
        state = 'no_plan';
        reason = 'No build plan yet, so nothing is scheduled';
      } else if (overdue === 0 && complete > 0) {
        // Checked BEFORE the dormant rule so a finished side project (Quincy's
        // Ambit, 13 of 13) reads as done rather than as abandoned.
        state = 'on_track';
        reason = `${complete} of ${total} done, nothing overdue`;
      } else if (ownerComplete === 0) {
        // The real intervention list. Nothing finished ANYWHERE for this person.
        state = 'stalled';
        reason = overdue > 0
          ? `Nothing completed yet — ${plural(overdue, 'task is', 'tasks are')} overdue`
          : 'Nothing completed yet';
      } else if (!r.is_active_project && activeMoving) {
        state = 'dormant';
        reason = active?.project_id
          ? 'A spare project — this student is building elsewhere'
          : 'A spare project';
      } else {
        state = 'behind';
        reason = `${plural(overdue, 'task', 'tasks')} overdue, ${complete} of ${total} done`;
      }

      // Overdue count breaks ties WITHIN a state so the worst case in each band
      // sorts first. It never lets a lower band outrank a higher one: the widest
      // in-band spread possible is bounded well below the 400-point gap between
      // adjacent bases.
      const attention = BASE[state] + Math.min(overdue, 99);

      out.set(r.project_id, {
        state,
        attention,
        reason,
        owner_projects: owned.length,
        owner_complete: ownerComplete,
      });
    }
  }

  return out;
}

/** Human label per state, for the UI and for anything that reports on this. */
export const RISK_LABEL: Record<RiskState, string> = {
  stalled: 'Not started',
  behind: 'Behind',
  dormant: 'Spare project',
  no_plan: 'No plan',
  on_track: 'On track',
  shipped: 'Published',
};
