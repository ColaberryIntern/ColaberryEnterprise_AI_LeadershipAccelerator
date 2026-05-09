/**
 * resourceBudgetReplay — Phase 28. Read-only replay bundle aggregator.
 *
 * Architectural commitment:
 *   - PURE READ-ONLY. Never re-executes, never mutates.
 *   - Surfaces full economics replay determinism: counter snapshot,
 *     quota snapshot, pressure sample, load snapshot, forecast snapshot.
 *   - Operators verify same operational inputs == same economic
 *     classification outputs via the boundary-proof chain.
 */

export {
  buildExecutionEconomicsReplay, verifyEconomicsReplayDeterminism,
} from './executionEconomicsCoordinator';
export type { EconomicsComposite, BuildEconomicsCompositeInput } from './executionEconomicsCoordinator';
