import { useState, useEffect, useCallback } from 'react';
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

interface ErrorsTabProps {
  onErrorCountChange?: (count: number) => void;
  entityFilter?: { type: string; id: string; name: string } | null;
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

/** Map entity selection to API filter params */
function entityToParams(entity: ErrorsTabProps['entityFilter']): Record<string, string> {
  if (!entity) return {};
  const t = entity.type.toLowerCase();
  if (t === 'campaign' || t === 'campaigns') return { campaign_id: entity.id };
  return {};
}

export default function ErrorsTab({ onErrorCountChange, entityFilter }: ErrorsTabProps) {
  const [errors, setErrors] = useState<CampaignErrorRecord[]>([]);
  const [governanceAlerts, setGovernanceAlerts] = useState<GovernanceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedErrorId, setSelectedErrorId] = useState<string | null>(null);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [selectedAlertId, setSelectedAlertId] = useState<number | null>(null);

  const filterKey = entityFilter ? `${entityFilter.type}:${entityFilter.id}` : 'global';

  const isCampaignFilter = entityFilter && (entityFilter.type.toLowerCase() === 'campaign' || entityFilter.type.toLowerCase() === 'campaigns');

  const fetchData = useCallback(async () => {
    try {
      // Campaign errors only apply when unfiltered or filtered by campaigns
      const shouldFetchCampaignErrors = !entityFilter || isCampaignFilter;
      const errParams: Record<string, any> = { resolved: 'false', limit: 50, ...entityToParams(entityFilter) };

      const promises: Promise<any>[] = [
        shouldFetchCampaignErrors
          ? api.get('/api/admin/ai-ops/errors', { params: errParams })
          : Promise.resolve(null),
        api.get('/api/admin/governance/alerts'),
      ];

      const [errRes, alertRes] = await Promise.allSettled(promises);

      if (errRes.status === 'fulfilled' && errRes.value) {
        setErrors(errRes.value.data.items || []);
      } else {
        setErrors([]);
      }

      let totalErrors = 0;
      if (alertRes.status === 'fulfilled') {
        let alerts = alertRes.value.data.alerts || [];
        // Client-side filter governance alerts by entity if applicable
        if (entityFilter) {
          const t = entityFilter.type.toLowerCase();
          alerts = alerts.filter((a: GovernanceAlert) => {
            if (t === 'agent' || t === 'ai agents' || t === 'ai_agents') {
              return a.entity_type === 'agent' || a.details?.agent_name;
            }
            if (t === 'campaign' || t === 'campaigns') {
              return a.entity_type === 'campaign';
            }
            if (t === 'department') {
              return true; // show all alerts for departments
            }
            return a.entity_type === t;
          });
        }
        setGovernanceAlerts(alerts);
        totalErrors += alerts.length;
      }

      if (errRes.status === 'fulfilled' && errRes.value) {
        totalErrors += errRes.value.data.total || 0;
      }
      onErrorCountChange?.(totalErrors);
    } catch { /* ignore */ }
    setLoading(false);
  }, [filterKey, onErrorCountChange]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

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
          <div className="card-header bg-white fw-semibold d-flex align-items-center justify-content-between">
            <span>System Alerts <span className="text-muted fw-normal">({governanceAlerts.length})</span></span>
            {entityFilter && (
              <span className="badge bg-primary" style={{ fontSize: '0.68rem' }}>
                Filtered: {entityFilter.name}
              </span>
            )}
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
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {governanceAlerts.map((alert) => {
                    const severity = alert.details?.severity || 'info';
                    return (
                      <tr key={alert.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedAlertId(alert.id)}>
                        <td className="text-muted text-nowrap">{timeAgo(alert.created_at)}</td>
                        <td><span className="badge bg-secondary">{alert.event_type.replace(/_/g, ' ')}</span></td>
                        <td><span className={`badge bg-${SEVERITY_COLORS[severity] || 'secondary'}`}>{severity}</span></td>
                        <td>{alert.details?.message || '—'}</td>
                        <td>
                          <button className="btn btn-sm btn-outline-primary py-0 px-2" onClick={(e) => { e.stopPropagation(); setSelectedAlertId(alert.id); }}>
                            Detail
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Unresolved Errors — only show campaign errors table when relevant */}
      {(!entityFilter || isCampaignFilter) && (
      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white fw-semibold d-flex align-items-center justify-content-between">
          <span>Unresolved Errors <span className="text-muted fw-normal">({errors.length})</span></span>
          {entityFilter && governanceAlerts.length === 0 && (
            <span className="badge bg-primary" style={{ fontSize: '0.68rem' }}>
              Filtered: {entityFilter.name}
            </span>
          )}
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
                  <tr><td colSpan={6} className="text-muted text-center py-4">No unresolved errors{entityFilter ? ` for ${entityFilter.name}` : ''}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      )}

      {/* No campaign errors context for non-campaign entities */}
      {entityFilter && !isCampaignFilter && governanceAlerts.length === 0 && (
        <div className="card border-0 shadow-sm">
          <div className="card-body text-center text-muted py-5">
            No errors or alerts found for {entityFilter.name}
          </div>
        </div>
      )}

      {/* Error Detail Modal */}
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

      {/* Alert Detail Modal */}
      {selectedAlertId && (() => {
        const alert = governanceAlerts.find((a) => a.id === selectedAlertId);
        if (!alert) return null;
        return (
          <div className="modal show d-block" style={{ zIndex: 1060 }} role="dialog" aria-modal="true">
            <div className="modal-backdrop show" style={{ zIndex: -1 }} onClick={() => setSelectedAlertId(null)} />
            <div className="modal-dialog modal-lg modal-dialog-centered">
              <div className="modal-content border-0 shadow">
                <div className="modal-header" style={{ background: 'var(--color-primary)', color: '#fff' }}>
                  <h6 className="modal-title mb-0">Alert Detail</h6>
                  <button className="btn-close btn-close-white" onClick={() => setSelectedAlertId(null)} />
                </div>
                <div className="modal-body">
                  <div className="row g-3">
                    <div className="col-sm-6">
                      <label className="form-label small fw-medium text-muted">Event Type</label>
                      <div><span className="badge bg-secondary">{alert.event_type.replace(/_/g, ' ')}</span></div>
                    </div>
                    <div className="col-sm-6">
                      <label className="form-label small fw-medium text-muted">Severity</label>
                      <div><span className={`badge bg-${SEVERITY_COLORS[alert.details?.severity || 'info'] || 'secondary'}`}>{alert.details?.severity || 'info'}</span></div>
                    </div>
                    <div className="col-sm-6">
                      <label className="form-label small fw-medium text-muted">Source</label>
                      <div>{alert.source}</div>
                    </div>
                    <div className="col-sm-6">
                      <label className="form-label small fw-medium text-muted">Entity</label>
                      <div>{alert.entity_type}{alert.entity_id ? ` #${alert.entity_id}` : ''}</div>
                    </div>
                    <div className="col-12">
                      <label className="form-label small fw-medium text-muted">Message</label>
                      <div>{alert.details?.message || '—'}</div>
                    </div>
                    <div className="col-12">
                      <label className="form-label small fw-medium text-muted">Time</label>
                      <div>{new Date(alert.created_at).toLocaleString()}</div>
                    </div>
                    {alert.details?.agent_name && (
                      <div className="col-sm-6">
                        <label className="form-label small fw-medium text-muted">Agent</label>
                        <div>{alert.details.agent_name}</div>
                      </div>
                    )}
                    {alert.details?.error_count != null && (
                      <div className="col-sm-6">
                        <label className="form-label small fw-medium text-muted">Error Count</label>
                        <div><span className="badge bg-danger">{alert.details.error_count}</span></div>
                      </div>
                    )}
                    <div className="col-12">
                      <label className="form-label small fw-medium text-muted">Full Details</label>
                      <pre className="bg-light rounded p-2 small mb-0" style={{ maxHeight: 200, overflow: 'auto', fontSize: '0.72rem' }}>
                        {JSON.stringify(alert.details, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
