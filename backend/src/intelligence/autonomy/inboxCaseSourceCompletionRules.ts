/**
 * InboxCaseEngine Source-Completion Reconciliation — pure classification rules
 *
 * `InboxCaseEngine`'s ticket board (see `services/inboxCase/caseTicketService.ts`) is
 * proven correct at DISCOVER time: every ticket accurately mirrors its `InboxCase`'s
 * real `state`, via `caseRepository.ts`'s `transitionCase()` -> `syncTicketForCase()`.
 * The real defect is upstream of the ticket sync entirely: 625 cases (2026-08-16
 * production snapshot, see this run's execution-contract.md for the full DISCOVER
 * trail) sit in `ASSESSING` because nothing has ever advanced them past the hourly
 * auto-sync that created them — by design, every step past discovery requires a human
 * click in the admin UI (Assess/Plan/Approve/Execute/Verify/Close).
 *
 * One category of that stuck work has a real, live, re-derivable "is this actually
 * done" signal today: a case item whose `source_type` is `'basecamp_todo'` mirrors a
 * real Basecamp to-do, and `models/OpsBcTodo.ts` (owned by the separate, already-
 * running AI Ops Command Center sync worker — never written to by this module) is
 * already kept current with that to-do's live `status`. If Ali finished (or deleted)
 * that to-do directly in Basecamp rather than through the Cases UI, that is a genuine,
 * already-established fact this module can propagate — not a new judgment call.
 * Mirrors `services/inboxCase/caseAutoSyncService.ts`'s existing
 * `disposeItemsDeletedAtSource()` (the identical pattern already proven in production
 * for a deleted/trashed EMAIL) for a structurally identical but distinct source type.
 *
 * This module is the pure decision logic (no I/O, no DB, no LLM) for that one
 * classification: given a `basecamp_todo` item's live `ops_bc_todos.status`, decide
 * the item's new `disposition` (or that no signal exists and the item must stay
 * untouched). It does not decide whether the CASE containing that item can close —
 * that is `services/inboxCase/caseClosureService.ts`'s `evaluateClosureGuard()`'s job,
 * unchanged and unmodified by this run except for one additive override parameter.
 *
 * No time-based fallback of any kind lives in this file: no wall-clock-vs-stored-
 * timestamp delta, no item-age comparison, no "disposition after N days untouched"
 * heuristic anywhere. A dedicated test in this file's `__tests__` greps this file's own
 * source for the tokens such a gate would require and asserts zero matches — the same
 * assertion this session's earlier `cory-engine`/`CoryBrain` fixes both carry.
 */

/** The subset of `models/OpsBcTodo.ts`'s real `status` enum this module classifies
 * against (`'active' | 'completed' | 'trashed'`, confirmed at DISCOVER against the real
 * model). Any other string, or no live mirror row at all, produces no signal. */
export type LiveBasecampTodoStatus = 'active' | 'completed' | 'trashed' | string;

export type SourceCompletionOutcome = 'completed_at_source' | 'trashed_at_source' | 'still_active' | 'no_live_signal';

export interface SourceCompletionClassification {
  outcome: SourceCompletionOutcome;
  /** The item's new disposition, or null when there is no signal to act on — the
   * caller must leave the item's disposition exactly as it is. */
  disposition: 'RESOLVED' | 'NO_ACTION' | null;
  reason: string;
}

/**
 * Classifies one `basecamp_todo` `InboxCaseItem` given the live `status` of its
 * matching `ops_bc_todos` row (the caller already resolved that match, by
 * `item.source_id === ops_bc_todos.bc_id`, and re-queried it fresh — never a cached or
 * stale value). Pure, total, never throws.
 *
 * `'completed'` -> `RESOLVED` (mirrors `caseQuickResolveService.ts`'s own
 * `HANDLED -> RESOLVED` mapping: the underlying work genuinely got done).
 * `'trashed'` -> `NO_ACTION` (mirrors `disposeItemsDeletedAtSource()`'s identical
 * mapping for a deleted email: the to-do was removed, nothing to act on).
 * `'active'`, any unrecognized string, or no live mirror row found (`null`/`undefined`)
 * -> no signal, left untouched. This is the branch that keeps the 232 genuinely-open
 * `basecamp_todo` items in the current production backlog untouched — see
 * execution-contract.md's DISCOVER findings.
 */
export function classifyBasecampTodoCompletion(
  bcTodoStatus: LiveBasecampTodoStatus | null | undefined,
): SourceCompletionClassification {
  if (bcTodoStatus === 'completed') {
    return {
      outcome: 'completed_at_source',
      disposition: 'RESOLVED',
      reason:
        'The linked Basecamp to-do is now CURRENTLY completed. This reflects an already-established ' +
        'fact from Basecamp itself (Ali or a collaborator finished it there directly) — this ' +
        'classifier does not itself decide the to-do is done, only propagates that it already is.',
    };
  }

  if (bcTodoStatus === 'trashed') {
    return {
      outcome: 'trashed_at_source',
      disposition: 'NO_ACTION',
      reason:
        'The linked Basecamp to-do was trashed at the source. Nothing left to act on — mirrors how ' +
        'a deleted email source message is dispositioned NO_ACTION elsewhere in this subsystem.',
    };
  }

  if (bcTodoStatus === 'active') {
    return {
      outcome: 'still_active',
      disposition: null,
      reason: "The linked Basecamp to-do is still 'active' — real, legitimately open work. Left untouched.",
    };
  }

  // No live mirror row found (null/undefined) or an unrecognized status string: never
  // guess. Total function safety net, not a reachable path against real production
  // data at the time this was written (every basecamp_todo item's source_id has a
  // matching ops_bc_todos row, confirmed at DISCOVER), but still a real return, not a
  // thrown error, so one unmatched row can never abort a batch run.
  return {
    outcome: 'no_live_signal',
    disposition: null,
    reason:
      bcTodoStatus == null
        ? 'No live ops_bc_todos mirror row was found for this item — left untouched, unclassifiable.'
        : `Unrecognized live Basecamp status '${bcTodoStatus}' — left untouched rather than guessed.`,
  };
}
