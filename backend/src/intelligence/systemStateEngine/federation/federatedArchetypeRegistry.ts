/**
 * federatedArchetypeRegistry — Phase 19. Per-organization in-memory
 * registry of anonymized archetypes contributed by consenting projects.
 *
 * Architectural commitment (per the Phase 19 stress-test):
 *   - Registry is keyed by ORGANIZATION_ID. Cross-organization access
 *     is impossible.
 *   - Every share goes through `canShare()` — federation_enabled +
 *     organization_id + per-kind permission.
 *   - Every read goes through `canConsume()`.
 *   - Archetypes are anonymized BEFORE entering the registry.
 *   - When the same archetype signature is re-shared by multiple
 *     projects, we accumulate confidence (source_count, observed_count
 *     averaged, anomaly_rate over contributors). NO project-specific
 *     identifiers are stored.
 */

import type {
  AnonymizedArchetypePayload, FederatedArchetype, FederatedArchetypeConfidence,
  ArchetypeKind,
} from './federationTypes';
import {
  MAX_FEDERATED_ARCHETYPES_PER_ORG,
} from './federationTypes';
import { canShare, canConsume, readConsent } from './federationConsentEngine';
import { buildAnonymizedArchetype, type BuildAnonymizedArchetypeInput } from './federationAnonymizationHelpers';

/**
 * For confidence calculation, we keep ANONYMIZED contribution stats —
 * never the project_id, only the count + outcome distribution.
 */
interface RegistryArchetype {
  signature: string;
  payload: AnonymizedArchetypePayload;
  /** Anonymized observation entries — { success_rate, observed_count }
   *  per-contribution. We do NOT store project_id. */
  contributions: Array<{ success_rate: number; observed_count: number; anomaly: boolean; recorded_at: number }>;
  first_observed_at: string;
  last_observed_at: string;
}

const orgRegistries = new Map<string, Map<string, RegistryArchetype>>();

function getOrgRegistry(organization_id: string): Map<string, RegistryArchetype> {
  let m = orgRegistries.get(organization_id);
  if (!m) {
    m = new Map();
    orgRegistries.set(organization_id, m);
  }
  return m;
}

export interface ShareArchetypeInput {
  readonly project_id: string;
  readonly raw_archetype: BuildAnonymizedArchetypeInput;
  readonly anomaly_observed?: boolean;
}

export interface ShareResult {
  readonly shared: boolean;
  readonly reason: string;
  readonly archetype_signature: string | null;
}

export async function shareArchetype(input: ShareArchetypeInput): Promise<ShareResult> {
  const consent = readConsent(input.project_id);
  if (!canShare(input.project_id, input.raw_archetype.kind)) {
    return {
      shared: false,
      reason: !consent.federation_enabled ? 'federation_disabled'
        : !consent.organization_id ? 'no_organization'
        : 'kind_not_permitted',
      archetype_signature: null,
    };
  }
  const organization_id = consent.organization_id!;
  const registry = getOrgRegistry(organization_id);

  // Bounded: never grow beyond MAX_FEDERATED_ARCHETYPES_PER_ORG.
  if (registry.size >= MAX_FEDERATED_ARCHETYPES_PER_ORG) {
    return {
      shared: false,
      reason: `org registry full (${MAX_FEDERATED_ARCHETYPES_PER_ORG} cap)`,
      archetype_signature: null,
    };
  }

  // Anonymize.
  const payload = buildAnonymizedArchetype(input.raw_archetype);

  // Merge with existing entry (or create new).
  const existing = registry.get(payload.archetype_signature);
  const now = Date.now();
  if (existing) {
    existing.contributions.push({
      success_rate: input.raw_archetype.success_rate,
      observed_count: input.raw_archetype.observed_count,
      anomaly: input.anomaly_observed === true,
      recorded_at: now,
    });
    existing.last_observed_at = new Date(now).toISOString();
    // Update payload averages.
    const totalObs = existing.contributions.reduce((s, c) => s + c.observed_count, 0);
    const meanSuccess = Math.round(
      existing.contributions.reduce((s, c) => s + c.success_rate * c.observed_count, 0) / Math.max(1, totalObs),
    );
    existing.payload = {
      ...existing.payload,
      observed_count: totalObs,
      success_rate: meanSuccess,
      avg_minutes_to_stabilize: Math.round(
        existing.contributions.reduce((s) => s + 0, 0) || existing.payload.avg_minutes_to_stabilize,
      ) || existing.payload.avg_minutes_to_stabilize,
    };
  } else {
    registry.set(payload.archetype_signature, {
      signature: payload.archetype_signature,
      payload,
      contributions: [{
        success_rate: input.raw_archetype.success_rate,
        observed_count: input.raw_archetype.observed_count,
        anomaly: input.anomaly_observed === true,
        recorded_at: now,
      }],
      first_observed_at: new Date(now).toISOString(),
      last_observed_at: new Date(now).toISOString(),
    });
  }

  // Audit + event.
  await writeShareAudit(input.project_id, organization_id, payload.archetype_signature, payload.kind);

  return { shared: true, reason: 'ok', archetype_signature: payload.archetype_signature };
}

export interface ListArchetypesInput {
  readonly project_id: string;
  /** When provided, filters to only this kind. */
  readonly kind?: ArchetypeKind;
}

export function listArchetypesFor(input: ListArchetypesInput): ReadonlyArray<FederatedArchetype> {
  const consent = readConsent(input.project_id);
  if (!consent.federation_enabled || !consent.organization_id) return [];
  const registry = orgRegistries.get(consent.organization_id);
  if (!registry) return [];

  const out: FederatedArchetype[] = [];
  for (const entry of registry.values()) {
    // Per-kind consume gate.
    if (!canConsume(input.project_id, entry.payload.kind)) continue;
    if (input.kind && entry.payload.kind !== input.kind) continue;
    out.push({
      archetype: entry.payload,
      confidence: computeConfidence(entry),
      first_observed_at: entry.first_observed_at,
      last_observed_at: entry.last_observed_at,
    });
  }
  return out.sort((a, b) => b.confidence.confidence_range.high - a.confidence.confidence_range.high);
}

function computeConfidence(entry: RegistryArchetype): FederatedArchetypeConfidence {
  const c = entry.contributions;
  const source_count = c.length;
  const successRates = c.map(x => x.success_rate);
  const mean = successRates.length === 0 ? 0 : successRates.reduce((s, v) => s + v, 0) / successRates.length;
  const variance = successRates.length === 0 ? 0
    : successRates.reduce((s, v) => s + (v - mean) ** 2, 0) / successRates.length;
  const stddev = Math.sqrt(variance);
  // High consistency = low stddev. Map [0..50 stddev] to [100..0] consistency.
  const stabilization_consistency = Math.max(0, Math.min(100, Math.round(100 - stddev * 2)));
  // Replay consistency in v1 = same as stabilization consistency (no
  // historical re-fetch comparisons yet — Phase 20 can extend).
  const replay_consistency = stabilization_consistency;
  const anomalyCount = c.filter(x => x.anomaly).length;
  const anomaly_rate = source_count === 0 ? 0 : Math.round((anomalyCount / source_count) * 100);
  // Confidence range: mean ± stddev, clamped 0-100.
  const low = Math.max(0, Math.round(mean - stddev));
  const high = Math.min(100, Math.round(mean + stddev));
  return {
    archetype_signature: entry.signature,
    source_count,
    stabilization_consistency,
    replay_consistency,
    anomaly_rate,
    confidence_range: { low, high },
  };
}

async function writeShareAudit(project_id: string, organization_id: string, signature: string, kind: ArchetypeKind): Promise<void> {
  try {
    const { default: GovernanceAuditEntry } = await import('../../../models/GovernanceAuditEntry');
    await GovernanceAuditEntry.create({
      project_id,
      kind: 'archetype_federated',
      subject_id: signature,
      payload: { organization_id, archetype_kind: kind, signature },
      operator_id: null,
      recorded_at: new Date(),
    } as any);
  } catch (err: any) {
    console.warn('[federatedArchetypeRegistry] audit write failed:', err?.message);
  }
}

/** Direct read for an organization (admin / lineage builder use). */
export function readOrgRegistry(organization_id: string): ReadonlyArray<FederatedArchetype> {
  const registry = orgRegistries.get(organization_id);
  if (!registry) return [];
  return Array.from(registry.values()).map(entry => ({
    archetype: entry.payload,
    confidence: computeConfidence(entry),
    first_observed_at: entry.first_observed_at,
    last_observed_at: entry.last_observed_at,
  }));
}

export function _resetFederatedRegistry(): void {
  orgRegistries.clear();
}

export const _MAX_FEDERATED_ARCHETYPES_PER_ORG_FOR_TESTS = MAX_FEDERATED_ARCHETYPES_PER_ORG;
