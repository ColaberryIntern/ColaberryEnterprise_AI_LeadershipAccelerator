/**
 * sandboxTrustSurface — Phase 26. 6 inherited bands surfaced from
 * Phase 25 + Phase 22 + Phase 26 self-evidence.
 */

import type { SandboxTrustSurface } from './liveSandboxTypes';
import { buildExperimentationTrustSurface } from '../experimentation/experimentationTrustSurface';
import {
  listRuntimes, activeRuntimeCount, recentExpirationCount24h,
} from './ephemeralWorkerRuntime';
import { recentLiveSandboxDecisionCount24h } from './sandboxGovernanceSupervisor';

export function buildLiveSandboxTrustSurface(input: { organization_id: string }): SandboxTrustSurface {
  const runtimes = listRuntimes(input.organization_id);
  const phase25 = buildExperimentationTrustSurface({ organization_id: input.organization_id });
  const decisionCount24h = recentLiveSandboxDecisionCount24h(input.organization_id);
  const expirationCount24h = recentExpirationCount24h(input.organization_id);
  const activeCount = activeRuntimeCount(input.organization_id);

  // ── Phase 26 self-evidence bands ─────────────────────────────────
  const allHaveBoundaryProof = runtimes.length === 0 || runtimes.every(r =>
    r.boundary_proof.topology_detachment_hash.length > 0
    && r.boundary_proof.runtime_isolation_hash.length > 0
    && r.boundary_proof.replay_determinism_hash.length > 0
    && r.boundary_proof.expiration_proof_hash.length > 0
    && r.boundary_proof.mutation_avoidance_proof_hash.length > 0,
  );
  const sandbox_isolation_proof = allHaveBoundaryProof ? 100 : 0;

  const allExpiredOrRunning = runtimes.length === 0 || runtimes.every(r =>
    r.lifecycle_state === 'expired' || r.lifecycle_state === 'completed' || r.lifecycle_state === 'running' || r.lifecycle_state === 'failed' || r.lifecycle_state === 'pending',
  );
  const lifecycle_completeness = allExpiredOrRunning ? 100 : 0;

  // ── Inherited from Phase 25 ──────────────────────────────────────
  const phase25Determinism = phase25.bands.find(b => b.label === 'projection_determinism')?.score ?? 100;
  const phase25Inheritance = phase25.bands.find(b => b.label === 'propagation_inheritance')?.score ?? 60;

  // ── Phase 26 governance completeness ────────────────────────────
  const governance_attribution_completeness =
    runtimes.length === 0 ? 100 :
    decisionCount24h >= runtimes.length ? 100 : 70;

  // ── Phase 26 expiration health ──────────────────────────────────
  const expiration_health =
    runtimes.length === 0 ? 100 :
    expirationCount24h >= runtimes.filter(r => r.lifecycle_state !== 'pending' && r.lifecycle_state !== 'running').length ? 100 :
    Math.max(60, 100 - activeCount * 10);

  const bands: SandboxTrustSurface['bands'] = [
    {
      label: 'sandbox_isolation_proof',
      score: sandbox_isolation_proof,
      inherited_from_phase: 'phase_26_live_sandbox',
      drivers: allHaveBoundaryProof ? ['all_runtimes_carry_5_hash_boundary_proof'] : ['missing_boundary_proof_in_some_runtime'],
      source_attribution_id: `phase26_iso_proof:${input.organization_id}`,
    },
    {
      label: 'lifecycle_completeness',
      score: lifecycle_completeness,
      inherited_from_phase: 'phase_26_live_sandbox',
      drivers: ['runtime_in_known_lifecycle_state'],
      source_attribution_id: `phase26_lifecycle:${input.organization_id}`,
    },
    {
      label: 'projection_determinism_inherited',
      score: phase25Determinism,
      inherited_from_phase: 'phase_25_experimentation',
      drivers: ['inherited_from_phase_25_projection_determinism'],
      source_attribution_id: `phase25_determinism:${input.organization_id}`,
    },
    {
      label: 'propagation_inheritance',
      score: phase25Inheritance,
      inherited_from_phase: 'phase_22_topology',
      drivers: ['inherited_from_phase_22_forecast_via_phase_25'],
      source_attribution_id: `phase22_via_phase25:${input.organization_id}`,
    },
    {
      label: 'governance_attribution_completeness',
      score: governance_attribution_completeness,
      inherited_from_phase: 'phase_26_live_sandbox',
      drivers: [`decision_count_24h=${decisionCount24h}`, `runtime_count=${runtimes.length}`],
      source_attribution_id: `phase26_governance:${input.organization_id}`,
    },
    {
      label: 'expiration_health',
      score: expiration_health,
      inherited_from_phase: 'phase_26_live_sandbox',
      drivers: [`expirations_24h=${expirationCount24h}`, `active_runtimes=${activeCount}`],
      source_attribution_id: `phase26_expiration:${input.organization_id}`,
    },
  ];

  const aggregate_score = Math.round(bands.reduce((s, b) => s + b.score, 0) / bands.length);
  return {
    organization_id: input.organization_id,
    bands,
    aggregate_score,
    built_at: new Date().toISOString(),
  };
}
