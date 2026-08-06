import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  getWorkLedgerHealth,
  WorkLedgerHealth,
  getGovernanceShadowSummary,
  GovernanceShadowSummary,
  getAgentTrust,
  AgentTrustEntry,
  getCostToProof,
  CostToProofEntry,
  getRelatedWorkClusters,
  RelatedWorkClusters,
  getOutcomeMeasurementsSummary,
  OutcomeMeasurementsSummary,
} from '../../services/workLedgerApi';
import { PageHeader, StatCard, SectionCard } from '../../components/admin/shell';
import { TrustSignal, TrustLevel } from '../../components/admin/shell/trust';
import GovernanceShadowPanel from '../../components/admin/GovernanceShadowPanel';
import AgentTrustPanel from '../../components/admin/AgentTrustPanel';
import CostToProofPanel from '../../components/admin/CostToProofPanel';
import RelatedWorkClustersPanel from '../../components/admin/RelatedWorkClustersPanel';
import OutcomeMeasurementsPanel from '../../components/admin/OutcomeMeasurementsPanel';
import { usePolledResource } from '../../hooks/usePolledResource';

// ProofDesk Work Ledger — Milestone 1 (Foundation). Read-only ingestion-health
// panel: proves the shadow-mode wrap points (ticket create/status-change/
// agent-output/dispatch) are actually producing durable ledger rows on real
// traffic. This is the ONLY new user-visible surface in Milestone 1 - the Kanban
// board and ticket detail modal are untouched.
export default function AdminWorkLedgerHealthPage() {
  const [health, setHealth] = useState<WorkLedgerHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      const data = await getWorkLedgerHealth(24);
      setHealth(data);
      setError(null);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load work ledger health');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 10000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  // ProofDesk Governance — Milestone 4 (shadow mode). Deliberately independent
  // loading/error state from the ingestion-health card above - a governance-panel
  // fetch failure must never affect the pre-existing card's render (T009 AC3).
  const [governance, setGovernance] = useState<GovernanceShadowSummary | null>(null);
  const [govLoading, setGovLoading] = useState(true);
  const [govError, setGovError] = useState<string | null>(null);

  const fetchGovernance = useCallback(async () => {
    try {
      const data = await getGovernanceShadowSummary(24);
      setGovernance(data);
      setGovError(null);
    } catch (err: any) {
      setGovError(err?.response?.data?.error || 'Failed to load governance shadow summary');
    } finally {
      setGovLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGovernance();
    const interval = setInterval(fetchGovernance, 10000);
    return () => clearInterval(interval);
  }, [fetchGovernance]);

  // ProofDesk Outcomes & Learning — Milestone 5. Each panel below fetches
  // independently (usePolledResource), so one panel's failure never affects another's
  // render — same invariant the pre-existing governance panel already established.
  const agentTrust = usePolledResource<AgentTrustEntry[]>(getAgentTrust, 10000, 'Failed to load agent trust stats');
  const costToProof = usePolledResource<CostToProofEntry[]>(getCostToProof, 10000, 'Failed to load cost-to-proof stats');
  const relatedWorkClusters = usePolledResource<RelatedWorkClusters>(
    getRelatedWorkClusters,
    10000,
    'Failed to load related-work clusters',
  );
  const outcomeMeasurements = usePolledResource<OutcomeMeasurementsSummary>(
    getOutcomeMeasurementsSummary,
    10000,
    'Failed to load outcome measurements summary',
  );

  const trust: TrustSignal = useMemo(() => {
    const pct = health?.completeness_pct ?? 0;
    const total = health?.total_actions ?? 0;
    const level: TrustLevel = total === 0 ? 'unverified' : pct >= 95 ? 'live' : 'stale';
    return {
      level,
      source: 'work ledger',
      updatedAt: new Date().toISOString(),
      summary: total === 0
        ? 'No wrapped ticket actions in the last 24h yet.'
        : `${pct}% of ${total} wrapped ticket actions produced a ledger row.`,
      href: '/admin/trust',
      pillars: [
        {
          name: 'Ledger completeness',
          status: level,
          evidence: [
            { label: 'Completeness', value: `${pct}%` },
            { label: 'Orphan actions', value: String(health?.orphan_count ?? 0) },
          ],
        },
      ],
    };
  }, [health]);

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (error || !health) {
    return <div className="alert alert-danger">{error || 'No data'}</div>;
  }

  return (
    <>
      <PageHeader
        title="Work Ledger Health"
        icon="shield-check-line"
        subtitle="ProofDesk Milestone 1 (shadow mode) — ingestion health for the Agent Work Ledger. Auto-refreshes every 10 seconds."
        breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Work Ledger Health' }]}
        trust={trust}
        actions={
          <button className="btn btn-outline-primary btn-sm" onClick={fetchHealth} disabled={loading}>
            <i className="ri-refresh-line" aria-hidden="true" /> Refresh
          </button>
        }
      >
        <div className="row g-3">
          <div className="col-6 col-lg-3">
            <StatCard
              label="Completeness"
              value={health.completeness_pct}
              unit="%"
              icon="checkbox-circle-line"
              tone={health.completeness_pct >= 95 ? 'success' : health.total_actions === 0 ? 'neutral' : 'warning'}
            />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard
              label="Orphan actions"
              value={health.orphan_count}
              icon="error-warning-line"
              tone={health.orphan_count > 0 ? 'warning' : 'success'}
            />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard label="Total actions (24h)" value={health.total_actions} icon="list-check-2" tone="neutral" />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard label="Matched actions" value={health.matched_actions} icon="link" tone="neutral" />
          </div>
        </div>
      </PageHeader>

      <SectionCard padded={false}>
        <div className="card-header bg-white fw-semibold">Breakdown by action</div>
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead className="table-light">
              <tr>
                <th>Action</th>
                <th className="text-end">Total</th>
                <th className="text-end">Matched</th>
                <th className="text-end">Orphan</th>
              </tr>
            </thead>
            <tbody>
              {health.breakdown.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-muted text-center py-3">
                    No wrapped ticket actions in the last 24h.
                  </td>
                </tr>
              ) : (
                health.breakdown.map((row) => (
                  <tr key={row.action}>
                    <td><code>{row.action}</code></td>
                    <td className="text-end">{row.total}</td>
                    <td className="text-end">{row.matched}</td>
                    <td className={`text-end ${row.orphan > 0 ? 'text-warning fw-medium' : ''}`}>{row.orphan}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <GovernanceShadowPanel
        governance={governance}
        loading={govLoading}
        error={govError}
        onRefresh={fetchGovernance}
      />

      {/* ProofDesk Outcomes & Learning — Milestone 5 */}
      <OutcomeMeasurementsPanel
        summary={outcomeMeasurements.data}
        loading={outcomeMeasurements.loading}
        error={outcomeMeasurements.error}
        onRefresh={outcomeMeasurements.refetch}
      />
      <AgentTrustPanel
        entries={agentTrust.data}
        loading={agentTrust.loading}
        error={agentTrust.error}
        onRefresh={agentTrust.refetch}
      />
      <CostToProofPanel
        entries={costToProof.data}
        loading={costToProof.loading}
        error={costToProof.error}
        onRefresh={costToProof.refetch}
      />
      <RelatedWorkClustersPanel
        clusters={relatedWorkClusters.data}
        loading={relatedWorkClusters.loading}
        error={relatedWorkClusters.error}
        onRefresh={relatedWorkClusters.refetch}
      />

      {/* ProofDesk Outcomes & Learning — Milestone 5 (T011) */}
      <div className="text-center mt-4 mb-2">
        <a href="/admin/executive-narrative" className="btn btn-outline-secondary btn-sm">
          <i className="ri-file-text-line" aria-hidden="true" /> View executive narrative (what shipped, what needs a decision)
        </a>
      </div>
    </>
  );
}
