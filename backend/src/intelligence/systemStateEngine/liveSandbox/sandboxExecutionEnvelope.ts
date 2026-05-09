/**
 * sandboxExecutionEnvelope — Phase 26. Constructs the bounded execution
 * envelope + boundary proof chain that the coordinator hands to the
 * ephemeral runtime.
 */

import { createHash } from 'crypto';
import type {
  SandboxExecutionEnvelope, SandboxBoundaryProofChain,
} from './liveSandboxTypes';
import {
  MAX_LIVE_SANDBOX_DEPTH, MAX_RUNTIME_TTL_MS,
} from './liveSandboxTypes';
import { MAX_HYPOTHETICAL_ACTIONS_PER_SANDBOX } from '../experimentation/experimentationTypes';
import type { HypotheticalAction } from '../experimentation/experimentationTypes';

function deterministicHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

export interface BuildEnvelopeInput {
  readonly runtime_id: string;
  readonly organization_id: string;
  readonly operator_id: string;
  readonly hypothetical_actions: ReadonlyArray<HypotheticalAction>;
  readonly ttl_ms: number;
}

export function buildSandboxExecutionEnvelope(input: BuildEnvelopeInput): SandboxExecutionEnvelope {
  const authorized_at = new Date().toISOString();
  const authorization_hash = deterministicHash(`${input.runtime_id}::${input.operator_id}::${authorized_at}`);
  return {
    runtime_id: input.runtime_id,
    organization_id: input.organization_id,
    hypothetical_actions: input.hypothetical_actions,
    bounded_budget: {
      max_ttl_ms: Math.min(input.ttl_ms, MAX_RUNTIME_TTL_MS),
      max_heartbeat_count: 50,
      max_action_count: MAX_HYPOTHETICAL_ACTIONS_PER_SANDBOX,
      max_simulation_depth: MAX_LIVE_SANDBOX_DEPTH,
    },
    operator_authorization: {
      operator_id: input.operator_id,
      authorized_at,
      authorization_hash,
    },
  };
}

export function buildBoundaryProofChain(input: {
  runtime_id: string;
  organization_id: string;
  topology_isolation_verification_hash: string;
  underlying_phase_25_sandbox_hash?: string;
  ttl_ms: number;
}): SandboxBoundaryProofChain {
  const topology_detachment_hash = deterministicHash(`detach::${input.runtime_id}::${input.topology_isolation_verification_hash}`);
  const runtime_isolation_hash = deterministicHash(`runtime_iso::${input.runtime_id}::${input.organization_id}`);
  const replay_determinism_hash = deterministicHash(`replay_det::${input.runtime_id}::${input.underlying_phase_25_sandbox_hash ?? '_no_phase25_'}`);
  const expiration_proof_hash = deterministicHash(`expire::${input.runtime_id}::${input.ttl_ms}`);
  const mutation_avoidance_proof_hash = deterministicHash(`no_mutation::${input.runtime_id}::pure_in_memory`);
  return {
    topology_detachment_hash,
    runtime_isolation_hash,
    replay_determinism_hash,
    expiration_proof_hash,
    mutation_avoidance_proof_hash,
  };
}
