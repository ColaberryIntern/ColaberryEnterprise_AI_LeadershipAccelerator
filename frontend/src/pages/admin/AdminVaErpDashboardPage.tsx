import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import { PageHeader, SectionCard, StatusBadge } from '../../components/admin/shell';

interface VaErpDashboardData {
  email: string;
  role: string;
  role_label: string;
  role_description: string;
  permissions: string[];
}

const SCOPE_LABELS: Record<string, string> = {
  'dashboard:read': 'View dashboard',
  'approvals:read': 'View approvals',
  'approvals:write': 'Approve/reject transactions',
  'financial:read': 'View financial postings',
  'financial:write': 'Edit financial postings',
  'procurement:read': 'View procurement requests',
  'procurement:write': 'Edit procurement requests',
  'audit:read': 'View audit trail',
};

/**
 * VA ERP Integration Platform — role-specific dashboard. STORY-005.
 *
 * DEMO SCOPE ONLY. These screens live inside the Colaberry student/
 * Accelerator admin shell for the VA ERP proposal-rehearsal demo -- reusing
 * its existing login, layout, and audit-log infrastructure. This is the
 * fast, correct call for a rehearsal demo, but is NOT a shippable
 * production architecture: real VA financial/procurement data cannot share
 * an app or security boundary with the student platform. See the STORY-005
 * decision record for the full reasoning.
 */
export default function AdminVaErpDashboardPage() {
  const [data, setData] = useState<VaErpDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.get('/api/admin/va-erp/dashboard')
      .then(res => {
        if (!cancelled) setData(res.data);
      })
      .catch(err => {
        if (!cancelled) setError(err.response?.data?.error || 'Failed to load VA ERP dashboard');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="va-erp-dashboard">
      <PageHeader
        title="VA ERP Integration Platform"
        subtitle="Proposal rehearsal demo — not a production system"
        icon="government-line"
      />

      <div className="alert alert-warning py-2" role="note">
        <strong>Demo scope only.</strong> This dashboard runs inside the Colaberry Accelerator
        admin shell for the VA ERP Integration proposal rehearsal. It is not a shippable
        production architecture — real VA financial/procurement data would require its own
        app and security boundary, separate from the student platform.
      </div>

      {loading && <p>Loading…</p>}
      {error && (
        <div className="alert alert-danger py-2" role="alert">{error}</div>
      )}

      {data && (
        <div className="va-erp-dashboard__grid">
          <SectionCard title="Your access" icon="user-line">
            <p><strong>{data.email}</strong></p>
            <p>
              <StatusBadge label={data.role_label} tone="info" />
            </p>
            <p style={{ color: 'var(--text-muted)' }}>{data.role_description}</p>
          </SectionCard>

          <SectionCard title="Permitted actions" icon="shield-check-line">
            <ul className="va-erp-dashboard__permission-list">
              {data.permissions.map(scope => (
                <li key={scope}>{SCOPE_LABELS[scope] ?? scope}</li>
              ))}
            </ul>
          </SectionCard>
        </div>
      )}

      <style>{`
        .va-erp-dashboard__grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 1rem;
        }
        .va-erp-dashboard__permission-list {
          margin: 0;
          padding-left: 1.25rem;
        }
        .va-erp-dashboard__permission-list li {
          margin: 0.25rem 0;
        }
        @media (max-width: 576px) {
          .va-erp-dashboard__grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
