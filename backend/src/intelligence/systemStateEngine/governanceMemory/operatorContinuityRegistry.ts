/**
 * operatorContinuityRegistry — Phase 31. Per-organization aggregate
 * counters over the session/event log.
 *
 * Architectural commitment:
 *   - Counters + filterable raw events + distinct operator IDs.
 *   - NO per-operator confidence score, NO behavioral pattern field,
 *     NO operator-specific recommendations.
 *   - `engine_never_profiles: true` typed-as-literal.
 *   - Cross-organization isolation absolute.
 */

import { createHash } from 'crypto';
import type {
  OperatorContinuityProfile, MemoryDensityTier,
  StabilizationSessionEventKind, MemoryNeutralityProof,
} from './governanceMemoryTypes';
import {
  DENSITY_SPARSE_THRESHOLD, DENSITY_PARTIAL_THRESHOLD,
  DENSITY_DEVELOPED_THRESHOLD, DENSITY_DENSE_THRESHOLD,
} from './governanceMemoryTypes';
import { listSessions, listEvents } from './stabilizationSessionTimeline';

interface PartitionStore {
  neutrality_proofs: MemoryNeutralityProof[];
}

const partitions = new Map<string, PartitionStore>();

function ensure(organization_id: string): PartitionStore {
  let s = partitions.get(organization_id);
  if (!s) { s = { neutrality_proofs: [] }; partitions.set(organization_id, s); }
  return s;
}

function deterministicHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

function classifyDensity(total_events: number): MemoryDensityTier {
  if (total_events >= DENSITY_DENSE_THRESHOLD) return 'compressed';
  if (total_events >= DENSITY_DEVELOPED_THRESHOLD) return 'dense';
  if (total_events >= DENSITY_PARTIAL_THRESHOLD) return 'developed';
  if (total_events >= DENSITY_SPARSE_THRESHOLD) return 'partial';
  return 'sparse';
}

const ALL_KINDS: ReadonlyArray<StabilizationSessionEventKind> = [
  'session_opened',
  'archetype_viewed',
  'comparison_built',
  'survivability_reviewed',
  'tradeoff_reviewed',
  'archaeology_replayed',
  'walkthrough_generated',
  'guidance_built',
  'governance_evaluated',
  'archetype_applied',
  'session_closed',
  'note_recorded',
];

export interface BuildContinuityProfileInput {
  readonly organization_id: string;
}

export function buildOperatorContinuityProfile(
  input: BuildContinuityProfileInput,
): OperatorContinuityProfile {
  const sessions = listSessions(input.organization_id);
  const events = listEvents(input.organization_id);

  const events_by_kind = ALL_KINDS.reduce((acc, k) => ({ ...acc, [k]: 0 }), {} as Record<StabilizationSessionEventKind, number>);
  for (const e of events) {
    events_by_kind[e.event_kind] = (events_by_kind[e.event_kind] ?? 0) + 1;
  }

  const total_sessions = sessions.length;
  const active_sessions = sessions.filter(s =>
    s.lifecycle_state === 'opened' || s.lifecycle_state === 'active',
  ).length;
  const closed_sessions = sessions.filter(s =>
    s.lifecycle_state === 'closed' || s.lifecycle_state === 'expired',
  ).length;
  const total_events = events.length;

  const distinct_operator_ids = Array.from(
    new Set(sessions.map(s => s.operator_id)),
  ).sort();
  const distinct_operator_count = distinct_operator_ids.length;

  const density_tier = classifyDensity(total_events);

  const profile_hash = deterministicHash(
    `continuity::${input.organization_id}::${total_sessions}::${total_events}::${distinct_operator_count}::${density_tier}`,
  );

  return {
    organization_id: input.organization_id,
    total_sessions,
    active_sessions,
    closed_sessions,
    total_events,
    events_by_kind,
    distinct_operator_count,
    distinct_operator_ids,
    engine_never_profiles: true,
    density_tier,
    profile_hash,
    built_at: new Date().toISOString(),
  };
}

/**
 * Build a `MemoryNeutralityProof` attesting that this build of the
 * continuity profile remained STRUCTURALLY NEUTRAL: no operator
 * profiling, no behavioral prediction, no operator ranking.
 */
export function recordNeutralityProof(
  input: { organization_id: string; continuity_id: string },
): MemoryNeutralityProof {
  const recorded_at = new Date().toISOString();
  const proof: MemoryNeutralityProof = {
    continuity_id: input.continuity_id,
    no_operator_profiling: true,
    no_behavioral_prediction: true,
    no_operator_ranking: true,
    deterministic_hash: deterministicHash(
      `neutrality::${input.continuity_id}::${recorded_at}`,
    ),
    recorded_at,
  };
  const store = ensure(input.organization_id);
  store.neutrality_proofs.push(proof);
  if (store.neutrality_proofs.length > 200) store.neutrality_proofs.shift();
  return proof;
}

export function listNeutralityProofs(
  organization_id: string,
): ReadonlyArray<MemoryNeutralityProof> {
  return [...(partitions.get(organization_id)?.neutrality_proofs ?? [])].reverse();
}

export function _resetContinuityRegistryForTests(): void {
  partitions.clear();
}
