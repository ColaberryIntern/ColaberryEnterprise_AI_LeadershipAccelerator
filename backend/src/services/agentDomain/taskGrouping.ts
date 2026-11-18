/**
 * AF12.1 — read a TASK, with the several tools it needs.
 *
 * ## Why this exists
 *
 * Ali, 17 Nov 2026: *"you have a task that uses multiple tools."* Until `task_key` existed, the
 * decide screen could only ever show one request at a time, and deciding tool 2 of 3 without
 * seeing the other two is deciding blind. This turns rows the console already has into the shape
 * the console actually needs.
 *
 * ## Pure on purpose
 *
 * No query of its own. `ChangeRequestRow` already carries the detail, the package and the
 * readiness, so a second round trip would be a second source of truth about the same request.
 * Keeping it pure also means the grouping can be tested without a database, which is the only
 * way the interesting cases (a task half granted, a task whose tools disagree about its name)
 * get covered at all.
 *
 * ## What a tool's state can honestly be
 *
 * Derived from the request's own status and nothing else. A grant lives in
 * `agent_domain_tool_grants` and is NOT on this row; inferring "granted" from `approved` would be
 * the same mistake as reading a merged PR as a deployed one. `approved` here means a human said
 * yes, which is not yet the agent holding the tool, and the vocabulary says so.
 */
import type { AgentChangeRequestStatus } from './agentChangeRequest';
import type { ChangeRequestRow } from './agentChangeRequestService';

/** Where one tool of a task stands. Deliberately not the word "granted". */
export type ToolState = 'waiting_on_a_decision' | 'approved_to_build' | 'declined' | 'withdrawn';

export interface TaskTool {
  readonly request_id: string;
  readonly tool_name: string;
  readonly title: string;
  readonly state: ToolState;
  readonly requested_at: string | null;
  /** True when the package is in front of a human. Absent package means not ready. */
  readonly ready_to_decide: boolean;
  /** Named blocks still outstanding, so a reader sees WHAT is missing, not just that it is. */
  readonly not_ready_because: ReadonlyArray<string>;
}

export interface GroupedTask {
  readonly task_key: string;
  readonly domain_key: string;
  /**
   * The task in prose. Several tools of one task may word it differently, since each builder
   * typed their own sentence; the longest is kept because it is the most specific, and the
   * alternatives are preserved rather than silently dropped.
   */
  readonly task_label: string;
  readonly other_labels: ReadonlyArray<string>;
  readonly tools: ReadonlyArray<TaskTool>;
  readonly waiting_on_a_decision: number;
  readonly approved_to_build: number;
  /**
   * AF10.9 rung 4 says the agent does it watched once EVERY tool the task needs exists.
   * This is the only honest reading of that condition, and it is false while any tool is
   * still waiting or was declined.
   */
  readonly every_tool_decided: boolean;
}

function stateOf(status: AgentChangeRequestStatus): ToolState {
  switch (status) {
    case 'approved': return 'approved_to_build';
    case 'declined': return 'declined';
    case 'withdrawn': return 'withdrawn';
    default: return 'waiting_on_a_decision';
  }
}

/**
 * Why this tool is not yet in front of a human, in the readiness check's own words.
 *
 * The block names come straight from `bounced_blocks` rather than being re-described here. A
 * second wording of the same refusal is a second thing to keep in agreement, and the one that
 * drifts is always the copy furthest from the check.
 */
function notReadyBecause(row: ChangeRequestRow): string[] {
  const r = row.readiness;
  if (!r || !r.has_package) return ['no decision package has been written'];
  if (r.ready_for_a_human) return [];
  if (r.bounced_blocks.length) return r.bounced_blocks.map((b) => String(b));
  return ['the decision package is not complete'];
}

/**
 * Group tool requests into the tasks they serve.
 *
 * Rows that are not tool requests, or that carry no task key, are not forced into a task: a
 * change request is a different kind of thing and inventing a task for it would put a row on a
 * screen that claims a grouping nobody declared. The caller gets them back separately.
 */
export function groupIntoTasks(rows: ReadonlyArray<ChangeRequestRow>): {
  tasks: GroupedTask[];
  ungrouped: ChangeRequestRow[];
} {
  const byKey = new Map<string, ChangeRequestRow[]>();
  const ungrouped: ChangeRequestRow[] = [];

  for (const row of rows) {
    const key = (row.tool_request?.task_key ?? '').trim().toLowerCase();
    if (!key) { ungrouped.push(row); continue; }
    // Keyed by domain too: two domains may legitimately use the same obvious word for a task,
    // and merging them would show a builder somebody else's work as part of their own.
    const id = `${row.domain_key}::${key}`;
    const list = byKey.get(id);
    if (list) list.push(row); else byKey.set(id, [row]);
  }

  const tasks: GroupedTask[] = [];
  for (const [id, group] of byKey) {
    const [domain_key, task_key] = id.split('::');
    const labels = [...new Set(
      group.map((r) => (r.tool_request?.task_unblocked ?? '').trim()).filter(Boolean),
    )].sort((a, b) => b.length - a.length);

    const tools: TaskTool[] = group
      .map((r) => {
        const missing = notReadyBecause(r);
        return {
          request_id: r.id,
          tool_name: r.tool_request?.tool_name ?? '',
          title: r.title,
          state: stateOf(r.status),
          requested_at: r.requested_at,
          ready_to_decide: missing.length === 0,
          not_ready_because: missing,
        };
      })
      .sort((a, b) => (a.requested_at ?? '').localeCompare(b.requested_at ?? ''));

    const waiting = tools.filter((t) => t.state === 'waiting_on_a_decision').length;
    const approved = tools.filter((t) => t.state === 'approved_to_build').length;

    tasks.push({
      task_key,
      domain_key,
      task_label: labels[0] ?? task_key,
      other_labels: labels.slice(1),
      tools,
      waiting_on_a_decision: waiting,
      approved_to_build: approved,
      every_tool_decided: tools.length > 0 && waiting === 0,
    });
  }

  tasks.sort((a, b) => (b.waiting_on_a_decision - a.waiting_on_a_decision)
    || a.task_key.localeCompare(b.task_key));

  return { tasks, ungrouped };
}

/**
 * The siblings of one request: the other tools the same task needs.
 *
 * This is what the detail view puts beside a request so the decision is made in context rather
 * than in isolation. An empty array means this task needs one tool, which is a real answer and
 * not a missing one.
 */
export function siblingTools(
  rows: ReadonlyArray<ChangeRequestRow>, requestId: string,
): { task: GroupedTask | null; siblings: TaskTool[] } {
  const { tasks } = groupIntoTasks(rows);
  const task = tasks.find((t) => t.tools.some((x) => x.request_id === requestId)) ?? null;
  if (!task) return { task: null, siblings: [] };
  return { task, siblings: task.tools.filter((t) => t.request_id !== requestId) };
}
