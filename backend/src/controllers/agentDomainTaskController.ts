import type { Request, Response } from 'express';
import { z } from 'zod';
import { sequelize } from '../config/database';
import { listAllChangeRequests } from '../services/agentDomain/agentChangeRequestService';
import { groupIntoTasks, siblingTools } from '../services/agentDomain/taskGrouping';

/**
 * GET the queue as TASKS rather than as requests — AF12.1's read surface.
 *
 * Ali, 17 Nov 2026: *"I think we need to do a better job of differentiating between a task and a
 * tool. They can be the same, but they can also be different and you have a task that uses
 * multiple tools."*
 *
 * ## Why this is an endpoint and not a function the page calls
 *
 * The decide console already holds every row, so grouping them on the client would cost nothing
 * and need no route. It would also mean two implementations of the grouping — the one in
 * `taskGrouping.ts` that is tested, and a TypeScript copy in the frontend that is not — and the
 * two would agree until the first time somebody changed one. The rule a task is grouped by is the
 * same rule `toolRequestContract.ts` refuses a malformed key under, so it belongs on the same side
 * of the wire as that contract, once.
 *
 * ## `requireAdmin` at the route, matching the queue it reads
 *
 * This is a projection of `/api/admin/agent-domain-change-requests`, which is admin-only, and it
 * carries the same rows — every builder's requests, across every domain. Putting it on a builder
 * section would widen that queue sideways, which is the thing a projection must never do.
 *
 * ## What it returns beside the tasks
 *
 * `ungrouped`, as a COUNT and the rows themselves. A change request carries no task key and is
 * deliberately not forced into a task, so a console that rendered only `tasks` would silently
 * drop Kalkidan's request — the one real row in production — off the screen. The number is there
 * so the caller can say "and 1 request that is not part of a task" rather than show nothing.
 */

const DetailQuery = z.object({
  /** When given, the response also carries that one request's task and its sibling tools. */
  request_id: z.string().trim().min(1).max(64).optional(),
}).strict();

function log(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    service: 'backend',
    event: 'agent_domain_tasks',
    ...fields,
  }));
}

export async function handleListAgentDomainTasks(req: Request, res: Response): Promise<void> {
  const started = Date.now();
  const actorEmail = (req as { admin?: { email?: string } }).admin?.email ?? '';

  let query: z.infer<typeof DetailQuery>;
  try {
    query = DetailQuery.parse(req.query);
  } catch (err: unknown) {
    res.status(400).json({
      error: 'Invalid input',
      error_class: 'ValidationError',
      issues: err instanceof z.ZodError ? err.issues : [],
    });
    return;
  }

  try {
    const rows = await listAllChangeRequests(sequelize);
    const { tasks, ungrouped } = groupIntoTasks(rows);

    // Computed from the same `rows`, so the siblings a detail view shows cannot disagree with the
    // task list beside it. Resolving it in a second call would have allowed exactly that.
    const focus = query.request_id ? siblingTools(rows, query.request_id) : null;

    log({
      level: 'info',
      outcome: 'success',
      duration_ms: Date.now() - started,
      actor_email: actorEmail,
      context: {
        tasks: tasks.length,
        ungrouped: ungrouped.length,
        waiting: tasks.reduce((n, t) => n + t.waiting_on_a_decision, 0),
        request_id: query.request_id ?? null,
        // Null when a request_id was asked for and belongs to no task, which is a real answer
        // and the one a caller most needs to tell apart from "no siblings".
        focus_found: query.request_id ? Boolean(focus?.task) : null,
      },
    });

    res.json({
      tasks,
      ungrouped,
      ungrouped_count: ungrouped.length,
      ...(query.request_id
        ? { focus: { request_id: query.request_id, task: focus?.task ?? null, siblings: focus?.siblings ?? [] } }
        : {}),
    });
  } catch (err: unknown) {
    log({
      level: 'error',
      outcome: 'failure',
      error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
      duration_ms: Date.now() - started,
      actor_email: actorEmail,
      context: { message: err instanceof Error ? err.message : String(err) },
    });
    res.status(500).json({
      error: 'Could not read the tasks.',
      error_class: 'AgentDomainTasksUnreadable',
    });
  }
}
