/**
 * sandboxPreviewNarrativeBuilder — Phase 26. Phase 24-compliant
 * deterministic template-rendered narrative for live sandbox runtimes.
 *
 * Architectural commitment:
 *   - Inherits Phase 24's structural anti-hallucination guarantees:
 *     no LLM, no inference, citation-required rendering, deterministic
 *     SHA-256 hashes.
 *   - Uses a small fixed template registry inline (kept minimal so
 *     Phase 26 narratives remain operationally distinct from Phase 24).
 */

import { randomUUID, createHash } from 'crypto';
import type {
  OperationalPreviewNarrative, OperationalPreviewNarrativeBlock,
  RehearsalPreviewCitation,
} from './liveSandboxTypes';
import {
  MAX_PREVIEW_NARRATIVES_PER_PARTITION,
} from './liveSandboxTypes';
import { getRuntime } from './ephemeralWorkerRuntime';
import { publishCognitiveEvent } from '../realtime/cognitiveEventBus';

function deterministicHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

const TEMPLATES = {
  'sandbox.lifecycle.summary.v1': (vars: Record<string, string | number>) =>
    `Live sandbox runtime ${vars.runtime_id} (org ${vars.organization_id}) transitioned ${vars.lifecycle_state}; boundary tier ${vars.boundary_tier}; ${vars.heartbeat_count} heartbeat(s); expires_at ${vars.expires_at}.`,
  'sandbox.boundary.proof.v1': (vars: Record<string, string | number>) =>
    `Boundary proof chain for runtime ${vars.runtime_id}: topology_detached=${vars.topology_detachment_hash}, runtime_isolated=${vars.runtime_isolation_hash}, replay_deterministic=${vars.replay_determinism_hash}, expiration_proof=${vars.expiration_proof_hash}, mutation_avoidance=${vars.mutation_avoidance_proof_hash}.`,
  'sandbox.rollback.rehearsal.v1': (vars: Record<string, string | number>) =>
    `Rollback rehearsal ${vars.rehearsal_id} on runtime ${vars.runtime_id}: ${vars.step_count} step(s); projected outcome ${vars.projected_outcome}; underlying Phase 25 simulation ${vars.simulation_id}.`,
  'sandbox.expiration.notice.v1': (vars: Record<string, string | number>) =>
    `Runtime ${vars.runtime_id} expired via ${vars.expiration_trigger} after ${vars.runtime_duration_ms}ms; terminal state ${vars.lifecycle_terminal_state}.`,
};

const partitions = new Map<string, OperationalPreviewNarrative[]>();

function ensure(organization_id: string): OperationalPreviewNarrative[] {
  let s = partitions.get(organization_id);
  if (!s) { s = []; partitions.set(organization_id, s); }
  return s;
}

function renderTemplate(template_id: keyof typeof TEMPLATES, vars: Record<string, string | number>): { text: string; hash: string } | null {
  const fn = TEMPLATES[template_id];
  if (!fn) return null;
  const text = fn(vars).slice(0, 600);
  const hash = deterministicHash(`${template_id}::${text}`);
  return { text, hash };
}

export interface BuildPreviewNarrativeInput {
  readonly runtime_id: string;
  readonly organization_id: string;
}

export function buildSandboxPreviewNarrative(input: BuildPreviewNarrativeInput): OperationalPreviewNarrative | null {
  const runtime = getRuntime(input.runtime_id);
  if (!runtime || runtime.organization_id !== input.organization_id) return null;

  const narrative_id = `nprev_${randomUUID()}`;
  const built_at = new Date().toISOString();
  const blocks: OperationalPreviewNarrativeBlock[] = [];

  // Block 1: lifecycle summary
  const lifecycleRendered = renderTemplate('sandbox.lifecycle.summary.v1', {
    runtime_id: runtime.runtime_id,
    organization_id: runtime.organization_id,
    lifecycle_state: runtime.lifecycle_state,
    boundary_tier: runtime.boundary_tier,
    heartbeat_count: runtime.heartbeats.length,
    expires_at: runtime.expires_at,
  });
  if (lifecycleRendered) {
    const cite: RehearsalPreviewCitation = {
      source_kind: 'ephemeral_sandbox_runtime_profile',
      source_id: runtime.runtime_id,
      source_phase: 'phase_26_live_sandbox',
      recorded_at: built_at,
      fragment_quoted: `${runtime.lifecycle_state} runtime with ${runtime.heartbeats.length} heartbeat(s)`,
      underlying_phase_25_sandbox_id: runtime.underlying_phase_25_sandbox_id,
      underlying_phase_26_runtime_id: runtime.runtime_id,
    };
    blocks.push({
      block_id: `nblk_${randomUUID().slice(0, 8)}`,
      template_id: 'sandbox.lifecycle.summary.v1',
      rendered_text: lifecycleRendered.text,
      citations: [cite],
      deterministic_hash: lifecycleRendered.hash,
    });
  }

  // Block 2: boundary proof chain
  const proofRendered = renderTemplate('sandbox.boundary.proof.v1', {
    runtime_id: runtime.runtime_id,
    topology_detachment_hash: runtime.boundary_proof.topology_detachment_hash,
    runtime_isolation_hash: runtime.boundary_proof.runtime_isolation_hash,
    replay_determinism_hash: runtime.boundary_proof.replay_determinism_hash,
    expiration_proof_hash: runtime.boundary_proof.expiration_proof_hash,
    mutation_avoidance_proof_hash: runtime.boundary_proof.mutation_avoidance_proof_hash,
  });
  if (proofRendered) {
    const cite: RehearsalPreviewCitation = {
      source_kind: 'sandbox_boundary_proof_chain',
      source_id: runtime.runtime_id,
      source_phase: 'phase_26_live_sandbox',
      recorded_at: built_at,
      fragment_quoted: 'boundary_proof_chain_with_5_hashes',
      underlying_phase_26_runtime_id: runtime.runtime_id,
    };
    blocks.push({
      block_id: `nblk_${randomUUID().slice(0, 8)}`,
      template_id: 'sandbox.boundary.proof.v1',
      rendered_text: proofRendered.text,
      citations: [cite],
      deterministic_hash: proofRendered.hash,
    });
  }

  // Block 3 (only if expired): expiration notice
  if (runtime.expiration) {
    const expRendered = renderTemplate('sandbox.expiration.notice.v1', {
      runtime_id: runtime.runtime_id,
      expiration_trigger: runtime.expiration.expiration_trigger,
      runtime_duration_ms: runtime.expiration.runtime_duration_ms,
      lifecycle_terminal_state: runtime.expiration.lifecycle_terminal_state,
    });
    if (expRendered) {
      const cite: RehearsalPreviewCitation = {
        source_kind: 'sandbox_expiration_attribution',
        source_id: runtime.runtime_id,
        source_phase: 'phase_26_live_sandbox',
        recorded_at: runtime.expiration.recorded_at,
        fragment_quoted: runtime.expiration.expiration_reason,
        underlying_phase_26_runtime_id: runtime.runtime_id,
      };
      blocks.push({
        block_id: `nblk_${randomUUID().slice(0, 8)}`,
        template_id: 'sandbox.expiration.notice.v1',
        rendered_text: expRendered.text,
        citations: [cite],
        deterministic_hash: expRendered.hash,
      });
    }
  }

  if (blocks.length === 0) return null;

  const narrative: OperationalPreviewNarrative = {
    narrative_id,
    runtime_id: runtime.runtime_id,
    organization_id: runtime.organization_id,
    kind: 'sandbox_lifecycle',
    blocks,
    built_at,
  };

  const store = ensure(input.organization_id);
  store.push(narrative);
  if (store.length > MAX_PREVIEW_NARRATIVES_PER_PARTITION) store.shift();

  try {
    publishCognitiveEvent({
      kind: 'sandbox.preview.generated',
      project_id: 'system',
      severity: 'info',
      payload: { narrative_id, runtime_id: runtime.runtime_id, organization_id: runtime.organization_id, block_count: blocks.length },
    });
  } catch { /* noop */ }

  return narrative;
}

export function listSandboxPreviewNarratives(organization_id: string): ReadonlyArray<OperationalPreviewNarrative> {
  return [...(partitions.get(organization_id) ?? [])].reverse();
}

export function recentSandboxPreviewNarrativeCount24h(organization_id?: string): number {
  const cutoff = Date.now() - 24 * 60 * 60_000;
  if (organization_id) {
    return (partitions.get(organization_id) ?? []).filter(n => Date.parse(n.built_at) >= cutoff).length;
  }
  let total = 0;
  for (const list of partitions.values()) {
    total += list.filter(n => Date.parse(n.built_at) >= cutoff).length;
  }
  return total;
}

export function _resetSandboxPreviewNarrativesForTests(): void {
  partitions.clear();
}
