/**
 * sandboxRollbackRehearsal — Phase 26. Wraps Phase 25 rollback
 * simulation in a live sandbox runtime envelope.
 *
 * Architectural commitment:
 *   - Calls Phase 25 `simulateRollback` synchronously.
 *   - Wraps the result in a `SandboxRollbackRehearsalReplay` with a
 *     deterministic replay attribution + Phase 24-compliant citation.
 *   - NEVER invokes the actual rollback execution path.
 */

import { randomUUID, createHash } from 'crypto';
import type {
  SandboxRollbackRehearsalReplay, SandboxReplayDeterminismBounds,
  RehearsalPreviewCitation,
} from './liveSandboxTypes';
import {
  MAX_ROLLBACK_REHEARSALS_PER_PARTITION,
} from './liveSandboxTypes';
import { simulateRollback } from '../experimentation/rollbackSimulationEngine';
import { getRuntime } from './ephemeralWorkerRuntime';
import { publishCognitiveEvent } from '../realtime/cognitiveEventBus';

const partitions = new Map<string, SandboxRollbackRehearsalReplay[]>();

function ensure(organization_id: string): SandboxRollbackRehearsalReplay[] {
  let s = partitions.get(organization_id);
  if (!s) { s = []; partitions.set(organization_id, s); }
  return s;
}

function deterministicHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

export interface RehearseSandboxRollbackInput {
  readonly runtime_id: string;
  readonly organization_id: string;
  readonly experiment_id?: string;
  readonly plan_id?: string;
  readonly source_chain_ids?: ReadonlyArray<string>;
}

export function rehearseSandboxRollback(input: RehearseSandboxRollbackInput): SandboxRollbackRehearsalReplay | null {
  const runtime = getRuntime(input.runtime_id);
  if (!runtime || runtime.organization_id !== input.organization_id) return null;
  if (runtime.lifecycle_state === 'expired' || runtime.lifecycle_state === 'failed') return null;

  const experiment_id = input.experiment_id ?? runtime.experiment_id;
  const phase25Sim = simulateRollback({
    organization_id: input.organization_id,
    experiment_id,
    plan_id: input.plan_id,
    source_chain_ids: input.source_chain_ids,
  });

  const rehearsal_id = `rrehearse_${randomUUID()}`;
  const recorded_at = new Date().toISOString();

  const preview_citation: RehearsalPreviewCitation = {
    source_kind: 'rollback_simulation_replay',
    source_id: phase25Sim.simulation_id,
    source_phase: 'phase_25_experimentation',
    recorded_at,
    fragment_quoted: `Phase 25 dry-run produced ${phase25Sim.steps.length} step(s); outcome ${phase25Sim.projected_outcome}`,
    underlying_phase_25_sandbox_id: runtime.underlying_phase_25_sandbox_id,
    underlying_phase_26_runtime_id: runtime.runtime_id,
  };

  const replay_hash = deterministicHash(`${rehearsal_id}::${phase25Sim.determinism.projected_state_hash}::${runtime.runtime_id}`);
  const determinism: SandboxReplayDeterminismBounds = {
    runtime_id: runtime.runtime_id,
    replay_hash,
    replayable: true,
    deterministic: true,
    runtime_expired: false,    // gated above — runtime cannot be expired/failed at this point
  };

  const replay: SandboxRollbackRehearsalReplay = {
    rehearsal_id,
    runtime_id: runtime.runtime_id,
    experiment_id,
    organization_id: input.organization_id,
    underlying_phase_25_simulation: phase25Sim,
    preview_citation,
    determinism,
    built_at: recorded_at,
  };

  const store = ensure(input.organization_id);
  store.push(replay);
  if (store.length > MAX_ROLLBACK_REHEARSALS_PER_PARTITION) store.shift();

  try {
    publishCognitiveEvent({
      kind: 'sandbox.rollback.rehearsed',
      project_id: 'system',
      severity: 'info',
      payload: {
        rehearsal_id, runtime_id: runtime.runtime_id, organization_id: input.organization_id,
        step_count: phase25Sim.steps.length, projected_outcome: phase25Sim.projected_outcome,
      },
    });
  } catch { /* noop */ }

  return replay;
}

export function listSandboxRollbackRehearsals(organization_id: string): ReadonlyArray<SandboxRollbackRehearsalReplay> {
  return [...(partitions.get(organization_id) ?? [])].reverse();
}

export function recentSandboxRollbackRehearsalCount24h(organization_id?: string): number {
  const cutoff = Date.now() - 24 * 60 * 60_000;
  if (organization_id) {
    return (partitions.get(organization_id) ?? []).filter(r => Date.parse(r.built_at) >= cutoff).length;
  }
  let total = 0;
  for (const list of partitions.values()) {
    total += list.filter(r => Date.parse(r.built_at) >= cutoff).length;
  }
  return total;
}

export function _resetSandboxRollbackRehearsalsForTests(): void {
  partitions.clear();
}
