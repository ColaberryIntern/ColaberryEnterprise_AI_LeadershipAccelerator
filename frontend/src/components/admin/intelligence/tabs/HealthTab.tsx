import { useState, useEffect, useCallback } from 'react';
import api from '../../../../utils/api';
import CampaignTimelineModal from '../../../../pages/admin/ai-settings/CampaignTimelineModal';
import OrchestrationHealthSection from '../../../../pages/admin/ai-settings/OrchestrationHealthSection';

interface HealthRecord {
  id: string;
  campaign_id: string;
  health_score: number;
  status: string;
  lead_count: number;
  active_lead_count: number;
  sent_count: number;
  error_count: number;
  components: Record<string, { ok: boolean; error?: string }>;
  metrics: Record<string, number>;
  last_scan_at: string | null;
  campaign?: { name: string; status: string; type: string };
}

interface HealthTabProps {
  entityFilter?: { type: string; id: string; name: string } | null;
}

const HEALTH_COLORS: Record<string, string> = {
  healthy: 'success',
  degraded: 'warning',
  critical: 'danger',
  unknown: 'secondary',
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

export default function HealthTab({ entityFilter }: HealthTabProps) {
  const [health, setHealth] = useState<HealthRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanLoading, setScanLoading] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [selectedComponent, setSelectedComponent] = useState<{ campaignName: string; key: string; ok: boolean; error?: string } | null>(null);

  const filterKey = entityFilter ? `${entityFilter.type}:${entityFilter.id}` : 'global';

  const fetchHealth = useCallback(async () => {
    try {
      const { data } = await api.get('/api/admin/ai-ops/health');
      // Client-side filter by entity if applicable
      let filtered = data as HealthRecord[];
      if (entityFilter) {
        const t = entityFilter.type.toLowerCase();
        if (t === 'campaign' || t === 'campaigns') {
          filtered = filtered.filter((h) => h.campaign_id === entityFilter.id);
        }
        // For leads/students — show campaigns that have related leads
        // (all campaigns involve leads, so show campaigns with active leads)
        if (t === 'leads' || t === 'lead') {
          filtered = filtered.filter((h) => h.active_lead_count > 0);
        }
      }
      setHealth(filtered);
    } catch { /* ignore */ }
    setLoading(false);
  }, [filterKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setLoading(true);
    fetchHealth();
  }, [fetchHealth]);

  const handleScan = async () => {
    setScanLoading(true);
    try {
      await api.post('/api/admin/ai-ops/discover');
      await api.post('/api/admin/ai-ops/health/scan');
      await fetchHealth();
    } catch { /* ignore */ }
    setScanLoading(false);
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border spinner-border-sm text-primary" role="status">
          <span className="visually-hidden">Loading health data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div className="d-flex align-items-center gap-2">
          <h6 className="mb-0 fw-semibold">Campaign Health Monitor</h6>
          {entityFilter && (
            <span className="badge bg-primary" style={{ fontSize: '0.68rem' }}>
              Filtered: {entityFilter.name}
            </span>
          )}
        </div>
        <button className="btn btn-sm btn-primary" onClick={handleScan} disabled={scanLoading}>
          {scanLoading ? 'Scanning...' : 'Run Health Scan'}
        </button>
      </div>

      {health.length === 0 ? (
        <div className="card border-0 shadow-sm">
          <div className="card-body text-center text-muted py-5">
            {entityFilter
              ? `No health data for ${entityFilter.name}. Click "Run Health Scan" to scan.`
              : 'No health data. Click "Run Health Scan" to scan all active campaigns.'}
          </div>
        </div>
      ) : (
        <div className="row g-3">
          {health.map((h) => (
            <div key={h.id} className="col-md-6 col-lg-4">
              <div
                className="card border-0 shadow-sm h-100"
                style={{ cursor: 'pointer' }}
                onClick={() => setSelectedCampaignId(h.campaign_id)}
              >
                <div className="card-body">
                  <div className="d-flex justify-content-between align-items-start mb-2">
                    <h6 className="fw-semibold mb-0" style={{ fontSize: '0.9rem' }}>
                      {h.campaign?.name || h.campaign_id.substring(0, 8)}
                    </h6>
                    <span className={`badge bg-${HEALTH_COLORS[h.status]}`}>{h.health_score}/100</span>
                  </div>
                  <div className="progress mb-3" style={{ height: 6 }}>
                    <div className={`progress-bar bg-${HEALTH_COLORS[h.status]}`} style={{ width: `${h.health_score}%` }} />
                  </div>
                  <div className="row g-2 small">
                    <div className="col-6"><span className="text-muted">Leads:</span> <strong>{h.active_lead_count}/{h.lead_count}</strong></div>
                    <div className="col-6"><span className="text-muted">Sent (24h):</span> <strong>{h.sent_count}</strong></div>
                    <div className="col-6"><span className="text-muted">Open Rate:</span> <strong>{h.metrics?.open_rate ?? 0}%</strong></div>
                    <div className="col-6"><span className="text-muted">Reply Rate:</span> <strong>{h.metrics?.reply_rate ?? 0}%</strong></div>
                  </div>
                  {h.components && Object.keys(h.components).length > 0 && (
                    <div className="mt-2 pt-2 border-top">
                      <div className="d-flex flex-wrap gap-1">
                        {Object.entries(h.components).map(([key, val]) => (
                          <span
                            key={key}
                            className={`badge bg-${val.ok ? 'success' : 'danger'}`}
                            title={val.error || 'OK'}
                            role="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedComponent({ campaignName: h.campaign?.name || h.campaign_id, key, ok: val.ok, error: val.error });
                            }}
                          >
                            {key}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {h.error_count > 0 && (
                    <div className="mt-2"><span className="badge bg-danger">{h.error_count} error(s)</span></div>
                  )}
                  <div className="d-flex justify-content-between align-items-center mt-2">
                    <span className="text-muted" style={{ fontSize: '0.75rem' }}>Last scan: {timeAgo(h.last_scan_at)}</span>
                    <span className="text-primary small">View Timeline</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <hr className="my-4" />
      <OrchestrationHealthSection />

      {/* Campaign Timeline Drill-Through */}
      {selectedCampaignId && (
        <CampaignTimelineModal campaignId={selectedCampaignId} onClose={() => setSelectedCampaignId(null)} />
      )}

      {/* Component Detail Drill-Through */}
      {selectedComponent && (
        <div className="modal show d-block" style={{ zIndex: 1060 }} role="dialog" aria-modal="true">
          <div className="modal-backdrop show" style={{ zIndex: -1 }} onClick={() => setSelectedComponent(null)} />
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow">
              <div className="modal-header" style={{ background: 'var(--color-primary)', color: '#fff' }}>
                <h6 className="modal-title mb-0">Component: {selectedComponent.key}</h6>
                <button className="btn-close btn-close-white" onClick={() => setSelectedComponent(null)} />
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label small fw-medium text-muted">Campaign</label>
                  <div className="fw-semibold">{selectedComponent.campaignName}</div>
                </div>
                <div className="mb-3">
                  <label className="form-label small fw-medium text-muted">Status</label>
                  <div>
                    <span className={`badge bg-${selectedComponent.ok ? 'success' : 'danger'}`}>
                      {selectedComponent.ok ? 'Healthy' : 'Error'}
                    </span>
                  </div>
                </div>
                {selectedComponent.error && (
                  <div>
                    <label className="form-label small fw-medium text-muted">Error Details</label>
                    <pre className="bg-light rounded p-2 small mb-0" style={{ whiteSpace: 'pre-wrap', fontSize: '0.72rem' }}>
                      {selectedComponent.error}
                    </pre>
                  </div>
                )}
                {!selectedComponent.error && selectedComponent.ok && (
                  <div className="text-muted">This component is operating normally. No issues detected.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
