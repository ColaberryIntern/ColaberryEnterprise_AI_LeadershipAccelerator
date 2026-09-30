import React from 'react';
import { SectionCard } from './shell';
import { AgentTrustEntry } from '../../services/workLedgerApi';

// ProofDesk Outcomes & Learning — Milestone 5 (spec 20.10). Pure/presentational, same
// convention as GovernanceShadowPanel.tsx: the parent page owns fetch/interval/error
// state, this component only renders what it's given. Per-(agent, capability,
// risk_tier) rate — NOT one global score per agent, per the spec's own explicit
// framing ("do not give an agent one global trust score").

interface Props {
  entries: AgentTrustEntry[] | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

export default function AgentTrustPanel({ entries, loading, error, onRefresh }: Props) {
  return (
    <SectionCard padded={false} className="mt-4">
      <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">
        <span>Agent trust by capability</span>
        <button className="btn btn-outline-primary btn-sm" onClick={onRefresh} disabled={loading}>
          <i className="ri-refresh-line" aria-hidden="true" /> Refresh
        </button>
      </div>
      {loading ? (
        <div className="text-center py-4">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      ) : error ? (
        <div className="alert alert-danger mx-3 my-3">{error}</div>
      ) : !entries || entries.length === 0 ? (
        <div className="text-muted text-center py-4 px-3">
          No data yet — work units are opt-in (Milestone 3) and nothing has been assigned to an
          agent/capability/risk-tier triple yet.
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead className="table-light">
              <tr>
                <th>Agent</th>
                <th>Capability</th>
                <th>Risk tier</th>
                <th className="text-end">Succeeded</th>
                <th className="text-end">Failed</th>
                <th className="text-end">Success rate</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((row) => (
                <tr key={`${row.agent_name}-${row.capability}-${row.risk_tier}`}>
                  <td>{row.agent_name}</td>
                  <td><code>{row.capability}</code></td>
                  <td>{row.risk_tier}</td>
                  <td className="text-end">{row.succeeded}</td>
                  <td className="text-end">{row.failed}</td>
                  <td className="text-end">
                    {row.status === 'insufficient_data' ? (
                      <span className="badge bg-secondary">insufficient data</span>
                    ) : (
                      <span className={`badge ${(row.success_rate ?? 0) >= 0.8 ? 'bg-success' : 'bg-warning text-dark'}`}>
                        {((row.success_rate ?? 0) * 100).toFixed(0)}%
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
