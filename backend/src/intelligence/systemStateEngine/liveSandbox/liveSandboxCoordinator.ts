/**
 * liveSandboxCoordinator — Phase 26. Top-level coordinator for live
 * sandbox runtimes.
 *
 * Architectural commitment:
 *   - Wraps Phase 25 `submitExecutionSandbox` in a tracked async
 *     lifecycle envelope. The Phase 25 simulation is what actually
 *     produces projection data; Phase 26 only manages the lifecycle.
 *   - Synchronous projection + asynchronous lifecycle visibility:
 *     `submitLiveSandbox` returns the runtime_id immediately, runs the
 *     underlying Phase 25 simulation synchronously, transitions through
 *     pending → running → completed, then waits for TTL expiration.
 *   - Heartbeats are recorded synchronously during the projection;
 *     they NEVER trigger orchestration / execution / recovery.
 */

import { randomUUID } from 'crypto';
import type { HypotheticalAction } from '../experimentation/experimentationTypes';
import { submitExecutionSandbox } from '../experimentation/executionSandboxEngine';
import { evaluateLiveSandboxSubmission } from './sandboxGovernanceSupervisor';
import { buildSandboxTopologyIsolationProfile } from './sandboxTopologyIsolation';
import { buildSandboxExecutionEnvelope, buildBoundaryProofChain } from './sandboxExecutionEnvelope';
import {
  createEphemeralRuntime, markRuntimeRunning, markRuntimeCompleted,
  markRuntimeFailed, recordRuntimeHeartbeat, getRuntime,
} from './ephemeralWorkerRuntime';
import type {
  EphemeralSandboxRuntimeProfile, SandboxExecutionEnvelope,
  SandboxTopologyIsolationProfile,
} from './liveSandboxTypes';
import { DEFAULT_RUNTIME_TTL_MS } from './liveSandboxTypes';
import { publishCognitiveEvent } from '../realtime/cognitiveEventBus';

export interface SubmitLiveSandboxInput {
  readonly organization_id: string;
  readonly operator_id: string;
  readonly hypothetical_actions: ReadonlyArray<HypotheticalAction>;
  readonly ttl_ms?: number;
}

export type SubmitLiveSandboxResult =
  | {
      permitted: true;
      runtime: EphemeralSandboxRuntimeProfile;
      envelope: SandboxExecutionEnvelope;
      topology_isolation: SandboxTopologyIsolationProfile;
    }
  | {
      permitted: false;
      decision: 'rejected' | 'flagged';
      reason: string;
      supervisor_rule_violated?: string;
    };

export function submitLiveSandbox(input: SubmitLiveSandboxInput): SubmitLiveSandboxResult {
  const ttl_ms = input.ttl_ms ?? DEFAULT_RUNTIME_TTL_MS;

  // 1. Run the underlying Phase 25 sandbox synchronously. If Phase 25
  //    rejects, Phase 26 rejects.
  const phase25 = submitExecutionSandbox({
    organization_id: input.organization_id,
    hypothetical_actions: input.hypothetical_actions,
  });

  // 2. Phase 26 governance gate.
  const candidate_runtime_id = `runtime_${randomUUID().slice(0, 8)}`;
  const gate = evaluateLiveSandboxSubmission({
    runtime_id: candidate_runtime_id,
    organization_id: input.organization_id,
    operator_id: input.operator_id,
    action_count: input.hypothetical_actions.length,
    ttl_ms,
    depth: 0,
    underlying_phase_25_permitted: phase25.permitted,
  });
  if (gate.decision !== 'permitted') {
    return {
      permitted: false,
      decision: gate.decision === 'flagged' ? 'flagged' : 'rejected',
      reason: gate.reason,
      supervisor_rule_violated: gate.supervisor_rule_violated,
    };
  }

  // 3. Build topology isolation proof + boundary proof chain.
  const topology_isolation = buildSandboxTopologyIsolationProfile({
    runtime_id: candidate_runtime_id, organization_id: input.organization_id,
  });
  const underlying_phase_25_sandbox_id = phase25.permitted ? phase25.sandbox.sandbox_id : undefined;
  const boundary_proof = buildBoundaryProofChain({
    runtime_id: candidate_runtime_id,
    organization_id: input.organization_id,
    topology_isolation_verification_hash: topology_isolation.verification_hash,
    underlying_phase_25_sandbox_hash: phase25.permitted ? phase25.sandbox.determinism.projected_state_hash : undefined,
    ttl_ms,
  });

  // 4. Create the ephemeral runtime + envelope.
  const runtime = createEphemeralRuntime({
    experiment_id: phase25.permitted ? phase25.replay_attribution.experiment_id : `exp_${randomUUID()}`,
    organization_id: input.organization_id,
    underlying_phase_25_sandbox_id,
    ttl_ms,
    boundary_proof,
  });
  const envelope = buildSandboxExecutionEnvelope({
    runtime_id: runtime.runtime_id,
    organization_id: input.organization_id,
    operator_id: input.operator_id,
    hypothetical_actions: input.hypothetical_actions,
    ttl_ms,
  });

  try {
    publishCognitiveEvent({
      kind: 'sandbox.runtime.started',
      project_id: 'system',
      severity: 'info',
      payload: { runtime_id: runtime.runtime_id, organization_id: input.organization_id, operator_id: input.operator_id, ttl_ms },
    });
  } catch { /* noop */ }

  // 5. Walk the lifecycle: pending → running → completed.
  markRuntimeRunning(runtime.runtime_id);
  recordRuntimeHeartbeat(runtime.runtime_id);
  recordRuntimeHeartbeat(runtime.runtime_id);
  if (phase25.permitted) {
    markRuntimeCompleted(runtime.runtime_id, `wrapped_phase25_sandbox:${phase25.sandbox.sandbox_id}`);
    try {
      publishCognitiveEvent({
        kind: 'sandbox.runtime.completed',
        project_id: 'system',
        severity: 'info',
        payload: { runtime_id: runtime.runtime_id, underlying_phase_25_sandbox_id, action_count: input.hypothetical_actions.length },
      });
    } catch { /* noop */ }
  } else {
    markRuntimeFailed(runtime.runtime_id, `phase25_rejected:${phase25.reason}`);
  }

  const final = getRuntime(runtime.runtime_id) ?? runtime;

  return {
    permitted: true,
    runtime: final,
    envelope,
    topology_isolation,
  };
}
