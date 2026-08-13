/**
 * Pure boot-ingest decision for the AI News Flash pipeline. No I/O, no imports —
 * so the catch-up rule is unit-testable in isolation and refreshAiNewsOnBoot
 * stays a thin DB-reads-then-dispatch orchestrator.
 */

export type BootAction = { action: 'initial' | 'catchup' | 'skip'; reason: string };

/**
 * Decide what the boot ingest should do, given the current library state.
 *
 * - `initial` : the library is empty → seed it (ingest one card).
 * - `catchup` : materialization is on, items are pending, and the newest
 *               generated card is stale (older than staleHours) or none exists
 *               yet → a daily run was likely missed; recover it.
 * - `skip`    : nothing to do (cost gate off, nothing pending, or fresh enough).
 */
export function decideBootAction(s: {
  total: number;                     // rows in ai_news_items
  pending: number;                   // rows with card_id IS NULL
  newestCardAgeHours: number | null; // age of newest ai_news_flash card; null = none yet
  materializeEnabled: boolean;       // AI_NEWS_INGEST_ENABLED === 'true'
  staleHours: number;
}): BootAction {
  if (s.total === 0) return { action: 'initial', reason: 'library empty' };
  if (!s.materializeEnabled) return { action: 'skip', reason: 'materialize disabled (cost gate off)' };
  if (s.pending <= 0) return { action: 'skip', reason: 'no pending items to card' };
  if (s.newestCardAgeHours !== null && s.newestCardAgeHours < s.staleHours) {
    return { action: 'skip', reason: `newest card ${s.newestCardAgeHours.toFixed(1)}h < ${s.staleHours}h fresh` };
  }
  return {
    action: 'catchup',
    reason: s.newestCardAgeHours === null ? 'no card yet' : `newest card ${s.newestCardAgeHours.toFixed(1)}h stale`,
  };
}
