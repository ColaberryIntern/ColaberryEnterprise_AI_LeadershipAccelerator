/**
 * Pure decision logic for the bcSyncService completion-reconcile pass (Layer 2).
 *
 * Kept free of model / DB / network imports so it is unit-testable in isolation
 * (importing bcSyncService pulls in the full Sequelize model graph, which the
 * jest config deliberately avoids type-checking). The DB + Basecamp I/O lives in
 * bcSyncService.reconcileCompletions; the *decision* lives here.
 */

export interface LiveTodoResult {
  ok: boolean;
  completed?: boolean;
  notFound?: boolean;
}

export type ReconcileAction = 'mark_completed' | 'refresh' | 'skip';

// Detect a Basecamp 404 (todo trashed / deleted) from a bcGet error message.
// bcGet formats every failure as `BC GET <url> -> <status> <body>`, so we match
// the status position precisely - matching any "404" substring would false-
// positive on a todo id or URL that happens to contain 404.
export function is404(message: string | undefined | null): boolean {
  return /->\s*404\b/.test(String(message || ''));
}

/**
 * Given the live Basecamp result for a mirror row currently marked 'active',
 * decide what the reconcile pass should do:
 *   - completed = true        -> mark_completed  (the fix: stop surfacing it)
 *   - 404 (trashed / deleted) -> mark_completed  (no longer active)
 *   - still open              -> refresh         (bump last_synced_at, keep active)
 *   - transient / unknown err -> skip            (retry a later tick; never mislabel)
 *
 * Conservative by construction: a row is only ever flipped out of 'active' on a
 * positive completed=true or a 404. Any ambiguity leaves it active.
 */
export function reconcileAction(res: LiveTodoResult): ReconcileAction {
  if (res.ok) return res.completed ? 'mark_completed' : 'refresh';
  if (res.notFound) return 'mark_completed';
  return 'skip';
}
