import React, { useState } from 'react';
import { useAutonomousExecution } from '../../hooks/useAutonomousExecution';
import { useGovernanceTrust } from '../../hooks/useGovernanceTrust';
import { useExecutionConfidence } from '../../hooks/useExecutionConfidence';
import { useAutonomousHandoffs } from '../../hooks/useAutonomousHandoffs';
import { useIsolationZones } from '../../hooks/useIsolationZones';
import { useSelfHealingActivity } from '../../hooks/useSelfHealingActivity';
import { useAutonomousMutations } from '../../hooks/useAutonomousMutations';
import { useMutationContainment } from '../../hooks/useMutationContainment';
import { useMutationTrust } from '../../hooks/useMutationTrust';
import { useOperationalLineage } from '../../hooks/useOperationalLineage';
import { useContradictionPropagation } from '../../hooks/useContradictionPropagation';
import { useCausalTrust } from '../../hooks/useCausalTrust';
import { useValidatorReliability } from '../../hooks/useValidatorReliability';
import { useValidatorDrift } from '../../hooks/useValidatorDrift';
import { useCausalForecasts } from '../../hooks/useCausalForecasts';
import { useGovernanceCalibration } from '../../hooks/useGovernanceCalibration';
import { useRecoveryOrchestration } from '../../hooks/useRecoveryOrchestration';
import { useGovernanceTopology } from '../../hooks/useGovernanceTopology';
import { useFederationConsent } from '../../hooks/useFederationConsent';
import { useFederatedArchetypes } from '../../hooks/useFederatedArchetypes';
import { useForecastAnomalies } from '../../hooks/useForecastAnomalies';
import { useArchetypeReliability } from '../../hooks/useArchetypeReliability';
import { useFederationDrift } from '../../hooks/useFederationDrift';
import { useFederationPolicyEvolution } from '../../hooks/useFederationPolicyEvolution';
import { useDistributedBrokerHealth } from '../../hooks/useDistributedBrokerHealth';
import { useRuntimePartitions } from '../../hooks/useRuntimePartitions';
import { useBrokerIsolation } from '../../hooks/useBrokerIsolation';
import { useTopologyFragmentation } from '../../hooks/useTopologyFragmentation';
import { useTopologyRecovery } from '../../hooks/useTopologyRecovery';
import { useExecutionRuntime } from '../../hooks/useExecutionRuntime';
import { useExecutionIsolation } from '../../hooks/useExecutionIsolation';
import { useOperatorGuidance } from '../../hooks/useOperatorGuidance';
import { useCausalReplayStories } from '../../hooks/useCausalReplayStories';
import { useExecutionSandbox } from '../../hooks/useExecutionSandbox';
import { useExperimentationTrust } from '../../hooks/useExperimentationTrust';
import { useLiveSandbox } from '../../hooks/useLiveSandbox';
import { useSandboxTrust } from '../../hooks/useSandboxTrust';
import { useDelegatedExecution } from '../../hooks/useDelegatedExecution';
import { useAuthorityEnvelope } from '../../hooks/useAuthorityEnvelope';
import { useExecutionEconomics } from '../../hooks/useExecutionEconomics';
import { useExecutionQuota } from '../../hooks/useExecutionQuota';
import { useRuntimePressure } from '../../hooks/useRuntimePressure';
import { useStabilizationPlaybooks } from '../../hooks/useStabilizationPlaybooks';
import { useRecoveryPressure } from '../../hooks/useRecoveryPressure';
import { useStabilizationTrust } from '../../hooks/useStabilizationTrust';
import { useStabilizationDecision } from '../../hooks/useStabilizationDecision';
import { useGovernanceMemory } from '../../hooks/useGovernanceMemory';
import { useStabilizationTimeline } from '../../hooks/useStabilizationTimeline';
import { useGovernanceHandoffs } from '../../hooks/useGovernanceHandoffs';
import { useSharedStabilizationTimeline } from '../../hooks/useSharedStabilizationTimeline';

const TIER_BG: Record<string, string> = { low: '#fee2e2', moderate: '#fef3c7', high: '#dcfce7' };
const TIER_FG: Record<string, string> = { low: '#b91c1c', moderate: '#92400e', high: '#15803d' };

export interface AutonomousExecutionDashboardProps {
  defaultCollapsed?: boolean;
}

/**
 * Phase 13 — autonomous execution dashboard. Project-level surface
 * (slotted alongside Phase 12 OperatorCognitionDashboard). Renders:
 *   - live autonomous decisions (audit feed, last 25)
 *   - rollback readiness signal (per recent decision)
 *   - trust evolution (per-action-class scores)
 *   - blocked attempts (filtered audit kinds)
 *   - execution confidence traffic light
 */
export function AutonomousExecutionDashboard({ defaultCollapsed = false }: AutonomousExecutionDashboardProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const decisions = useAutonomousExecution({ autoFetch: !collapsed });
  const trust = useGovernanceTrust({ autoFetch: !collapsed });
  const confidence = useExecutionConfidence({ autoFetch: !collapsed });
  // Phase 14 surfaces
  const handoffs = useAutonomousHandoffs({ autoFetch: !collapsed, limit: 25 });
  const isolations = useIsolationZones({ autoFetch: !collapsed });
  const selfHeal = useSelfHealingActivity({ autoFetch: !collapsed, limit: 25 });
  // Phase 15 surfaces
  const mutations = useAutonomousMutations({ autoFetch: !collapsed, limit: 25 });
  const containment = useMutationContainment({ autoFetch: !collapsed });
  const mutationTrust = useMutationTrust({ autoFetch: !collapsed });
  // Phase 16 surfaces
  const lineage = useOperationalLineage({ autoFetch: !collapsed, limit: 100 });
  const propagation = useContradictionPropagation({ autoFetch: !collapsed });
  const causalTrust = useCausalTrust();
  // Phase 17 surfaces
  const reliability = useValidatorReliability({ autoFetch: !collapsed });
  const drift = useValidatorDrift({ autoFetch: !collapsed });
  const forecasts = useCausalForecasts({ autoFetch: !collapsed });
  // Phase 18 surfaces
  const calibration = useGovernanceCalibration({ autoFetch: !collapsed });
  const recovery = useRecoveryOrchestration({ autoFetch: !collapsed });
  const topology = useGovernanceTopology({ autoFetch: !collapsed });
  // Phase 19 surfaces
  const federationConsent = useFederationConsent({ autoFetch: !collapsed });
  const federatedArchetypes = useFederatedArchetypes({ autoFetch: !collapsed });
  const anomalies = useForecastAnomalies({ autoFetch: !collapsed });
  // Phase 20 surfaces
  const archetypeReliability = useArchetypeReliability({ autoFetch: !collapsed });
  const federationDrift = useFederationDrift({ autoFetch: !collapsed });
  const policyEvolution = useFederationPolicyEvolution({ autoFetch: !collapsed });
  // Phase 21 surfaces
  const brokerHealth = useDistributedBrokerHealth({ autoFetch: !collapsed });
  const runtimePartitions = useRuntimePartitions({ autoFetch: !collapsed });
  const brokerIsolation = useBrokerIsolation({ autoFetch: !collapsed });
  // Phase 22 surfaces — topology orchestration scoped to the first
  // partition (organization) the broker has seen. Operators can drill
  // into others via the dedicated topology endpoints.
  const topologyOrgId = runtimePartitions.partitions[0]?.organization_id ?? null;
  const topologyFragmentation = useTopologyFragmentation(topologyOrgId, { autoFetch: !collapsed && !!topologyOrgId });
  const topologyRecovery = useTopologyRecovery(topologyOrgId, { autoFetch: !collapsed && !!topologyOrgId });
  // Phase 23 surfaces — execution substrate scoped to the same partition.
  const executionRuntime = useExecutionRuntime(topologyOrgId, { autoFetch: !collapsed && !!topologyOrgId });
  const executionIsolation = useExecutionIsolation({ autoFetch: !collapsed });
  // Phase 24 surfaces — cognitive compression scoped to the same partition.
  const operatorGuidance = useOperatorGuidance(topologyOrgId, { autoFetch: !collapsed && !!topologyOrgId });
  const causalStory = useCausalReplayStories(topologyOrgId, { autoFetch: !collapsed && !!topologyOrgId });
  // Phase 25 surfaces — counterfactual experimentation scoped to the same partition.
  const experimentSandbox = useExecutionSandbox(topologyOrgId, { autoFetch: !collapsed && !!topologyOrgId });
  const experimentTrust = useExperimentationTrust(topologyOrgId, { autoFetch: !collapsed && !!topologyOrgId });
  // Phase 26 surfaces — bounded live operational rehearsal (async lifecycle).
  const liveSandbox = useLiveSandbox(topologyOrgId, { autoFetch: !collapsed && !!topologyOrgId });
  const liveSandboxTrust = useSandboxTrust(topologyOrgId, { autoFetch: !collapsed && !!topologyOrgId });
  // Phase 27 surfaces — bounded delegated operational execution. SAFETY:
  // delegated execution is NOT autonomous orchestration. The operator
  // remains the sole authority source; the system merely executes ONE
  // pre-authorized action inside strict rollback-protected constraints.
  const delegatedExecution = useDelegatedExecution(topologyOrgId, { autoFetch: !collapsed && !!topologyOrgId });
  const authorityEnvelope = useAuthorityEnvelope(topologyOrgId, { autoFetch: !collapsed && !!topologyOrgId });
  // Phase 28 surfaces — execution resource governance + operational economics.
  // SAFETY: deterministic resource accounting. Phase 28 OBSERVES, CLASSIFIES,
  // BUDGETS, CONSTRAINS — never optimizes, allocates, reprioritizes, or
  // expands authority. Static operator-set quotas; cross-org isolation absolute.
  const economics = useExecutionEconomics(topologyOrgId, { autoFetch: !collapsed && !!topologyOrgId });
  const quota = useExecutionQuota(topologyOrgId, { autoFetch: !collapsed && !!topologyOrgId });
  const pressure = useRuntimePressure(topologyOrgId, { autoFetch: !collapsed && !!topologyOrgId });
  // Phase 29 surfaces — stabilization playbook intelligence + recovery
  // governance. SAFETY: read-only recovery recommendation intelligence.
  // Phase 29 RECOMMENDS, SEQUENCES, FORECASTS, CLASSIFIES, REPLAYS — never
  // executes. Operator click + Phase 27 envelope is the sole mutation path.
  const stabilizationPlaybooks = useStabilizationPlaybooks(topologyOrgId, { autoFetch: !collapsed && !!topologyOrgId });
  const recoveryPressure = useRecoveryPressure(topologyOrgId, { autoFetch: !collapsed && !!topologyOrgId });
  const stabilizationTrust = useStabilizationTrust(topologyOrgId, undefined, { autoFetch: !collapsed && !!topologyOrgId });
  // Phase 30 surfaces — recovery foresight UX + stabilization decision cognition.
  // SAFETY: read-only comparison cognition. Phase 30 COMPARES, EXPLAINS,
  // WALKS THROUGH, REPLAYS, FORECASTS — never selects, never ranks.
  // engine_never_ranks: true typed-as-literal on every output.
  const stabilizationDecision = useStabilizationDecision(topologyOrgId);
  // Phase 31 surfaces — operator cognition continuity + governance memory.
  // SAFETY: per-org append-only event log. NEVER profiles operators.
  // engine_never_profiles: true typed-as-literal on every output.
  const governanceMemory = useGovernanceMemory(topologyOrgId, { autoFetch: !collapsed && !!topologyOrgId });
  const memoryTimeline = useStabilizationTimeline(topologyOrgId, { autoFetch: !collapsed && !!topologyOrgId, limit: 5 });
  // Phase 32 surfaces — multi-operator governance continuity + handoffs.
  // SAFETY: per-org append-only handoff event log. NEVER profiles operators.
  // authority_transfer_supported: false typed-as-literal on every handoff.
  // (renamed from `handoffs` to avoid collision with Phase 14 useAutonomousHandoffs)
  const governanceHandoffs = useGovernanceHandoffs(topologyOrgId, { autoFetch: !collapsed && !!topologyOrgId });
  const sharedTimeline = useSharedStabilizationTimeline(topologyOrgId, { autoFetch: !collapsed && !!topologyOrgId, limit: 5 });

  const blocked = decisions.decisions.filter(d => d.kind === 'autonomy.execution.blocked').length;
  const applied = decisions.decisions.filter(d => d.kind === 'autonomy.execution.applied').length;
  const rolledBack = decisions.decisions.filter(d => d.kind === 'autonomy.execution.rolled_back').length;

  return (
    <div className="card border-0 shadow-sm mb-3">
      <div
        className="card-header bg-white d-flex align-items-center justify-content-between"
        style={{ cursor: 'pointer', padding: '8px 12px' }}
        onClick={() => setCollapsed(c => !c)}
      >
        <div className="d-flex align-items-center gap-2">
          <i className="bi bi-cpu" style={{ color: '#0f172a', fontSize: 13 }}></i>
          <span className="fw-semibold" style={{ fontSize: 12 }}>Autonomous execution</span>
          {confidence.data && (
            <span className="badge ms-2" style={{ background: TIER_BG[confidence.data.tier], color: TIER_FG[confidence.data.tier], fontSize: 9 }}>
              confidence {confidence.data.confidence}/100 · {confidence.data.tier}
            </span>
          )}
          {(decisions.streamConnected || trust.streamConnected) && (
            <span className="text-success" title="Live stream connected" style={{ fontSize: 9 }}>● live</span>
          )}
        </div>
        <i className={`bi ${collapsed ? 'bi-chevron-down' : 'bi-chevron-up'}`} style={{ fontSize: 11, color: '#64748b' }}></i>
      </div>
      {!collapsed && (
        <div className="card-body" style={{ padding: '10px 12px', fontSize: 11 }}>
          <div className="row g-2 mb-3">
            <div className="col-md-3">
              <div className="text-muted mb-1" style={{ fontSize: 10 }}>Auto-applied</div>
              <div className="fw-bold" style={{ fontSize: 18, color: '#15803d' }}>{applied}</div>
            </div>
            <div className="col-md-3">
              <div className="text-muted mb-1" style={{ fontSize: 10 }}>Blocked</div>
              <div className="fw-bold" style={{ fontSize: 18, color: blocked > 0 ? '#92400e' : '#0f172a' }}>{blocked}</div>
            </div>
            <div className="col-md-3">
              <div className="text-muted mb-1" style={{ fontSize: 10 }}>Rolled back</div>
              <div className="fw-bold" style={{ fontSize: 18, color: rolledBack > 0 ? '#b91c1c' : '#0f172a' }}>{rolledBack}</div>
            </div>
            <div className="col-md-3">
              <div className="text-muted mb-1" style={{ fontSize: 10 }}>Success / Rollback</div>
              <div className="fw-bold" style={{ fontSize: 14 }}>
                {confidence.data ? `${confidence.data.execution_success_rate}% / ${confidence.data.rollback_frequency}%` : '— / —'}
              </div>
            </div>
          </div>

          {trust.data && (
            <div className="mb-3">
              <div className="text-muted mb-1" style={{ fontSize: 10 }}>Trust by action class</div>
              <div className="d-flex flex-wrap gap-2">
                {Object.values(trust.data.trust.profiles_by_class).map(p => (
                  <span key={p.action_class} className="badge"
                    style={{ background: '#f8fafc', color: '#0f172a', border: `1px solid ${TIER_FG[p.trust_score >= 70 ? 'high' : p.trust_score >= 45 ? 'moderate' : 'low']}`, fontSize: 10 }}>
                    {p.action_class}: {p.trust_score}/100 ({p.success_count}✓ / {p.rollback_count}↶ / {p.blocked_count}⊘)
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="text-muted mb-1" style={{ fontSize: 10 }}>Recent decisions</div>
          {decisions.decisions.length === 0 ? (
            <div className="text-muted" style={{ fontSize: 11 }}>No autonomy decisions yet.</div>
          ) : (
            <ul className="list-unstyled mb-0" style={{ fontSize: 10 }}>
              {decisions.decisions.slice(0, 8).map(d => (
                <li key={d.id} className="d-flex justify-content-between gap-2 mb-1">
                  <span className="font-monospace" style={{ color: d.kind.includes('blocked') ? '#92400e' : d.kind.includes('rolled_back') ? '#b91c1c' : '#15803d' }}>
                    {d.kind}
                  </span>
                  <span className="text-muted">{new Date(d.recorded_at).toLocaleTimeString()}</span>
                </li>
              ))}
            </ul>
          )}

          {/* ── Phase 14 — Handoffs ─────────────────────────────────── */}
          <div className="mt-3 pt-2 border-top">
            <div className="text-muted mb-1" style={{ fontSize: 10 }}>
              Handoffs (last 7d) {handoffs.streamConnected && <span className="text-success" style={{ fontSize: 9 }}>● live</span>}
            </div>
            {handoffs.handoffs.length === 0 ? (
              <div className="text-muted" style={{ fontSize: 11 }}>No autonomous handoffs yet.</div>
            ) : (
              <ul className="list-unstyled mb-0" style={{ fontSize: 10 }}>
                {handoffs.handoffs.slice(0, 6).map(h => (
                  <li key={h.id} className="d-flex justify-content-between gap-2 mb-1">
                    <span className="font-monospace" style={{
                      color: h.kind.includes('failed') ? '#b91c1c'
                        : h.kind.includes('verified') ? '#15803d'
                        : h.kind.includes('rollback') ? '#92400e'
                        : '#0f172a',
                    }}>
                      {h.kind}
                    </span>
                    <span className="d-flex gap-2 align-items-center">
                      {h.subject_id && (h.kind === 'autonomy_execution_started' || (h.payload || {}).execution_verification_status === 'pending') && (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary"
                          style={{ fontSize: 9, padding: '0 4px' }}
                          onClick={() => { void handoffs.cancelHandoff(h.subject_id as string); }}
                          title="Cancel pending handoff"
                        >cancel</button>
                      )}
                      <span className="text-muted">{new Date(h.recorded_at).toLocaleTimeString()}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ── Phase 14 — Isolations ───────────────────────────────── */}
          <div className="mt-3 pt-2 border-top">
            <div className="text-muted mb-1" style={{ fontSize: 10 }}>
              Isolated cluster signatures {isolations.streamConnected && <span className="text-success" style={{ fontSize: 9 }}>● live</span>}
            </div>
            {isolations.zones.length === 0 ? (
              <div className="text-muted" style={{ fontSize: 11 }}>None.</div>
            ) : (
              <ul className="list-unstyled mb-0" style={{ fontSize: 10 }}>
                {isolations.zones.map(z => (
                  <li key={z.signature} className="d-flex justify-content-between gap-2 mb-1">
                    <span className="font-monospace" style={{ color: '#92400e' }}>{z.signature}</span>
                    <span className="d-flex gap-2 align-items-center">
                      <span className="text-muted" title={z.reason}>expires {new Date(z.expires_at).toLocaleTimeString()}</span>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        style={{ fontSize: 9, padding: '0 4px' }}
                        onClick={() => { void isolations.liftIsolation(z.signature); }}
                        title="Lift isolation (admin)"
                      >lift</button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ── Phase 14 — Self-healing activity ────────────────────── */}
          <div className="mt-3 pt-2 border-top">
            <div className="text-muted mb-1" style={{ fontSize: 10 }}>
              Self-healing actions (last 7d) — total {selfHeal.summary.total}
              {selfHeal.streamConnected && <span className="text-success ms-2" style={{ fontSize: 9 }}>● live</span>}
            </div>
            {selfHeal.entries.length === 0 ? (
              <div className="text-muted" style={{ fontSize: 11 }}>No self-healing actions taken.</div>
            ) : (
              <>
                <div className="d-flex flex-wrap gap-1 mb-2">
                  {Object.entries(selfHeal.summary.by_action).map(([action, count]) => (
                    <span key={action} className="badge"
                      style={{ background: '#f8fafc', color: '#0f172a', border: '1px solid #cbd5e1', fontSize: 9 }}>
                      {action}: {count}
                    </span>
                  ))}
                </div>
                <ul className="list-unstyled mb-0" style={{ fontSize: 10 }}>
                  {selfHeal.entries.slice(0, 5).map(e => (
                    <li key={e.id} className="d-flex justify-content-between gap-2 mb-1">
                      <span className="font-monospace" style={{ color: '#92400e' }}>
                        {(e.payload || {}).action || 'self_heal'}
                        {(e.payload || {}).triggered_by ? ` ← ${(e.payload || {}).triggered_by}` : ''}
                      </span>
                      <span className="text-muted">{new Date(e.recorded_at).toLocaleTimeString()}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {/* ── Phase 15 — Autonomous mutations ──────────────────────── */}
          <div className="mt-3 pt-2 border-top">
            <div className="text-muted mb-1" style={{ fontSize: 10 }}>
              Direct mutations (last 7d)
              {mutations.streamConnected && <span className="text-success ms-2" style={{ fontSize: 9 }}>● live</span>}
              {mutationTrust.avgTrust !== null && (
                <span className="ms-2 text-muted">avg trust {mutationTrust.avgTrust}/100</span>
              )}
              {mutationTrust.profile?.autonomy_recommended_intent && (
                <span className="ms-2 text-success">recommended: {mutationTrust.profile.autonomy_recommended_intent}</span>
              )}
            </div>
            {mutations.envelopes.length === 0 ? (
              <div className="text-muted" style={{ fontSize: 11 }}>No autonomous mutations yet.</div>
            ) : (
              <ul className="list-unstyled mb-0" style={{ fontSize: 10 }}>
                {mutations.envelopes.slice(0, 6).map(m => (
                  <li key={m.id} className="d-flex justify-content-between gap-2 mb-1">
                    <span className="font-monospace" style={{
                      color: m.kind.includes('failed') ? '#b91c1c'
                        : m.kind.includes('verified') ? '#15803d'
                        : m.kind.includes('rolled_back') ? '#92400e'
                        : m.kind.includes('contained') ? '#92400e'
                        : '#0f172a',
                    }}>
                      {m.kind}{(m.payload?.mutation_class) ? ` · ${m.payload.mutation_class}` : ''}
                    </span>
                    <span className="d-flex gap-2 align-items-center">
                      {m.subject_id && (m.kind === 'mutation_executed' || m.kind === 'mutation_failed') && (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary"
                          style={{ fontSize: 9, padding: '0 4px' }}
                          onClick={() => { void mutations.rollback(m.subject_id as string, 'full', undefined, 'operator_initiated'); }}
                          title="Roll back this mutation (full)"
                        >rollback</button>
                      )}
                      <span className="text-muted">{new Date(m.recorded_at).toLocaleTimeString()}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ── Phase 15 — Mutation containment ───────────────────── */}
          <div className="mt-3 pt-2 border-top">
            <div className="text-muted mb-1" style={{ fontSize: 10 }}>
              Mutation containment
              {containment.streamConnected && <span className="text-success ms-2" style={{ fontSize: 9 }}>● live</span>}
            </div>
            {!containment.snapshot || (containment.snapshot.contained_classes.length === 0 && containment.snapshot.frozen_classes.length === 0) ? (
              <div className="text-muted" style={{ fontSize: 11 }}>No contained or frozen intent classes.</div>
            ) : (
              <div className="d-flex flex-wrap gap-1">
                {containment.snapshot.contained_classes.map(c => (
                  <span key={`c-${c}`} className="badge"
                    style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fbbf24', fontSize: 9 }}>
                    contained: {c}
                  </span>
                ))}
                {containment.snapshot.frozen_classes.map(c => (
                  <span key={`f-${c}`} className="badge"
                    style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #ef4444', fontSize: 9 }}>
                    frozen: {c}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* ── Phase 15 — Mutation trust by intent class ────────── */}
          {mutationTrust.profile && (
            <div className="mt-3 pt-2 border-top">
              <div className="text-muted mb-1" style={{ fontSize: 10 }}>Mutation trust by intent class</div>
              <div className="d-flex flex-wrap gap-1">
                {Object.values(mutationTrust.profile.profiles_by_intent).map(p => (
                  <span key={p.intent_class} className="badge"
                    style={{
                      background: '#f8fafc', color: '#0f172a',
                      border: `1px solid ${p.trust_score >= 70 ? '#15803d' : p.trust_score >= 45 ? '#92400e' : '#b91c1c'}`,
                      fontSize: 9,
                    }}>
                    {p.intent_class}: {p.trust_score}/100 ({p.success_count}✓ / {p.rollback_count}↶)
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── Phase 16 — Operational lineage ──────────────────────── */}
          <div className="mt-3 pt-2 border-top">
            <div className="text-muted mb-1" style={{ fontSize: 10 }}>
              Causal lineage (last 7d)
              {lineage.streamConnected && <span className="text-success ms-2" style={{ fontSize: 9 }}>● live</span>}
              {lineage.graph && (
                <span className="ms-2 text-muted">
                  {lineage.graph.nodes.length} nodes · {lineage.graph.edges.length} edges · max depth {lineage.graph.max_observed_depth}
                </span>
              )}
            </div>
            {!lineage.graph || lineage.graph.nodes.length === 0 ? (
              <div className="text-muted" style={{ fontSize: 11 }}>No lineage events yet.</div>
            ) : (
              <div className="d-flex flex-wrap gap-1">
                {lineage.graph.root_node_ids.slice(0, 4).map(id => {
                  const n = lineage.graph!.nodes.find(x => x.node_id === id);
                  if (!n) return null;
                  return (
                    <span key={id} className="badge"
                      style={{ background: '#f8fafc', color: '#0f172a', border: '1px solid #cbd5e1', fontSize: 9 }}
                      title={`${n.kind} · ${n.severity} · ${n.summary}`}>
                      root: {n.kind}
                    </span>
                  );
                })}
                <span className="badge"
                  style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fbbf24', fontSize: 9 }}>
                  {lineage.graph.leaf_node_ids.length} leaves
                </span>
              </div>
            )}
          </div>

          {/* ── Phase 16 — Contradiction propagation hotspots ──────── */}
          <div className="mt-3 pt-2 border-top">
            <div className="text-muted mb-1" style={{ fontSize: 10 }}>
              Contradiction propagation
              {propagation.streamConnected && <span className="text-success ms-2" style={{ fontSize: 9 }}>● live</span>}
              {propagation.profile && (
                <span className="ms-2 text-muted">
                  {propagation.profile.clusters.length} clusters · {propagation.profile.total_contradictions_in_window} flags
                </span>
              )}
            </div>
            {!propagation.profile || propagation.profile.hotspots.length === 0 ? (
              <div className="text-muted" style={{ fontSize: 11 }}>No active hotspots.</div>
            ) : (
              <ul className="list-unstyled mb-0" style={{ fontSize: 10 }}>
                {propagation.profile.hotspots.slice(0, 5).map(h => (
                  <li key={h.subject_id} className="d-flex justify-content-between gap-2 mb-1">
                    <span className="font-monospace" style={{
                      color: h.worst_severity === 'error' ? '#b91c1c'
                        : h.worst_severity === 'warning' ? '#92400e' : '#0f172a',
                    }}>
                      {h.subject_id}
                    </span>
                    <span className="text-muted">{h.count} flags · {h.worst_severity}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ── Phase 16 — Causal trust propagation alerts ──────── */}
          {causalTrust.summary.count > 0 && (
            <div className="mt-3 pt-2 border-top">
              <div className="text-muted mb-1" style={{ fontSize: 10 }}>
                Causal trust propagation (last {causalTrust.summary.count} events) · max inherited decay {causalTrust.summary.max_decay}
              </div>
              <ul className="list-unstyled mb-0" style={{ fontSize: 10 }}>
                {causalTrust.events.slice(0, 4).map((e, i) => (
                  <li key={i} className="d-flex justify-content-between gap-2 mb-1">
                    <span className="font-monospace" style={{ color: '#92400e' }}>
                      {e.payload?.node_id?.slice(0, 16) || '(node)'}
                    </span>
                    <span className="text-muted">decay {e.payload?.inherited_decay ?? '?'} · effective {e.payload?.effective_trust ?? '?'}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── Phase 17 — Validator drift + adaptive weights ──────── */}
          {drift.profile && (
            <div className="mt-3 pt-2 border-top">
              <div className="text-muted mb-1" style={{ fontSize: 10 }}>
                Validator stability · worst tier <span className="fw-semibold" style={{
                  color: drift.profile.worst_tier === 'unstable' ? '#b91c1c'
                    : drift.profile.worst_tier === 'drifting' ? '#92400e'
                    : drift.profile.worst_tier === 'cautionary' ? '#92400e'
                    : drift.profile.worst_tier === 'suppressed' ? '#475569'
                    : '#15803d',
                }}>{drift.profile.worst_tier}</span>
                {drift.streamConnected && <span className="text-success ms-2" style={{ fontSize: 9 }}>● live</span>}
              </div>
              <div className="d-flex flex-wrap gap-1">
                {drift.profile.signals.map(s => {
                  const tierColor = s.tier === 'unstable' ? '#b91c1c'
                    : s.tier === 'drifting' ? '#92400e'
                    : s.tier === 'cautionary' ? '#92400e'
                    : s.tier === 'suppressed' ? '#475569'
                    : '#15803d';
                  return (
                    <span key={s.validator_role} className="badge"
                      style={{
                        background: '#f8fafc', color: '#0f172a',
                        border: `1px solid ${tierColor}`, fontSize: 9,
                      }}
                      title={s.signals.join(' · ')}>
                      {s.validator_role}: {s.tier}
                    </span>
                  );
                })}
              </div>
              {reliability.attributions.length > 0 && (
                <div className="mt-2 text-muted" style={{ fontSize: 10 }}>
                  Adaptive weights:{' '}
                  {reliability.attributions.map((a, i) => (
                    <span key={a.validator_role} className="font-monospace ms-1">
                      {i > 0 && ' · '}{a.validator_role.split('_')[0]}={a.adjusted_weight.toFixed(2)}
                      {a.adjusted_weight !== a.prior_weight && (
                        <span style={{ color: a.adjusted_weight > a.prior_weight ? '#15803d' : '#b91c1c' }}>
                          {' '}({a.prior_weight.toFixed(2)}→{a.adjusted_weight.toFixed(2)})
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Phase 17 — Causal stability forecast ──────────────── */}
          {forecasts.forecast && forecasts.forecast.entries.length > 0 && (
            <div className="mt-3 pt-2 border-top">
              <div className="text-muted mb-1" style={{ fontSize: 10 }}>
                Causal stability forecast
                {forecasts.forecast.worst_signal && (
                  <span className="ms-2 text-warning">⚠ worst: {forecasts.forecast.worst_signal}</span>
                )}
                {forecasts.streamConnected && <span className="text-success ms-2" style={{ fontSize: 9 }}>● live</span>}
              </div>
              <ul className="list-unstyled mb-0" style={{ fontSize: 10 }}>
                {forecasts.forecast.entries.slice(0, 5).map(e => (
                  <li key={e.signal} className="d-flex justify-content-between gap-2 mb-1">
                    <span className="font-monospace" style={{
                      color: e.direction === 'degrading' ? '#b91c1c'
                        : e.direction === 'improving' ? '#15803d' : '#475569',
                    }}>
                      {e.signal}
                    </span>
                    <span className="text-muted">
                      {e.current_value} → {e.projected_value} (range {e.bounds.low}-{e.bounds.high}) · {e.direction}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── Phase 18 — Pending calibration proposals ──────────── */}
          {calibration.pending.length > 0 && (
            <div className="mt-3 pt-2 border-top">
              <div className="text-muted mb-1" style={{ fontSize: 10 }}>
                Calibration proposals · {calibration.pending.length} pending operator
                {calibration.streamConnected && <span className="text-success ms-2" style={{ fontSize: 9 }}>● live</span>}
              </div>
              <ul className="list-unstyled mb-0" style={{ fontSize: 10 }}>
                {calibration.pending.slice(0, 4).map(p => (
                  <li key={p.proposal_id} className="d-flex justify-content-between gap-2 mb-1">
                    <span className="font-monospace" style={{ color: '#92400e' }} title={p.rationale}>
                      {p.calibration_type} · impact {p.bounds.expected_governance_impact}/100 (range {p.bounds.low}-{p.bounds.high})
                    </span>
                    <span className="d-flex gap-1">
                      <button type="button" className="btn btn-sm btn-outline-success"
                        style={{ fontSize: 9, padding: '0 4px' }}
                        onClick={() => { void calibration.approve(p.proposal_id); }}>approve</button>
                      <button type="button" className="btn btn-sm btn-outline-danger"
                        style={{ fontSize: 9, padding: '0 4px' }}
                        onClick={() => { void calibration.reject(p.proposal_id); }}>reject</button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── Phase 18 — Active recovery sessions ─────────────────── */}
          {recovery.activeSessions.length > 0 && (
            <div className="mt-3 pt-2 border-top">
              <div className="text-muted mb-1" style={{ fontSize: 10 }}>
                Recovery sessions · {recovery.activeSessions.length} active · operator-gated
                {recovery.streamConnected && <span className="text-success ms-2" style={{ fontSize: 9 }}>● live</span>}
              </div>
              {recovery.activeSessions.slice(0, 2).map(session => {
                const currentStep = session.steps[session.current_step_index];
                if (!currentStep) return null;
                return (
                  <div key={session.session_id} className="mb-2" style={{ fontSize: 10 }}>
                    <div className="text-muted mb-1">
                      Session {session.session_id.slice(0, 12)} · step {session.current_step_index + 1}/{session.steps.length} · {session.trigger_summary}
                    </div>
                    <div className="d-flex justify-content-between gap-2">
                      <span className="font-monospace">
                        {currentStep.kind} · stab {currentStep.stabilization_confidence}/100 · blast {currentStep.blast_radius_implication}/100
                      </span>
                      <span className="d-flex gap-1">
                        <button type="button" className="btn btn-sm btn-outline-success"
                          style={{ fontSize: 9, padding: '0 4px' }}
                          onClick={() => { void recovery.performStep(session.session_id, 'approve'); }}>approve</button>
                        <button type="button" className="btn btn-sm btn-outline-secondary"
                          style={{ fontSize: 9, padding: '0 4px' }}
                          onClick={() => { void recovery.performStep(session.session_id, 'skip'); }}>skip</button>
                        <button type="button" className="btn btn-sm btn-outline-danger"
                          style={{ fontSize: 9, padding: '0 4px' }}
                          onClick={() => { void recovery.performStep(session.session_id, 'abort'); }}>abort</button>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Phase 18 — Governance topology ────────────────────── */}
          {topology.topology && (topology.topology.identified_bottlenecks.length > 0 || topology.topology.identified_hubs.length > 0) && (
            <div className="mt-3 pt-2 border-top">
              <div className="text-muted mb-1" style={{ fontSize: 10 }}>
                Governance topology · {topology.topology.nodes.length} nodes
                {topology.streamConnected && <span className="text-success ms-2" style={{ fontSize: 9 }}>● live</span>}
              </div>
              <div className="d-flex flex-wrap gap-1">
                {topology.topology.identified_hubs.slice(0, 3).map(id => (
                  <span key={id} className="badge"
                    style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #15803d', fontSize: 9 }}>
                    hub: {id.replace('hub:', '')}
                  </span>
                ))}
                {topology.topology.identified_bottlenecks.slice(0, 3).map(id => (
                  <span key={id} className="badge"
                    style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #92400e', fontSize: 9 }}>
                    bottleneck: {id.replace('bottleneck:', '')}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── Phase 19 — Federation status ─────────────────────── */}
          {federationConsent.consent && (
            <div className="mt-3 pt-2 border-top">
              <div className="text-muted mb-1" style={{ fontSize: 10 }}>
                Federation status · isolation tier <span className="fw-semibold" style={{
                  color: federationConsent.consent.isolation_tier === 'organizational' ? '#15803d'
                    : federationConsent.consent.isolation_tier === 'restricted' ? '#92400e'
                    : federationConsent.consent.isolation_tier === 'visibility_limited' ? '#92400e'
                    : '#475569',
                }}>{federationConsent.consent.isolation_tier}</span>
                {federationConsent.consent.federation_enabled && federationConsent.consent.organization_id && (
                  <span className="ms-2 text-muted">org: {federationConsent.consent.organization_id}</span>
                )}
                {federationConsent.streamConnected && <span className="text-success ms-2" style={{ fontSize: 9 }}>● live</span>}
              </div>
              {federatedArchetypes.recommended.length > 0 && (
                <div style={{ fontSize: 10 }}>
                  <span className="text-muted">Recommended patterns from organization: </span>
                  <span className="fw-semibold">{federatedArchetypes.recommended.length}</span>
                  <ul className="list-unstyled mb-0 mt-1">
                    {federatedArchetypes.recommended.slice(0, 3).map(insight => (
                      <li key={insight.archetype.archetype_signature} className="d-flex justify-content-between gap-2 mb-1">
                        <span className="font-monospace" style={{ color: '#15803d' }} title={insight.recommendation_reason}>
                          {insight.archetype.kind}: {insight.archetype.step_sequence.slice(0, 3).join(' → ')}
                          {insight.archetype.step_sequence.length > 3 && '…'}
                        </span>
                        <span className="text-muted">
                          conf {insight.confidence.confidence_range.low}-{insight.confidence.confidence_range.high} · {insight.confidence.source_count} sources
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* ── Phase 19 — Active forecast anomalies ──────────────── */}
          {anomalies.profile && anomalies.profile.active_anomalies > 0 && (
            <div className="mt-3 pt-2 border-top">
              <div className="text-muted mb-1" style={{ fontSize: 10 }}>
                Forecast anomalies · {anomalies.profile.active_anomalies} active · pressure {anomalies.profile.anomaly_pressure_score}/100
                {anomalies.streamConnected && <span className="text-success ms-2" style={{ fontSize: 9 }}>● live</span>}
              </div>
              <ul className="list-unstyled mb-0" style={{ fontSize: 10 }}>
                {anomalies.profile.entries.slice(0, 4).map((e, i) => (
                  <li key={i} className="d-flex justify-content-between gap-2 mb-1">
                    <span className="font-monospace" style={{ color: '#92400e' }} title={e.explanation}>
                      {e.kind} · z={e.z_score.toFixed(2)}
                    </span>
                    <span className="text-muted">obs {e.observed_value.toFixed(1)} vs μ {e.rolling_mean.toFixed(1)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── Phase 20 — Federation drift + archetype reliability ── */}
          {federationDrift.profile && federationDrift.profile.tier !== 'stable' && (
            <div className="mt-3 pt-2 border-top">
              <div className="text-muted mb-1" style={{ fontSize: 10 }}>
                Federation drift · tier <span className="fw-semibold" style={{
                  color: federationDrift.profile.tier === 'unstable' ? '#b91c1c'
                    : federationDrift.profile.tier === 'fragmenting' ? '#92400e'
                    : '#92400e',
                }}>{federationDrift.profile.tier}</span>
                <span className="ms-2 text-muted">pressure {federationDrift.profile.drift_pressure_score}/100</span>
                {federationDrift.streamConnected && <span className="text-success ms-2" style={{ fontSize: 9 }}>● live</span>}
              </div>
              {federationDrift.profile.signals.length > 0 && (
                <ul className="list-unstyled mb-0" style={{ fontSize: 10 }}>
                  {federationDrift.profile.signals.slice(0, 4).map((s, i) => (
                    <li key={i} className="d-flex justify-content-between gap-2 mb-1">
                      <span className="font-monospace" style={{ color: '#92400e' }} title={s.explanation}>
                        {s.kind}
                      </span>
                      <span className="text-muted">{s.score}/100</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* ── Phase 20 — Archetype reliability tiers ─────────────── */}
          {archetypeReliability.profiles.length > 0 && (
            <div className="mt-3 pt-2 border-top">
              <div className="text-muted mb-1" style={{ fontSize: 10 }}>
                Archetype reliability · {archetypeReliability.profiles.length} tracked
                {archetypeReliability.streamConnected && <span className="text-success ms-2" style={{ fontSize: 9 }}>● live</span>}
              </div>
              <div className="d-flex flex-wrap gap-1">
                {archetypeReliability.profiles.slice(0, 6).map(p => {
                  const tierColor = p.current_tier === 'trusted' ? '#15803d'
                    : p.current_tier === 'stable' ? '#15803d'
                    : p.current_tier === 'cautionary' ? '#92400e'
                    : p.current_tier === 'degraded' ? '#b91c1c'
                    : p.current_tier === 'suppressed' ? '#475569'
                    : '#0f172a';
                  return (
                    <span key={p.archetype_signature} className="badge"
                      style={{ background: '#f8fafc', color: '#0f172a', border: `1px solid ${tierColor}`, fontSize: 9 }}
                      title={p.last_attribution?.refinement_reason ?? p.current_tier}>
                      {p.archetype_signature.slice(0, 14)}: {p.current_tier} ({p.current_score}/100)
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Phase 20 — Pending federation policy proposals ─────── */}
          {policyEvolution.pending.length > 0 && (
            <div className="mt-3 pt-2 border-top">
              <div className="text-muted mb-1" style={{ fontSize: 10 }}>
                Federation policy proposals · {policyEvolution.pending.length} pending operator
                {policyEvolution.streamConnected && <span className="text-success ms-2" style={{ fontSize: 9 }}>● live</span>}
              </div>
              <ul className="list-unstyled mb-0" style={{ fontSize: 10 }}>
                {policyEvolution.pending.slice(0, 3).map(p => (
                  <li key={p.proposal_id} className="d-flex justify-content-between gap-2 mb-1">
                    <span className="font-monospace" style={{ color: '#92400e' }} title={p.rationale}>
                      {p.evolution_kind} · impact {p.impact_bounds.expected_federation_impact}/100
                    </span>
                    <span className="d-flex gap-1">
                      <button type="button" className="btn btn-sm btn-outline-success"
                        style={{ fontSize: 9, padding: '0 4px' }}
                        onClick={() => { void policyEvolution.approve(p.proposal_id); }}>approve</button>
                      <button type="button" className="btn btn-sm btn-outline-danger"
                        style={{ fontSize: 9, padding: '0 4px' }}
                        onClick={() => { void policyEvolution.reject(p.proposal_id); }}>reject</button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── Phase 21 — Distributed runtime status ──────────────── */}
          {brokerHealth.visibility && (
            <div className="mt-3 pt-2 border-top">
              <div className="text-muted mb-1" style={{ fontSize: 10 }}>
                Distributed runtime · adapter <span className="font-monospace">{(brokerHealth.visibility as any).health_scores ? (runtimePartitions.partitions[0]?.organization_id ? '' : '') : ''}</span>
                <span className="badge ms-2" style={{
                  background: brokerHealth.visibility.broker_continuity_status === 'connected' ? '#dcfce7' : '#fee2e2',
                  color: brokerHealth.visibility.broker_continuity_status === 'connected' ? '#15803d' : '#b91c1c',
                  fontSize: 9,
                }}>{brokerHealth.visibility.broker_continuity_status}</span>
                <span className="ms-2" style={{ fontSize: 9, color: '#64748b' }}>
                  continuity {brokerHealth.visibility.health_scores.broker_continuity}/100 · drift {brokerHealth.visibility.health_scores.runtime_drift_pressure}/100 · {brokerHealth.visibility.federation_continuity_status}
                </span>
                {brokerHealth.streamConnected && <span className="text-success ms-2" style={{ fontSize: 9 }}>● live</span>}
              </div>
              {runtimePartitions.partitions.length > 0 && (
                <ul className="list-unstyled mb-0" style={{ fontSize: 10 }}>
                  {runtimePartitions.partitions.slice(0, 5).map(p => (
                    <li key={p.organization_id} className="d-flex justify-content-between gap-2 mb-1">
                      <span className="font-monospace text-truncate" style={{ maxWidth: 200, color: '#0f172a' }} title={`${p.organization_id} · ${p.notes.join(', ')}`}>
                        {p.organization_id}
                      </span>
                      <span style={{
                        color:
                          p.tier === 'healthy' ? '#15803d' :
                          p.tier === 'monitoring' ? '#92400e' :
                          p.tier === 'degraded' ? '#b91c1c' :
                          p.tier === 'isolated' ? '#dc2626' :
                          '#7f1d1d',
                      }}>{p.tier} · {p.health_score}/100</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {brokerIsolation.profile && brokerIsolation.profile.active_isolation_count > 0 && (
            <div className="mt-2 pt-2 border-top">
              <div className="text-muted mb-1" style={{ fontSize: 10 }}>
                Active broker isolations · {brokerIsolation.profile.active_isolation_count}
              </div>
              <ul className="list-unstyled mb-0" style={{ fontSize: 10 }}>
                {brokerIsolation.profile.isolated_namespaces.slice(0, 3).map((iso, i) => (
                  <li key={i} className="d-flex justify-content-between gap-2 mb-1">
                    <span className="font-monospace" style={{ color: '#b91c1c' }} title={iso.explanation}>
                      {iso.namespace}{iso.organization_id ? `@${iso.organization_id}` : ''} · {iso.reason}
                    </span>
                    <button type="button" className="btn btn-sm btn-outline-success"
                      style={{ fontSize: 9, padding: '0 4px' }}
                      onClick={() => { void brokerIsolation.liftIsolation(iso.namespace, iso.organization_id); }}>
                      lift
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── Phase 22 — Cognition topology + fragmentation forecast ── */}
          {topologyOrgId && topologyFragmentation.profile && (
            <div className="mt-3 pt-2 border-top">
              <div className="text-muted mb-1" style={{ fontSize: 10 }}>
                Cognition topology · org <span className="font-monospace">{topologyOrgId}</span>
                <span className="badge ms-2" style={{
                  background:
                    topologyFragmentation.profile.tier === 'cohesive' ? '#dcfce7' :
                    topologyFragmentation.profile.tier === 'partial' ? '#fef3c7' :
                    topologyFragmentation.profile.tier === 'fragmented' ? '#fee2e2' :
                    '#fecaca',
                  color:
                    topologyFragmentation.profile.tier === 'cohesive' ? '#15803d' :
                    topologyFragmentation.profile.tier === 'partial' ? '#92400e' :
                    '#b91c1c',
                  fontSize: 9,
                }}>
                  {topologyFragmentation.profile.tier} · pressure {topologyFragmentation.profile.fragmentation_pressure_score}/100
                </span>
                {topologyFragmentation.forecast && (
                  <span className="ms-2" style={{ fontSize: 9, color: '#64748b' }}>
                    forecast {topologyFragmentation.forecast.forecast_horizon_minutes}min: {topologyFragmentation.forecast.forecast_tier} (conf {topologyFragmentation.forecast.bounds.confidence_low}-{topologyFragmentation.forecast.bounds.confidence_high})
                  </span>
                )}
                {topologyFragmentation.streamConnected && <span className="text-success ms-2" style={{ fontSize: 9 }}>● live</span>}
              </div>
              {topologyFragmentation.profile.isolated_dependency_clusters.length > 0 && (
                <ul className="list-unstyled mb-0" style={{ fontSize: 10 }}>
                  {topologyFragmentation.profile.isolated_dependency_clusters.slice(0, 3).map((c, i) => (
                    <li key={i} className="d-flex justify-content-between gap-2 mb-1">
                      <span className="font-monospace text-truncate" style={{ maxWidth: 220, color: '#b91c1c' }} title={c.explanation}>
                        cluster: {c.cluster_root} · depth {c.cluster_depth} · {c.cluster_namespaces.length} ns
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {topologyRecovery.plans.length > 0 && (
                <div className="mt-2">
                  <div className="text-muted mb-1" style={{ fontSize: 10 }}>
                    Topology recovery plans · {topologyRecovery.plans.length} recent
                  </div>
                  <ul className="list-unstyled mb-0" style={{ fontSize: 10 }}>
                    {topologyRecovery.plans.slice(0, 2).map(p => (
                      <li key={p.plan_id} className="d-flex justify-content-between gap-2 mb-1">
                        <span className="font-monospace" style={{ color: '#0f172a' }} title={p.sequencing_reason}>
                          {p.trigger} · {p.steps.length} steps · {p.status}
                        </span>
                        {p.status === 'pending' && p.steps[0] && (
                          <button type="button" className="btn btn-sm btn-outline-primary"
                            style={{ fontSize: 9, padding: '0 4px' }}
                            onClick={() => { void topologyRecovery.executeStep(p.plan_id, p.steps[0].step_id); }}>
                            execute step 1
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {topologyFragmentation.profile.tier !== 'cohesive' && topologyRecovery.plans.length === 0 && (
                <button type="button" className="btn btn-sm btn-outline-primary mt-1"
                  style={{ fontSize: 9, padding: '0 6px' }}
                  onClick={() => { void topologyRecovery.buildPlan('fragmentation_detected'); }}>
                  build topology recovery plan
                </button>
              )}
            </div>
          )}

          {/* ── Phase 23 — Execution substrate (workers + isolation) ── */}
          {topologyOrgId && executionRuntime.visibility && (
            <div className="mt-3 pt-2 border-top">
              <div className="text-muted mb-1" style={{ fontSize: 10 }}>
                Execution substrate · {executionRuntime.visibility.active_workers.length} active worker(s)
                {executionRuntime.visibility.recent_failed.length > 0 && (
                  <span className="ms-2" style={{ color: '#b91c1c', fontSize: 9 }}>
                    {executionRuntime.visibility.recent_failed.length} recent failed
                  </span>
                )}
                {executionRuntime.visibility.recent_interrupted.length > 0 && (
                  <span className="ms-2" style={{ color: '#92400e', fontSize: 9 }}>
                    {executionRuntime.visibility.recent_interrupted.length} interrupted
                  </span>
                )}
                {executionRuntime.streamConnected && <span className="text-success ms-2" style={{ fontSize: 9 }}>● live</span>}
              </div>
              {executionRuntime.visibility.active_workers.length > 0 && (
                <ul className="list-unstyled mb-0" style={{ fontSize: 10 }}>
                  {executionRuntime.visibility.active_workers.slice(0, 3).map(w => (
                    <li key={w.worker_id} className="d-flex justify-content-between gap-2 mb-1">
                      <span className="font-monospace text-truncate" style={{ maxWidth: 240, color: '#0f172a' }} title={w.scope_summary}>
                        {w.kind} · {w.lifecycle_state}
                      </span>
                      <span style={{ fontSize: 9, color: '#64748b' }}>
                        depth {w.parent_depth} · {Math.round((Date.now() - Date.parse(w.started_at)) / 1000)}s
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {executionIsolation.profile && executionIsolation.profile.active_isolation_count > 0 && (
                <div className="mt-2">
                  <div className="text-muted mb-1" style={{ fontSize: 10 }}>
                    Active execution isolations · {executionIsolation.profile.active_isolation_count}
                  </div>
                  <ul className="list-unstyled mb-0" style={{ fontSize: 10 }}>
                    {executionIsolation.profile.isolated_kinds.slice(0, 3).map((iso, i) => (
                      <li key={i} className="d-flex justify-content-between gap-2 mb-1">
                        <span className="font-monospace" style={{ color: '#b91c1c' }} title={iso.explanation}>
                          {iso.kind}@{iso.organization_id} · {iso.reason}
                        </span>
                        <button type="button" className="btn btn-sm btn-outline-success"
                          style={{ fontSize: 9, padding: '0 4px' }}
                          onClick={() => { void executionIsolation.liftIsolation(iso.kind, iso.organization_id); }}>
                          lift
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* ── Phase 24 — Cognitive load + operator guidance ── */}
          {topologyOrgId && operatorGuidance.load && (
            <div className="mt-3 pt-2 border-top">
              <div className="text-muted mb-1" style={{ fontSize: 10 }}>
                Cognitive load · <span className="badge ms-1" style={{
                  background:
                    operatorGuidance.load.tier === 'light' ? '#dcfce7' :
                    operatorGuidance.load.tier === 'moderate' ? '#fef3c7' :
                    operatorGuidance.load.tier === 'dense' ? '#fee2e2' :
                    '#fecaca',
                  color:
                    operatorGuidance.load.tier === 'light' ? '#15803d' :
                    operatorGuidance.load.tier === 'moderate' ? '#92400e' :
                    '#b91c1c',
                  fontSize: 9,
                }}>{operatorGuidance.load.tier} · {operatorGuidance.load.load_score}/100</span>
                {operatorGuidance.load.drivers[0] && (
                  <span className="ms-2" style={{ fontSize: 9, color: '#64748b' }}>
                    top driver: {operatorGuidance.load.drivers[0].metric} ({operatorGuidance.load.drivers[0].contribution}/100)
                  </span>
                )}
                {operatorGuidance.streamConnected && <span className="text-success ms-2" style={{ fontSize: 9 }}>● live</span>}
              </div>
              {operatorGuidance.latest && operatorGuidance.latest.items.length > 0 && (
                <div>
                  <div className="text-muted mb-1" style={{ fontSize: 10 }}>
                    Operator guidance · {operatorGuidance.latest.items.length} ranked action(s)
                  </div>
                  <ul className="list-unstyled mb-0" style={{ fontSize: 10 }}>
                    {operatorGuidance.latest.items.slice(0, 3).map(item => (
                      <li key={item.attribution.guidance_id} className="d-flex justify-content-between gap-2 mb-1">
                        <span className="font-monospace text-truncate" style={{ maxWidth: 280, color: '#0f172a' }} title={item.attribution.ranking_reason}>
                          [{item.attribution.urgency_score}] {item.attribution.action_kind}
                        </span>
                        <span style={{ fontSize: 9, color: '#64748b' }}>
                          {item.attribution.ranked_by_rule}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {causalStory.story && causalStory.story.causal_chain.length > 0 && (
                <div className="mt-2">
                  <div className="text-muted mb-1" style={{ fontSize: 10 }}>
                    Causal story · {causalStory.story.causal_chain.length} step(s) compressed (tier: {causalStory.story.narrative.tier})
                  </div>
                  <ul className="list-unstyled mb-0" style={{ fontSize: 10 }}>
                    {causalStory.story.narrative.blocks.slice(0, 2).map(block => (
                      <li key={block.block_id} className="mb-1">
                        <span className="text-truncate d-inline-block" style={{ maxWidth: '100%', color: '#475569' }} title={block.rendered_text}>
                          {block.rendered_text}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* ── Phase 25 — Counterfactual experimentation surface ── */}
          {topologyOrgId && (
            <div className="mt-3 pt-2 border-top">
              <div className="text-muted mb-1" style={{ fontSize: 10 }}>
                Counterfactual experimentation
                {experimentTrust.trust && (
                  <span className="badge ms-2" style={{
                    background: experimentTrust.trust.aggregate_score >= 90 ? '#dcfce7' : experimentTrust.trust.aggregate_score >= 70 ? '#fef3c7' : '#fee2e2',
                    color: experimentTrust.trust.aggregate_score >= 90 ? '#15803d' : experimentTrust.trust.aggregate_score >= 70 ? '#92400e' : '#b91c1c',
                    fontSize: 9,
                  }}>
                    trust {experimentTrust.trust.aggregate_score}/100
                  </span>
                )}
                <span className="ms-2" style={{ fontSize: 9, color: '#64748b' }}>
                  {experimentSandbox.sandboxes.length} recent sandbox(es) · pure in-memory simulation, never mutates production
                </span>
                {experimentSandbox.streamConnected && <span className="text-success ms-2" style={{ fontSize: 9 }}>● live</span>}
              </div>
              {experimentSandbox.sandboxes.length > 0 && (
                <ul className="list-unstyled mb-0" style={{ fontSize: 10 }}>
                  {experimentSandbox.sandboxes.slice(0, 3).map(s => (
                    <li key={s.sandbox_id} className="d-flex justify-content-between gap-2 mb-1">
                      <span className="font-monospace text-truncate" style={{ maxWidth: 280, color: '#0f172a' }}
                            title={`${s.hypothetical_actions.length} actions; ${s.projected_deltas.length} projected deltas; hash ${s.determinism.projected_state_hash}`}>
                        {s.tier} · {s.hypothetical_actions.length} action(s)
                      </span>
                      <span style={{ fontSize: 9, color: '#64748b' }}>
                        {s.projected_deltas.length} delta(s) · {s.time_elapsed_ms}ms
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {experimentTrust.trust && experimentTrust.trust.bands.length > 0 && (
                <div className="mt-2">
                  <div className="text-muted mb-1" style={{ fontSize: 10 }}>
                    Trust bands · all confidence INHERITED from existing phases
                  </div>
                  <ul className="list-unstyled mb-0" style={{ fontSize: 9 }}>
                    {experimentTrust.trust.bands.slice(0, 3).map(b => (
                      <li key={b.label} className="d-flex justify-content-between gap-2">
                        <span className="font-monospace" style={{ color: '#475569' }} title={b.drivers.join(', ')}>
                          {b.label}
                        </span>
                        <span style={{ color: b.score >= 90 ? '#15803d' : b.score >= 70 ? '#92400e' : '#b91c1c' }}>
                          {b.score} · {b.inherited_from_phase.replace(/^phase_/, 'P')}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* ── Phase 26 — Live operational rehearsal substrate ── */}
          {topologyOrgId && (
            <div className="mt-3 pt-2 border-top">
              <div className="text-muted mb-1" style={{ fontSize: 10 }}>
                Live rehearsal substrate
                {liveSandboxTrust.trust && (
                  <span className="badge ms-2" style={{
                    background: liveSandboxTrust.trust.aggregate_score >= 90 ? '#dcfce7' : liveSandboxTrust.trust.aggregate_score >= 70 ? '#fef3c7' : '#fee2e2',
                    color: liveSandboxTrust.trust.aggregate_score >= 90 ? '#15803d' : liveSandboxTrust.trust.aggregate_score >= 70 ? '#92400e' : '#b91c1c',
                    fontSize: 9,
                  }}>
                    trust {liveSandboxTrust.trust.aggregate_score}/100
                  </span>
                )}
                <span className="ms-2" style={{ fontSize: 9, color: '#64748b' }}>
                  {liveSandbox.runtimes.length} recent runtime(s) · async lifecycle envelopes wrapping Phase 25 projection
                </span>
                {liveSandbox.streamConnected && <span className="text-success ms-2" style={{ fontSize: 9 }}>● live</span>}
              </div>
              {liveSandbox.runtimes.length > 0 && (
                <ul className="list-unstyled mb-0" style={{ fontSize: 10 }}>
                  {liveSandbox.runtimes.slice(0, 3).map(r => (
                    <li key={r.runtime_id} className="d-flex justify-content-between gap-2 mb-1">
                      <span className="font-monospace text-truncate" style={{
                        maxWidth: 280,
                        color: r.lifecycle_state === 'expired' ? '#64748b' :
                               r.lifecycle_state === 'failed' ? '#b91c1c' :
                               r.lifecycle_state === 'completed' ? '#15803d' :
                               r.lifecycle_state === 'running' ? '#92400e' :
                               '#0f172a',
                      }} title={`boundary tier: ${r.boundary_tier}; heartbeats: ${r.heartbeats.length}; expires_at: ${r.expires_at}`}>
                        {r.lifecycle_state} · {r.boundary_tier} · {r.heartbeats.length} heartbeat(s)
                      </span>
                      <span style={{ fontSize: 9, color: '#64748b' }}>
                        TTL {Math.max(0, Math.round((Date.parse(r.expires_at) - Date.now()) / 1000))}s
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {liveSandboxTrust.trust && liveSandboxTrust.trust.bands.length > 0 && (
                <div className="mt-2">
                  <div className="text-muted mb-1" style={{ fontSize: 10 }}>
                    Trust bands · {liveSandboxTrust.trust.bands.length} bands tracing Phase 22/25/26 inheritance
                  </div>
                  <ul className="list-unstyled mb-0" style={{ fontSize: 9 }}>
                    {liveSandboxTrust.trust.bands.slice(0, 3).map(b => (
                      <li key={b.label} className="d-flex justify-content-between gap-2">
                        <span className="font-monospace" style={{ color: '#475569' }} title={b.drivers.join(', ')}>
                          {b.label}
                        </span>
                        <span style={{ color: b.score >= 90 ? '#15803d' : b.score >= 70 ? '#92400e' : '#b91c1c' }}>
                          {b.score} · {b.inherited_from_phase.replace(/^phase_/, 'P')}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* ── Phase 27 — Bounded delegated operational execution ── */}
          {topologyOrgId && (
            <div className="mt-3 pt-3" style={{ borderTop: '1px solid #e2e8f0' }}>
              <div className="d-flex align-items-center gap-2 mb-2">
                <span className="fw-semibold" style={{ fontSize: 11, color: '#0f172a' }}>Delegated execution</span>
                <span className="badge" style={{
                  background: '#fef3c7', color: '#92400e', fontSize: 9,
                }} title="Delegated execution is NOT autonomous orchestration. Operator is the sole authority source.">
                  operator-authority-only
                </span>
                {delegatedExecution.streamConnected && <span className="text-success ms-2" style={{ fontSize: 9 }}>● live</span>}
              </div>
              <div className="row g-2 mb-2">
                <div className="col-md-4">
                  <div className="text-muted" style={{ fontSize: 9 }}>Active envelopes</div>
                  <div className="fw-bold" style={{ fontSize: 14, color: '#0f172a' }}>
                    {authorityEnvelope.envelopes.filter(e => e.lifecycle_state === 'issued' || e.lifecycle_state === 'verified' || e.lifecycle_state === 'executing').length}
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="text-muted" style={{ fontSize: 9 }}>Recent executions</div>
                  <div className="fw-bold" style={{ fontSize: 14, color: '#15803d' }}>
                    {delegatedExecution.traces.length}
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="text-muted" style={{ fontSize: 9 }}>Last outcome</div>
                  <div className="fw-bold" style={{ fontSize: 12, color: delegatedExecution.lastResult?.outcome === 'success' ? '#15803d' : delegatedExecution.lastResult?.outcome ? '#b91c1c' : '#94a3b8' }}>
                    {delegatedExecution.lastResult?.outcome ?? '—'}
                  </div>
                </div>
              </div>
              {authorityEnvelope.envelopes.length > 0 && (
                <ul className="list-unstyled mb-0" style={{ fontSize: 9 }}>
                  {authorityEnvelope.envelopes.slice(0, 3).map(e => (
                    <li key={e.envelope_id} className="d-flex align-items-center gap-2 py-1" style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <span className="font-monospace" style={{ color: '#475569', minWidth: 100 }} title={e.envelope_id}>
                        {e.envelope_id.slice(0, 18)}…
                      </span>
                      <span className="badge" style={{
                        background:
                          e.lifecycle_state === 'completed' ? '#dcfce7' :
                          e.lifecycle_state === 'failed' || e.lifecycle_state === 'expired' ? '#fee2e2' :
                          e.lifecycle_state === 'executing' ? '#dbeafe' :
                          '#fef3c7',
                        color:
                          e.lifecycle_state === 'completed' ? '#15803d' :
                          e.lifecycle_state === 'failed' || e.lifecycle_state === 'expired' ? '#b91c1c' :
                          e.lifecycle_state === 'executing' ? '#1e40af' :
                          '#92400e',
                        fontSize: 8,
                      }} title={`single_use=${e.single_use}; max=${e.max_action_count}; rollback=${e.rollback_chain_id}; expires=${e.expires_at}`}>
                        {e.lifecycle_state} · {e.action_kind}
                      </span>
                      <span style={{ fontSize: 9, color: '#64748b' }}>
                        TTL {Math.max(0, Math.round((Date.parse(e.expires_at) - Date.now()) / 1000))}s
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {delegatedExecution.traces.length > 0 && (
                <div className="mt-2 text-muted" style={{ fontSize: 9 }}>
                  Latest trace: <span className="font-monospace">{delegatedExecution.traces[0]?.envelope_id?.slice(0, 16)}…</span> ·
                  outcome <strong>{delegatedExecution.traces[0]?.outcome ?? '—'}</strong> ·
                  {delegatedExecution.traces[0]?.duration_ms ?? 0}ms
                </div>
              )}
            </div>
          )}

          {/* ── Phase 28 — Execution Resource Governance + Operational Economics ── */}
          {topologyOrgId && (
            <div className="mt-3 pt-3" style={{ borderTop: '1px solid #e2e8f0' }}>
              <div className="d-flex align-items-center gap-2 mb-2">
                <span className="fw-semibold" style={{ fontSize: 11, color: '#0f172a' }}>Execution economics</span>
                <span className="badge" style={{
                  background: '#fef3c7', color: '#92400e', fontSize: 9,
                }} title="Deterministic resource accounting. Phase 28 observes, classifies, budgets, constrains — never optimizes, allocates, or expands authority.">
                  observability-only
                </span>
                {economics.summary && (
                  <span className="badge ms-2" style={{
                    background:
                      economics.summary.current_economics_tier === 'stable' ? '#dcfce7' :
                      economics.summary.current_economics_tier === 'constrained' ? '#fef3c7' :
                      economics.summary.current_economics_tier === 'elevated' ? '#fed7aa' :
                      economics.summary.current_economics_tier === 'saturated' ? '#fecaca' :
                      '#fee2e2',
                    color:
                      economics.summary.current_economics_tier === 'stable' ? '#15803d' :
                      economics.summary.current_economics_tier === 'constrained' ? '#92400e' :
                      economics.summary.current_economics_tier === 'elevated' ? '#9a3412' :
                      '#b91c1c',
                    fontSize: 9,
                  }}>
                    tier {economics.summary.current_economics_tier}
                  </span>
                )}
                {economics.streamConnected && <span className="text-success ms-2" style={{ fontSize: 9 }}>● live</span>}
              </div>
              <div className="row g-2 mb-2">
                <div className="col-md-3">
                  <div className="text-muted" style={{ fontSize: 9 }}>Quota exhaustions 24h</div>
                  <div className="fw-bold" style={{ fontSize: 14, color: economics.summary && economics.summary.recent_quota_exhaustions_24h > 0 ? '#b91c1c' : '#15803d' }}>
                    {economics.summary?.recent_quota_exhaustions_24h ?? 0}
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="text-muted" style={{ fontSize: 9 }}>Pressure tier</div>
                  <div className="fw-bold" style={{ fontSize: 12, color: '#0f172a' }}>
                    {pressure.profile?.tier ?? '—'}
                    {pressure.profile && (
                      <span className="text-muted ms-1" style={{ fontSize: 9 }}>
                        · {pressure.profile.score}/100
                      </span>
                    )}
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="text-muted" style={{ fontSize: 9 }}>Quota safety</div>
                  <div className="fw-bold" style={{ fontSize: 14, color: (economics.summary?.health_scores.quota_safety ?? 100) >= 90 ? '#15803d' : '#b91c1c' }}>
                    {economics.summary?.health_scores.quota_safety ?? 100}
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="text-muted" style={{ fontSize: 9 }}>Forecasts 24h</div>
                  <div className="fw-bold" style={{ fontSize: 14, color: '#0f172a' }}>
                    {economics.summary?.recent_forecasts_24h ?? 0}
                  </div>
                </div>
              </div>
              {quota.profile && (
                <ul className="list-unstyled mb-0" style={{ fontSize: 9 }}>
                  {(Object.keys(quota.profile.limits) as Array<keyof typeof quota.profile.limits>).slice(0, 4).map(k => (
                    <li key={k} className="d-flex justify-content-between gap-2 py-1" style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <span className="font-monospace" style={{ color: '#475569' }}>{k}</span>
                      <span style={{
                        color: quota.profile!.remaining[k] === 0 ? '#b91c1c'
                          : quota.profile!.remaining[k] / Math.max(1, quota.profile!.limits[k]) < 0.25 ? '#92400e'
                          : '#15803d',
                      }}>
                        {quota.profile!.consumed[k]}/{quota.profile!.limits[k]} (rem {quota.profile!.remaining[k]})
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* ── Phase 29 — Stabilization Playbook Intelligence + Recovery Governance ── */}
          {topologyOrgId && (
            <div className="mt-3 pt-3" style={{ borderTop: '1px solid #e2e8f0' }}>
              <div className="d-flex align-items-center gap-2 mb-2">
                <span className="fw-semibold" style={{ fontSize: 11, color: '#0f172a' }}>Stabilization intelligence</span>
                <span className="badge" style={{
                  background: '#fef3c7', color: '#92400e', fontSize: 9,
                }} title="Read-only recovery recommendation intelligence. Phase 29 recommends, sequences, forecasts, classifies, replays — never executes. Operator click + Phase 27 envelope is the sole mutation path.">
                  recommendation-only
                </span>
                {recoveryPressure.profile && (
                  <span className="badge ms-2" style={{
                    background:
                      recoveryPressure.profile.tier === 'low' ? '#dcfce7' :
                      recoveryPressure.profile.tier === 'moderate' ? '#fef3c7' :
                      recoveryPressure.profile.tier === 'elevated' ? '#fed7aa' :
                      '#fee2e2',
                    color:
                      recoveryPressure.profile.tier === 'low' ? '#15803d' :
                      recoveryPressure.profile.tier === 'moderate' ? '#92400e' :
                      recoveryPressure.profile.tier === 'elevated' ? '#9a3412' :
                      '#b91c1c',
                    fontSize: 9,
                  }}>
                    pressure {recoveryPressure.profile.tier} · {recoveryPressure.profile.score}/100
                  </span>
                )}
                {stabilizationPlaybooks.streamConnected && <span className="text-success ms-2" style={{ fontSize: 9 }}>● live</span>}
              </div>
              <div className="row g-2 mb-2">
                <div className="col-md-3">
                  <div className="text-muted" style={{ fontSize: 9 }}>Archetypes available</div>
                  <div className="fw-bold" style={{ fontSize: 14, color: '#0f172a' }}>
                    {stabilizationPlaybooks.archetypes.length}
                    <span className="text-muted ms-1" style={{ fontSize: 9 }}>
                      ({stabilizationPlaybooks.archetypes.filter(a => a.is_built_in).length} built-in)
                    </span>
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="text-muted" style={{ fontSize: 9 }}>Topology contained</div>
                  <div className="fw-bold" style={{ fontSize: 12, color: recoveryPressure.containment?.topology_contained ? '#15803d' : '#b91c1c' }}>
                    {recoveryPressure.containment ? (recoveryPressure.containment.topology_contained ? 'yes' : 'no') : '—'}
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="text-muted" style={{ fontSize: 9 }}>Rollback coverage</div>
                  <div className="fw-bold" style={{ fontSize: 12, color: recoveryPressure.containment?.rollback_coverage_verified ? '#15803d' : '#b91c1c' }}>
                    {recoveryPressure.containment ? (recoveryPressure.containment.rollback_coverage_verified ? 'verified' : 'gap') : '—'}
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="text-muted" style={{ fontSize: 9 }}>Trust aggregate</div>
                  <div className="fw-bold" style={{ fontSize: 14, color: (stabilizationTrust.trust?.aggregate_score ?? 100) >= 80 ? '#15803d' : '#b91c1c' }}>
                    {stabilizationTrust.trust?.aggregate_score ?? '—'}
                  </div>
                </div>
              </div>
              {stabilizationPlaybooks.archetypes.length > 0 && (
                <ul className="list-unstyled mb-0" style={{ fontSize: 9 }}>
                  {stabilizationPlaybooks.archetypes.slice(0, 3).map(a => (
                    <li key={a.archetype_id} className="d-flex justify-content-between gap-2 py-1" style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <span className="font-monospace" style={{ color: '#475569' }} title={a.description}>
                        {a.name} <span className="text-muted">({a.steps.length} step{a.steps.length === 1 ? '' : 's'})</span>
                      </span>
                      <span className="badge" style={{
                        background: a.is_built_in ? '#dbeafe' : '#fef3c7',
                        color: a.is_built_in ? '#1e40af' : '#92400e',
                        fontSize: 8,
                      }}>
                        {a.provenance}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* ── Phase 30 — Recovery Foresight UX + Stabilization Decision Cognition ── */}
          {topologyOrgId && (
            <div className="mt-3 pt-3" style={{ borderTop: '1px solid #e2e8f0' }}>
              <div className="d-flex align-items-center gap-2 mb-2">
                <span className="fw-semibold" style={{ fontSize: 11, color: '#0f172a' }}>Recovery foresight</span>
                <span className="badge" style={{
                  background: '#fef3c7', color: '#92400e', fontSize: 9,
                }} title="Read-only comparison cognition. Phase 30 compares, explains, walks through, replays, forecasts — never selects, never ranks. engine_never_ranks: true typed-as-literal on every output.">
                  comparison-only · engine never ranks
                </span>
                {stabilizationDecision.streamConnected && <span className="text-success ms-2" style={{ fontSize: 9 }}>● live</span>}
              </div>
              <div className="row g-2 mb-2">
                <div className="col-md-4">
                  <div className="text-muted" style={{ fontSize: 9 }}>Last comparison tier</div>
                  <div className="fw-bold" style={{
                    fontSize: 12,
                    color: stabilizationDecision.profile?.tier === 'clear' ? '#15803d'
                      : stabilizationDecision.profile?.tier === 'explorable' ? '#0d9488'
                      : stabilizationDecision.profile?.tier === 'contested' ? '#92400e'
                      : stabilizationDecision.profile?.tier === 'blocked' ? '#b91c1c'
                      : '#64748b',
                  }}>
                    {stabilizationDecision.profile?.tier ?? '—'}
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="text-muted" style={{ fontSize: 9 }}>Archetypes compared</div>
                  <div className="fw-bold" style={{ fontSize: 14, color: '#0f172a' }}>
                    {stabilizationDecision.profile?.rows.length ?? '—'}
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="text-muted" style={{ fontSize: 9 }}>Engine ranking</div>
                  <div className="fw-bold" style={{ fontSize: 11, color: '#15803d' }}>
                    {stabilizationDecision.profile ? 'never (typed-as-literal)' : '—'}
                  </div>
                </div>
              </div>
              {stabilizationDecision.profile && stabilizationDecision.profile.rows.length > 0 && (
                <ul className="list-unstyled mb-0" style={{ fontSize: 9 }}>
                  {stabilizationDecision.profile.rows.slice(0, 4).map(r => (
                    <li key={r.archetype_id} className="d-flex justify-content-between gap-2 py-1" style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <span className="font-monospace" style={{ color: '#475569' }} title={r.archetype_id}>
                        {r.archetype_name}
                        <span className="text-muted ms-1">
                          ({r.duration_ms}ms · conf {r.confidence})
                        </span>
                      </span>
                      <span className="badge" style={{
                        background: r.governance_passed ? '#dcfce7' : '#fee2e2',
                        color: r.governance_passed ? '#15803d' : '#b91c1c',
                        fontSize: 8,
                      }}>
                        {r.governance_passed ? 'permitted' : 'rejected'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {!stabilizationDecision.profile && (
                <div className="text-muted" style={{ fontSize: 9, fontStyle: 'italic' }}>
                  Operator click to build a comparison · operators sort UI side
                </div>
              )}
            </div>
          )}

          {/* ── Phase 31 — Governance Memory + Cognition Continuity ── */}
          {topologyOrgId && (
            <div className="mt-3 pt-3" style={{ borderTop: '1px solid #e2e8f0' }}>
              <div className="d-flex align-items-center gap-2 mb-2">
                <span className="fw-semibold" style={{ fontSize: 11, color: '#0f172a' }}>Governance memory</span>
                <span className="badge" style={{
                  background: '#fef3c7', color: '#92400e', fontSize: 9,
                }} title="Per-organization append-only event log. Phase 31 PERSISTS, REPLAYS, TIMELINES, COMPRESSES, NARRATES — NEVER profiles operators / NEVER predicts behavior / NEVER ranks. engine_never_profiles: true typed-as-literal.">
                  no-profiling · append-only
                </span>
                {governanceMemory.profile && (
                  <span className="badge ms-2" style={{
                    background:
                      governanceMemory.profile.density_tier === 'sparse' ? '#dbeafe'
                      : governanceMemory.profile.density_tier === 'partial' ? '#dcfce7'
                      : governanceMemory.profile.density_tier === 'developed' ? '#fef3c7'
                      : governanceMemory.profile.density_tier === 'dense' ? '#fed7aa'
                      : '#fee2e2',
                    color:
                      governanceMemory.profile.density_tier === 'sparse' ? '#1e40af'
                      : governanceMemory.profile.density_tier === 'partial' ? '#15803d'
                      : governanceMemory.profile.density_tier === 'developed' ? '#92400e'
                      : governanceMemory.profile.density_tier === 'dense' ? '#9a3412'
                      : '#b91c1c',
                    fontSize: 9,
                  }}>
                    {governanceMemory.profile.density_tier}
                  </span>
                )}
                {governanceMemory.streamConnected && <span className="text-success ms-2" style={{ fontSize: 9 }}>● live</span>}
              </div>
              <div className="row g-2 mb-2">
                <div className="col-md-3">
                  <div className="text-muted" style={{ fontSize: 9 }}>Sessions</div>
                  <div className="fw-bold" style={{ fontSize: 14, color: '#0f172a' }}>
                    {governanceMemory.profile?.total_sessions ?? '—'}
                    {governanceMemory.profile && (
                      <span className="text-muted ms-1" style={{ fontSize: 9 }}>
                        ({governanceMemory.profile.active_sessions} active)
                      </span>
                    )}
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="text-muted" style={{ fontSize: 9 }}>Total events</div>
                  <div className="fw-bold" style={{ fontSize: 14, color: '#0f172a' }}>
                    {governanceMemory.profile?.total_events ?? '—'}
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="text-muted" style={{ fontSize: 9 }}>Distinct operators</div>
                  <div className="fw-bold" style={{ fontSize: 14, color: '#0f172a' }}>
                    {governanceMemory.profile?.distinct_operator_count ?? '—'}
                    <span className="text-muted ms-1" style={{ fontSize: 9 }}>(count only)</span>
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="text-muted" style={{ fontSize: 9 }}>Engine profiling</div>
                  <div className="fw-bold" style={{ fontSize: 11, color: '#15803d' }}>
                    {governanceMemory.profile ? 'never (typed-as-literal)' : '—'}
                  </div>
                </div>
              </div>
              {memoryTimeline.surface && memoryTimeline.surface.points.length > 0 && (
                <ul className="list-unstyled mb-0" style={{ fontSize: 9 }}>
                  {memoryTimeline.surface.points.slice(0, 4).map(p => (
                    <li key={p.deterministic_hash} className="d-flex justify-content-between gap-2 py-1" style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <span className="font-monospace" style={{ color: '#475569' }} title={p.operator_id}>
                        {new Date(p.recorded_at).toLocaleTimeString()} · {p.event_kind}
                        {p.subject_kind && (
                          <span className="text-muted ms-1">({p.subject_kind})</span>
                        )}
                      </span>
                      <span className="text-muted" style={{ fontSize: 8 }}>
                        {p.session_id.slice(-6)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {!governanceMemory.profile?.total_events && (
                <div className="text-muted" style={{ fontSize: 9, fontStyle: 'italic' }}>
                  Operator opens session via API to populate memory · no autonomous listening
                </div>
              )}
            </div>
          )}

          {/* ── Phase 32 — Multi-Operator Governance Continuity + Handoffs ── */}
          {topologyOrgId && (
            <div className="mt-3 pt-3" style={{ borderTop: '1px solid #e2e8f0' }}>
              <div className="d-flex align-items-center gap-2 mb-2">
                <span className="fw-semibold" style={{ fontSize: 11, color: '#0f172a' }}>Operator handoffs</span>
                <span className="badge" style={{
                  background: '#fef3c7', color: '#92400e', fontSize: 9,
                }} title="Per-org append-only handoff event log. Phase 32 records handoff events; NEVER ranks operators / NEVER scores collaboration / NEVER infers behavior. authority_transfer_supported: false typed-as-literal on every handoff. Phase 27/28/29 gates run independently after handoff.">
                  no-ranking · context-only
                </span>
                {governanceHandoffs.streamConnected && <span className="text-success ms-2" style={{ fontSize: 9 }}>● live</span>}
              </div>
              <div className="row g-2 mb-2">
                <div className="col-md-3">
                  <div className="text-muted" style={{ fontSize: 9 }}>Total handoffs</div>
                  <div className="fw-bold" style={{ fontSize: 14, color: '#0f172a' }}>
                    {governanceHandoffs.handoffs.length ?? '—'}
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="text-muted" style={{ fontSize: 9 }}>Active handoffs</div>
                  <div className="fw-bold" style={{ fontSize: 14, color: '#0f172a' }}>
                    {governanceHandoffs.handoffs.filter(h => h.lifecycle_state === 'started' || h.lifecycle_state === 'acknowledged').length}
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="text-muted" style={{ fontSize: 9 }}>Authority transfer</div>
                  <div className="fw-bold" style={{ fontSize: 11, color: '#15803d' }}>
                    never (typed-as-false)
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="text-muted" style={{ fontSize: 9 }}>Engine ranking</div>
                  <div className="fw-bold" style={{ fontSize: 11, color: '#15803d' }}>
                    never (typed-as-true)
                  </div>
                </div>
              </div>
              {governanceHandoffs.handoffs.length > 0 && (
                <ul className="list-unstyled mb-0" style={{ fontSize: 9 }}>
                  {governanceHandoffs.handoffs.slice(0, 4).map(h => (
                    <li key={h.handoff_id} className="d-flex justify-content-between gap-2 py-1" style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <span className="font-monospace" style={{ color: '#475569' }} title={`${h.from_operator_id} → ${h.to_operator_id}`}>
                        {new Date(h.started_at).toLocaleTimeString()} · {h.from_operator_id.slice(0, 6)}…→{h.to_operator_id.slice(0, 6)}…
                      </span>
                      <span className="badge" style={{
                        background:
                          h.lifecycle_state === 'completed' ? '#dcfce7'
                          : h.lifecycle_state === 'acknowledged' ? '#dbeafe'
                          : h.lifecycle_state === 'declined' ? '#fee2e2'
                          : h.lifecycle_state === 'expired' ? '#f3f4f6'
                          : '#fef3c7',
                        color:
                          h.lifecycle_state === 'completed' ? '#15803d'
                          : h.lifecycle_state === 'acknowledged' ? '#1e40af'
                          : h.lifecycle_state === 'declined' ? '#b91c1c'
                          : h.lifecycle_state === 'expired' ? '#6b7280'
                          : '#92400e',
                        fontSize: 8,
                      }}>
                        {h.lifecycle_state}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {!governanceHandoffs.handoffs.length && (
                <div className="text-muted" style={{ fontSize: 9, fontStyle: 'italic' }}>
                  Operator records handoffs via API · no autonomous detection
                </div>
              )}
            </div>
          )}

          {(decisions.error || trust.error || handoffs.error || isolations.error || selfHeal.error || mutations.error || containment.error || mutationTrust.error || lineage.error || propagation.error || reliability.error || drift.error || forecasts.error || calibration.error || recovery.error || topology.error || federationConsent.error || federatedArchetypes.error || anomalies.error || archetypeReliability.error || federationDrift.error || policyEvolution.error || brokerHealth.error || runtimePartitions.error || brokerIsolation.error || topologyFragmentation.error || topologyRecovery.error || executionRuntime.error || executionIsolation.error || operatorGuidance.error || causalStory.error || experimentSandbox.error || experimentTrust.error || liveSandbox.error || liveSandboxTrust.error || delegatedExecution.error || authorityEnvelope.error || economics.error || quota.error || pressure.error || stabilizationPlaybooks.error || recoveryPressure.error || stabilizationTrust.error || stabilizationDecision.error || governanceMemory.error || memoryTimeline.error || governanceHandoffs.error || sharedTimeline.error) && (
            <div className="mt-2 text-warning" style={{ fontSize: 10 }}>
              {decisions.error || trust.error || handoffs.error || isolations.error || selfHeal.error || mutations.error || containment.error || mutationTrust.error || lineage.error || propagation.error || reliability.error || drift.error || forecasts.error || calibration.error || recovery.error || topology.error || federationConsent.error || federatedArchetypes.error || anomalies.error || archetypeReliability.error || federationDrift.error || policyEvolution.error || brokerHealth.error || runtimePartitions.error || brokerIsolation.error || topologyFragmentation.error || topologyRecovery.error || executionRuntime.error || executionIsolation.error || operatorGuidance.error || causalStory.error || experimentSandbox.error || experimentTrust.error || liveSandbox.error || liveSandboxTrust.error || delegatedExecution.error || authorityEnvelope.error || economics.error || quota.error || pressure.error || stabilizationPlaybooks.error || recoveryPressure.error || stabilizationTrust.error || stabilizationDecision.error || governanceMemory.error || memoryTimeline.error || governanceHandoffs.error || sharedTimeline.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
