/**
 * projectReleaseMeta — the pure logic behind the Projects delivery view's release
 * detail, timing story, build evidence and artifact grouping.
 *
 * Separate from projectDeliveryService (381 lines) so four new capabilities do not
 * push it past CLAUDE.md's 500-line hard ceiling, and so every function here is
 * unit-testable without a database. Everything in this file is pure; the queries
 * that feed it live in the service.
 */

/* ------------------------------------------------------------------ */
/*  Release identity                                                   */
/* ------------------------------------------------------------------ */

/**
 * The human name for a release, from its task-list title.
 *
 * Cards are grouped by `student_tasks.release_key`, but the readable name lives on
 * `student_task_lists.title` keyed by `cluster` — the same vocabulary (verified in
 * production: CoreOps' lists are r0..r4 + prep, matching its tasks' release_keys).
 * Falls back to the raw key rather than rendering an empty heading, because a
 * project whose vocabularies diverge should still show a usable timeline.
 */
export function resolveReleaseName(
  cluster: string | null | undefined,
  titleByCluster: Map<string, string> | Record<string, string> | null | undefined
): string {
  const key = (cluster ?? '').trim();
  if (!key) return 'Unscheduled';
  const lookup = titleByCluster instanceof Map
    ? titleByCluster.get(key)
    : titleByCluster
      ? (titleByCluster as Record<string, string>)[key]
      : undefined;
  const title = typeof lookup === 'string' ? lookup.trim() : '';
  return title || key;
}

/**
 * The release's definition of done, from the generated build document.
 *
 * The build text runs to roughly 2KB and embeds the line
 * `This release lands when: <criterion>`. Matching stops at the newline — a greedy
 * match would swallow the rest of the document into what the UI renders as a
 * one-line goal. Returns null (never an empty string) when the phrase is absent or
 * carries no text after the colon, so callers can omit the block entirely rather
 * than render an empty quote.
 */
export function extractLandsWhen(buildText: string | null | undefined): string | null {
  if (!buildText || typeof buildText !== 'string') return null;
  const m = buildText.match(/This release lands when:?[ \t]*([^\r\n]*)/i);
  if (!m) return null;
  const text = (m[1] ?? '').trim();
  return text.length > 0 ? text : null;
}

/* ------------------------------------------------------------------ */
/*  Timing                                                             */
/* ------------------------------------------------------------------ */

export type TaskTiming = 'on_time' | 'late' | 'unverified' | 'open' | 'undated';

/** Task statuses that count as finished. Mirrors DONE_TASK_STATUSES in the service. */
const DONE = 'complete';

/** `YYYY-MM-DD` for a date-ish value, or null. Date-only comparison throughout:
 *  `verified_at` is a timestamp and `due_on` is a date, so comparing them raw would
 *  make anything verified later the same day look late. */
function isoDate(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s.slice(0, 10) : d.toISOString().slice(0, 10);
}

/**
 * How one task landed.
 *
 * THE RULE THAT MATTERS: a task marked complete but never verified is `unverified`,
 * NOT `on_time`. In production 24 of 196 complete tasks carry no `verified_at`, so
 * folding them into "on time" would overstate the figure by roughly 14% and turn an
 * unknown into a reassuring claim. Unverified work is exactly the work an operator
 * needs to look at.
 */
export function classifyTiming(t: {
  status?: string | null;
  verified_at?: Date | string | null;
  due_on?: Date | string | null;
}): TaskTiming {
  const done = t.status === DONE;
  if (!done) return 'open';

  const verified = isoDate(t.verified_at);
  if (!verified) return 'unverified';

  const due = isoDate(t.due_on);
  if (!due) return 'undated';

  // On the due date itself counts as on time.
  return verified <= due ? 'on_time' : 'late';
}

export interface TimingRollup {
  on_time: number;
  late: number;
  unverified: number;
  open: number;
  undated: number;
  /** Of the work that CAN be judged (on_time + late), the share that landed on time.
   *  Null when nothing is judgeable — never 0, which would read as "all late". */
  on_time_pct: number | null;
}

export function rollUpTiming(
  tasks: Array<{ status?: string | null; verified_at?: Date | string | null; due_on?: Date | string | null }>
): TimingRollup {
  const r: TimingRollup = { on_time: 0, late: 0, unverified: 0, open: 0, undated: 0, on_time_pct: null };
  for (const t of tasks) r[classifyTiming(t)] += 1;
  const judgeable = r.on_time + r.late;
  r.on_time_pct = judgeable > 0 ? Math.round((r.on_time / judgeable) * 100) : null;
  return r;
}

/* ------------------------------------------------------------------ */
/*  Task state buckets — the segmented bar                             */
/* ------------------------------------------------------------------ */

/**
 * The four states the compact dashboard's segmented bar draws, plus undated.
 *
 * `due_this_week` is the one that does not exist anywhere else in this codebase
 * and is the reason this function exists: an operator scanning thirty rows needs
 * to see what is ABOUT to slip, not only what already has. Seven days is the
 * window because the programme runs on weekly releases.
 *
 * `undated` is counted but deliberately kept OUT of the bar's proportions —
 * 67 of 656 tasks in production carry no due date, and rendering them as a fifth
 * segment would imply a schedule position they do not have. They are reported as
 * a separate caption instead.
 */
export interface TaskBuckets {
  total: number;
  done: number;
  overdue: number;
  due_this_week: number;
  open: number;
  undated: number;
}

export const DUE_SOON_DAYS = 7;

export function bucketTasks(
  tasks: Array<{ status?: string | null; due_on?: string | null }> | null | undefined,
  today: string
): TaskBuckets {
  const b: TaskBuckets = { total: 0, done: 0, overdue: 0, due_this_week: 0, open: 0, undated: 0 };
  if (!Array.isArray(tasks)) return b;

  const horizon = addDays(today, DUE_SOON_DAYS);

  for (const t of tasks) {
    b.total += 1;
    if (t.status === DONE) { b.done += 1; continue; }
    const due = t.due_on ? String(t.due_on).slice(0, 10) : null;
    if (!due) { b.undated += 1; continue; }
    if (due < today) b.overdue += 1;
    else if (due <= horizon) b.due_this_week += 1;
    else b.open += 1;
  }
  return b;
}

/** `YYYY-MM-DD` plus n days, in UTC. */
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + n * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

export type ReleaseState = 'landed' | 'overdue' | 'due_soon' | 'open' | 'empty';

/**
 * One release reduced to a single status, for the small strip of segments that
 * summarises a project's whole spine on a collapsed row.
 *
 * Order matters: a release with ANY overdue task reads as overdue even if most of
 * it landed, because the overdue work is the thing needing attention. Fully
 * complete wins only when nothing is outstanding.
 */
export function releaseState(b: TaskBuckets): ReleaseState {
  if (b.total === 0) return 'empty';
  if (b.overdue > 0) return 'overdue';
  if (b.done === b.total) return 'landed';
  if (b.due_this_week > 0) return 'due_soon';
  return 'open';
}

/* ------------------------------------------------------------------ */
/*  Build evidence                                                     */
/* ------------------------------------------------------------------ */

export interface EvidenceSummary {
  /** False when no manifest rows exist. The UI must render a cause, not a row of
   *  zeros — zeros would assert "they built nothing", which is a different claim
   *  from "nothing was recorded". */
  has_evidence: boolean;
  manifests: number;
  files_created: number;
  files_modified: number;
  apis_added: number;
  ui_components_added: number;
  tests_added: number;
  database_changes: number;
  last_execution_at: string | null;
}

/** Length of a jsonb column that should hold an array. Nullable in the schema, and
 *  observed holding objects as well, so anything non-array counts as 0 rather than
 *  throwing or producing NaN. */
function countArray(v: unknown): number {
  return Array.isArray(v) ? v.length : 0;
}

export function summariseEvidence(
  rows: Array<Record<string, unknown>> | null | undefined
): EvidenceSummary {
  const empty: EvidenceSummary = {
    has_evidence: false, manifests: 0, files_created: 0, files_modified: 0,
    apis_added: 0, ui_components_added: 0, tests_added: 0, database_changes: 0,
    last_execution_at: null,
  };
  if (!Array.isArray(rows) || rows.length === 0) return empty;

  let last: string | null = null;
  const out: EvidenceSummary = { ...empty, has_evidence: true, manifests: rows.length };
  for (const r of rows) {
    out.files_created += countArray(r.files_created);
    out.files_modified += countArray(r.files_modified);
    out.apis_added += countArray(r.apis_added);
    out.ui_components_added += countArray(r.ui_components_added);
    out.tests_added += countArray(r.tests_added);
    out.database_changes += countArray(r.database_changes);
    const ts = isoDateTime(r.execution_timestamp);
    if (ts && (!last || ts > last)) last = ts;
  }
  out.last_execution_at = last;
  return out;
}

function isoDateTime(v: unknown): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/* ------------------------------------------------------------------ */
/*  Repo verification — the evidence that actually exists              */
/* ------------------------------------------------------------------ */

/**
 * WHY THIS REPLACED THE MANIFEST COUNTS AS THE PRIMARY SOURCE.
 *
 * The build-evidence panel first read `build_manifests`, which are emitted by a
 * student's own Claude Code to `POST /api/portal/project/telemetry`. That endpoint
 * is real and student-facing, but nothing in the Student Build Pipeline's docs
 * bundle, command-center story or build prompt ever tells a student to emit — so
 * every one of the 178 manifests in production belongs to the platform's own
 * project or a withdrawn test account, and ZERO to the 30 live student projects.
 *
 * Meanwhile the platform ALREADY verifies student work server-side: a job
 * (`verified_by = 'build_pipeline:repo_verification'`) reads each student's repo
 * and checks their acceptance criteria against real commits, writing the result to
 * `student_tasks.verification_json` — present on 309 tasks, with commit SHAs on 174.
 *
 * That is both richer and available today: a commit SHA is proof, and `outstanding`
 * names the exact criteria blocking a task. Closing the gap therefore needed no
 * student-side token and no change to the auth posture — only pointing at the
 * evidence the platform was already collecting.
 */
export interface VerificationSummary {
  /** True when any task carries a verification record. */
  has_verification: boolean;
  tasks_with_verification: number;
  verified_tasks: number;
  in_progress_tasks: number;
  /** Distinct commits the verifier matched — real construction, not self-report. */
  commits: number;
  latest_commit_sha: string | null;
  latest_commit_at: string | null;
  last_checked_at: string | null;
  criteria_passed: number;
  criteria_total: number;
  /** Deduplicated criteria still outstanding, most recent first. Capped by the
   *  caller for display; the count is the honest total. */
  outstanding: string[];
  outstanding_count: number;
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}
function asInt(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Rolls per-task verification records into one project-level picture.
 *
 * `verification_json` is jsonb and every field is optional, so each read is
 * defensive: a missing `criteria_total` must contribute 0, not NaN, and a
 * malformed row must not take the panel down.
 */
export function summariseVerification(
  rows: Array<Record<string, unknown>> | null | undefined
): VerificationSummary {
  const empty: VerificationSummary = {
    has_verification: false, tasks_with_verification: 0, verified_tasks: 0,
    in_progress_tasks: 0, commits: 0, latest_commit_sha: null, latest_commit_at: null,
    last_checked_at: null, criteria_passed: 0, criteria_total: 0,
    outstanding: [], outstanding_count: 0,
  };
  if (!Array.isArray(rows) || rows.length === 0) return empty;

  const out: VerificationSummary = { ...empty };
  const shas = new Set<string>();
  const seenOutstanding = new Set<string>();
  let latestCommitAt: string | null = null;
  let latestSha: string | null = null;

  for (const r of rows) {
    const v = (r && typeof r === 'object' ? (r as any).verification_json : null) as any;
    if (!v || typeof v !== 'object') continue;
    out.tasks_with_verification += 1;

    const state = asString(v.state);
    if (state === 'verified') out.verified_tasks += 1;
    else if (state === 'in_progress') out.in_progress_tasks += 1;

    out.criteria_passed += asInt(v.criteria_passed);
    out.criteria_total += asInt(v.criteria_total);

    const sha = asString(v.commit_sha);
    if (sha) {
      shas.add(sha);
      const at = asString(v.commit_at);
      // Track the newest commit; a row with a sha but no date still counts toward
      // the commit total but cannot win "latest".
      if (at && (!latestCommitAt || at > latestCommitAt)) {
        latestCommitAt = at;
        latestSha = sha;
      } else if (!latestSha) {
        latestSha = sha;
      }
    }

    const checked = asString(v.checked_at);
    if (checked && (!out.last_checked_at || checked > out.last_checked_at)) {
      out.last_checked_at = checked;
    }

    if (Array.isArray(v.outstanding)) {
      for (const o of v.outstanding) {
        const text = asString(o);
        if (text && !seenOutstanding.has(text)) {
          seenOutstanding.add(text);
          out.outstanding.push(text);
        }
      }
    }
  }

  out.commits = shas.size;
  out.latest_commit_sha = latestSha;
  out.latest_commit_at = latestCommitAt;
  out.outstanding_count = out.outstanding.length;
  out.has_verification = out.tasks_with_verification > 0;
  return out;
}

/* ------------------------------------------------------------------ */
/*  Artifacts                                                          */
/* ------------------------------------------------------------------ */

export interface ArtifactVersion {
  version: number | null;
  submission_id: string | null;
  title: string | null;
  file_name: string | null;
  /** True when the submission carries renderable content. Every artifact observed in
   *  production has `file_name` null and `content_json` populated, so the UI offers
   *  the content rather than a download link that would 404. */
  has_content: boolean;
  submitted_at: string | null;
  stage: string | null;
}

export interface ArtifactGroup {
  name: string;
  latest_version: number | null;
  versions: ArtifactVersion[];
}

/**
 * Groups artifact rows by definition name, newest version first.
 *
 * Rows arrive one per version (production holds four rows that are all versions of
 * "System Requirements Specification"), so listing them raw would show the same
 * document four times as though four artifacts existed.
 */
export function groupArtifacts(
  rows: Array<Record<string, any>> | null | undefined
): ArtifactGroup[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const byName = new Map<string, ArtifactVersion[]>();

  for (const r of rows) {
    const name = (r.artifact_name ?? r.name ?? 'Untitled artifact').toString();
    const v: ArtifactVersion = {
      version: typeof r.version === 'number' ? r.version : Number(r.version) || null,
      submission_id: r.submission_id ?? null,
      title: r.title ?? null,
      file_name: r.file_name ?? null,
      has_content: !!r.has_content,
      submitted_at: isoDateTime(r.submitted_at),
      stage: r.artifact_stage ?? null,
    };
    const list = byName.get(name);
    if (list) list.push(v);
    else byName.set(name, [v]);
  }

  return [...byName.entries()]
    .map(([name, versions]) => {
      versions.sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
      return { name, latest_version: versions[0]?.version ?? null, versions };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
