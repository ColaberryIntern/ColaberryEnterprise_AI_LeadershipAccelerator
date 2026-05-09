/**
 * federationSummaryCounters — Phase 19 in-memory rolling counters used
 * by the engine state's `federation_summary` block.
 *
 * Strictly sync, no DB reads. Counters reset on process restart;
 * GovernanceAuditEntry rows of the Phase 19 audit kinds remain
 * authoritative for history.
 */

import type {
  FederationIsolationTier, FederationSummarySnapshot, FederationHealthScores,
} from './federationTypes';

interface ProjectFederationCounters {
  federation_enabled: boolean;
  isolation_tier: FederationIsolationTier;
  archetypes_shared_24h: number;
  archetypes_consumed_24h: number;
  active_anomalies: number;
  drift_events_detected: number;
  // Health score input counters
  recent_consent_changes: number;
  recent_visibility_violations: number;     // archetype attempted to share but consent denied
  recent_replays_total: number;
  recent_replays_with_attribution: number;
  last_event_at: number;
}

const states = new Map<string, ProjectFederationCounters>();

function getOrInit(project_id: string): ProjectFederationCounters {
  let s = states.get(project_id);
  if (!s) {
    s = {
      federation_enabled: false,
      isolation_tier: 'isolated',
      archetypes_shared_24h: 0,
      archetypes_consumed_24h: 0,
      active_anomalies: 0,
      drift_events_detected: 0,
      recent_consent_changes: 0,
      recent_visibility_violations: 0,
      recent_replays_total: 0,
      recent_replays_with_attribution: 0,
      last_event_at: Date.now(),
    };
    states.set(project_id, s);
  }
  return s;
}

export function noteConsentUpdated(project_id: string, federation_enabled: boolean, isolation_tier: FederationIsolationTier): void {
  const s = getOrInit(project_id);
  s.federation_enabled = federation_enabled;
  s.isolation_tier = isolation_tier;
  s.recent_consent_changes++;
  s.last_event_at = Date.now();
}

export function noteArchetypeShared(project_id: string): void {
  const s = getOrInit(project_id);
  s.archetypes_shared_24h++;
  s.last_event_at = Date.now();
}

export function noteArchetypeConsumed(project_id: string): void {
  const s = getOrInit(project_id);
  s.archetypes_consumed_24h++;
  s.last_event_at = Date.now();
}

export function noteVisibilityViolation(project_id: string): void {
  const s = getOrInit(project_id);
  s.recent_visibility_violations++;
  s.last_event_at = Date.now();
}

export function noteAnomalyActive(project_id: string, count: number): void {
  const s = getOrInit(project_id);
  s.active_anomalies = count;
  s.last_event_at = Date.now();
}

export function noteDriftEvent(project_id: string): void {
  const s = getOrInit(project_id);
  s.drift_events_detected++;
  s.last_event_at = Date.now();
}

export function noteImpactReplay(project_id: string, with_attribution: boolean): void {
  const s = getOrInit(project_id);
  s.recent_replays_total++;
  if (with_attribution) s.recent_replays_with_attribution++;
  s.last_event_at = Date.now();
}

export function readFederationSummary(project_id: string): FederationSummarySnapshot {
  const s = getOrInit(project_id);
  return {
    federation_enabled: s.federation_enabled,
    isolation_tier: s.isolation_tier,
    archetypes_shared_24h: s.archetypes_shared_24h,
    archetypes_consumed_24h: s.archetypes_consumed_24h,
    active_anomalies: s.active_anomalies,
    drift_events_detected: s.drift_events_detected,
    health_scores: computeHealthScores(s),
  };
}

function computeHealthScores(s: ProjectFederationCounters): FederationHealthScores {
  // Federation stability: fewer recent consent changes = more stable.
  const federation_stability = Math.max(0, 100 - s.recent_consent_changes * 5);

  // Archetype confidence: not directly readable here (depends on registry);
  // surface a baseline 75 when federation is enabled, otherwise 100 (irrelevant).
  const archetype_confidence = s.federation_enabled ? 75 : 100;

  // Federation drift: more drift events = lower score.
  const federation_drift = Math.max(0, 100 - s.drift_events_detected * 2);

  // Anomaly pressure: more active anomalies = lower score.
  const anomaly_pressure = Math.max(0, 100 - s.active_anomalies * 15);

  // Visibility integrity: fewer violations = higher integrity.
  const visibility_integrity = Math.max(0, 100 - s.recent_visibility_violations * 10);

  return {
    federation_stability,
    archetype_confidence,
    federation_drift,
    anomaly_pressure,
    visibility_integrity,
  };
}

export function _resetFederationSummary(): void {
  states.clear();
}
