import React from 'react';
import { useGovernanceAudit } from '../../hooks/useGovernanceAudit';

/**
 * Phase 12 — admin-only governance policy dashboard. v1 surfaces the
 * audit log + the recent override history; full policy editing UI
 * (automation_mode toggle, confidence_floor sliders, retention windows)
 * sits as a Phase 12.1 follow-up. This dashboard is the admin lens
 * onto governance health across all projects.
 */
export function GovernancePolicyDashboard() {
  const audit = useGovernanceAudit({ autoFetch: true, limit: 100 });

  return (
    <div className="container-fluid p-3">
      <div className="d-flex align-items-center gap-2 mb-3">
        <i className="bi bi-shield-lock" style={{ color: '#1a365d', fontSize: 18 }}></i>
        <h5 className="fw-bold mb-0" style={{ color: '#1a365d' }}>Governance Policies</h5>
      </div>
      <p className="text-muted" style={{ fontSize: 13 }}>
        Per-project automation thresholds, confidence floors, and audit visibility.
        Policy editing surfaces are project-scoped — switch to a project to edit its policy.
      </p>

      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white d-flex align-items-center justify-content-between" style={{ padding: '10px 14px' }}>
          <span className="fw-semibold">Recent governance audit</span>
          <span className="text-muted" style={{ fontSize: 11 }}>{audit.entries.length} entries</span>
        </div>
        <div className="card-body" style={{ padding: '0' }}>
          {audit.loading && <div className="p-3 text-muted">Loading…</div>}
          {audit.error && <div className="p-3 text-danger" style={{ fontSize: 12 }}>{audit.error}</div>}
          {!audit.loading && audit.entries.length === 0 && (
            <div className="p-3 text-muted" style={{ fontSize: 12 }}>No audit entries yet.</div>
          )}
          {audit.entries.length > 0 && (
            <div className="table-responsive">
              <table className="table table-sm table-hover mb-0" style={{ fontSize: 12 }}>
                <thead className="table-light">
                  <tr>
                    <th>Time</th>
                    <th>Kind</th>
                    <th>Operator</th>
                    <th>Subject</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.entries.map(e => (
                    <tr key={e.id}>
                      <td className="text-muted" style={{ fontSize: 11 }}>{new Date(e.recorded_at).toLocaleString()}</td>
                      <td><span className="font-monospace" style={{ fontSize: 11 }}>{e.kind}</span></td>
                      <td className="text-muted" style={{ fontSize: 11 }}>{e.operator_id || '—'}</td>
                      <td className="font-monospace text-muted" style={{ fontSize: 10 }}>{e.subject_id?.slice(0, 8) ?? '—'}</td>
                      <td className="text-muted" style={{ fontSize: 11, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {JSON.stringify(e.payload).slice(0, 80)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
