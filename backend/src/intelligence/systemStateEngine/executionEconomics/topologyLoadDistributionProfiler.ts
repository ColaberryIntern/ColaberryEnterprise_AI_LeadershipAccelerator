/**
 * topologyLoadDistributionProfiler — Phase 28. RECOMMENDATION-ONLY
 * advisory load distribution profiling.
 *
 * Architectural commitment:
 *   - Recommendation-only. The engine NEVER auto-migrates execution.
 *   - `recommendation_only: true` and `never_auto_migrates: true` are
 *     typed-as-literal structural commitments.
 *   - Surfaces partition-level load + imbalance score; operators read,
 *     interpret, and decide. The engine does NOT correct imbalance.
 *   - Cross-org pooling forbidden — every profile is per-organization.
 */

import { createHash } from 'crypto';
import type {
  TopologyLoadDistributionProfile, DelegatedPressureTier,
} from './executionEconomicsTypes';
import {
  PRESSURE_SCORE_LOW, PRESSURE_SCORE_MODERATE,
  PRESSURE_SCORE_ELEVATED, PRESSURE_SCORE_CRITICAL,
  MAX_LOAD_CLASSIFICATIONS_PER_PARTITION,
} from './executionEconomicsTypes';
import { listEnvelopes as listDelegatedEnvelopes } from '../delegatedExecution/authorityEnvelopeEngine';
import { listExecutionTraces } from '../delegatedExecution/delegatedExecutionCoordinator';
import type { DelegatedAuthorityEnvelope } from '../delegatedExecution/delegatedExecutionTypes';

interface PartitionStore {
  classifications: TopologyLoadDistributionProfile[];
}

const partitions = new Map<string, PartitionStore>();

function ensure(organization_id: string): PartitionStore {
  let s = partitions.get(organization_id);
  if (!s) { s = { classifications: [] }; partitions.set(organization_id, s); }
  return s;
}

function deterministicHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

function classifyLoad(score: number): DelegatedPressureTier {
  if (score >= PRESSURE_SCORE_CRITICAL) return 'saturated';
  if (score >= PRESSURE_SCORE_ELEVATED) return 'critical';
  if (score >= PRESSURE_SCORE_MODERATE) return 'elevated';
  if (score >= PRESSURE_SCORE_LOW) return 'moderate';
  return 'low';
}

/**
 * Build a load distribution profile across the organization's
 * partitions (target_namespace as the partition key, with 'unscoped'
 * as the catch-all). RECOMMENDATION-ONLY.
 */
export function buildTopologyLoadDistributionProfile(
  organization_id: string,
): TopologyLoadDistributionProfile {
  const envelopes = listDelegatedEnvelopes(organization_id);
  const traces = listExecutionTraces(organization_id);

  const partitionMap = new Map<string, { envelopes: number; executions: number }>();

  for (const env of envelopes) {
    const key = env.target_namespace ?? 'unscoped';
    const cur = partitionMap.get(key) ?? { envelopes: 0, executions: 0 };
    cur.envelopes += 1;
    partitionMap.set(key, cur);
  }
  for (const tr of traces) {
    const key = tr.action_kind === 'lift_broker_isolation' || tr.action_kind === 'force_continuity_replay'
      ? (envelopes.find((e: DelegatedAuthorityEnvelope) => e.envelope_id === tr.envelope_id)?.target_namespace ?? 'unscoped')
      : 'unscoped';
    const cur = partitionMap.get(key) ?? { envelopes: 0, executions: 0 };
    cur.executions += 1;
    partitionMap.set(key, cur);
  }

  const partitionList = Array.from(partitionMap.entries()).map(([key, counts]) => {
    // Bounded score: linear with envelope count, executions weighted 2x.
    const load_score = Math.min(100, counts.envelopes * 5 + counts.executions * 10);
    return {
      partition_key: key,
      load_score,
      tier: classifyLoad(load_score),
      observed_envelope_count: counts.envelopes,
      observed_execution_count: counts.executions,
    };
  });

  const scores = partitionList.map(p => p.load_score);
  const max = scores.length === 0 ? 0 : Math.max(...scores);
  const min = scores.length === 0 ? 0 : Math.min(...scores);
  const imbalance_score = max - min;

  // Advisory recommendation — string only, never an action.
  let advisory_recommendation: string | undefined;
  if (imbalance_score >= 50) {
    advisory_recommendation = `Load imbalance detected (${imbalance_score} points across partitions). Operator review recommended; no auto-migration performed.`;
  } else if (imbalance_score >= 25) {
    advisory_recommendation = `Mild load imbalance (${imbalance_score} points). No action required; advisory only.`;
  }

  const built_at = new Date().toISOString();
  const distribution_hash = deterministicHash(
    `${organization_id}::${JSON.stringify(partitionList)}::${imbalance_score}`,
  );

  const profile: TopologyLoadDistributionProfile = {
    organization_id,
    partitions: partitionList,
    imbalance_score,
    advisory_recommendation,
    recommendation_only: true,
    never_auto_migrates: true,
    distribution_hash,
    built_at,
  };

  const store = ensure(organization_id);
  store.classifications.push(profile);
  if (store.classifications.length > MAX_LOAD_CLASSIFICATIONS_PER_PARTITION) {
    store.classifications.shift();
  }
  return profile;
}

export function listLoadDistributionProfiles(
  organization_id: string,
): ReadonlyArray<TopologyLoadDistributionProfile> {
  return [...(partitions.get(organization_id)?.classifications ?? [])].reverse();
}

export function recentLoadClassificationCount24h(organization_id?: string): number {
  const cutoff = Date.now() - 24 * 60 * 60_000;
  const orgs = organization_id ? [organization_id] : Array.from(partitions.keys());
  let total = 0;
  for (const o of orgs) {
    const arr = partitions.get(o)?.classifications ?? [];
    total += arr.filter(p => Date.parse(p.built_at) >= cutoff).length;
  }
  return total;
}

export function _resetTopologyLoadProfilerForTests(): void {
  partitions.clear();
}
