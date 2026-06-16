/**
 * bcSyncService — pulls all Basecamp projects → todolists → todos and
 * upserts them into ops_bc_todos. This is the read-mirror that the AI Ops
 * Command Center reads from.
 *
 * Design:
 *   - Idempotent: upsert by bc_id (BC's own todo id is our primary key).
 *   - No writes back to BC from this service. Push-back lives in the
 *     Workflow layer (separate module).
 *   - "Last sync" tracked in last_synced_at column. We never delete; if a
 *     todo disappears from BC we just leave the row.
 *
 * MVP target: 15 active projects × ~50 todos = ~750 rows. Polling every
 * 2 minutes is fine for that volume.
 *
 * Phase 1+: replace with /events.json incremental polling keyed by
 * `since` cursor (stored per project in an ops_sync_state table).
 */
import OpsBcTodo from '../../models/OpsBcTodo';
import OpsBcProject from '../../models/OpsBcProject';
import { sequelize } from '../../config/database';
import { getBcToken, refreshBcToken, isAuthError } from './basecampToken';
import { BC_RETRYABLE_STATUS, bcBackoffMs, bcPace, sleep } from './bcRetry';

// Projects with no BC activity (no todo updated, no project metadata
// touched) in this many days get auto-demoted out of the CB-managed set
// so they stop polluting the queue. Override via env if needed.
const CB_DORMANT_DAYS = Math.max(1, Number(process.env.OPS_CB_DORMANT_DAYS) || 30);

interface BcProject {
  id: number;
  name: string;
  description?: string | null;
  status: string;
  dock: Array<{ name: string; enabled: boolean; id: number; url: string }>;
}

interface BcTodoset {
  id: number;
  todolists_url: string;
}

interface BcTodolist {
  id: number;
  title: string;
  todos_url: string;
  app_url?: string;
}

interface BcTodo {
  id: number;
  title: string;
  content?: string;
  description?: string;
  status?: string;
  completed?: boolean;
  due_on?: string | null;
  assignees?: Array<{ id: number; name: string }>;
  creator?: { id: number; name: string };
  app_url?: string;
  created_at: string;
  updated_at: string;
}

const BC_ACCOUNT_ID = process.env.BASECAMP_ACCOUNT_ID || '3945211';
const BC_API = `https://3.basecampapi.com/${BC_ACCOUNT_ID}`;
const BC_USER_AGENT =
  process.env.BASECAMP_USER_AGENT || 'Colaberry AI Ops Command Center (ali@colaberry.com)';


function bcHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'User-Agent': BC_USER_AGENT,
    Accept: 'application/json',
  };
}

// Resilient BC GET: refreshes the token from CCPP on a 401 (token rotation),
// and backs off + retries on a 429/503 (rate limit). Without the 429 handling
// the sync dropped hundreds of todolists per cycle when Basecamp throttled the
// burst, leaving the ops mirror incomplete.
const BC_MAX_RETRIES = 5;
async function bcGet<T>(url: string): Promise<T> {
  const u = url.startsWith('http') ? url : `${BC_API}${url}`;
  let refreshed = false;
  for (let attempt = 0; ; attempt++) {
    await bcPace(); // stay under BC's rate limit so 429s rarely happen at all
    const r = await fetch(u, { headers: bcHeaders(getBcToken()) });
    if (isAuthError(r.status) && !refreshed) {
      await refreshBcToken();
      refreshed = true;
      continue;
    }
    if (BC_RETRYABLE_STATUS.has(r.status) && attempt < BC_MAX_RETRIES) {
      await sleep(bcBackoffMs(r.headers.get('Retry-After'), attempt));
      continue;
    }
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      throw new Error(`BC GET ${u} -> ${r.status} ${body.slice(0, 200)}`);
    }
    return (await r.json()) as T;
  }
}

/**
 * Pull every page of a BC list endpoint. BC paginates via Link: <next>; rel="next"
 * but the simpler approach in this codebase is to read `?page=N` until empty.
 */
async function bcGetAll<T>(url: string): Promise<T[]> {
  const acc: T[] = [];
  for (let page = 1; page < 50; page++) {
    const sep = url.includes('?') ? '&' : '?';
    const pageUrl = `${url}${sep}page=${page}`;
    const data = await bcGet<T[]>(pageUrl);
    if (!Array.isArray(data) || data.length === 0) break;
    acc.push(...data);
    if (data.length < 15) break; // BC's typical page size cutoff
  }
  return acc;
}

export interface BcSyncResult {
  started_at: Date;
  finished_at: Date;
  projects_seen: number;
  todolists_seen: number;
  todos_seen: number;
  todos_inserted: number;
  todos_updated: number;
  errors: Array<{ stage: string; message: string }>;
}

// Single-flight: a rate-limit-paced pass can exceed the 2-min cron interval.
// Without this guard the cron stacks concurrent passes that fight for the same
// rate-limit budget and never drain (observed 2026-06-16). A skipped tick is
// harmless — the next one re-syncs (upserts are idempotent by bc_id).
let bcSyncInFlight = false;

export async function runBcSync(): Promise<BcSyncResult> {
  if (bcSyncInFlight) {
    return {
      started_at: new Date(),
      finished_at: new Date(),
      projects_seen: 0,
      todolists_seen: 0,
      todos_seen: 0,
      todos_inserted: 0,
      todos_updated: 0,
      errors: [{ stage: 'skipped', message: 'previous sync still in flight' }],
    };
  }
  bcSyncInFlight = true;
  try {
    return await runBcSyncInner();
  } finally {
    bcSyncInFlight = false;
  }
}

/**
 * Run one full sync pass. Safe to invoke concurrently — each upsert is
 * keyed on bc_id so duplicate writes converge to the same end state.
 */
async function runBcSyncInner(): Promise<BcSyncResult> {
  const result: BcSyncResult = {
    started_at: new Date(),
    finished_at: new Date(),
    projects_seen: 0,
    todolists_seen: 0,
    todos_seen: 0,
    todos_inserted: 0,
    todos_updated: 0,
    errors: [],
  };

  // Token is resolved per-request inside bcGet (env token, with CCPP refresh +
  // retry on a 401), so a rotation no longer fails the sync. Surface a clear
  // auth error only if even the first resolve throws (no token anywhere).
  try {
    getBcToken();
  } catch (err: any) {
    result.errors.push({ stage: 'auth', message: err.message });
    result.finished_at = new Date();
    return result;
  }

  let projects: BcProject[];
  try {
    projects = await bcGetAll<BcProject>('/projects.json');
  } catch (err: any) {
    result.errors.push({ stage: 'list_projects', message: err.message });
    result.finished_at = new Date();
    return result;
  }
  result.projects_seen = projects.length;

  for (const project of projects) {
    // Upsert project metadata so the UI can show the name (and so the
    // CB-managed filter has somewhere to live). is_cb_managed defaults to
    // true on first insert; subsequent syncs do NOT overwrite the flag —
    // Ali can toggle it manually later via a separate API.
    try {
      const existingProj = await OpsBcProject.findByPk(String(project.id));
      if (existingProj) {
        await existingProj.update({
          name: project.name,
          description: project.description || null,
          last_synced_at: new Date(),
        });
      } else {
        await OpsBcProject.create({
          bc_id: String(project.id),
          name: project.name,
          description: project.description || null,
          is_cb_managed: true,
          weight: 1.0,
          last_synced_at: new Date(),
        } as any);
      }
    } catch (err: any) {
      result.errors.push({
        stage: `project_upsert:${project.id}`,
        message: err.message,
      });
    }

    // Each project's "todoset" dock entry leads to its todolists.
    const todosetDock = project.dock?.find((d) => d.name === 'todoset' && d.enabled);
    if (!todosetDock) continue;

    let todoset: BcTodoset;
    try {
      todoset = await bcGet<BcTodoset>(todosetDock.url);
    } catch (err: any) {
      result.errors.push({
        stage: `todoset:${project.id}`,
        message: err.message,
      });
      continue;
    }

    let todolists: BcTodolist[];
    try {
      todolists = await bcGetAll<BcTodolist>(todoset.todolists_url);
    } catch (err: any) {
      result.errors.push({
        stage: `todolists:${project.id}`,
        message: err.message,
      });
      continue;
    }
    result.todolists_seen += todolists.length;

    for (const tl of todolists) {
      let todos: BcTodo[];
      try {
        todos = await bcGetAll<BcTodo>(tl.todos_url);
      } catch (err: any) {
        result.errors.push({
          stage: `todos:${project.id}:${tl.id}`,
          message: err.message,
        });
        continue;
      }
      result.todos_seen += todos.length;

      for (const todo of todos) {
        try {
          const upsertResult = await upsertTodo(project.id, tl.id, tl.title, todo);
          if (upsertResult === 'inserted') result.todos_inserted++;
          else if (upsertResult === 'updated') result.todos_updated++;
        } catch (err: any) {
          result.errors.push({
            stage: `upsert:${todo.id}`,
            message: err.message,
          });
        }
      }
    }
  }

  // Auto-detect dormant projects: if a project has zero todos with
  // bc_updated_at in the last CB_DORMANT_DAYS days, flip is_cb_managed=false.
  // Revives any previously-dormant project that now has fresh activity.
  try {
    await sequelize.query(
      `UPDATE ops_bc_projects p
          SET is_cb_managed = sub.has_recent_activity,
              updated_at = NOW()
         FROM (
           SELECT p.bc_id,
                  EXISTS (
                    SELECT 1 FROM ops_bc_todos t
                     WHERE t.project_id = p.bc_id
                       AND t.status = 'active'
                       AND t.bc_updated_at >= NOW() - (:dormant_days || ' days')::interval
                  ) AS has_recent_activity
             FROM ops_bc_projects p
         ) sub
        WHERE p.bc_id = sub.bc_id
          AND p.is_cb_managed <> sub.has_recent_activity`,
      { replacements: { dormant_days: CB_DORMANT_DAYS } },
    );
  } catch (err: any) {
    result.errors.push({ stage: 'cb_managed_autodetect', message: err.message });
  }

  result.finished_at = new Date();
  return result;
}

async function upsertTodo(
  projectId: number,
  todolistId: number,
  todolistName: string,
  todo: BcTodo,
): Promise<'inserted' | 'updated' | 'noop'> {
  const assigneeIds = (todo.assignees || []).map((a) => String(a.id));
  const status = todo.completed ? 'completed' : (todo.status || 'active');
  const now = new Date();

  const payload = {
    bc_id: String(todo.id),
    project_id: String(projectId),
    todolist_id: String(todolistId),
    todolist_name: todolistName,
    title: todo.title || '(untitled)',
    description: todo.description || todo.content || null,
    status,
    due_on: todo.due_on ? new Date(todo.due_on) : null,
    assignee_ids: assigneeIds,
    bc_creator_id: todo.creator ? String(todo.creator.id) : null,
    bc_app_url: todo.app_url || null,
    bc_created_at: new Date(todo.created_at),
    bc_updated_at: new Date(todo.updated_at),
    last_synced_at: now,
  };

  const existing = await OpsBcTodo.findByPk(payload.bc_id);
  if (existing) {
    await existing.update(payload);
    return 'updated';
  }
  await OpsBcTodo.create({ ...payload, category: 'unscored', downstream_blocked_count: 0 } as any);
  return 'inserted';
}
