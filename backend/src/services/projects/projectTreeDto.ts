/**
 * projectTreeDto — PURE mappers (no I/O, no Sequelize) that turn plain
 * `student_tasks` / `student_task_lists` / `projects` attribute objects into the
 * API DTO the portal reads. Kept I/O-free so the shape + ordering + counts are
 * trivially unit-testable. The I/O shell is projectReadService.ts.
 *
 * This is the read half of the Project Backend (P1) — it serves the unified
 * StudentTask hierarchy the localStorage `projectsStore` will migrate onto.
 */

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
export function toProjectTreeDto(p: Plain, lists: Array<Plain & { tasks?: Plain[] }>): ProjectTreeDto {
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
