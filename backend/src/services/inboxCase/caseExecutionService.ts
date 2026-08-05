import InboxCaseAction from '../../models/InboxCaseAction';
import InboxCaseItem from '../../models/InboxCaseItem';
import { ActionStatus } from '../../types/inboxCase';
import { ACTION_EXECUTORS, ClassifiedExecutionError } from './caseActionExecutors';
import { logCaseEvent } from './caseEventLog';
import { getCaseOrThrow, transitionCase } from './caseRepository';
import { postCaseProgressNote } from './caseTicketService';

// Durable-outbox action executor (root directive section 12). The pattern:
// persist -> approve -> lock (EXECUTING) -> idempotency-check -> execute ONE
// external action -> store receipt -> next. A failed action blocks anything
// that depends on it (SKIPPED, never silently promoted to archive). This
// module never executes two actions for the same idempotency_key — that
// guarantee lives at the DB layer (unique index) and is reinforced here by
// reconciliation before every run.

export interface ExecuteResult {
  executed: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

export class MaxRetriesExceededError extends Error {
  error_class = 'MaxRetriesExceededError';
  constructor(public exhaustedActionIds: string[]) {
    super(
      `${exhaustedActionIds.length} action(s) have failed ${MAX_ACTION_ATTEMPTS} times and will not be retried automatically. Regenerate the plan or reject them to unblock this case.`
    );
    this.name = 'MaxRetriesExceededError';
  }
}

// Bounded retry cap for a FAILED action re-entering the retry-eligible set
// on the next "Retry Failed" / execute() call. Prevents an infinite retry
// loop against an external provider (CLAUDE.md: "retrying without an
// upper bound is explicitly prohibited") while giving genuinely transient
// failures (a rate limit, a momentary timeout) real room to succeed on a
// later attempt.
const MAX_ACTION_ATTEMPTS = 5;

// Reconciliation: picks up any action left in EXECUTING by an interrupted
// prior run (process crash, browser refresh mid-run, etc.) BEFORE the main
// loop starts. If an external_receipt already exists, the side effect
// happened — promote straight to SUCCEEDED rather than risk re-sending. If
// no receipt exists, nothing external happened yet — reset to APPROVED so
// the main loop retries it safely (attempt_count already reflects prior
// attempts, so a runaway retry loop is still bounded by the caller).
export async function reconcileStuckActions(caseId: string): Promise<number> {
  const stuck = await InboxCaseAction.findAll({ where: { case_id: caseId, status: 'EXECUTING' } });
  let reconciled = 0;
  for (const action of stuck) {
    if (action.external_receipt) {
      await action.update({ status: 'SUCCEEDED', updated_at: new Date() });
      await logCaseEvent({
        case_id: caseId,
        action_id: action.id,
        event_type: 'action_execution_reconciled_as_succeeded',
        actor_type: 'system',
        actor_id: 'case_execution_service',
        details: { reason: 'external_receipt present after interruption' },
        correlation_id: action.correlation_id,
      });
    } else {
      await action.update({ status: 'APPROVED', updated_at: new Date() });
      await logCaseEvent({
        case_id: caseId,
        action_id: action.id,
        event_type: 'action_execution_reconciled_as_retryable',
        actor_type: 'system',
        actor_id: 'case_execution_service',
        details: { reason: 'no external_receipt — safe to retry' },
        correlation_id: action.correlation_id,
      });
    }
    reconciled++;
  }
  return reconciled;
}

// Kahn's-algorithm topological sort over depends_on_action_ids so archive
// actions (which depend on everything else in the plan) always sort last,
// and any action is only attempted once every action it depends on has a
// terminal status.
function topologicalOrder(actions: InboxCaseAction[]): InboxCaseAction[] {
  const byId = new Map(actions.map((a) => [a.id, a]));
  const inDegree = new Map(actions.map((a) => [a.id, 0]));
  const dependents = new Map<string, string[]>();

  for (const a of actions) {
    for (const depId of a.depends_on_action_ids) {
      if (!byId.has(depId)) continue; // dependency outside this action set (already terminal) — not a graph edge here
      inDegree.set(a.id, (inDegree.get(a.id) || 0) + 1);
      dependents.set(depId, [...(dependents.get(depId) || []), a.id]);
    }
  }

  const queue = actions.filter((a) => (inDegree.get(a.id) || 0) === 0).map((a) => a.id);
  const ordered: InboxCaseAction[] = [];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    ordered.push(byId.get(id)!);
    for (const depId of dependents.get(id) || []) {
      inDegree.set(depId, (inDegree.get(depId) || 0) - 1);
      if ((inDegree.get(depId) || 0) <= 0) queue.push(depId);
    }
  }

  // Any action not reached (a cycle, which shouldn't happen from the
  // planner but is defended against) is appended at the end rather than
  // silently dropped.
  for (const a of actions) if (!seen.has(a.id)) ordered.push(a);
  return ordered;
}

const BLOCKING_STATUSES: ActionStatus[] = ['FAILED', 'SKIPPED', 'REJECTED'];
const SATISFYING_STATUSES: ActionStatus[] = ['SUCCEEDED', 'VERIFIED'];

export async function executeApprovedActions(caseId: string, requestedBy: string): Promise<ExecuteResult> {
  const caseRow = await getCaseOrThrow(caseId);
  if (caseRow.state === 'AWAITING_APPROVAL' || caseRow.state === 'FAILED') {
    await transitionCase(caseId, 'EXECUTING', {
      actor_type: 'system',
      actor_id: 'case_execution_service',
      event_type: 'action_execution_started',
      details: { requested_by: requestedBy, retry: caseRow.state === 'FAILED' },
    });
  } else if (caseRow.state !== 'EXECUTING') {
    const err: any = new Error(`Cannot execute actions from case state ${caseRow.state}`);
    err.name = 'InvalidCaseTransitionError';
    throw err;
  }

  await reconcileStuckActions(caseId);

  const allActions = await InboxCaseAction.findAll({ where: { case_id: caseId } });

  // "Retry Failed" calls this same function again. A FAILED action's
  // status never becomes APPROVED on its own, so without this step every
  // retry would silently execute zero actions. Bounded by attempt_count
  // so a genuinely broken action (bad recipient, permanently revoked
  // auth) can't retry forever — see MAX_ACTION_ATTEMPTS.
  const failedActions = allActions.filter((a) => a.status === 'FAILED');
  const retryableFailed = failedActions.filter((a) => a.attempt_count < MAX_ACTION_ATTEMPTS);
  const exhaustedFailed = failedActions.filter((a) => a.attempt_count >= MAX_ACTION_ATTEMPTS);
  for (const action of retryableFailed) {
    await action.update({ status: 'APPROVED', updated_at: new Date() });
  }

  const statusById = new Map(allActions.map((a) => [a.id, a.status as ActionStatus]));
  const items = await InboxCaseItem.findAll({ where: { case_id: caseId } });
  const itemsById = new Map(items.map((i) => [i.id, i]));

  const approved = allActions.filter((a) => a.status === 'APPROVED');

  if (approved.length === 0 && exhaustedFailed.length > 0) {
    throw new MaxRetriesExceededError(exhaustedFailed.map((a) => a.id));
  }

  const ordered = topologicalOrder(approved);

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (const action of ordered) {
    const blockedBy = action.depends_on_action_ids.find((depId) => BLOCKING_STATUSES.includes(statusById.get(depId) as ActionStatus));
    if (blockedBy) {
      await action.update({ status: 'SKIPPED', updated_at: new Date() });
      statusById.set(action.id, 'SKIPPED');
      await logCaseEvent({
        case_id: caseId,
        action_id: action.id,
        event_type: 'action_execution_skipped_dependency_failed',
        actor_type: 'system',
        actor_id: 'case_execution_service',
        details: { blocked_by_action_id: blockedBy },
        correlation_id: action.correlation_id,
      });
      skipped++;
      continue;
    }

    const notYetSatisfied = action.depends_on_action_ids.some((depId) => !SATISFYING_STATUSES.includes(statusById.get(depId) as ActionStatus));
    if (notYetSatisfied) {
      // A dependency exists in this action set but hasn't resolved yet
      // (shouldn't happen given topological order, but defended against —
      // leave it APPROVED for the next Execute call rather than guessing).
      continue;
    }

    await action.update({ status: 'EXECUTING', attempt_count: action.attempt_count + 1, updated_at: new Date() });
    statusById.set(action.id, 'EXECUTING');

    const executor = ACTION_EXECUTORS[action.action_type];
    const item = action.item_id ? itemsById.get(action.item_id) || null : null;

    try {
      if (!executor) throw new ClassifiedExecutionError('NotImplementedActionError', `No executor registered for ${action.action_type}`);
      const receipt = await executor(action, item);
      await action.update({ status: 'SUCCEEDED', external_receipt: receipt, executed_at: new Date(), updated_at: new Date() });
      statusById.set(action.id, 'SUCCEEDED');
      await logCaseEvent({
        case_id: caseId,
        action_id: action.id,
        event_type: 'action_execution_succeeded',
        actor_type: 'system',
        actor_id: 'case_execution_service',
        details: { action_type: action.action_type },
        correlation_id: action.correlation_id,
      });
      succeeded++;
    } catch (err: any) {
      const error_class = err?.error_class || err?.name || 'Error';
      const message = String(err?.message || 'Unknown error').slice(0, 500);
      await action.update({ status: 'FAILED', error_class, error_message: message, updated_at: new Date() });
      statusById.set(action.id, 'FAILED');
      await logCaseEvent({
        case_id: caseId,
        action_id: action.id,
        event_type: 'action_execution_failed',
        actor_type: 'system',
        actor_id: 'case_execution_service',
        details: { error_class, action_type: action.action_type },
        correlation_id: action.correlation_id,
      });
      failed++;
    }
  }

  if (failed > 0) {
    await transitionCase(caseId, 'FAILED', {
      actor_type: 'system',
      actor_id: 'case_execution_service',
      event_type: 'case_execution_failed',
      details: { succeeded, failed, skipped },
    });
  }

  await postCaseProgressNote(
    caseId,
    `Execution run: ${succeeded} succeeded, ${failed} failed, ${skipped} skipped (blocked by a failed dependency).` +
      (failed > 0 ? ' At least one action failed — needs your attention before this case can close.' : '')
  );

  return { executed: succeeded + failed, succeeded, failed, skipped };
}
