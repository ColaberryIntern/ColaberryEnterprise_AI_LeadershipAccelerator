import React, { useEffect, useState } from 'react';
import LeadDetailModal from './LeadDetailModal';

interface Props {
  campaignId: string;
  headers: Record<string, string>;
}

interface ActivityEntry {
  type: string;
  timestamp: string;
  lead_id: number;
  lead_name: string;
  channel?: string;
  subject?: string;
  action?: string;
  outcome?: string;
  status?: string;
  ai_generated?: boolean;
}

const CHANNEL_ICONS: Record<string, string> = {
  email: 'bi-envelope',
  voice: 'bi-telephone',
  sms: 'bi-chat-dots',
  linkedin: 'bi-linkedin',
};

const OUTCOME_COLORS: Record<string, string> = {
  opened: 'info',
  clicked: 'primary',
  replied: 'success',
  answered: 'success',
  bounced: 'danger',
  unsubscribed: 'danger',
  booked_meeting: 'warning',
  converted: 'success',
  sent: 'secondary',
  declined: 'danger',
  no_response: 'secondary',
  voicemail: 'secondary',
};

export default function CRMTab({ campaignId, headers }: Props) {
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterChannel, setFilterChannel] = useState('all');
  const [filterOutcome, setFilterOutcome] = useState('all');
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);
  const [selectedLeadName, setSelectedLeadName] = useState('');

  useEffect(() => {
    fetchActivities();
  }, [campaignId]);

  const fetchActivities = async () => {
    setLoading(true);
    try {
      // Fetch all leads and build activity from their timelines
      const res = await fetch(`/api/admin/campaigns/${campaignId}/lead-details`, { headers });
      const data = await res.json();
      const enrichedLeads = data.leads || [];

      // Build a consolidated activity list from enriched lead data
      const allActivities: ActivityEntry[] = [];
      for (const cl of enrichedLeads) {
        try {
          const tlRes = await fetch(
            `/api/admin/campaigns/${campaignId}/leads/${cl.lead_id}/timeline`,
            { headers }
          );
          const tlData = await tlRes.json();
          for (const entry of (tlData.timeline || [])) {
            allActivities.push({
              ...entry,
              lead_id: cl.lead_id,
              lead_name: cl.lead?.name || `Lead #${cl.lead_id}`,
            });
          }
        } catch {
          // Skip individual lead errors
        }
      }

      // Sort by timestamp desc
      allActivities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setActivities(allActivities);
    } catch (err) {
      console.error('Failed to fetch CRM activities:', err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = activities.filter((a) => {
    const matchesChannel = filterChannel === 'all' || a.channel === filterChannel;
    const matchesOutcome = filterOutcome === 'all' || a.outcome === filterOutcome || a.type === filterOutcome;
    return matchesChannel && matchesOutcome;
  });

  const totalTouchpoints = activities.filter((a) => a.type === 'action').length;
  const totalOutcomes = activities.filter((a) => a.type === 'outcome').length;
  const responseRate = totalTouchpoints > 0
    ? ((totalOutcomes / totalTouchpoints) * 100).toFixed(1) + '%'
    : '0%';

  const relTime = (d: string) => {
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  const uniqueChannels = [...new Set(activities.map((a) => a.channel).filter(Boolean))];
  const uniqueOutcomes = [...new Set(activities.map((a) => a.outcome).filter(Boolean))];

  return (
    <>
      {/* Aggregation Cards */}
      <div className="row g-3 mb-4">
        <div className="col-md-4">
          <div className="card border-0 shadow-sm">
            <div className="card-body text-center p-3">
              <div className="fs-4 fw-bold">{totalTouchpoints}</div>
              <div className="text-muted small">Total Touchpoints</div>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card border-0 shadow-sm">
            <div className="card-body text-center p-3">
              <div className="fs-4 fw-bold text-success">{responseRate}</div>
              <div className="text-muted small">Response Rate</div>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card border-0 shadow-sm">
            <div className="card-body text-center p-3">
              <div className="fs-4 fw-bold text-primary">{activities.length}</div>
              <div className="text-muted small">Total Events</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="d-flex gap-2 mb-3">
        <select
          className="form-select form-select-sm"
          style={{ maxWidth: 150 }}
          value={filterChannel}
          onChange={(e) => setFilterChannel(e.target.value)}
        >
          <option value="all">All Channels</option>
          {uniqueChannels.map((ch) => (
            <option key={ch} value={ch}>{ch}</option>
          ))}
        </select>
        <select
          className="form-select form-select-sm"
          style={{ maxWidth: 180 }}
          value={filterOutcome}
          onChange={(e) => setFilterOutcome(e.target.value)}
        >
          <option value="all">All Types</option>
          <option value="action">Actions</option>
          <option value="outcome">Outcomes</option>
          {uniqueOutcomes.map((o) => (
            <option key={o} value={o}>{o?.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <button className="btn btn-outline-secondary btn-sm ms-auto" onClick={fetchActivities} disabled={loading}>
          Refresh
        </button>
      </div>

      {/* Activity Log */}
      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <div className="text-muted mt-2 small">Loading campaign activity...</div>
        </div>
      ) : (
        <div className="card border-0 shadow-sm">
          <div className="card-body p-0">
            {filtered.length === 0 ? (
              <div className="text-center py-4 text-muted">No activity recorded yet.</div>
            ) : (
              <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                {filtered.map((entry, i) => (
                  <div key={i} className="d-flex align-items-start gap-3 p-3 border-bottom">
                    <div className="text-center" style={{ minWidth: 36 }}>
                      <i className={`bi ${CHANNEL_ICONS[entry.channel || ''] || 'bi-circle'} fs-5 text-muted`} />
                    </div>
                    <div className="flex-grow-1">
                      <div className="d-flex justify-content-between">
                        <div>
                          <span
                            className="fw-medium small text-primary"
                            style={{ cursor: 'pointer' }}
                            onClick={() => {
                              setSelectedLeadId(entry.lead_id);
                              setSelectedLeadName(entry.lead_name);
                            }}
                          >
                            {entry.lead_name}
                          </span>
                          <span className="text-muted small ms-2">
                            {entry.subject || entry.action || entry.outcome?.replace(/_/g, ' ') || entry.type}
                          </span>
                          {entry.ai_generated && (
                            <span className="badge bg-primary bg-opacity-10 text-primary ms-2" style={{ fontSize: '0.6rem' }}>AI</span>
                          )}
                        </div>
                        <span className="text-muted" style={{ fontSize: '0.7rem' }}>{relTime(entry.timestamp)}</span>
                      </div>
                      <div className="d-flex gap-2 mt-1">
                        {entry.outcome && (
                          <span className={`badge bg-${OUTCOME_COLORS[entry.outcome] || 'secondary'} bg-opacity-10 text-${OUTCOME_COLORS[entry.outcome] || 'secondary'}`} style={{ fontSize: '0.6rem' }}>
                            {entry.outcome.replace(/_/g, ' ')}
                          </span>
                        )}
                        {entry.channel && (
                          <span className="text-muted" style={{ fontSize: '0.7rem' }}>{entry.channel}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lead Modal */}
      {selectedLeadId && (
        <LeadDetailModal
          campaignId={campaignId}
          leadId={selectedLeadId}
          leadName={selectedLeadName}
          headers={headers}
          onClose={() => setSelectedLeadId(null)}
        />
      )}
    </>
  );
}
