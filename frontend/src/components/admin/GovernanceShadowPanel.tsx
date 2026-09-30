import React from 'react';
import { SectionCard, StatCard } from './shell';
import { GovernanceShadowSummary } from '../../services/workLedgerApi';

// ProofDesk Governance — Milestone 4 (Governance Enforcement, SHADOW MODE ONLY).
// Pure/presentational (no fetch/loading state of its own) so it's directly testable
// with renderToStaticMarkup, per this repo's established convention (see
// ticketDetailTabs/WorkGraphTab.tsx's WorkGraphContent - the parent page owns
// fetch/interval/error state; this component only renders what it's given).
//
// SHADOW MODE INVARIANT: every count and badge here is purely descriptive. Nothing
// rendered by this component can block, delay, or gate a real action - the banner
// below states that explicitly so an admin reading this page never mistakes shadow
// logging for live enforcement.

interface Props {
  governance: GovernanceShadowSummary | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

function verdictBadgeClass(verdict: string): string {
  if (verdict === 'would_allow') return 'bg-success';
  if (verdict === 'would_require_approval') return 'bg-warning text-dark';
  return 'bg-danger';
}

export default function GovernanceShadowPanel({ governance, loading, error, onRefresh }: Props) {
  return (
    <SectionCard padded={false} className="mt-4">
      <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">
        <span>Governance (shadow mode)</span>
        <button className="btn btn-outline-primary btn-sm" onClick={onRefresh} disabled={loading}>
          <i className="ri-refresh-line" aria-hidden="true" /> Refresh
        </button>
      </div>
      <div className="px-3 pt-3">
        <div className="alert alert-info mb-3" role="status">
          <strong>Shadow mode — no action is currently blocked.</strong> These counts show what
          R3/R4 (or any other authorization rule) WOULD have blocked or required human approval
          for, if enforcement were live. Every dispatch below ran exactly as it would have before
          this milestone.
        </div>
      </div>
      {loading ? (
        <div className="text-center py-4">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      ) : error || !governance ? (
        <div className="alert alert-danger mx-3">{error || 'No data'}</div>
      ) : (
        <>
          <div className="row g-3 px-3 pb-3">
            <div className="col-6 col-lg-3">
              <StatCard label="Would allow" value={governance.would_allow} icon="checkbox-circle-line" tone="success" />
            </div>
            <div className="col-6 col-lg-3">
              <StatCard
                label="Would require approval"
                value={governance.would_require_approval}
                icon="hourglass-line"
                tone={governance.would_require_approval > 0 ? 'warning' : 'neutral'}
              />
            </div>
            <div className="col-6 col-lg-3">
              <StatCard
                label="Would block"
                value={governance.would_block}
                icon="shield-cross-line"
                tone={governance.would_block > 0 ? 'warning' : 'neutral'}
              />
            </div>
            <div className="col-6 col-lg-3">
              <StatCard label="Total decisions (24h)" value={governance.total_decisions} icon="list-check-2" tone="neutral" />
            </div>
          </div>
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead className="table-light">
                <tr>
                  <th>Action</th>
                  <th>Risk tier</th>
                  <th>Verdict</th>
                  <th className="text-end">Count</th>
                </tr>
              </thead>
              <tbody>
                {governance.breakdown.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-muted text-center py-3">
                      No ticket-dispatch decisions in the last 24h.
                    </td>
                  </tr>
                ) : (
                  governance.breakdown.map((row) => (
                    <tr key={`${row.action}-${row.risk_tier}-${row.verdict}`}>
                      <td><code>{row.action}</code></td>
                      <td>{row.risk_tier}</td>
                      <td>
                        <span className={`badge ${verdictBadgeClass(row.verdict)}`}>{row.verdict}</span>
                      </td>
                      <td className="text-end">{row.count}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </SectionCard>
  );
}
