import type { ExplorerPrimaryState } from './explorerGrowthApi';

/**
 * The journey order of the primary states. Ordered for display: the roster reads
 * as a journey, not an alphabet.
 *
 * ─── WHY IT MOVED OUT OF `explorerGrowthApi` (2026-11-22) ───────────────────
 *
 * The Growth Journey workspace needs this order for its own brand-scoped roster,
 * and its guard forbids VALUE imports of Explorer's clients: a panel that imports
 * Explorer's FETCHERS calls the unscoped surface and shows one brand's learners
 * under another brand's name. That guard failed on the import of this constant
 * and it was right to.
 *
 * The constant itself is harmless. A CARVE-OUT would not be - a rule that admits
 * "but only the constants" invites an argument about what counts as one, and that
 * argument is how a fetcher eventually gets through. So the constant moved to a
 * module that fetches nothing and imports only a TYPE, which is erased at compile
 * time. `explorerGrowthApi` re-exports it, so Explorer's own importers are
 * unaffected.
 */
export const PRIMARY_STATE_ORDER: ExplorerPrimaryState[] = [
  'NEW_EXPLORER',
  'NOT_STARTED',
  'ACTIVATING',
  'ACTIVE_LEARNER',
  'ENGAGED_LEARNER',
  'CONNECTED_TO_COMMUNITY',
  'CONSIDERING_NEXT_STEP',
  'ENROLLMENT_READY',
  'CONVERTED',
];
