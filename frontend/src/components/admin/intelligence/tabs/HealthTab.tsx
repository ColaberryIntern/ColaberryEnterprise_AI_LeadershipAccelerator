import React, { useState, useEffect, useCallback } from 'react';
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

export default function HealthTab() {
  const [health, setHealth] = useState<HealthRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanLoading, setScanLoading] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      const { data } = await api.get('/api/admin/ai-ops/health');
      setHealth(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchHealth(); }, [fetchHealth]);

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
        <h6 className="mb-0 fw-semibold">Campaign Health Monitor</h6>
        <button className="btn btn-sm btn-primary" onClick={handleScan} disabled={scanLoading}>
          {scanLoading ? 'Scanning...' : 'Run Health Scan'}
        </button>
      </div>

      {health.length === 0 ? (
        <div className="card border-0 shadow-sm">
          <div className="card-body text-center text-muted py-5">
            No health data. Click "Run Health Scan" to scan all active campaigns.
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
                          <span key={key} className={`badge bg-${val.ok ? 'success' : 'danger'}`} title={val.error || 'OK'}>{key}</span>
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

      {selectedCampaignId && (
        <CampaignTimelineModal campaignId={selectedCampaignId} onClose={() => setSelectedCampaignId(null)} />
      )}
    </div>
  );
}
