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
  };
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
