/**
 * projectDeliveryService — what each student has actually built, on a timeline,
 * and how close that project is to becoming a case study.
 *
 * WHY THE READINESS SCORE IS RANKED, NOT BINARY. A production audit on
 * 2026-09-09 found the platform holds two disjoint populations: 33 projects
 * carry a build plan (tasks, dates, releases, 47-100% complete) with no repo and
 * no artifacts, and 7 carry a repo and artifacts with no build plan at all. The
 * overlap is ZERO. A gate of the obvious shape - stage complete AND artifacts
 * present AND tasks done - therefore matches nothing today, and would render an
 * empty page that reads as a broken feature rather than as a true statement
 * about the data.
 *
 * So readiness is scored and ordered, and every project reports the specific
 * things it is MISSING. An empty "ready" list becomes a ranked worklist:
 * "CoreOps - 79% built, no repo, no artifacts". That is useful on day one and
 * becomes a real readiness signal as projects mature, without a rewrite.
 *
 * Implementation work is meant to complement the build plans rather than replace
 * them (operator, 2026-09-09), so a project holding only one of the two is
 * half-finished and the gap list is what says which half.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
// The same "no longer a student here" rule the current-classes snapshot uses.
// Imported rather than restated so the two cannot drift into disagreeing about
// who counts as enrolled.
import { DEPARTED_ENROLLMENT_STATUSES } from './acceleratorCurrentClassesService';

/** Task statuses that count as finished. The others are not_started, in_progress, blocked. */
export const DONE_TASK_STATUSES = ['complete'] as const;

/** Stages a project passes through, in order — index doubles as progress rank. */
export const PROJECT_STAGES = [
  'discovery', 'architecture', 'implementation', 'portfolio', 'complete',
] as const;
export type ProjectStage = (typeof PROJECT_STAGES)[number];

export interface ReadinessComponent {
  key: string;
  label: string;
  /** 0..1 — how far this component is satisfied. */
  score: number;
  weight: number;
  /** Present when the component is not fully satisfied: what is missing. */
  gap?: string;
}

export interface ProjectReadiness {
  /** 0..100, weighted. Ordering signal, not a verdict. */
  score: number;
  /** True only when nothing is missing. Expected to be rare, by design. */
  ready: boolean;
  components: ReadinessComponent[];
  /** Human-readable list of what stands between this project and a case study. */
  gaps: string[];
}

export interface ProjectRow {
  project_id: string;
  name: string | null;
  enrollment_id: string;
  student_name: string | null;
  student_email: string | null;
  cohort_id: string | null;
  cohort_name: string | null;
  stage: ProjectStage;
  maturity_score: number | null;
  has_repo: boolean;
  repo_url: string | null;
  has_exec_summary: boolean;
  artifacts: number;
  tasks_total: number;
  tasks_complete: number;
  tasks_overdue: number;
  tasks_pct: number;
  starts_on: string | null;
  ends_on: string | null;
  already_case_study: boolean;
  readiness: ProjectReadiness;
}

/**
 * The readiness model, weighted.
 *
 * Build progress carries the most weight because it is the only component
 * populated at scale today; the rest are what turn a finished build into a
 * publishable story. Weights sum to 1 so the score is directly a percentage.
 */
const WEIGHTS = {
  build: 0.40,
  repo: 0.20,
  artifacts: 0.15,
  narrative: 0.15,
  stage: 0.10,
} as const;

/** Pure: the readiness score and gap list for one project's raw numbers. */
export function computeReadiness(input: {
  tasks_total: number;
  tasks_complete: number;
  has_repo: boolean;
  artifacts: number;
  has_exec_summary: boolean;
  stage: ProjectStage;
}): ProjectReadiness {
  const buildPct = input.tasks_total > 0 ? input.tasks_complete / input.tasks_total : 0;
  const stageIdx = Math.max(0, PROJECT_STAGES.indexOf(input.stage));
  const stageScore = stageIdx / (PROJECT_STAGES.length - 1);

  const components: ReadinessComponent[] = [
    {
      key: 'build',
      label: 'Build plan complete',
      score: buildPct,
      weight: WEIGHTS.build,
      gap: input.tasks_total === 0
        ? 'no build plan'
        : buildPct < 1
          ? `${input.tasks_total - input.tasks_complete} of ${input.tasks_total} tasks open`
          : undefined,
    },
    {
      key: 'repo',
      label: 'Code repository',
      score: input.has_repo ? 1 : 0,
      weight: WEIGHTS.repo,
      gap: input.has_repo ? undefined : 'no repo',
    },
    {
      key: 'artifacts',
      label: 'Artifacts produced',
      // Three artifacts is treated as a full evidence set; more does not score
      // higher, because the question is "is there enough to write from", not
      // "who produced the most documents".
      score: Math.min(1, input.artifacts / 3),
      weight: WEIGHTS.artifacts,
      gap: input.artifacts === 0 ? 'no artifacts' : input.artifacts < 3 ? `${input.artifacts} of 3 artifacts` : undefined,
    },
    {
      key: 'narrative',
      label: 'Executive summary',
      score: input.has_exec_summary ? 1 : 0,
      weight: WEIGHTS.narrative,
      gap: input.has_exec_summary ? undefined : 'no executive summary',
    },
    {
      key: 'stage',
      label: 'Stage progression',
      score: stageScore,
      weight: WEIGHTS.stage,
      gap: stageScore < 1 ? `stage is ${input.stage}` : undefined,
    },
  ];

  const score = Math.round(
    components.reduce((n, c) => n + c.score * c.weight, 0) * 100
  );
  const gaps = components.map((c) => c.gap).filter((g): g is string => !!g);
  return { score, ready: gaps.length === 0, components, gaps };
}

/**
 * Every project with its delivery numbers, ranked by readiness.
 *
 * One query per grain, merged in JS. Joining tasks and artifacts in a single
 * statement would multiply the rows by each other and inflate both counts — the
 * classic fan-out, and here it would silently overstate exactly the two numbers
 * the readiness score is built from.
 */
export async function getProjectDelivery(opts: { cohortId?: string } = {}): Promise<ProjectRow[]> {
  const rows = await sequelize.query<any>(
    `SELECT p.id                AS project_id,
            p.name,
            p.enrollment_id,
            e.full_name         AS student_name,
            e.email             AS student_email,
            e.cohort_id,
            co.name             AS cohort_name,
            p.project_stage     AS stage,
            p.maturity_score,
            p.github_repo_url   AS repo_url,
            (p.executive_summary IS NOT NULL AND p.executive_summary <> '') AS has_exec_summary
       FROM projects p
       LEFT JOIN enrollments e ON e.id = p.enrollment_id
       LEFT JOIN cohorts co    ON co.id = e.cohort_id
      -- Two exclusions, both found by ranking this list against production and
      -- seeing test fixtures outrank real student work.
      --   * withdrawn enrollments: every E2E/demo fixture on prod sits on one
      --     ("Demo Run 1 (Reqs E2E)", "E2E Test", "Ali Test Project 2"), and a
      --     withdrawn student's project is not a case-study candidate anyway.
      --     This is the SAME rule the current-classes snapshot applies.
      --   * unnamed projects: scratch/system rows, not somebody's build.
      WHERE p.name IS NOT NULL AND p.name <> ''
        AND (e.status IS NULL OR e.status NOT IN (:departed))
        ${opts.cohortId ? 'AND e.cohort_id = :cohortId' : ''}`,
    {
      replacements: {
        departed: [...DEPARTED_ENROLLMENT_STATUSES],
        ...(opts.cohortId ? { cohortId: opts.cohortId } : {}),
      },
      type: QueryTypes.SELECT,
    }
  );
  if (!rows.length) return [];
  const ids = rows.map((r) => r.project_id);

  const taskAgg = await sequelize.query<any>(
    `SELECT project_id,
            COUNT(*)::int                                                   AS total,
            COUNT(*) FILTER (WHERE status IN (:done))::int                  AS complete,
            COUNT(*) FILTER (WHERE due_on < CURRENT_DATE
                               AND status NOT IN (:done))::int              AS overdue,
            MIN(due_on)::text                                               AS starts_on,
            MAX(due_on)::text                                               AS ends_on
       FROM student_tasks
      WHERE project_id IN (:ids)
      GROUP BY project_id`,
    { replacements: { ids, done: [...DONE_TASK_STATUSES] }, type: QueryTypes.SELECT }
  );
  const tasks = new Map(taskAgg.map((r) => [r.project_id, r]));

  const artAgg = await sequelize.query<any>(
    `SELECT project_id, COUNT(*)::int AS n FROM project_artifacts
      WHERE project_id IN (:ids) GROUP BY project_id`,
    { replacements: { ids }, type: QueryTypes.SELECT }
  );
  const arts = new Map(artAgg.map((r) => [r.project_id, Number(r.n)]));

  const csAgg = await sequelize.query<any>(
    `SELECT DISTINCT project_id FROM case_studies WHERE project_id IN (:ids)`,
    { replacements: { ids }, type: QueryTypes.SELECT }
  );
  const caseStudies = new Set(csAgg.map((r) => r.project_id));

  const out: ProjectRow[] = rows.map((r) => {
    const t = tasks.get(r.project_id);
    const total = t ? Number(t.total) : 0;
    const complete = t ? Number(t.complete) : 0;
    const artifacts = arts.get(r.project_id) ?? 0;
    const has_repo = !!(r.repo_url && String(r.repo_url).trim());
    const stage: ProjectStage = PROJECT_STAGES.includes(r.stage) ? r.stage : 'discovery';

    return {
      project_id: r.project_id,
      name: r.name,
      enrollment_id: r.enrollment_id,
      student_name: r.student_name,
      student_email: r.student_email,
      cohort_id: r.cohort_id,
      cohort_name: r.cohort_name,
      stage,
      maturity_score: r.maturity_score,
      has_repo,
      repo_url: has_repo ? r.repo_url : null,
      has_exec_summary: !!r.has_exec_summary,
      artifacts,
      tasks_total: total,
      tasks_complete: complete,
      tasks_overdue: t ? Number(t.overdue) : 0,
      tasks_pct: total > 0 ? Math.round((complete / total) * 100) : 0,
      starts_on: t?.starts_on ?? null,
      ends_on: t?.ends_on ?? null,
      already_case_study: caseStudies.has(r.project_id),
      readiness: computeReadiness({
        tasks_total: total,
        tasks_complete: complete,
        has_repo,
        artifacts,
        has_exec_summary: !!r.has_exec_summary,
        stage,
      }),
    };
  });

  // Closest to case-study ready first; a project already published drops to the
  // bottom, since it is no longer a candidate.
  return out.sort((a, b) => {
    if (a.already_case_study !== b.already_case_study) return a.already_case_study ? 1 : -1;
    return b.readiness.score - a.readiness.score;
  });
}

export interface GanttTask {
  id: string;
  title: string;
  status: string;
  release_key: string | null;
  due_on: string | null;
  due_baseline_on: string | null;
  /** True when due_on has moved later than the baseline it was planned against. */
  slipped: boolean;
  overdue: boolean;
  blocked_by: string[];
}

export interface GanttRelease {
  release_key: string;
  tasks: GanttTask[];
  total: number;
  complete: number;
  overdue: number;
  starts_on: string | null;
  ends_on: string | null;
}

/**
 * One project's tasks as a Gantt, grouped into its release spine.
 *
 * Undated tasks are returned in their release but with null dates rather than
 * dropped: 67 of 656 tasks carry no due date in production, and silently hiding
 * them would make a plan look smaller and healthier than it is.
 */
export async function getProjectGantt(projectId: string): Promise<{
  project_id: string;
  releases: GanttRelease[];
  totals: { tasks: number; complete: number; overdue: number; undated: number };
}> {
  const rows = await sequelize.query<any>(
    `SELECT id, title, status, release_key,
            due_on::text, due_baseline_on::text, blocked_by
       FROM student_tasks
      WHERE project_id = :projectId
      ORDER BY release_key NULLS LAST, due_on NULLS LAST, position`,
    { replacements: { projectId }, type: QueryTypes.SELECT }
  );

  const today = new Date().toISOString().slice(0, 10);
  const byRelease = new Map<string, GanttTask[]>();

  for (const r of rows) {
    const due = r.due_on ? String(r.due_on).slice(0, 10) : null;
    const base = r.due_baseline_on ? String(r.due_baseline_on).slice(0, 10) : null;
    const done = (DONE_TASK_STATUSES as readonly string[]).includes(r.status);
    const key = r.release_key ?? 'unscheduled';
    const task: GanttTask = {
      id: r.id,
      title: r.title,
      status: r.status,
      release_key: r.release_key ?? null,
      due_on: due,
      due_baseline_on: base,
      slipped: !!(due && base && due > base),
      overdue: !!(due && !done && due < today),
      blocked_by: Array.isArray(r.blocked_by) ? r.blocked_by : [],
    };
    const list = byRelease.get(key);
    if (list) list.push(task);
    else byRelease.set(key, [task]);
  }

  const releases: GanttRelease[] = [...byRelease.entries()].map(([release_key, list]) => {
    const dates = list.map((t) => t.due_on).filter((d): d is string => !!d).sort();
    return {
      release_key,
      tasks: list,
      total: list.length,
      complete: list.filter((t) => (DONE_TASK_STATUSES as readonly string[]).includes(t.status)).length,
      overdue: list.filter((t) => t.overdue).length,
      starts_on: dates[0] ?? null,
      ends_on: dates[dates.length - 1] ?? null,
    };
  }).sort((a, b) => {
    // Chronological by start; the unscheduled bucket sinks to the end.
    if (a.starts_on && b.starts_on) return a.starts_on.localeCompare(b.starts_on);
    if (a.starts_on) return -1;
    if (b.starts_on) return 1;
    return a.release_key.localeCompare(b.release_key);
  });

  return {
    project_id: projectId,
    releases,
    totals: {
      tasks: rows.length,
      complete: releases.reduce((n, r) => n + r.complete, 0),
      overdue: releases.reduce((n, r) => n + r.overdue, 0),
      undated: rows.filter((r: any) => !r.due_on).length,
    },
  };
}
