/**
 * SystemStateEngine — public surface.
 *
 * THIS IS THE ONE BRAIN. Every consumer of "what's the state of the project,
 * what should the user do next, are there contradictions" reads from here.
 *
 * No other file in the codebase is permitted to compute readiness,
 * coverage, maturity, queue ordering, or contradiction detection
 * independently after the migration completes. Legacy logic is wrapped /
 * adapted / deprecated, never duplicated.
 */

export {
  buildAuthoritativeState,
  buildAuthoritativeStateFromInputs,
} from './systemStateEngine';

export type {
  AuthoritativeSystemState,
  AuthoritativeTask,
  AuthoritativeTaskState,
  AuthoritativeTaskType,
  CapabilityScores,
  ContradictionFlag,
  ContradictionKind,
  ContradictionSeverity,
  EngineCapabilityInput,
  EngineProjectInput,
  ProjectScores,
  Score0to100,
  StateGraph,
  StateGraphEdge,
  StateGraphNode,
  StateGraphNodeType,
  SyncHealthDimensions,
  SyncHealthResult,
} from './types/systemState.types';

// Re-export scorers for direct access in tests / migration tools.
export { scoreReadiness } from './scoring/readinessScorer';
export { scoreCoverage } from './scoring/coverageScorer';
export { scoreMaturity } from './scoring/maturityScorer';
export { scoreHealth } from './scoring/healthScorer';
export { scoreSyncHealth } from './scoring/syncHealthScorer';
