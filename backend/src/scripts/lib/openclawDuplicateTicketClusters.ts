/**
 * Pure logic for the OpenclawLearningOptimizationAgent duplicate-ticket clusters
 * (see backend/src/scripts/archiveDuplicateOpenclawLearningTickets.ts for the
 * DB-backed CLI that uses this module). No DB/Sequelize dependency here so the
 * candidate-selection predicates, representative choice, and comment text are
 * fully unit-testable in isolation.
 *
 * Background: a production bug (fixed in PR #1465 / commit 6456abb4 and PR #1468 /
 * commit 3e95ac8b, both 2026-08-14) caused `cory-engine` and
 * `workforce_intelligence_engine` to refile the same OpenclawLearningOptimizationAgent
 * finding as a brand-new ticket roughly every hour, for months. Real production data
 * (verified by content-exact SQL, 2026-08-15) shows the true duplicate volume is
 * SMALLER than the audit's approximate estimate, because a large amount of same-
 * created_by_id ticket volume is genuinely different, unrelated findings (a separate
 * "out of shared memory" incident across ~19 other agents, and an unrelated "lead
 * generation dropped" alert) that must never be swept into this cleanup. The two
 * predicates below are the exact, content-verified boundary between "true duplicate
 * of the OpenclawLearningOptimizationAgent finding" and "everything else."
 */

/** Minimal shape this module needs from a `tickets` row. */
export interface TicketLike {
  id: string;
  created_by_id: string;
  title: string;
  description: string | null;
  status: string;
  created_at: string | Date;
}

/** The exact, real error substring cory-engine's varchar(100) overflow duplicate carries. */
export const CORY_ENGINE_DUPLICATE_TITLE = '[Review] update_agent_config';
export const CORY_ENGINE_DUPLICATE_DESCRIPTION_SUBSTRING =
  'Agent "OpenclawLearningOptimizationAgent" is in error state: value too long for type character varying(100)';

/** The exact, real description every workforce_intelligence_engine duplicate carries. */
export const WORKFORCE_DUPLICATE_DESCRIPTION =
  'Review OpenclawLearningOptimizationAgent error patterns and add retry logic or fix root cause';

export type ClusterName = 'cory-engine' | 'workforce_intelligence_engine';

/**
 * True only for the verified cory-engine duplicate cluster (2,781 rows in
 * production as of 2026-08-15). Explicitly excludes: the same title naming any OTHER
 * agent's "out of shared memory" error (a different, unrelated incident, ~5,126 rows),
 * and the `[Review] update_campaign_config` title (a different, unrelated finding,
 * ~1,717 rows) — both real, non-duplicate tickets under the same created_by_id.
 */
export function isCoryEngineDuplicate(ticket: TicketLike): boolean {
  if (!ticket || ticket.created_by_id !== 'cory-engine') return false;
  if (ticket.title !== CORY_ENGINE_DUPLICATE_TITLE) return false;
  if (!ticket.description) return false;
  return ticket.description.includes(CORY_ENGINE_DUPLICATE_DESCRIPTION_SUBSTRING);
}

/**
 * True only for the verified workforce_intelligence_engine duplicate cluster (438
 * rows in production as of 2026-08-15) — every row in that cluster carries this exact
 * description, 100% identical (confirmed by production content audit).
 */
export function isWorkforceDuplicate(ticket: TicketLike): boolean {
  if (!ticket || ticket.created_by_id !== 'workforce_intelligence_engine') return false;
  return ticket.description === WORKFORCE_DUPLICATE_DESCRIPTION;
}

/** True if `ticket` belongs to either verified duplicate cluster. */
export function isDuplicateTicket(ticket: TicketLike): boolean {
  return isCoryEngineDuplicate(ticket) || isWorkforceDuplicate(ticket);
}

/** Which cluster `ticket` belongs to, or null if it matches neither predicate. */
export function clusterOf(ticket: TicketLike): ClusterName | null {
  if (isCoryEngineDuplicate(ticket)) return 'cory-engine';
  if (isWorkforceDuplicate(ticket)) return 'workforce_intelligence_engine';
  return null;
}

/**
 * The representative for a cluster: the most recently created row. Ties (identical
 * `created_at`) resolve to the first one encountered, which is deterministic given a
 * stable input order (the caller always sorts/queries by `created_at` from the DB).
 */
export function pickRepresentative<T extends TicketLike>(rows: T[]): T | null {
  if (rows.length === 0) return null;
  return rows.reduce((latest, row) =>
    new Date(row.created_at).getTime() > new Date(latest.created_at).getTime() ? row : latest,
  );
}

export interface RepresentativeCommentInput {
  clusterName: ClusterName;
  duplicateCount: number;
  earliestSeenAt: string | Date;
  latestSeenAt: string | Date;
}

/**
 * Real resolution comment for the ONE representative ticket per cluster. Cites only
 * verified facts: the two real fix commits (6456abb4 / PR #1465, 3e95ac8b / PR #1468),
 * their real one-line descriptions, and the real duplicate count / date range for
 * this specific cluster. No invented ticket numbers, names, or dates.
 */
export function buildRepresentativeComment(input: RepresentativeCommentInput): string {
  const { clusterName, duplicateCount, earliestSeenAt, latestSeenAt } = input;
  const earliest = new Date(earliestSeenAt).toISOString().slice(0, 10);
  const latest = new Date(latestSeenAt).toISOString().slice(0, 10);
  const finding =
    clusterName === 'cory-engine'
      ? 'OpenclawLearningOptimizationAgent was stuck in an error state ("value too long for type character varying(100)") after its run-summary INSERT overflowed ai_agent_activity_logs.action, and cory-engine re-filed this exact finding as a brand-new ticket roughly every hour instead of reusing the still-open one.'
      : 'workforce_intelligence_engine repeatedly reported the same OpenclawLearningOptimizationAgent high-error-rate condition as a brand-new ticket (title varying only by the measured error percentage), instead of reusing the still-open one.';

  return [
    `Resolved. Root cause: ${finding}`,
    '',
    'Fixed in two commits on 2026-08-14: 6456abb4 (PR #1465, "Fix six failing cron ' +
      'agents and stop the alert engine re-emailing open conditions") corrected the ' +
      'original ai_agent_activity_logs.action varchar(100) overflow that put the ' +
      'agent into its phantom error state. 3e95ac8b (PR #1468, "Agent Quality ' +
      'Cleanup: fix a real 2nd overflow bug, dedup cory-engine/workforce tickets, ' +
      'real per-ticket descriptions, real tools_granted") fixed a second overflow ' +
      '(OpenclawLearning.metric_key varchar(200)) and the dedup bug itself: both ' +
      'engines now key ticket creation on a stable finding identity so the existing ' +
      '"reuse while still open" dedup logic actually fires going forward.',
    '',
    `This ticket is the representative record for ${duplicateCount} duplicate ` +
      `reports of this exact same finding, first seen ${earliest} and last seen ` +
      `${latest}. The other ${duplicateCount - 1} duplicate tickets have been closed ` +
      'in bulk and each carries a comment pointing back to this one. No history was ' +
      'deleted — the closed tickets remain queryable, just out of active view.',
  ].join('\n');
}

/** Short, real pointer comment for every non-representative ticket in a cluster. */
export function buildDuplicatePointerComment(representativeId: string): string {
  return (
    `Closed as duplicate of ticket ${representativeId} — see that ticket's activity ` +
    'log for the full resolution record (root cause, fix commits, and duplicate count).'
  );
}
