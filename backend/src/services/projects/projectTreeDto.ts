/**
 * projectTreeDto — PURE mappers (no I/O, no Sequelize) that turn plain
 * `student_tasks` / `student_task_lists` / `projects` attribute objects into the
 * API DTO the portal reads. Kept I/O-free so the shape + ordering + counts are
 * trivially unit-testable. The I/O shell is projectReadService.ts.
 *
 * This is the read half of the Project Backend (P1) — it serves the unified
 * StudentTask hierarchy the localStorage `projectsStore` will migrate onto.
 *
 * ONE RULE THIS FILE ENFORCES: verification is recorded in our database, and
 * `verification_json` is only a view of the last repo read. Every verification
 * field served from here goes through `applyVerificationLatch`, so nothing a
 * student does to their repo can make already-verified work look undone. See
 * sbp/verification/verificationLatch.ts.
 */
import {
  applyVerificationLatch, isLatched, latchNote,
  VerificationLatch, VerificationRecord,
} from '../sbp/verification/verificationLatch';

export type { VerificationLatch };

export interface ProjectTaskDto {
  id: string;
  story_id: string | null;
  requirement_key: string | null;
  requirement_map_id: string | null;
  title: string;
  description: string | null;
  status: string;
  position: number;
  owner_agent: string | null;
  execution_mode: string | null;   // 🤖 AI / 🧑 human
  release_key: string | null;
  acceptance: unknown;             // string[] (Gherkin/trust lines)
  build: string | null;            // the Claude Code prompt ("vibe-code it")
  vibe: string | null;
  trust: string | null;
  fulfills: unknown;               // requirement keys this story fulfills
  blocked_by: string[];            // story_ids this task waits on (release gate)
  // Dates the schedule assigned. `due_on` moves if a student shifts their plan;
  // `due_baseline_on` is written once at first publish and never again, so the
  // original deadline stays visible next to the current one. Both are DATEONLY
  // in the database and serialise as 'YYYY-MM-DD' — never a timestamp, because
  // a due date with a time on it lands on the wrong day in another timezone.
  due_on: string | null;
  due_baseline_on: string | null;
  /**
   * When the platform confirmed this story is actually done, as opposed to
   * `status` which is only what the student claims. Null means unverified, and
   * unverified is what the points gate will read — so the portal needs this on
   * the same payload it already renders the task from, not behind a second call
   * nobody makes. Full ISO timestamp (not a date): unlike a due date, the
   * instant of verification is a real point in time and the client decides how
   * to display it.
   */
  verified_at: string | null;
  /**
   * The live verdict from the last repo read: how far this story actually got,
   * what is still outstanding, and the commit behind it. Null until the project
   * has been synced at least once.
   *
   * Separate from `verified_at` on purpose. That field is a one-way latch — set
   * once, never moved. This one changes every sync, because "2 of 4 criteria,
   * waiting on the other two" is the answer a student needs while they are
   * still working, and it has to be allowed to go up.
   */
  verification: TaskVerificationDto | null;
}

/** Per-story verification state. The portal and the student's Command Center both read this. */
export interface TaskVerificationDto {
  /**
   * `submitted` is a real resting state, not a failure: it means some criteria
   * pass and some do not, or all pass but no commit names the story yet. Most
   * stories live here for a while, and the UI must say which criteria are
   * outstanding rather than leaving the student wondering why nothing happened.
   */
  state: 'not_started' | 'in_progress' | 'submitted' | 'verified';
  criteria_total: number;
  criteria_passed: number;
  /** Exact text of every criterion still outstanding — this is what the UI lists. */
  outstanding: string[];
  commit_sha: string | null;
  commit_at: string | null;
  /** Plain-language "why not verified yet". Empty once verified. */
  reasons: string[];
  /** Claims in the progress file that match no criterion in the published plan. */
  rejected_claims: string[];
  checked_at: string | null;
  /**
   * True when this story is held at `verified` by the immutable
   * `student_tasks.verified_at` latch rather than by the current repo read —
   * the student deleted the progress file, rewrote history, or the evidence
   * commit aged out of the read window. The UI uses it to say "still verified,
   * we just cannot re-check it" instead of silently showing complete work.
   */
  latched: boolean;
  /**
   * What the CURRENT repo read concluded, when it disagrees with the latch.
   * Diagnostic only. Never render this as the story's state.
   */
  live_state: TaskVerificationDto['state'] | null;
  /**
   * Set when the last sync could not READ `.colaberry/progress.json` — bad
   * JSON, wrong shape, a version we do not know. One sentence, written for the
   * student, rendered verbatim.
   *
   * WHEN THIS IS SET, THE FIELDS ABOVE IT ARE STALE. They are the last verdict
   * we could actually reach, not a conclusion about the push that just landed,
   * and a UI that lists `outstanding` beside this is telling a student their
   * criteria failed when the truth is we could not see them. Render this
   * INSTEAD, not alongside.
   */
  read_error: string | null;
  /** `ProgressFileSchemaMismatch`, `ProgressFileNotJson`, … For triage, not display. */
  read_error_class: string | null;
}

/** Build-level roll-up, derived from the per-story verdicts already on the tree. */
export interface BuildVerificationRollupDto {
  stories_total: number;
  stories_verified: number;
  stories_submitted: number;
  stories_in_progress: number;
  stories_not_started: number;
  criteria_total: number;
  criteria_passed: number;
  /** Distinct evidence commits behind the verified stories. */
  commits: number;
  /** Builder XP earned from verified stories, as recorded on the tasks. */
  xp_earned: number;
  /** Most recent per-story check, or null when the project has never been synced. */
  last_checked_at: string | null;
}

export interface ProjectListDto {
  id: string;
  cluster: string;
  title: string;
  status: string;
  position: number;
  tasks: ProjectTaskDto[];
}

export interface TaskCounts {
  total: number;
  complete: number;
  in_progress: number;
  blocked: number;
  not_started: number;
}

export interface ProjectTreeDto {
  id: string;
  name: string | null;
  organization_name: string | null;
  industry: string | null;
  project_stage: string | null;
  requirements_completion_pct: number | null;
  health_score: number | null;
  lists: ProjectListDto[];
  task_counts: TaskCounts;
  /**
   * Where this project's Command Center is running, once STORY-000 is built and
   * deployed. Held in `project_variables` rather than its own column: it is one
   * nullable string, and a migration on a core table hours before a class is a
   * bad trade for a field a JSONB blob already holds.
   */
  command_center_url: string | null;
  /**
   * How the build is actually going, rolled up from the per-story verdicts.
   * Null until the project has been synced at least once — a zeroed roll-up and
   * a never-checked project must not look the same, because the first means
   * "you have not started" and the second means "we have not looked".
   */
  build_verification: BuildVerificationRollupDto | null;
}

export interface ProjectSummaryDto {
  id: string;
  name: string | null;
  organization_name: string | null;
  project_stage: string | null;
  requirements_completion_pct: number | null;
  health_score: number | null;
  is_active: boolean;
}

type Plain = Record<string, any>;
const asArray = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
/** A non-empty string or null. A blank message must not render as an empty banner. */
const asText = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const byPosition = (a: { position: number }, b: { position: number }) => a.position - b.position;

/**
 * DATEONLY columns come back from Sequelize as 'YYYY-MM-DD' strings, but a raw
 * query or a model configured differently can yield a Date. Normalise both to
 * the date string the portal renders, and never emit a timestamp: a due date
 * carrying a time is a due date that lands on the wrong day somewhere.
 */
function asDateOnly(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

/**
 * TIMESTAMPTZ columns come back from Sequelize as a Date, but a raw query, a
 * JSON round-trip, or a cached row can hand over a string instead. Everything
 * leaves here as one shape — an ISO-8601 string or null — because a DTO field
 * that is sometimes a Date and sometimes a string is a field every consumer has
 * to defend against, and `JSON.stringify` quietly papering over the difference
 * is why nobody notices until something compares two of them.
 *
 * Anything unparseable becomes null rather than being passed through: this
 * field will gate points, and a garbage value must read as "not verified", not
 * as "verified at ???".
 */
function asIsoTimestamp(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  const d = v instanceof Date ? v : new Date(v as string | number);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const VERIFICATION_STATES = ['not_started', 'in_progress', 'submitted', 'verified'] as const;

/**
 * Read the stored verdict defensively, then apply the immutable latch over it.
 *
 * The blob is a JSONB snapshot of the last repo read, written by some release
 * of this code, so a row can predate any field added later — and an
 * unrecognised `state` must read as "we do not know", never as `verified`. The
 * generous direction on a field that gates credit is the wrong direction.
 *
 * THE LATCH IS APPLIED HERE AS WELL AS AT THE WRITE, deliberately. This is the
 * one function every display surface goes through, so putting the rule here
 * means a blob written by a buggy path, an older release, a replay, or a future
 * caller that forgets still cannot show a student that verified work has
 * vanished. The write-side latch keeps the stored data honest; this one keeps
 * the screen honest regardless.
 */
export function toTaskVerificationDto(v: unknown, latch?: VerificationLatch | null): TaskVerificationDto | null {
  const latched = isLatched(latch);
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    // No blob at all. Normally "never synced" ⇒ null. But a task carrying
    // `verified_at` with no verdict beside it is a real state — a row verified
    // before this field existed, or one whose blob was lost — and rendering it
    // as "never checked" would erase a completion we hold the record for.
    return latched ? latchedFromNothing(latch!) : null;
  }
  const raw = v as Record<string, unknown>;
  const state = (VERIFICATION_STATES as readonly string[]).includes(String(raw.state))
    ? (raw.state as TaskVerificationDto['state'])
    : 'not_started';
  const stored: VerificationRecord = {
    state,
    criteria_total: Number(raw.criteria_total ?? 0) || 0,
    criteria_passed: Number(raw.criteria_passed ?? 0) || 0,
    outstanding: asArray(raw.outstanding),
    commit_sha: typeof raw.commit_sha === 'string' ? raw.commit_sha : null,
    commit_at: asIsoTimestamp(raw.commit_at),
    reasons: asArray(raw.reasons),
    rejected_claims: asArray(raw.rejected_claims),
    checked_at: asIsoTimestamp(raw.checked_at),
    read_error: asText(raw.read_error),
    read_error_class: asText(raw.read_error_class),
  };
  const applied = applyVerificationLatch(stored, latch, stored);
  // A verified story is finished, so a leftover read error on it is noise
  // attached to work that is already banked. The writer never annotates a
  // verified record; this drops one that arrived by any other route.
  const verified = applied.state === 'verified';
  return {
    ...applied,
    commit_at: asIsoTimestamp(applied.commit_at),
    latched: Boolean(applied.latched),
    live_state: applied.live_state ?? null,
    read_error: verified ? null : (applied.read_error ?? null),
    read_error_class: verified ? null : (applied.read_error_class ?? null),
  };
}

/** A verified task with no verdict blob beside it. The record still stands. */
function latchedFromNothing(latch: VerificationLatch): TaskVerificationDto {
  return {
    state: 'verified',
    criteria_total: 0,
    criteria_passed: 0,
    outstanding: [],
    commit_sha: typeof latch.verified_ref === 'string' ? latch.verified_ref : null,
    commit_at: null,
    reasons: [latchNote('not_started')],
    rejected_claims: [],
    checked_at: asIsoTimestamp(latch.verified_at),
    latched: true,
    live_state: null,
    read_error: null,
    read_error_class: null,
  };
}

/**
 * Roll the per-story verdicts up to a build. PURE — derived from the tree that
 * was already assembled, so the roll-up can never disagree with the stories
 * underneath it.
 *
 * `commits` counts DISTINCT evidence commits on verified stories. Two stories
 * genuinely finished in one commit are one commit, not two: this number is
 * meant to answer "how much did they push", and double-counting a single push
 * would inflate it.
 */
export function toBuildVerificationRollup(
  lists: ProjectListDto[],
  xpEarned = 0,
): BuildVerificationRollupDto | null {
  const seen = lists.flatMap((l) => l.tasks).map((t) => t.verification).filter((v): v is TaskVerificationDto => v !== null);
  if (seen.length === 0) return null;

  const commits = new Set(
    seen.filter((v) => v.state === 'verified' && v.commit_sha).map((v) => v.commit_sha as string),
  );
  const checked = seen.map((v) => v.checked_at).filter((s): s is string => !!s).sort();

  return {
    stories_total: seen.length,
    stories_verified: seen.filter((v) => v.state === 'verified').length,
    stories_submitted: seen.filter((v) => v.state === 'submitted').length,
    stories_in_progress: seen.filter((v) => v.state === 'in_progress').length,
    stories_not_started: seen.filter((v) => v.state === 'not_started').length,
    criteria_total: seen.reduce((n, v) => n + v.criteria_total, 0),
    criteria_passed: seen.reduce((n, v) => n + v.criteria_passed, 0),
    commits: commits.size,
    xp_earned: xpEarned,
    last_checked_at: checked.length ? checked[checked.length - 1] : null,
  };
}

export function toTaskDto(t: Plain): ProjectTaskDto {
  return {
    id: String(t.id),
    story_id: t.story_id ?? null,
    requirement_key: t.requirement_key ?? null,
    requirement_map_id: t.requirement_map_id ?? null,
    title: t.title ?? '',
    description: t.description ?? null,
    status: t.status ?? 'not_started',
    position: Number(t.position ?? 0),
    owner_agent: t.owner_agent ?? null,
    execution_mode: t.execution_mode ?? null,
    release_key: t.release_key ?? null,
    acceptance: t.acceptance ?? null,
    build: t.build ?? null,
    vibe: t.vibe ?? null,
    trust: t.trust ?? null,
    fulfills: t.fulfills ?? null,
    blocked_by: asArray(t.blocked_by),
    due_on: asDateOnly(t.due_on),
    due_baseline_on: asDateOnly(t.due_baseline_on),
    verified_at: asIsoTimestamp(t.verified_at),
    // The latch columns travel with the blob, always. A caller that passes the
    // blob alone gets the repo's opinion of the student's work instead of ours.
    verification: toTaskVerificationDto(t.verification_json, {
      verified_at: t.verified_at ?? null,
      verified_by: t.verified_by ?? null,
      verified_ref: t.verified_ref ?? null,
    }),
  };
}

/** Map a list plus its (unordered) tasks; tasks are sorted by position. */
export function toListDto(l: Plain, tasks: Plain[]): ProjectListDto {
  return {
    id: String(l.id),
    cluster: l.cluster ?? '',
    title: l.title ?? '',
    status: l.status ?? 'not_started',
    position: Number(l.position ?? 0),
    tasks: tasks.map(toTaskDto).sort(byPosition),
  };
}

function countTasks(lists: ProjectListDto[]): TaskCounts {
  const c: TaskCounts = { total: 0, complete: 0, in_progress: 0, blocked: 0, not_started: 0 };
  for (const l of lists) {
    for (const t of l.tasks) {
      c.total += 1;
      if (t.status === 'complete') c.complete += 1;
      else if (t.status === 'in_progress') c.in_progress += 1;
      else if (t.status === 'blocked') c.blocked += 1;
      else c.not_started += 1;
    }
  }
  return c;
}

/**
 * Build the full project tree. `lists` are plain list objects each carrying a
 * `tasks: Plain[]` array (assembled by the I/O layer). Lists are sorted by
 * position; counts are derived across all tasks.
 */
export function toProjectTreeDto(
  p: Plain,
  lists: Array<Plain & { tasks?: Plain[] }>,
  /**
   * Builder XP already recorded for this project's verified stories. Injected
   * because it lives in `evidence_records`, not on the task — and this mapper
   * stays I/O-free.
   */
  verificationXpEarned = 0,
): ProjectTreeDto {
  const listDtos = lists
    .map((l) => toListDto(l, Array.isArray(l.tasks) ? l.tasks : []))
    .sort(byPosition);
  return {
    id: String(p.id),
    name: p.name ?? null,
    organization_name: p.organization_name ?? null,
    industry: p.industry ?? null,
    project_stage: p.project_stage ?? null,
    requirements_completion_pct: p.requirements_completion_pct ?? null,
    health_score: p.health_score ?? null,
    lists: listDtos,
    task_counts: countTasks(listDtos),
    command_center_url: commandCenterUrl(p),
    build_verification: toBuildVerificationRollup(listDtos, verificationXpEarned),
  };
}

/**
 * Only ever an https URL. A student pastes whatever their host gave them, and
 * this is rendered as a link that opens in a new tab — so `javascript:` and
 * friends are refused here rather than trusted to the browser.
 */
export function commandCenterUrl(p: Plain): string | null {
  const raw = (p?.project_variables as any)?.command_center_url;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const url = raw.trim();
  return /^https:\/\/[^\s]+$/i.test(url) ? url : null;
}

export function toProjectSummaryDto(p: Plain, activeProjectId: string | null): ProjectSummaryDto {
  return {
    id: String(p.id),
    name: p.name ?? null,
    organization_name: p.organization_name ?? null,
    project_stage: p.project_stage ?? null,
    requirements_completion_pct: p.requirements_completion_pct ?? null,
    health_score: p.health_score ?? null,
    is_active: activeProjectId != null && String(p.id) === String(activeProjectId),
  };
}
