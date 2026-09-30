import React from 'react';
import { SectionCard } from './shell';
import { CostToProofEntry } from '../../services/workLedgerApi';

// ProofDesk Outcomes & Learning — Milestone 5 (spec 20.11). Pure/presentational, same
// convention as GovernanceShadowPanel.tsx. Honest labeling: `cost_usd` is confirmed
// unpopulated everywhere in this repo today, so this panel shows duration-to-proof
// (ms) as the real, measurable proxy — never a fabricated dollar figure. The banner
// below states this explicitly so an admin never mistakes duration for real spend.

interface Props {
  entries: CostToProofEntry[] | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

function formatDuration(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export default function CostToProofPanel({ entries, loading, error, onRefresh }: Props) {
  return (
    <SectionCard padded={false} className="mt-4">
      <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">
        <span>Cost-to-proof (duration proxy)</span>
        <button className="btn btn-outline-primary btn-sm" onClick={onRefresh} disabled={loading}>
          <i className="ri-refresh-line" aria-hidden="true" /> Refresh
        </button>
      </div>
      <div className="px-3 pt-3">
        <div className="alert alert-info mb-3 py-2 small" role="status">
          <strong>Dollar cost is not tracked yet.</strong> No write path in this repo currently
          populates a real <code>cost_usd</code> value for agent work, so this panel shows average
          duration to a verified (<code>done</code>) work unit instead — the real, measurable proxy
          available today.
        </div>
      </div>
      {loading ? (
        <div className="text-center py-4">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      ) : error ? (
        <div className="alert alert-danger mx-3 mb-3">{error}</div>
      ) : !entries || entries.length === 0 ? (
        <div className="text-muted text-center py-4 px-3">
          No verified (done) work units yet — nothing to measure.
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead className="table-light">
              <tr>
                <th>Capability</th>
                <th className="text-end">Verified count</th>
                <th className="text-end">Avg duration to proof</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((row) => (
                <tr key={row.capability}>
                  <td><code>{row.capability}</code></td>
                  <td className="text-end">{row.verified_count}</td>
                  <td className="text-end">
                    {row.status === 'insufficient_data' ? (
                      <span className="badge bg-secondary">insufficient data</span>
                    ) : (
                      formatDuration(row.avg_duration_to_proof_ms)
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
