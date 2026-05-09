/**
 * organizationalRecoveryIntelligence — Phase 19. Reads federated
 * recovery archetypes from the consuming project's organization +
 * surfaces them as INFORMATIONAL recommendations.
 *
 * Architectural commitment (per the Phase 19 stress-test):
 *   - Federated archetypes are INFORMATIONAL ONLY. Consumers see
 *     "Patterns from other projects you may want to consider."
 *   - To actually apply a federated archetype, the operator MUST create
 *     a Phase 18 calibration proposal locally + approve it. There is
 *     NO autonomous federated learning loop.
 *   - This module produces `OrganizationalRecoveryInsight` payloads —
 *     it never modifies the consuming project's state.
 */

import type {
  OrganizationalRecoveryIntelligenceReport, OrganizationalRecoveryInsight,
  ArchetypeKind,
} from './federationTypes';
import { listArchetypesFor } from './federatedArchetypeRegistry';
import { readConsent, canConsume } from './federationConsentEngine';

const MIN_CONFIDENCE_LOW_FOR_RECOMMENDATION = 60;
const MIN_SOURCE_COUNT_FOR_RECOMMENDATION = 2;
const MAX_INSIGHTS_RETURNED = 25;

export interface BuildIntelligenceInput {
  readonly project_id: string;
  /** Optional kind filter — when supplied, only archetypes of this kind
   *  are surfaced. */
  readonly kind?: ArchetypeKind;
}

export function buildOrganizationalRecoveryIntelligence(input: BuildIntelligenceInput): OrganizationalRecoveryIntelligenceReport {
  const consent = readConsent(input.project_id);
  if (!consent.federation_enabled || !consent.organization_id) {
    return {
      project_id: input.project_id,
      organization_id: consent.organization_id,
      insights: [],
      built_at: new Date().toISOString(),
    };
  }

  const archetypes = listArchetypesFor({ project_id: input.project_id, kind: input.kind });
  const insights: OrganizationalRecoveryInsight[] = archetypes
    .map(a => {
      const meetsConsentGate = canConsume(input.project_id, a.archetype.kind);
      const meetsConfidenceGate =
        a.confidence.confidence_range.low >= MIN_CONFIDENCE_LOW_FOR_RECOMMENDATION
        && a.confidence.source_count >= MIN_SOURCE_COUNT_FOR_RECOMMENDATION;
      const meetsAnomalyGate = a.confidence.anomaly_rate < 50;
      const is_recommended = meetsConsentGate && meetsConfidenceGate && meetsAnomalyGate;
      const recommendation_reason = is_recommended
        ? `${a.confidence.source_count} sources; confidence ${a.confidence.confidence_range.low}-${a.confidence.confidence_range.high}; anomaly rate ${a.confidence.anomaly_rate}%.`
        : !meetsConsentGate ? `consume permission off for ${a.archetype.kind}`
        : !meetsConfidenceGate ? `confidence below floor (low=${a.confidence.confidence_range.low}, sources=${a.confidence.source_count})`
        : `anomaly rate too high (${a.confidence.anomaly_rate}%)`;
      return {
        archetype: a.archetype,
        confidence: a.confidence,
        is_recommended,
        recommendation_reason,
      };
    })
    .slice(0, MAX_INSIGHTS_RETURNED);

  return {
    project_id: input.project_id,
    organization_id: consent.organization_id,
    insights,
    built_at: new Date().toISOString(),
  };
}

export const _MIN_CONFIDENCE_LOW_FOR_TESTS = MIN_CONFIDENCE_LOW_FOR_RECOMMENDATION;
export const _MIN_SOURCE_COUNT_FOR_TESTS = MIN_SOURCE_COUNT_FOR_RECOMMENDATION;
export const _MAX_INSIGHTS_RETURNED_FOR_TESTS = MAX_INSIGHTS_RETURNED;
