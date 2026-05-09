/**
 * governanceArchaeologyEngine — Phase 31. Read-only aggregation across
 * Phase 27/28/29/30 governance attributions.
 *
 * Architectural commitment:
 *   - Pure read. Never writes to Phase 27/28/29/30 stores.
 *   - `read_only: true` typed-as-literal.
 *   - Cross-phase counts only — does NOT replay individual rows here
 *     (that's Phase 30's responsibility for foresight or Phase 31's
 *     reasoning continuity replay for memory).
 *   - Cross-organization isolation absolute.
 */

import { createHash } from 'crypto';
import type {
  GovernanceArchaeologyReplay,
} from './governanceMemoryTypes';
import { MAX_ARCHAEOLOGY_PER_PARTITION } from './governanceMemoryTypes';
import { listEnvelopes as listDelegatedEnvelopes } from '../delegatedExecution/authorityEnvelopeEngine';
import { listDelegatedGovernanceAttributions } from '../delegatedExecution/delegatedExecutionGovernance';
import {
  listQuotaGovernanceAttributions, listQuotaExhaustions,
} from '../executionEconomics/executionQuotaEngine';
import {
  listGovernanceAttributions as listStabilizationGovernance,
  listFinalityProofs,
} from '../stabilizationIntelligence/recoveryGovernanceSupervisor';
import { listComparisons } from '../recoveryForesight/stabilizationDecisionEngine';
import { listWalkthroughs } from '../recoveryForesight/recoveryNarrativeWalkthrough';
import { listDecisionGovernanceAttributions } from '../recoveryForesight/decisionGovernanceSupervisor';

interface PartitionStore {
  archaeology: GovernanceArchaeologyReplay[];
}

const partitions = new Map<string, PartitionStore>();

function ensure(organization_id: string): PartitionStore {
  let s = partitions.get(organization_id);
  if (!s) { s = { archaeology: [] }; partitions.set(organization_id, s); }
  return s;
}

function deterministicHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

export interface BuildArchaeologyInput {
  readonly organization_id: string;
}

export function buildGovernanceArchaeology(
  input: BuildArchaeologyInput,
): GovernanceArchaeologyReplay {
  // Phase 27 — delegated execution
  const phase27Envelopes = listDelegatedEnvelopes(input.organization_id);
  const phase27Governance = listDelegatedGovernanceAttributions(input.organization_id);

  // Phase 28 — quota governance
  const phase28QuotaGov = listQuotaGovernanceAttributions(input.organization_id);
  const phase28QuotaExh = listQuotaExhaustions(input.organization_id);

  // Phase 29 — stabilization governance + finality
  const phase29Gov = listStabilizationGovernance(input.organization_id);
  const phase29Final = listFinalityProofs(input.organization_id);

  // Phase 30 — foresight comparisons + walkthroughs + governance
  const phase30Comparisons = listComparisons(input.organization_id);
  const phase30Walkthroughs = listWalkthroughs(input.organization_id);
  const phase30Governance = listDecisionGovernanceAttributions(input.organization_id);

  const archaeology_hash = deterministicHash([
    `phase_27_envelopes=${phase27Envelopes.length}`,
    `phase_27_governance=${phase27Governance.length}`,
    `phase_28_quota_gov=${phase28QuotaGov.length}`,
    `phase_28_quota_exh=${phase28QuotaExh.length}`,
    `phase_29_gov=${phase29Gov.length}`,
    `phase_29_final=${phase29Final.length}`,
    `phase_30_cmp=${phase30Comparisons.length}`,
    `phase_30_walk=${phase30Walkthroughs.length}`,
    `phase_30_gov=${phase30Governance.length}`,
  ].join('::'));

  const replay: GovernanceArchaeologyReplay = {
    organization_id: input.organization_id,
    source_phase_summaries: {
      phase_27_envelope_count: phase27Envelopes.length,
      phase_27_governance_attribution_count: phase27Governance.length,
      phase_28_quota_governance_count: phase28QuotaGov.length,
      phase_28_quota_exhaustion_count: phase28QuotaExh.length,
      phase_29_governance_attribution_count: phase29Gov.length,
      phase_29_finality_proof_count: phase29Final.length,
      phase_30_comparison_count: phase30Comparisons.length,
      phase_30_walkthrough_count: phase30Walkthroughs.length,
      phase_30_governance_count: phase30Governance.length,
    },
    read_only: true,
    cross_phase_archaeology: true,
    bounded_to_organization: true,
    archaeology_hash,
    built_at: new Date().toISOString(),
  };

  const store = ensure(input.organization_id);
  store.archaeology.push(replay);
  if (store.archaeology.length > MAX_ARCHAEOLOGY_PER_PARTITION) store.archaeology.shift();

  return replay;
}

export function listArchaeologyReplays(
  organization_id: string,
): ReadonlyArray<GovernanceArchaeologyReplay> {
  return [...(partitions.get(organization_id)?.archaeology ?? [])].reverse();
}

export function recentArchaeologyCount24h(organization_id?: string): number {
  const cutoff = Date.now() - 24 * 60 * 60_000;
  const orgs = organization_id ? [organization_id] : Array.from(partitions.keys());
  let total = 0;
  for (const o of orgs) {
    const arr = partitions.get(o)?.archaeology ?? [];
    total += arr.filter(a => Date.parse(a.built_at) >= cutoff).length;
  }
  return total;
}

export function _resetGovernanceArchaeologyForTests(): void {
  partitions.clear();
}
