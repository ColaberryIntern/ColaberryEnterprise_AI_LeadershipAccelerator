import React, { useMemo } from 'react';
import { PageHeader, StatCard, StatusBadge, SectionCard } from '../../components/admin/shell';
import { TrustSignal } from '../../components/admin/shell/trust';
import { useGovernanceAudit } from '../../hooks/useGovernanceAudit';

/**
 * Phase 12 — admin-only governance policy page. Surfaces the governance
 * audit log + recent override history across all projects. Full policy
 * editing UI (automation_mode toggle, confidence_floor sliders, retention
 * windows) sits as a Phase 12.1 follow-up; policy editing surfaces are
 * project-scoped. This page is the admin lens onto governance health,
 * rebranded onto the shared admin shell.
 */
export default function AdminGovernancePolicyPage() {
  const audit = useGovernanceAudit({ autoFetch: true, limit: 100 });

  // KPI roll-up derived from the loaded audit entries.
  const summary = useMemo(() => {
    const total = audit.entries.length;
    const kinds = new Set(audit.entries.map((e) => e.kind)).size;
    const operators = new Set(
      audit.entries.map((e) => e.operator_id).filter(Boolean) as string[],
    ).size;
    return { total, kinds, operators };
  }, [audit.entries]);

  // Per-page trust signal (Basecamp todo 10027085963) — governance policy is an
  // audit/visibility surface, so the signal reflects that the entries shown are
  // the live record of governance actions across projects.
  const trust: TrustSignal = useMemo(
    () => ({
      level: 'live',
      source: 'governance policies',
      updatedAt: new Date().toISOString(),
      summary:
        'Live governance audit log — automation thresholds, confidence floors, and override history across all projects.',
      href: '/admin/trust',
      pillars: [
        {
          name: 'Audit Source',
          status: 'live',
          evidence: [{ label: 'Backed by', value: 'governance audit log' }],
        },
      ],
    }),
    [],
  );

  return (
    <div className="container-fluid py-4">
      <PageHeader
        title="Governance Policies"
        icon="shield-star-line"
        subtitle="Per-project automation thresholds, confidence floors, and audit visibility. Policy editing surfaces are project-scoped — switch to a project to edit its policy."
        breadcrumb={[
          { label: 'Admin', to: '/admin/dashboard' },
          { label: 'Governance Policies' },
        ]}
        trust={trust}
        actions={
          <button
            className="btn btn-outline-primary btn-sm"
            onClick={() => void audit.refresh()}
            disabled={audit.loading}
          >
            <i className="ri-refresh-line" aria-hidden="true" /> Refresh
          </button>
        }
      >
        <div className="row g-3">
          <div className="col-6 col-lg-4">
            <StatCard
              label="Audit Entries"
              value={summary.total}
              icon="file-list-3-line"
              tone="info"
            />
          </div>
          <div className="col-6 col-lg-4">
            <StatCard
              label="Event Kinds"
              value={summary.kinds}
              icon="git-branch-line"
              tone="primary"
            />
          </div>
          <div className="col-6 col-lg-4">
            <StatCard
              label="Operators"
              value={summary.operators}
              icon="user-settings-line"
              tone="neutral"
            />
          </div>
        </div>
      </PageHeader>

      <SectionCard
        title="Recent governance audit"
        icon="history-line"
        padded={false}
        actions={
          <span className="text-muted small">{audit.entries.length} entries</span>
        }
      >
        {audit.loading && <div className="p-3 text-muted">Loading…</div>}
        {audit.error && (
          <div className="p-3" style={{ color: 'var(--status-danger)', fontSize: 12 }}>
            {audit.error}
          </div>
        )}
        {!audit.loading && audit.entries.length === 0 && (
          <div className="p-3 text-muted" style={{ fontSize: 12 }}>
            No audit entries yet.
          </div>
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
                {audit.entries.map((e) => (
                  <tr key={e.id}>
                    <td className="text-muted" style={{ fontSize: 11 }}>
                      {new Date(e.recorded_at).toLocaleString()}
                    </td>
                    <td>
                      <StatusBadge label={e.kind} />
                    </td>
                    <td className="text-muted" style={{ fontSize: 11 }}>
                      {e.operator_id || '—'}
                    </td>
                    <td className="font-monospace text-muted" style={{ fontSize: 10 }}>
                      {e.subject_id?.slice(0, 8) ?? '—'}
                    </td>
                    <td
                      className="text-muted"
                      style={{
                        fontSize: 11,
                        maxWidth: 280,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {JSON.stringify(e.payload).slice(0, 80)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
