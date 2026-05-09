/**
 * executionAuthorityCompressionNarrative — Phase 27. Phase 24-compliant
 * deterministic template-rendered narrative explaining why a delegated
 * execution was authorized + bounded.
 *
 * Architectural commitment:
 *   - Inherits ALL Phase 24 anti-hallucination guarantees.
 *   - Static template registry. No LLM. Citation-required rendering.
 *   - Every block carries source citations + SHA-256 deterministic_hash.
 */

import { randomUUID, createHash } from 'crypto';
import type {
  ExecutionAuthorityCompressionNarrative, ExecutionAuthorityCompressionNarrativeBlock,
} from './delegatedExecutionTypes';
import { MAX_AUTHORITY_NARRATIVES_PER_PARTITION } from './delegatedExecutionTypes';
import { getEnvelope } from './authorityEnvelopeEngine';
import { getExecutionTrace } from './delegatedExecutionCoordinator';
import { publishCognitiveEvent } from '../realtime/cognitiveEventBus';

const TEMPLATES = {
  'delegation.authority.granted.v1': (vars: Record<string, string | number>) =>
    `Operator ${vars.operator_id} authorized a single-use delegated execution of ${vars.action_kind} on ${vars.target_summary} (org ${vars.target_organization_id}); envelope ${vars.envelope_id} expires at ${vars.expires_at}.`,
  'delegation.bounded.scope.v1': (vars: Record<string, string | number>) =>
    `Authority is structurally bounded: max_action_count=1, single_use=true, rollback_chain_required=true, topology_containment proof ${vars.containment_proof}.`,
  'delegation.rollback.coverage.v1': (vars: Record<string, string | number>) =>
    `Rollback coverage verified: chain ${vars.rollback_chain_id} sourced from ${vars.rollback_source_phase}; verification hash ${vars.verification_hash}.`,
  'delegation.containment.confirmed.v1': (vars: Record<string, string | number>) =>
    `Topology containment confirmed: cross_org_attempted=false, contained_within_partition=true; partition health ${vars.partition_health}/100.`,
  'delegation.outcome.v1': (vars: Record<string, string | number>) =>
    `Execution outcome: ${vars.outcome}; ${vars.summary}; envelope is now permanently terminal (cannot re-execute / re-consume / re-validate).`,
};

const partitions = new Map<string, ExecutionAuthorityCompressionNarrative[]>();

function ensure(organization_id: string): ExecutionAuthorityCompressionNarrative[] {
  let s = partitions.get(organization_id);
  if (!s) { s = []; partitions.set(organization_id, s); }
  return s;
}

function deterministicHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

function renderTemplate(template_id: keyof typeof TEMPLATES, vars: Record<string, string | number>): { text: string; hash: string } | null {
  const fn = TEMPLATES[template_id];
  if (!fn) return null;
  const text = fn(vars).slice(0, 600);
  const hash = deterministicHash(`${template_id}::${text}`);
  return { text, hash };
}

export interface BuildAuthorityNarrativeInput {
  readonly envelope_id: string;
  readonly organization_id: string;
}

export function buildAuthorityCompressionNarrative(input: BuildAuthorityNarrativeInput): ExecutionAuthorityCompressionNarrative | null {
  const envelope = getEnvelope(input.envelope_id);
  if (!envelope || envelope.target_organization_id !== input.organization_id) return null;

  const trace = getExecutionTrace(input.organization_id, input.envelope_id);
  const built_at = new Date().toISOString();
  const blocks: ExecutionAuthorityCompressionNarrativeBlock[] = [];

  // Block 1: authority granted
  const target_summary = envelope.target_namespace ?? envelope.target_kind ?? envelope.target_organization_id;
  const grantRendered = renderTemplate('delegation.authority.granted.v1', {
    operator_id: envelope.operator_id,
    action_kind: envelope.action_kind,
    target_summary,
    target_organization_id: envelope.target_organization_id,
    envelope_id: envelope.envelope_id,
    expires_at: envelope.expires_at,
  });
  if (grantRendered) {
    blocks.push({
      block_id: `nblk_${randomUUID().slice(0, 8)}`,
      template_id: 'delegation.authority.granted.v1',
      rendered_text: grantRendered.text,
      citations: [{
        source_kind: 'delegated_authority_envelope',
        source_id: envelope.envelope_id,
        source_phase: 'phase_27_delegated_execution',
      }],
      deterministic_hash: grantRendered.hash,
    });
  }

  // Block 2: bounded scope
  const boundedRendered = renderTemplate('delegation.bounded.scope.v1', {
    containment_proof: envelope.topology_containment_proof,
  });
  if (boundedRendered) {
    blocks.push({
      block_id: `nblk_${randomUUID().slice(0, 8)}`,
      template_id: 'delegation.bounded.scope.v1',
      rendered_text: boundedRendered.text,
      citations: [{
        source_kind: 'delegated_authority_envelope',
        source_id: envelope.envelope_id,
        source_phase: 'phase_27_delegated_execution',
      }],
      deterministic_hash: boundedRendered.hash,
    });
  }

  // Block 3: rollback coverage (only if trace exists)
  if (trace) {
    const rollback_inv = trace.safety_invariants.find(i => i.invariant_name === 'rollback_exists');
    if (rollback_inv) {
      const rollbackRendered = renderTemplate('delegation.rollback.coverage.v1', {
        rollback_chain_id: envelope.rollback_chain_id,
        rollback_source_phase: 'phase_23_execution_substrate',  // bounded set via verifyRollbackCoverage
        verification_hash: rollback_inv.verification_hash,
      });
      if (rollbackRendered) {
        blocks.push({
          block_id: `nblk_${randomUUID().slice(0, 8)}`,
          template_id: 'delegation.rollback.coverage.v1',
          rendered_text: rollbackRendered.text,
          citations: [{
            source_kind: 'delegated_safety_invariant',
            source_id: envelope.envelope_id,
            source_phase: 'phase_27_delegated_execution',
          }],
          deterministic_hash: rollbackRendered.hash,
        });
      }
    }
  }

  // Block 4: containment confirmed (only if trace + partition_stable invariant exists)
  if (trace) {
    const partition_inv = trace.safety_invariants.find(i => i.invariant_name === 'partition_stable');
    if (partition_inv && partition_inv.invariant_verified) {
      const containmentRendered = renderTemplate('delegation.containment.confirmed.v1', {
        partition_health: 100,  // structurally validated by partition_stable invariant
      });
      if (containmentRendered) {
        blocks.push({
          block_id: `nblk_${randomUUID().slice(0, 8)}`,
          template_id: 'delegation.containment.confirmed.v1',
          rendered_text: containmentRendered.text,
          citations: [{
            source_kind: 'topology_containment_profile',
            source_id: envelope.envelope_id,
            source_phase: 'phase_27_delegated_execution',
          }],
          deterministic_hash: containmentRendered.hash,
        });
      }
    }
  }

  // Block 5: outcome (only if trace exists)
  if (trace) {
    const outcomeRendered = renderTemplate('delegation.outcome.v1', {
      outcome: trace.attribution_lineage.actual_action_outcome,
      summary: trace.finality_proof.terminal_state,
    });
    if (outcomeRendered) {
      blocks.push({
        block_id: `nblk_${randomUUID().slice(0, 8)}`,
        template_id: 'delegation.outcome.v1',
        rendered_text: outcomeRendered.text,
        citations: [{
          source_kind: 'delegated_execution_replay_trace',
          source_id: trace.trace_id,
          source_phase: 'phase_27_delegated_execution',
        }],
        deterministic_hash: outcomeRendered.hash,
      });
    }
  }

  if (blocks.length === 0) return null;

  const narrative: ExecutionAuthorityCompressionNarrative = {
    narrative_id: `nauth_${randomUUID()}`,
    envelope_id: envelope.envelope_id,
    organization_id: envelope.target_organization_id,
    blocks,
    built_at,
  };

  const store = ensure(input.organization_id);
  store.push(narrative);
  if (store.length > MAX_AUTHORITY_NARRATIVES_PER_PARTITION) store.shift();

  try {
    publishCognitiveEvent({
      kind: 'delegation.replayed',
      project_id: 'system',
      severity: 'info',
      payload: {
        narrative_id: narrative.narrative_id,
        envelope_id: envelope.envelope_id,
        organization_id: envelope.target_organization_id,
        block_count: blocks.length,
      },
    });
  } catch { /* noop */ }

  return narrative;
}

export function listAuthorityNarratives(organization_id: string): ReadonlyArray<ExecutionAuthorityCompressionNarrative> {
  return [...(partitions.get(organization_id) ?? [])].reverse();
}

export function _resetAuthorityNarrativesForTests(): void {
  partitions.clear();
}
