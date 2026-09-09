/**
 * projectDeliveryDetail — the per-project and batched queries behind the Projects
 * delivery view's timeline, build evidence and artifacts.
 *
 * Split from projectDeliveryService (381 lines) to stay under CLAUDE.md's 500-line
 * ceiling. The pure logic these call lives in projectReleaseMeta and is unit-tested
 * there; this file is queries plus assembly.
 *
 * ONE DELIBERATE CHOICE worth stating: timing is classified in JS by
 * `classifyTiming`, not in SQL. Expressing "complete but unverified is NOT on time"
 * as a CASE expression would duplicate the rule in a second place, and the two would
 * drift — the SQL copy silently, since nothing tests it. Fetching the task rows and
 * classifying them in one place costs a few hundred rows and keeps one source of truth.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import {
  resolveReleaseName,
  extractLandsWhen,
  classifyTiming,
  rollUpTiming,
  summariseEvidence,
  groupArtifacts,
  TimingRollup,
  EvidenceSummary,
  ArtifactGroup,
} from './projectReleaseMeta';

const DONE = 'complete';

/** Task-list titles keyed `${project_id}::${cluster}` — the readable release names. */
async function loadReleaseTitles(projectIds: string[]): Promise<Map<string, string>> {
  if (!projectIds.length) return new Map();
  const rows = await sequelize.query<{ project_id: string; cluster: string; title: string }>(
    `SELECT project_id, cluster, title
       FROM student_task_lists
      WHERE project_id IN (:ids) AND title IS NOT NULL AND title <> ''`,
    { replacements: { ids: projectIds }, type: QueryTypes.SELECT }
  );
  return new Map(rows.map((r) => [`${r.project_id}::${r.cluster}`, r.title]));
}

export interface ReleaseSummary {
  release_key: string;
  display_name: string;
  total: number;
  complete: number;
  overdue: number;
  starts_on: string | null;
  ends_on: string | null;
  timing: TimingRollup;
}

/**
 * Every visible project's releases, in TWO queries total regardless of project count.
 *
 * This exists so the delivery list can render coloured release bars WITHOUT the
 * operator expanding each row — previously the timeline was fetched per project on
 * click, so a collapsed list showed one flat grey bar per project and gave away
 * nothing at a glance. Batched rather than per-project: 30 projects would otherwise
 * be 30 round trips.
 */
export async function getReleaseSummaries(
  projectIds: string[]
): Promise<Map<string, ReleaseSummary[]>> {
  const out = new Map<string, ReleaseSummary[]>();
  if (!projectIds.length) return out;

  const [tasks, titles] = await Promise.all([
    sequelize.query<any>(
      `SELECT project_id, release_key, status, due_on::text, verified_at
         FROM student_tasks
        WHERE project_id IN (:ids)`,
      { replacements: { ids: projectIds }, type: QueryTypes.SELECT }
    ),
    loadReleaseTitles(projectIds),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  // project -> release key -> rows
  const grouped = new Map<string, Map<string, any[]>>();
  for (const t of tasks) {
    const key = t.release_key ?? 'unscheduled';
    let byRelease = grouped.get(t.project_id);
    if (!byRelease) { byRelease = new Map(); grouped.set(t.project_id, byRelease); }
    const list = byRelease.get(key);
    if (list) list.push(t);
    else byRelease.set(key, [t]);
  }

  for (const [projectId, byRelease] of grouped) {
    const releases: ReleaseSummary[] = [...byRelease.entries()].map(([key, rows]) => {
      const dates = rows.map((r) => (r.due_on ? String(r.due_on).slice(0, 10) : null))
        .filter((d): d is string => !!d).sort();
      return {
        release_key: key,
        display_name: resolveReleaseName(key, {
          [key]: titles.get(`${projectId}::${key}`) ?? '',
        }),
        total: rows.length,
        complete: rows.filter((r) => r.status === DONE).length,
        overdue: rows.filter((r) => r.due_on && r.status !== DONE
          && String(r.due_on).slice(0, 10) < today).length,
        starts_on: dates[0] ?? null,
        ends_on: dates[dates.length - 1] ?? null,
        timing: rollUpTiming(rows),
      };
    }).sort(byStartThenKey);
    out.set(projectId, releases);
  }
  return out;
}

/** Chronological by start; the undated bucket sinks to the end. */
function byStartThenKey(a: { starts_on: string | null; release_key: string },
                        b: { starts_on: string | null; release_key: string }): number {
  if (a.starts_on && b.starts_on) return a.starts_on.localeCompare(b.starts_on);
  if (a.starts_on) return -1;
  if (b.starts_on) return 1;
  return a.release_key.localeCompare(b.release_key);
}

export interface GanttTask {
  id: string;
  title: string;
  status: string;
  release_key: string | null;
  due_on: string | null;
  due_baseline_on: string | null;
  slipped: boolean;
  overdue: boolean;
  timing: ReturnType<typeof classifyTiming>;
  verified_at: string | null;
  blocked_by: string[];
  narrative: string | null;
}

export interface GanttRelease extends ReleaseSummary {
  /** The release's definition of done, or null when the build text carries none. */
  lands_when: string | null;
  tasks: GanttTask[];
}

/** One project's tasks as a Gantt, grouped into its release spine, with the readable
 *  release name, its definition of done and its timing story. */
export async function getProjectGantt(projectId: string): Promise<{
  project_id: string;
  releases: GanttRelease[];
  totals: { tasks: number; complete: number; overdue: number; undated: number } & { timing: TimingRollup };
}> {
  const [rows, titles] = await Promise.all([
    sequelize.query<any>(
      `SELECT id, title, status, release_key, due_on::text, due_baseline_on::text,
              verified_at, blocked_by, narrative, build, position
         FROM student_tasks
        WHERE project_id = :projectId
        ORDER BY release_key NULLS LAST, due_on NULLS LAST, position`,
      { replacements: { projectId }, type: QueryTypes.SELECT }
    ),
    loadReleaseTitles([projectId]),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const byRelease = new Map<string, any[]>();
  for (const r of rows) {
    const key = r.release_key ?? 'unscheduled';
    const list = byRelease.get(key);
    if (list) list.push(r);
    else byRelease.set(key, [r]);
  }

  const releases: GanttRelease[] = [...byRelease.entries()].map(([key, list]) => {
    const tasks: GanttTask[] = list.map((r) => {
      const due = r.due_on ? String(r.due_on).slice(0, 10) : null;
      const base = r.due_baseline_on ? String(r.due_baseline_on).slice(0, 10) : null;
      const done = r.status === DONE;
      return {
        id: r.id,
        title: r.title,
        status: r.status,
        release_key: r.release_key ?? null,
        due_on: due,
        due_baseline_on: base,
        slipped: !!(due && base && due > base),
        overdue: !!(due && !done && due < today),
        timing: classifyTiming(r),
        verified_at: r.verified_at ? new Date(r.verified_at).toISOString() : null,
        blocked_by: Array.isArray(r.blocked_by) ? r.blocked_by : [],
        narrative: r.narrative ?? null,
      };
    });
    const dates = tasks.map((t) => t.due_on).filter((d): d is string => !!d).sort();

    // First non-null "lands when" in the release: the build documents within one
    // release restate the same criterion, so the first is representative.
    let landsWhen: string | null = null;
    for (const r of list) {
      landsWhen = extractLandsWhen(r.build);
      if (landsWhen) break;
    }

    return {
      release_key: key,
      display_name: resolveReleaseName(key, { [key]: titles.get(`${projectId}::${key}`) ?? '' }),
      lands_when: landsWhen,
      total: tasks.length,
      complete: tasks.filter((t) => t.status === DONE).length,
      overdue: tasks.filter((t) => t.overdue).length,
      starts_on: dates[0] ?? null,
      ends_on: dates[dates.length - 1] ?? null,
      timing: rollUpTiming(list),
      tasks,
    };
  }).sort(byStartThenKey);

  return {
    project_id: projectId,
    releases,
    totals: {
      tasks: rows.length,
      complete: releases.reduce((n, r) => n + r.complete, 0),
      overdue: releases.reduce((n, r) => n + r.overdue, 0),
      undated: rows.filter((r: any) => !r.due_on).length,
      timing: rollUpTiming(rows),
    },
  };
}

/**
 * What a project's build actually produced, from build_manifests.
 *
 * Returns `has_evidence: false` for every project visible today: all 178 manifests in
 * production belong either to the platform's own project or to a withdrawn test
 * enrollment, so none survives the delivery view's filters. That is a data-pipeline
 * gap, not a bug here — the caller must render the cause rather than a row of zeros,
 * because zeros would assert "built nothing" when the truth is "nothing recorded".
 */
export async function getProjectEvidence(projectId: string): Promise<EvidenceSummary> {
  const rows = await sequelize.query<any>(
    `SELECT files_created, files_modified, apis_added, ui_components_added,
            tests_added, database_changes, execution_timestamp
       FROM build_manifests
      WHERE project_id = :projectId
      ORDER BY execution_timestamp DESC`,
    { replacements: { projectId }, type: QueryTypes.SELECT }
  );
  return summariseEvidence(rows);
}

/**
 * A project's artifacts, grouped by document with version history.
 *
 * Artifacts are stored as submission CONTENT, not files — every row observed in
 * production has `file_name` null and `content_json` populated — so the caller offers
 * the content rather than a download link that would 404.
 */
export async function getProjectArtifacts(projectId: string): Promise<ArtifactGroup[]> {
  const rows = await sequelize.query<any>(
    `SELECT ad.name              AS artifact_name,
            a.artifact_stage,
            a.version,
            s.id                 AS submission_id,
            s.title,
            s.file_name,
            s.content_json IS NOT NULL AS has_content,
            s.submitted_at
       FROM project_artifacts a
       LEFT JOIN artifact_definitions ad ON ad.id = a.artifact_definition_id
       LEFT JOIN assignment_submissions s ON s.id = a.submission_id
      WHERE a.project_id = :projectId
      ORDER BY a.version DESC`,
    { replacements: { projectId }, type: QueryTypes.SELECT }
  );
  return groupArtifacts(rows);
}
