/**
 * projectWriteDto — PURE helpers for the Project Backend write API (P1b):
 * task-status validation + mapping an import-payload task onto StudentTask
 * attributes. No I/O — trivially unit-testable. I/O shell = projectWriteService.ts.
 */
import type { StudentTaskAttributes } from '../../models/StudentTask';

export const TASK_STATUSES = ['not_started', 'in_progress', 'complete', 'blocked'] as const;
export type TaskStatus = typeof TASK_STATUSES[number];

export function isTaskStatus(s: unknown): s is TaskStatus {
  return typeof s === 'string' && (TASK_STATUSES as readonly string[]).includes(s);
}

/** One task from the client import payload (the localStorage projectsStore shape, normalized). */
export interface ImportTaskInput {
  story_id?: string | null;
  requirement_key?: string | null;
  title: string;
  description?: string | null;
  status?: string | null;
  position?: number;
  owner_agent?: string | null;
  execution_mode?: string | null;
  release_key?: string | null;
  acceptance?: unknown;
  build?: string | null;
  blocked_by?: string[];
}

/** Map a validated import task onto StudentTask attributes (defensive, bounded). */
export function importTaskToAttributes(
  t: ImportTaskInput,
  projectId: string,
  listId: string,
  fallbackPosition: number,
): StudentTaskAttributes {
  return {
    project_id: projectId,
    task_list_id: listId,
    story_id: t.story_id ?? null,
    requirement_key: t.requirement_key ?? null,
    requirement_map_id: null,
    title: (t.title || 'Task').slice(0, 500),
    description: t.description ?? null,
    status: isTaskStatus(t.status) ? t.status : 'not_started',
    position: typeof t.position === 'number' ? t.position : fallbackPosition,
    owner_agent: t.owner_agent ?? null,
    execution_mode: t.execution_mode ?? null,
    release_key: t.release_key ?? null,
    acceptance: t.acceptance ?? null,
    build: t.build ?? null,
    blocked_by: Array.isArray(t.blocked_by) ? t.blocked_by : null,
  };
}
