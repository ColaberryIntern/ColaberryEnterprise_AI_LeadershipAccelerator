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

          {(decisions.error || trust.error || handoffs.error || isolations.error || selfHeal.error || mutations.error || containment.error || mutationTrust.error || lineage.error || propagation.error) && (
            <div className="mt-2 text-warning" style={{ fontSize: 10 }}>
              {decisions.error || trust.error || handoffs.error || isolations.error || selfHeal.error || mutations.error || containment.error || mutationTrust.error || lineage.error || propagation.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
