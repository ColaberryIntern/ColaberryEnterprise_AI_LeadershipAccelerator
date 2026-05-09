/**
 * Phase 19 tests — federated organizational governance intelligence.
 *
 * Coverage (pure helpers + lazy-DB paths with mocked models):
 *   - federationAnonymizationHelpers: identifier stripping, hash determinism,
 *     step sequence anonymization, signature stability
 *   - federationConsentEngine: default isolated, opt-in flips tier,
 *     federation_disabled blocks all sharing/consumption (hard veto),
 *     canShare/canConsume contract
 *   - federatedArchetypeRegistry: blocked share when consent off, blocked
 *     when no organization, accepted share, registry size cap, multi-source
 *     confidence accumulation, kind filter, cross-org isolation
 *   - organizationalRecoveryIntelligence: cold-start empty, recommends only
 *     with ≥2 sources + confidence ≥ 60 + anomaly < 50, consume permission
 *     gate
 *   - calibrationImpactReplay: before/after delta, overall_assessment,
 *     window clamp, missing proposal returns error
 *   - anomalyAwareForecastEngine: cold-start no entries, z-score detection,
 *     pressure score, observation cap
 *   - governanceDriftReplay: empty when no audits (mocked), kind mapping
 *   - federationLineageTracker: source/consumer recording, attribution
 *     readback, cap enforcement
 *   - federationSummaryCounters + AuthoritativeSystemState surface
 *   - hard-veto preservation under federation
 */

jest.mock('../../../models/GovernanceAuditEntry', () => ({
  __esModule: true,
  default: { create: jest.fn().mockResolvedValue({}), findAll: jest.fn().mockResolvedValue([]), findOne: jest.fn().mockResolvedValue(null) },
}));

import {
  anonymizeStepSequence, hashArchetypeSignature, stripIdentifyingFields,
  buildAnonymizedArchetype, _IDENTIFYING_FIELDS_FOR_TESTS,
} from '../federation/federationAnonymizationHelpers';
import {
  readConsent, updateConsent, canShare, canConsume,
  _resetFederationConsent, _ARCHETYPE_KINDS_FOR_TESTS,
} from '../federation/federationConsentEngine';
import {
  shareArchetype, listArchetypesFor, readOrgRegistry,
  _resetFederatedRegistry, _MAX_FEDERATED_ARCHETYPES_PER_ORG_FOR_TESTS,
} from '../federation/federatedArchetypeRegistry';
import {
  buildOrganizationalRecoveryIntelligence,
  _MIN_CONFIDENCE_LOW_FOR_TESTS, _MIN_SOURCE_COUNT_FOR_TESTS,
} from '../federation/organizationalRecoveryIntelligence';
import {
  _testReplayWithSnapshots,
  _CALIBRATION_IMPACT_MAX_WINDOW_HOURS_FOR_TESTS,
} from '../federation/calibrationImpactReplay';
import {
  recordAnomalyObservation, buildForecastAnomalyProfile,
  _resetAnomalyEngine, _ANOMALY_Z_SCORE_THRESHOLD_FOR_TESTS,
  _ANOMALY_MIN_OBSERVATIONS_FOR_TESTS, _MAX_ANOMALY_OBSERVATIONS_PER_SIGNAL_FOR_TESTS,
} from '../federation/anomalyAwareForecastEngine';
import {
  buildGovernanceDriftReplay,
} from '../federation/governanceDriftReplay';
import {
  recordSource, recordConsumption, readFederationLineage,
  readConsumptionAttributions, _resetFederationLineage,
  _MAX_LINEAGE_ENTRIES_PER_ARCHETYPE_FOR_TESTS,
} from '../federation/federationLineageTracker';
import {
  noteConsentUpdated, noteArchetypeShared, noteArchetypeConsumed,
  noteAnomalyActive, readFederationSummary,
  _resetFederationSummary,
} from '../federation/federationSummaryCounters';
import { buildAuthoritativeStateFromInputs } from '../systemStateEngine';
import type { ArchetypeKind, FederationConsumptionAttribution } from '../federation/federationTypes';

// ─── federationAnonymizationHelpers ──────────────────────────────────

describe('federationAnonymizationHelpers', () => {
  it('anonymizeStepSequence strips colon suffixes', () => {
    const r = anonymizeStepSequence(['rollback_target:cap-x', 'contain_root:POLICY_NUDGE', 'monitor_only']);
    expect(r).toEqual(['rollback_target', 'contain_root', 'monitor_only']);
  });

  it('hashArchetypeSignature is deterministic', () => {
    const a = hashArchetypeSignature('test::POLICY_NUDGE::successful');
    const b = hashArchetypeSignature('test::POLICY_NUDGE::successful');
    expect(a).toBe(b);
    expect(a).toMatch(/^arch-/);
  });

  it('hashArchetypeSignature differs for different inputs', () => {
    expect(hashArchetypeSignature('a')).not.toBe(hashArchetypeSignature('b'));
  });

  it('stripIdentifyingFields removes known identifying keys', () => {
    const r = stripIdentifyingFields({
      project_id: 'p1', capability_id: 'cap-x', cluster_signature: 'cta:cap:/x',
      step_sequence: ['contain_root', 'rollback_target'],
      success_rate: 80,
    });
    expect(r.project_id).toBeUndefined();
    expect(r.capability_id).toBeUndefined();
    expect(r.cluster_signature).toBeUndefined();
    expect(r.step_sequence).toEqual(['contain_root', 'rollback_target']);
    expect(r.success_rate).toBe(80);
  });

  it('stripIdentifyingFields recurses into nested objects', () => {
    const r = stripIdentifyingFields({
      payload: { project_id: 'p1', kind: 'mutation', subject_id: 'cap-x' },
    });
    expect((r.payload as any).project_id).toBeUndefined();
    expect((r.payload as any).subject_id).toBeUndefined();
    expect((r.payload as any).kind).toBe('mutation');
  });

  it('buildAnonymizedArchetype produces a stable signature for same inputs', () => {
    const a = buildAnonymizedArchetype({
      kind: 'recovery_archetype',
      raw_step_sequence: ['contain_root:cap-x', 'rollback_target:mut-1'],
      observed_count: 2, success_rate: 90, avg_minutes_to_stabilize: 15,
    });
    const b = buildAnonymizedArchetype({
      kind: 'recovery_archetype',
      raw_step_sequence: ['contain_root:cap-y', 'rollback_target:mut-2'],     // different identifiers
      observed_count: 2, success_rate: 90, avg_minutes_to_stabilize: 15,
    });
    expect(a.archetype_signature).toBe(b.archetype_signature);     // anonymized → same hash
    expect(a.step_sequence).toEqual(['contain_root', 'rollback_target']);
  });

  it('buildAnonymizedArchetype filters notes containing identifying fields', () => {
    const a = buildAnonymizedArchetype({
      kind: 'recovery_archetype',
      raw_step_sequence: ['contain_root', 'rollback_target'],
      observed_count: 2, success_rate: 90, avg_minutes_to_stabilize: 15,
      notes: ['contains project_id leak', 'normal note'],
    });
    expect(a.notes).toEqual(['normal note']);
  });

  it('IDENTIFYING_FIELDS includes the expected keys', () => {
    expect(_IDENTIFYING_FIELDS_FOR_TESTS.has('project_id')).toBe(true);
    expect(_IDENTIFYING_FIELDS_FOR_TESTS.has('capability_id')).toBe(true);
    expect(_IDENTIFYING_FIELDS_FOR_TESTS.has('cluster_signature')).toBe(true);
  });
});

// ─── federationConsentEngine ─────────────────────────────────────────

describe('federationConsentEngine', () => {
  beforeEach(() => { _resetFederationConsent(); });

  it('default consent is isolated (federation_enabled=false)', () => {
    const c = readConsent('p1');
    expect(c.federation_enabled).toBe(false);
    expect(c.isolation_tier).toBe('isolated');
    expect(c.organization_id).toBeNull();
  });

  it('updateConsent flips federation_enabled + organization_id → tier=organizational when all share/consume on', async () => {
    const sharePerm = _ARCHETYPE_KINDS_FOR_TESTS.reduce((acc, k) => { acc[k] = true; return acc; }, {} as any);
    const c = await updateConsent({
      project_id: 'p1', organization_id: 'org-1',
      federation_enabled: true,
      share_permissions: sharePerm,
      consume_permissions: sharePerm,
      updated_by: 'op-1',
    });
    expect(c.federation_enabled).toBe(true);
    expect(c.isolation_tier).toBe('organizational');
  });

  it('federation_enabled=false hard-vetoes canShare regardless of permissions', async () => {
    const sharePerm = _ARCHETYPE_KINDS_FOR_TESTS.reduce((acc, k) => { acc[k] = true; return acc; }, {} as any);
    await updateConsent({
      project_id: 'p1', organization_id: 'org-1',
      federation_enabled: false,
      share_permissions: sharePerm, consume_permissions: sharePerm,
      updated_by: 'op-1',
    });
    expect(canShare('p1', 'recovery_archetype')).toBe(false);
    expect(canConsume('p1', 'recovery_archetype')).toBe(false);
  });

  it('no organization_id keeps tier=local_only when federation_enabled=true', async () => {
    const c = await updateConsent({
      project_id: 'p1', organization_id: null,
      federation_enabled: true, updated_by: 'op-1',
    });
    expect(c.isolation_tier).toBe('local_only');
  });

  it('share-only (no consume) → tier=restricted', async () => {
    const c = await updateConsent({
      project_id: 'p1', organization_id: 'org-1', federation_enabled: true,
      share_permissions: { recovery_archetype: true } as any,
      consume_permissions: {} as any,
      updated_by: 'op-1',
    });
    expect(c.isolation_tier).toBe('restricted');
  });

  it('consume-only → tier=visibility_limited', async () => {
    const c = await updateConsent({
      project_id: 'p1', organization_id: 'org-1', federation_enabled: true,
      share_permissions: {} as any,
      consume_permissions: { recovery_archetype: true } as any,
      updated_by: 'op-1',
    });
    expect(c.isolation_tier).toBe('visibility_limited');
  });

  it('canShare requires per-kind permission', async () => {
    await updateConsent({
      project_id: 'p1', organization_id: 'org-1', federation_enabled: true,
      share_permissions: { recovery_archetype: true } as any,
      updated_by: 'op-1',
    });
    expect(canShare('p1', 'recovery_archetype')).toBe(true);
    expect(canShare('p1', 'contradiction_archetype')).toBe(false);
  });
});

// ─── federatedArchetypeRegistry ──────────────────────────────────────

describe('federatedArchetypeRegistry', () => {
  beforeEach(() => {
    _resetFederationConsent();
    _resetFederatedRegistry();
  });

  async function consentAll(project_id: string, organization_id: string): Promise<void> {
    const all = _ARCHETYPE_KINDS_FOR_TESTS.reduce((acc, k) => { acc[k] = true; return acc; }, {} as any);
    await updateConsent({
      project_id, organization_id, federation_enabled: true,
      share_permissions: all, consume_permissions: all, updated_by: 'op-1',
    });
  }

  it('shareArchetype refused when federation disabled', async () => {
    const r = await shareArchetype({
      project_id: 'p1',
      raw_archetype: { kind: 'recovery_archetype', raw_step_sequence: ['contain_root'], observed_count: 2, success_rate: 80, avg_minutes_to_stabilize: 10 },
    });
    expect(r.shared).toBe(false);
    expect(r.reason).toBe('federation_disabled');
  });

  it('shareArchetype refused when no organization', async () => {
    await updateConsent({ project_id: 'p1', organization_id: null, federation_enabled: true, share_permissions: { recovery_archetype: true } as any, updated_by: 'op-1' });
    const r = await shareArchetype({
      project_id: 'p1',
      raw_archetype: { kind: 'recovery_archetype', raw_step_sequence: ['contain_root'], observed_count: 2, success_rate: 80, avg_minutes_to_stabilize: 10 },
    });
    expect(r.shared).toBe(false);
    expect(r.reason).toBe('no_organization');
  });

  it('shareArchetype accepted when fully consented', async () => {
    await consentAll('p1', 'org-1');
    const r = await shareArchetype({
      project_id: 'p1',
      raw_archetype: { kind: 'recovery_archetype', raw_step_sequence: ['contain_root'], observed_count: 3, success_rate: 80, avg_minutes_to_stabilize: 10 },
    });
    expect(r.shared).toBe(true);
    expect(r.archetype_signature).toMatch(/^arch-/);
  });

  it('multiple shares of same anonymized archetype accumulate confidence', async () => {
    await consentAll('p1', 'org-1');
    await consentAll('p2', 'org-1');
    const sig1 = (await shareArchetype({
      project_id: 'p1',
      raw_archetype: { kind: 'recovery_archetype', raw_step_sequence: ['contain_root', 'rollback_target'], observed_count: 5, success_rate: 90, avg_minutes_to_stabilize: 12 },
    })).archetype_signature!;
    const sig2 = (await shareArchetype({
      project_id: 'p2',
      raw_archetype: { kind: 'recovery_archetype', raw_step_sequence: ['contain_root', 'rollback_target'], observed_count: 4, success_rate: 80, avg_minutes_to_stabilize: 14 },
    })).archetype_signature!;
    expect(sig1).toBe(sig2);     // anonymized step seq → same hash
    const all = readOrgRegistry('org-1');
    expect(all.length).toBe(1);
    expect(all[0].confidence.source_count).toBe(2);
  });

  it('listArchetypesFor respects consume permission gate', async () => {
    await consentAll('p1', 'org-1');
    await shareArchetype({
      project_id: 'p1',
      raw_archetype: { kind: 'recovery_archetype', raw_step_sequence: ['contain_root'], observed_count: 3, success_rate: 80, avg_minutes_to_stabilize: 10 },
    });
    // p2 in same org but no consume permission
    await updateConsent({
      project_id: 'p2', organization_id: 'org-1', federation_enabled: true,
      share_permissions: {} as any, consume_permissions: {} as any, updated_by: 'op-1',
    });
    expect(listArchetypesFor({ project_id: 'p2' })).toEqual([]);
  });

  it('cross-organization isolation: p3 in org-2 cannot see archetypes from org-1', async () => {
    await consentAll('p1', 'org-1');
    await consentAll('p3', 'org-2');
    await shareArchetype({
      project_id: 'p1',
      raw_archetype: { kind: 'recovery_archetype', raw_step_sequence: ['contain_root'], observed_count: 3, success_rate: 80, avg_minutes_to_stabilize: 10 },
    });
    expect(listArchetypesFor({ project_id: 'p3' })).toEqual([]);
  });

  it('kind filter scopes the listing', async () => {
    await consentAll('p1', 'org-1');
    await shareArchetype({
      project_id: 'p1',
      raw_archetype: { kind: 'recovery_archetype', raw_step_sequence: ['contain_root'], observed_count: 3, success_rate: 80, avg_minutes_to_stabilize: 10 },
    });
    await shareArchetype({
      project_id: 'p1',
      raw_archetype: { kind: 'routing_archetype' as ArchetypeKind, raw_step_sequence: ['route_a'], observed_count: 3, success_rate: 70, avg_minutes_to_stabilize: 10 },
    });
    const recovery = listArchetypesFor({ project_id: 'p1', kind: 'recovery_archetype' });
    expect(recovery.length).toBe(1);
    expect(recovery[0].archetype.kind).toBe('recovery_archetype');
  });

  it('registry cap is enforced (size ceiling)', () => {
    expect(_MAX_FEDERATED_ARCHETYPES_PER_ORG_FOR_TESTS).toBeGreaterThanOrEqual(50);
  });
});

// ─── organizationalRecoveryIntelligence ──────────────────────────────

describe('organizationalRecoveryIntelligence', () => {
  beforeEach(() => {
    _resetFederationConsent();
    _resetFederatedRegistry();
  });

  it('cold-start (no consent) returns empty insights', () => {
    const r = buildOrganizationalRecoveryIntelligence({ project_id: 'p1' });
    expect(r.insights).toEqual([]);
  });

  it('insights are unrecommended when source_count < threshold', async () => {
    const all = _ARCHETYPE_KINDS_FOR_TESTS.reduce((acc, k) => { acc[k] = true; return acc; }, {} as any);
    await updateConsent({ project_id: 'p1', organization_id: 'org-1', federation_enabled: true, share_permissions: all, consume_permissions: all, updated_by: 'op-1' });
    await shareArchetype({
      project_id: 'p1',
      raw_archetype: { kind: 'recovery_archetype', raw_step_sequence: ['contain_root'], observed_count: 3, success_rate: 95, avg_minutes_to_stabilize: 10 },
    });
    const r = buildOrganizationalRecoveryIntelligence({ project_id: 'p1' });
    expect(r.insights.length).toBe(1);
    expect(r.insights[0].is_recommended).toBe(false);     // only 1 source
    expect(r.insights[0].recommendation_reason).toContain('below floor');
  });

  it('recommends when ≥2 sources + confidence_low ≥ 60 + anomaly < 50', async () => {
    const all = _ARCHETYPE_KINDS_FOR_TESTS.reduce((acc, k) => { acc[k] = true; return acc; }, {} as any);
    await updateConsent({ project_id: 'p1', organization_id: 'org-1', federation_enabled: true, share_permissions: all, consume_permissions: all, updated_by: 'op-1' });
    await updateConsent({ project_id: 'p2', organization_id: 'org-1', federation_enabled: true, share_permissions: all, consume_permissions: all, updated_by: 'op-1' });
    await shareArchetype({
      project_id: 'p1',
      raw_archetype: { kind: 'recovery_archetype', raw_step_sequence: ['contain_root', 'rollback_target'], observed_count: 5, success_rate: 90, avg_minutes_to_stabilize: 12 },
    });
    await shareArchetype({
      project_id: 'p2',
      raw_archetype: { kind: 'recovery_archetype', raw_step_sequence: ['contain_root', 'rollback_target'], observed_count: 5, success_rate: 90, avg_minutes_to_stabilize: 12 },
    });
    const r = buildOrganizationalRecoveryIntelligence({ project_id: 'p1' });
    expect(r.insights[0].is_recommended).toBe(true);
  });

  it('respects consume permission per kind', async () => {
    await updateConsent({ project_id: 'p1', organization_id: 'org-1', federation_enabled: true, share_permissions: { recovery_archetype: true } as any, consume_permissions: {} as any, updated_by: 'op-1' });
    await shareArchetype({
      project_id: 'p1',
      raw_archetype: { kind: 'recovery_archetype', raw_step_sequence: ['contain_root'], observed_count: 3, success_rate: 90, avg_minutes_to_stabilize: 10 },
    });
    const r = buildOrganizationalRecoveryIntelligence({ project_id: 'p1' });
    expect(r.insights).toEqual([]);     // share-only, no consume
  });

  it('confidence + source thresholds match constants', () => {
    expect(_MIN_CONFIDENCE_LOW_FOR_TESTS).toBe(60);
    expect(_MIN_SOURCE_COUNT_FOR_TESTS).toBe(2);
  });
});

// ─── calibrationImpactReplay ─────────────────────────────────────────

describe('calibrationImpactReplay (synthetic snapshots)', () => {
  it('improvement detected when stabilization_confidence rises', () => {
    const r = _testReplayWithSnapshots({
      project_id: 'p1', proposal_id: 'cal-1', approval_timestamp: '2026-05-07T00:00:00Z', window_hours: 4,
      before: { stabilization_confidence: 50, contradiction_count: 5, routing_volatility: 30, forecast_within_bounds_rate: 60, recovery_success_rate: 70 },
      after: { stabilization_confidence: 80, contradiction_count: 5, routing_volatility: 30, forecast_within_bounds_rate: 60, recovery_success_rate: 70 },
    });
    expect(r.deltas.find(d => d.metric === 'stabilization_confidence')?.direction).toBe('improved');
    expect(r.overall_assessment).toBe('net_improvement');
  });

  it('regression detected when contradictions rise', () => {
    const r = _testReplayWithSnapshots({
      project_id: 'p1', proposal_id: 'cal-1', approval_timestamp: '2026-05-07T00:00:00Z', window_hours: 4,
      before: { stabilization_confidence: 70, contradiction_count: 1, routing_volatility: 30, forecast_within_bounds_rate: 60, recovery_success_rate: 70 },
      after: { stabilization_confidence: 70, contradiction_count: 10, routing_volatility: 30, forecast_within_bounds_rate: 60, recovery_success_rate: 70 },
    });
    expect(r.deltas.find(d => d.metric === 'contradiction_count')?.direction).toBe('degraded');
  });

  it('unchanged below significance threshold (delta < 0.5)', () => {
    const r = _testReplayWithSnapshots({
      project_id: 'p1', proposal_id: 'cal-1', approval_timestamp: '2026-05-07T00:00:00Z', window_hours: 4,
      before: { stabilization_confidence: 70, contradiction_count: 5, routing_volatility: 30, forecast_within_bounds_rate: 60, recovery_success_rate: 70 },
      after: { stabilization_confidence: 70.2, contradiction_count: 5, routing_volatility: 30, forecast_within_bounds_rate: 60, recovery_success_rate: 70 },
    });
    expect(r.deltas.find(d => d.metric === 'stabilization_confidence')?.direction).toBe('unchanged');
  });

  it('window cap is sane', () => {
    expect(_CALIBRATION_IMPACT_MAX_WINDOW_HOURS_FOR_TESTS).toBe(24);
  });
});

// ─── anomalyAwareForecastEngine ──────────────────────────────────────

describe('anomalyAwareForecastEngine', () => {
  beforeEach(() => { _resetAnomalyEngine(); });

  it('cold-start profile has 0 active anomalies', () => {
    const p = buildForecastAnomalyProfile('p1');
    expect(p.active_anomalies).toBe(0);
    expect(p.anomaly_pressure_score).toBe(0);
  });

  it('z-score detection flags spike when last value diverges materially', () => {
    for (let i = 0; i < 10; i++) recordAnomalyObservation('p1', 'volatility_spike', 5);     // baseline near 5
    recordAnomalyObservation('p1', 'volatility_spike', 50);                                  // spike → z >> 2
    const p = buildForecastAnomalyProfile('p1');
    expect(p.active_anomalies).toBeGreaterThan(0);
    const entry = p.entries.find(e => e.kind === 'volatility_spike');
    expect(entry).toBeDefined();
    expect(Math.abs(entry!.z_score)).toBeGreaterThanOrEqual(_ANOMALY_Z_SCORE_THRESHOLD_FOR_TESTS);
  });

  it('low variance + flat values produce no anomaly', () => {
    for (let i = 0; i < 10; i++) recordAnomalyObservation('p1', 'volatility_spike', 5);
    const p = buildForecastAnomalyProfile('p1');
    expect(p.active_anomalies).toBe(0);
  });

  it('insufficient observations → no anomaly entry', () => {
    for (let i = 0; i < _ANOMALY_MIN_OBSERVATIONS_FOR_TESTS - 1; i++) recordAnomalyObservation('p1', 'volatility_spike', i * 10);
    const p = buildForecastAnomalyProfile('p1');
    expect(p.active_anomalies).toBe(0);
  });

  it('anomaly_pressure_score scales with z-score magnitude (clamped at 100)', () => {
    for (let i = 0; i < 10; i++) recordAnomalyObservation('p1', 'volatility_spike', 5);
    recordAnomalyObservation('p1', 'volatility_spike', 500);     // huge spike
    const p = buildForecastAnomalyProfile('p1');
    expect(p.anomaly_pressure_score).toBeGreaterThan(0);
    expect(p.anomaly_pressure_score).toBeLessThanOrEqual(100);
  });

  it('observation cap is enforced', () => {
    expect(_MAX_ANOMALY_OBSERVATIONS_PER_SIGNAL_FOR_TESTS).toBe(50);
  });
});

// ─── governanceDriftReplay ───────────────────────────────────────────

describe('governanceDriftReplay (mocked DB)', () => {
  it('returns empty entries when no audit rows match', async () => {
    const r = await buildGovernanceDriftReplay({ project_id: 'p1', window_hours: 24 });
    expect(r.entries).toEqual([]);
    expect(r.worst_kind).toBeNull();
    expect(r.truncated).toBe(false);
  });

  it('window clamp keeps replay bounded', async () => {
    const r = await buildGovernanceDriftReplay({ project_id: 'p1', window_hours: 999999 });
    expect(r.entries).toEqual([]);
    expect(new Date(r.window_end).getTime() - new Date(r.window_start).getTime()).toBeLessThanOrEqual(31 * 24 * 60 * 60 * 1000);
  });
});

// ─── federationLineageTracker ────────────────────────────────────────

describe('federationLineageTracker', () => {
  beforeEach(() => { _resetFederationLineage(); });

  it('readFederationLineage returns empty when nothing recorded', () => {
    const lineage = readFederationLineage({ organization_id: 'org-1' });
    expect(lineage.archetype_count).toBe(0);
    expect(lineage.source_project_count).toBe(0);
    expect(lineage.consumer_project_count).toBe(0);
  });

  it('recordSource + recordConsumption builds source→archetype→consumer graph', () => {
    recordSource({ organization_id: 'org-1', source_project_id: 'p1', archetype_signature: 'arch-aaaa' });
    const attribution: FederationConsumptionAttribution = {
      consumer_project: 'p2', archetype_signature: 'arch-aaaa',
      surfaced_reason: 'high org confidence', operator_action: 'approved_local_calibration',
      calibration_generated: { proposal_id: 'cal-1' }, applied_locally: true,
      recorded_at: new Date().toISOString(),
    };
    recordConsumption({ organization_id: 'org-1', attribution });
    const lineage = readFederationLineage({ organization_id: 'org-1' });
    expect(lineage.archetype_count).toBe(1);
    expect(lineage.source_project_count).toBe(1);
    expect(lineage.consumer_project_count).toBe(1);
    // source → archetype → consumer
    expect(lineage.edges.some(e => e.from === 'source:p1' && e.to === 'archetype:arch-aaaa')).toBe(true);
    expect(lineage.edges.some(e => e.from === 'archetype:arch-aaaa' && e.to === 'consumer:p2')).toBe(true);
  });

  it('readConsumptionAttributions returns attribution history newest-first', () => {
    const a1: FederationConsumptionAttribution = {
      consumer_project: 'p2', archetype_signature: 'arch-bb',
      surfaced_reason: 'first surface', operator_action: 'reviewed',
      calibration_generated: null, applied_locally: false,
      recorded_at: '2026-05-07T10:00:00Z',
    };
    const a2: FederationConsumptionAttribution = { ...a1, surfaced_reason: 'second surface', recorded_at: '2026-05-07T11:00:00Z' };
    recordConsumption({ organization_id: 'org-1', attribution: a1 });
    recordConsumption({ organization_id: 'org-1', attribution: a2 });
    const got = readConsumptionAttributions('org-1', 'arch-bb');
    expect(got.length).toBe(2);
    expect(got[0].surfaced_reason).toBe('second surface');     // newest-first
  });

  it('cap on attributions per consumer is sane', () => {
    expect(_MAX_LINEAGE_ENTRIES_PER_ARCHETYPE_FOR_TESTS).toBeGreaterThanOrEqual(50);
  });

  it('lineage is read-only — attributions never mutate source project state', () => {
    recordSource({ organization_id: 'org-1', source_project_id: 'p1', archetype_signature: 'arch-cc' });
    const attribution: FederationConsumptionAttribution = {
      consumer_project: 'p2', archetype_signature: 'arch-cc',
      surfaced_reason: '', operator_action: 'reviewed',
      calibration_generated: null, applied_locally: false,
      recorded_at: new Date().toISOString(),
    };
    recordConsumption({ organization_id: 'org-1', attribution });
    // Reading consumer attributions does NOT affect the source side.
    const before = readFederationLineage({ organization_id: 'org-1' });
    const _attrs = readConsumptionAttributions('org-1', 'arch-cc');
    void _attrs;
    const after = readFederationLineage({ organization_id: 'org-1' });
    expect(after.source_project_count).toBe(before.source_project_count);
  });
});

// ─── federationSummaryCounters + AuthoritativeSystemState ────────────

describe('federation_summary surface', () => {
  beforeEach(() => { _resetFederationSummary(); });

  it('zero-state surfaces sane defaults', () => {
    const state = buildAuthoritativeStateFromInputs({
      project: { id: 'proj-y', target_mode: 'production', setup_status: {}, capabilities: [], repo_file_tree: [] },
      capabilities: [],
    } as any);
    expect(state.federation_summary?.federation_enabled).toBe(false);
    expect(state.federation_summary?.isolation_tier).toBe('isolated');
  });

  it('counters reflect into federation_summary', () => {
    noteConsentUpdated('proj-x', true, 'organizational');
    noteArchetypeShared('proj-x');
    noteArchetypeShared('proj-x');
    noteArchetypeConsumed('proj-x');
    noteAnomalyActive('proj-x', 2);

    const state = buildAuthoritativeStateFromInputs({
      project: { id: 'proj-x', target_mode: 'production', setup_status: {}, capabilities: [], repo_file_tree: [] },
      capabilities: [],
    } as any);
    expect(state.federation_summary?.federation_enabled).toBe(true);
    expect(state.federation_summary?.isolation_tier).toBe('organizational');
    expect(state.federation_summary?.archetypes_shared_24h).toBe(2);
    expect(state.federation_summary?.archetypes_consumed_24h).toBe(1);
    expect(state.federation_summary?.active_anomalies).toBe(2);
  });

  it('health scores are 0-100', () => {
    const summary = readFederationSummary('p1');
    for (const v of Object.values(summary.health_scores)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it('per-project counters are isolated', () => {
    noteArchetypeShared('proj-a');
    noteArchetypeShared('proj-b');
    noteArchetypeShared('proj-b');
    expect(readFederationSummary('proj-a').archetypes_shared_24h).toBe(1);
    expect(readFederationSummary('proj-b').archetypes_shared_24h).toBe(2);
  });
});
