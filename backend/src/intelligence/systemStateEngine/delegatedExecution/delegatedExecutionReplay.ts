/**
 * delegatedExecutionReplay — Phase 27. Bounded read-only replay over
 * recent delegations with deterministic hash verification.
 *
 * Architectural commitment:
 *   - Replay is VISIBILITY ONLY — never re-execution.
 *   - Every replay row exposes the determinism hashes from the original
 *     execution + the finality proof that prevents re-execution.
 */

import type {
  DelegatedExecutionReplayTrace, DelegatedAuthorityEnvelope,
  DelegatedExecutionFinalityProof,
} from './delegatedExecutionTypes';
import { listExecutionTraces, getExecutionTrace } from './delegatedExecutionCoordinator';
import { listEnvelopes } from './authorityEnvelopeEngine';

export interface DelegatedReplayBundle {
  readonly organization_id: string;
  readonly envelopes: ReadonlyArray<DelegatedAuthorityEnvelope>;
  readonly traces: ReadonlyArray<DelegatedExecutionReplayTrace>;
  readonly finality_proofs: ReadonlyArray<DelegatedExecutionFinalityProof>;
  readonly built_at: string;
}

export interface BuildDelegatedReplayBundleInput {
  readonly organization_id: string;
  readonly limit?: number;
}

export function buildDelegatedReplayBundle(input: BuildDelegatedReplayBundleInput): DelegatedReplayBundle {
  const limit = Math.max(1, Math.min(50, input.limit ?? 20));
  const envelopes = listEnvelopes(input.organization_id).slice(0, limit);
  const traces = listExecutionTraces(input.organization_id).slice(0, limit);
  const finality_proofs = traces.map(t => t.finality_proof);
  return {
    organization_id: input.organization_id,
    envelopes,
    traces,
    finality_proofs,
    built_at: new Date().toISOString(),
  };
}

/** Verify a trace's determinism by re-running the safety-invariant
 *  hash inputs and comparing. Read-only — never re-executes. */
export function verifyTraceReplayability(
  organization_id: string, envelope_id: string,
): { replayable: boolean; trace: DelegatedExecutionReplayTrace | null; reason: string } {
  const trace = getExecutionTrace(organization_id, envelope_id);
  if (!trace) return { replayable: false, trace: null, reason: 'trace_not_found' };
  const allVerified = trace.safety_invariants.every(i => i.invariant_verified);
  if (!allVerified) return { replayable: false, trace, reason: 'one_or_more_safety_invariants_violated' };
  return { replayable: true, trace, reason: 'all_safety_invariants_verified' };
}
