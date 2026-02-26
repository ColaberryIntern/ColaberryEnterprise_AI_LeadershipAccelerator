import React, { useEffect, useState } from 'react';
import TemperatureBadge from '../TemperatureBadge';

interface Props {
  campaignId: string;
  leadId: number;
  leadName: string;
  headers: Record<string, string>;
  onClose: () => void;
}

interface TimelineEntry {
  type: 'action' | 'outcome' | 'activity';
  timestamp: string;
  channel?: string;
  subject?: string;
  action?: string;
  outcome?: string;
  status?: string;
  ai_generated?: boolean;
  description?: string;
}

interface TempHistoryEntry {
  id: string;
  previous_temperature: string;
  new_temperature: string;
  trigger_type: string;
  trigger_detail: string;
  created_at: string;
}

const CHANNEL_ICONS: Record<string, string> = {
  email: 'bi-envelope',
  voice: 'bi-telephone',
  sms: 'bi-chat-dots',
  linkedin: 'bi-linkedin',
};

export default function LeadDetailModal({ campaignId, leadId, leadName, headers, onClose }: Props) {
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [tempHistory, setTempHistory] = useState<TempHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [leadDetail, setLeadDetail] = useState<any>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [tlRes, thRes, ldRes] = await Promise.all([
          fetch(`/api/admin/campaigns/${campaignId}/leads/${leadId}/timeline`, { headers }),
          fetch(`/api/admin/leads/${leadId}/temperature-history`, { headers }),
          fetch(`/api/admin/leads/${leadId}`, { headers }),
        ]);
        const tlData = await tlRes.json();
        const thData = await thRes.json();
        const ldData = await ldRes.json();
        setTimeline(tlData.timeline || []);
        setTempHistory(thData.history || []);
        setLeadDetail(ldData);
      } catch (err) {
        console.error('Failed to fetch lead detail:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [campaignId, leadId]);

  const relTime = (d: string) => {
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  return (
    <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="modal-dialog modal-lg modal-dialog-scrollable" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content">
          <div className="modal-header">
            <div>
              <h5 className="modal-title mb-1">{leadName}</h5>
              <div className="d-flex gap-2 align-items-center">
                {leadDetail && (
                  <>
                    <span className="text-muted small">{leadDetail.company}</span>
                    <TemperatureBadge temperature={leadDetail.lead_temperature} size="md" />
                    <span className={`badge bg-${leadDetail.status === 'qualified' ? 'success' : 'secondary'}`}>
                      {leadDetail.status || 'new'}
                    </span>
                  </>
                )}
              </div>
            </div>
            <button className="btn-close" onClick={onClose} />
          </div>
          <div className="modal-body">
            {loading ? (
              <div className="text-center py-4">
                <div className="spinner-border spinner-border-sm text-primary" />
              </div>
            ) : (
              <>
                {/* KPI Row */}
                {leadDetail && (
                  <div className="row g-2 mb-4">
                    <div className="col">
                      <div className="border rounded p-2 text-center">
                        <div className="fw-bold">{leadDetail.lead_score || 0}</div>
                        <div className="text-muted" style={{ fontSize: '0.7rem' }}>Lead Score</div>
                      </div>
                    </div>
                    <div className="col">
                      <div className="border rounded p-2 text-center">
                        <div className="fw-bold">{timeline.filter(t => t.type === 'action').length}</div>
                        <div className="text-muted" style={{ fontSize: '0.7rem' }}>Touchpoints</div>
                      </div>
                    </div>
                    <div className="col">
                      <div className="border rounded p-2 text-center">
                        <div className="fw-bold">{timeline.filter(t => t.type === 'outcome').length}</div>
                        <div className="text-muted" style={{ fontSize: '0.7rem' }}>Responses</div>
                      </div>
                    </div>
                    <div className="col">
                      <div className="border rounded p-2 text-center">
                        <div className="fw-bold">{leadDetail.email}</div>
                        <div className="text-muted" style={{ fontSize: '0.7rem' }}>Email</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Communication Timeline */}
                <h6 className="fw-semibold mb-3">Communication Timeline</h6>
                {timeline.length === 0 ? (
                  <p className="text-muted small">No communication recorded yet.</p>
                ) : (
                  <div className="border rounded mb-4" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {timeline.map((entry, i) => (
                      <div key={i} className="d-flex align-items-start gap-3 p-2 border-bottom">
                        <div className="text-center" style={{ minWidth: 36 }}>
                          <i className={`bi ${CHANNEL_ICONS[entry.channel || ''] || 'bi-circle'} fs-5 text-muted`} />
                        </div>
                        <div className="flex-grow-1">
                          <div className="d-flex justify-content-between align-items-center">
                            <div>
                              <span className="fw-medium small">
                                {entry.type === 'action' ? entry.subject || entry.action || 'Action' :
                                 entry.type === 'outcome' ? `${(entry.outcome || '').replace(/_/g, ' ')}` :
                                 entry.description || 'Activity'}
                              </span>
                              {entry.ai_generated && (
                                <span className="badge bg-primary bg-opacity-10 text-primary ms-2" style={{ fontSize: '0.65rem' }}>AI</span>
                              )}
                            </div>
                            <span className="text-muted" style={{ fontSize: '0.7rem' }}>
                              {relTime(entry.timestamp)}
                            </span>
                          </div>
                          <div className="d-flex gap-2 mt-1">
                            <span className={`badge bg-${
                              entry.type === 'outcome' ? 'info' :
                              entry.type === 'action' ? 'primary' : 'secondary'
                            } bg-opacity-10 text-${
                              entry.type === 'outcome' ? 'info' :
                              entry.type === 'action' ? 'primary' : 'secondary'
                            }`} style={{ fontSize: '0.65rem' }}>
                              {entry.type}
                            </span>
                            {entry.channel && (
                              <span className="text-muted" style={{ fontSize: '0.7rem' }}>{entry.channel}</span>
                            )}
                            {entry.status && (
                              <span className="text-muted" style={{ fontSize: '0.7rem' }}>{entry.status}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Temperature History */}
                <h6 className="fw-semibold mb-3">Temperature History</h6>
                {tempHistory.length === 0 ? (
                  <p className="text-muted small">No temperature changes recorded.</p>
                ) : (
                  <div className="border rounded" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                    {tempHistory.map((entry) => (
                      <div key={entry.id} className="d-flex align-items-center gap-3 p-2 border-bottom">
                        <div className="d-flex align-items-center gap-1">
                          <TemperatureBadge temperature={entry.previous_temperature} />
                          <span className="text-muted small mx-1">&rarr;</span>
                          <TemperatureBadge temperature={entry.new_temperature} />
                        </div>
                        <div className="flex-grow-1">
                          <span className="text-muted small text-capitalize">
                            {entry.trigger_type.replace(/_/g, ' ')} &middot; {entry.trigger_detail?.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <span className="text-muted" style={{ fontSize: '0.7rem' }}>
                          {relTime(entry.created_at)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
