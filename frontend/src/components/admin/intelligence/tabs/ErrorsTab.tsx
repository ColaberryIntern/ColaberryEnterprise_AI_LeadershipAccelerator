import React, { useState, useEffect, useCallback } from 'react';
import api from '../../../../utils/api';
import ErrorDetailModal from '../../../../pages/admin/ai-settings/ErrorDetailModal';
import ExecutionTraceModal from '../../../../pages/admin/ai-settings/ExecutionTraceModal';

interface CampaignErrorRecord {
  id: string;
  campaign_id: string;
  component: string;
  severity: string;
  error_message: string;
  context: Record<string, any> | null;
  resolved: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  campaign?: { name: string; status: string };
}

interface GovernanceAlert {
  id: number;
  source: string;
  event_type: string;
  entity_type: string;
  entity_id: number | null;
  details: { severity?: string; agent_name?: string; error_count?: number; message?: string };
  created_at: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  info: 'info',
  warning: 'warning',
  error: 'danger',
  critical: 'danger',
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function ErrorsTab({ onErrorCountChange }: { onErrorCountChange?: (count: number) => void }) {
  const [errors, setErrors] = useState<CampaignErrorRecord[]>([]);
  const [governanceAlerts, setGovernanceAlerts] = useState<GovernanceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedErrorId, setSelectedErrorId] = useState<string | null>(null);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [errRes, alertRes] = await Promise.allSettled([
        api.get('/api/admin/ai-ops/errors', { params: { resolved: 'false', limit: 50 } }),
        api.get('/api/admin/governance/alerts'),
      ]);
      if (errRes.status === 'fulfilled') {
        setErrors(errRes.value.data.items);
        onErrorCountChange?.(errRes.value.data.total);
      }
      if (alertRes.status === 'fulfilled') {
        setGovernanceAlerts(alertRes.value.data.alerts || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [onErrorCountChange]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleResolve = async (id: string) => {
    try {
      await api.patch(`/api/admin/ai-ops/errors/${id}`, { resolved: true });
      fetchData();
    } catch { /* ignore */ }
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border spinner-border-sm text-primary" role="status">
          <span className="visually-hidden">Loading errors...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3">
      {/* Governance System Alerts */}
      {governanceAlerts.length > 0 && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white fw-semibold">
            System Alerts <span className="text-muted fw-normal">({governanceAlerts.length})</span>
          </div>
          <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table table-hover mb-0 small">
                <thead className="table-light">
                  <tr>
                    <th>Time</th>
                    <th>Type</th>
                    <th>Severity</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {governanceAlerts.map((alert) => {
                    const severity = alert.details?.severity || 'info';
                    return (
                      <tr key={alert.id}>
                        <td className="text-muted text-nowrap">{timeAgo(alert.created_at)}</td>
                        <td><span className="badge bg-secondary">{alert.event_type.replace(/_/g, ' ')}</span></td>
                        <td><span className={`badge bg-${SEVERITY_COLORS[severity] || 'secondary'}`}>{severity}</span></td>
                        <td>{alert.details?.message || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Unresolved Errors */}
      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white fw-semibold">
          Unresolved Errors <span className="text-muted fw-normal">({errors.length})</span>
        </div>
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="table table-hover mb-0 small">
              <thead className="table-light">
                <tr>
                  <th>Campaign</th>
                  <th>Component</th>
                  <th>Severity</th>
                  <th>Error</th>
                  <th>Time</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((e) => (
                  <tr key={e.id}>
                    <td className="fw-medium">{e.campaign?.name || e.campaign_id.substring(0, 8)}</td>
                    <td><span className="badge bg-secondary">{e.component}</span></td>
                    <td><span className={`badge bg-${SEVERITY_COLORS[e.severity] || 'secondary'}`}>{e.severity}</span></td>
                    <td style={{ maxWidth: 300 }}>
                      <span className="text-truncate d-inline-block" style={{ maxWidth: 300 }} title={e.error_message}>
                        {e.error_message}
                      </span>
                    </td>
                    <td className="text-muted">{timeAgo(e.created_at)}</td>
                    <td>
                      <div className="d-flex gap-1">
                        <button className="btn btn-sm btn-outline-primary py-0 px-2" onClick={() => setSelectedErrorId(e.id)}>Detail</button>
                        <button className="btn btn-sm btn-outline-success py-0 px-2" onClick={() => handleResolve(e.id)}>Resolve</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {errors.length === 0 && (
                  <tr><td colSpan={6} className="text-muted text-center py-4">No unresolved errors</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selectedErrorId && (
        <ErrorDetailModal
          errorId={selectedErrorId}
          onClose={() => setSelectedErrorId(null)}
          onResolve={(id) => { handleResolve(id); setSelectedErrorId(null); }}
          onViewTrace={(traceId) => { setSelectedErrorId(null); setSelectedTraceId(traceId); }}
        />
      )}
      {selectedTraceId && (
        <ExecutionTraceModal traceId={selectedTraceId} onClose={() => setSelectedTraceId(null)} />
      )}
    </div>
  );
}
