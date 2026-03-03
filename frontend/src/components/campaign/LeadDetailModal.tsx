import React, { useEffect, useState } from 'react';
import TemperatureBadge from '../TemperatureBadge';
import Modal from '../ui/Modal';

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
  const [enrollment, setEnrollment] = useState<any>(null);

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
        setTimeline(Array.isArray(tlData.timeline) ? tlData.timeline : []);
        setTempHistory(Array.isArray(thData.history) ? thData.history : []);
        setEnrollment(tlData.enrollment || null);
        setLeadDetail(ldData);
      } catch (err) {
        console.error('Failed to fetch lead detail:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [campaignId, leadId]);

  const relTime = (d: string | null | undefined) => {
    if (!d) return '—';
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  const fmtDate = (d: string | null | undefined) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString();
  };

  const touchpoints = timeline.filter(t => t.type === 'action').length;
  const responses = timeline.filter(t => t.type === 'outcome').length;
  const lastContact = timeline.length > 0 ? timeline[0]?.timestamp : null;

  const STATUS_COLORS: Record<string, string> = {
    active: 'success',
    completed: 'info',
    paused: 'warning',
    enrolled: 'primary',
    removed: 'danger',
    dnc: 'danger',
  };

  return (
    <Modal
      show={true}
      onClose={onClose}
      title={leadName}
      size="lg"
      footer={<button className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>}
    >
      {loading ? (
        <div className="text-center py-4">
          <div className="spinner-border spinner-border-sm text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      ) : (
        <>
          {/* Lead Header */}
          {leadDetail && (
            <div className="d-flex gap-2 align-items-center mb-3">
              <span className="text-muted small">{leadDetail.company || leadDetail.lead?.company}</span>
              <TemperatureBadge temperature={leadDetail.lead_temperature || leadDetail.lead?.lead_temperature} size="md" />
              <span className={`badge bg-${leadDetail.status === 'qualified' ? 'success' : 'secondary'}`}>
                {leadDetail.status || 'new'}
              </span>
            </div>
          )}

          {/* KPI Row */}
          <div className="row g-2 mb-4">
            <div className="col">
              <div className="border rounded p-2 text-center">
                <div className="fw-bold">
                  <TemperatureBadge temperature={leadDetail?.lead_temperature || leadDetail?.lead?.lead_temperature} />
                </div>
                <div className="text-muted" style={{ fontSize: '0.7rem' }}>Temperature</div>
              </div>
            </div>
            <div className="col">
              <div className="border rounded p-2 text-center">
                <div className="fw-bold">{leadDetail?.lead_score || leadDetail?.lead?.lead_score || 0}</div>
                <div className="text-muted" style={{ fontSize: '0.7rem' }}>Lead Score</div>
              </div>
            </div>
            <div className="col">
              <div className="border rounded p-2 text-center">
                <div className="fw-bold">{touchpoints}</div>
                <div className="text-muted" style={{ fontSize: '0.7rem' }}>Touchpoints</div>
              </div>
            </div>
            <div className="col">
              <div className="border rounded p-2 text-center">
                <div className="fw-bold">{responses}</div>
                <div className="text-muted" style={{ fontSize: '0.7rem' }}>Responses</div>
              </div>
            </div>
            <div className="col">
              <div className="border rounded p-2 text-center">
                <div className="fw-bold small">
                  {enrollment?.current_step_index !== undefined && enrollment?.total_steps
                    ? `${(enrollment.current_step_index || 0) + 1}/${enrollment.total_steps}`
                    : '—'}
                </div>
                <div className="text-muted" style={{ fontSize: '0.7rem' }}>Step</div>
              </div>
            </div>
            <div className="col">
              <div className="border rounded p-2 text-center">
                <div className="fw-bold small">{relTime(lastContact)}</div>
                <div className="text-muted" style={{ fontSize: '0.7rem' }}>Last Contact</div>
              </div>
            </div>
          </div>

          {/* Two-Column Layout */}
          <div className="row g-3">
            {/* Left Column — Communication Timeline */}
            <div className="col-md-8">
              <h6 className="fw-semibold mb-3">Communication Timeline</h6>
              {timeline.length === 0 ? (
                <p className="text-muted small">No communication recorded yet.</p>
              ) : (
                <div className="border rounded mb-4" style={{ maxHeight: '350px', overflowY: 'auto' }}>
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
            </div>

            {/* Right Column — Enrollment Details */}
            <div className="col-md-4">
              <h6 className="fw-semibold mb-3">Enrollment Details</h6>
              {enrollment ? (
                <div className="card border-0 bg-light">
                  <div className="card-body p-3">
                    <div className="mb-3">
                      <div className="text-muted small">Status</div>
                      <span className={`badge bg-${STATUS_COLORS[enrollment.status] || 'secondary'}`}>
                        {enrollment.status}
                      </span>
                    </div>
                    <div className="mb-3">
                      <div className="text-muted small">Enrolled</div>
                      <div className="fw-medium small">{fmtDate(enrollment.enrolled_at)}</div>
                    </div>
                    <div className="mb-3">
                      <div className="text-muted small">Step Progress</div>
                      <div className="fw-medium small">
                        {enrollment.current_step_index !== undefined && enrollment.total_steps
                          ? `Step ${(enrollment.current_step_index || 0) + 1} of ${enrollment.total_steps}`
                          : '—'}
                      </div>
                      {enrollment.total_steps > 0 && (
                        <div className="progress mt-1" style={{ height: 4 }}>
                          <div
                            className="progress-bar bg-primary"
                            style={{ width: `${((enrollment.current_step_index || 0) + 1) / enrollment.total_steps * 100}%` }}
                          />
                        </div>
                      )}
                    </div>
                    <div className="mb-3">
                      <div className="text-muted small">Next Action</div>
                      <div className="fw-medium small">{fmtDate(enrollment.next_action_at)}</div>
                    </div>
                    <div className="mb-3">
                      <div className="text-muted small">Last Activity</div>
                      <div className="fw-medium small">{relTime(enrollment.last_activity_at)}</div>
                    </div>
                    {enrollment.outcome && (
                      <div className="mb-3">
                        <div className="text-muted small">Outcome</div>
                        <div className="fw-medium small text-capitalize">{enrollment.outcome.replace(/_/g, ' ')}</div>
                      </div>
                    )}
                    <div className="row g-2">
                      <div className="col-6">
                        <div className="text-muted small">Touchpoints</div>
                        <div className="fw-bold">{enrollment.touchpoint_count || touchpoints}</div>
                      </div>
                      <div className="col-6">
                        <div className="text-muted small">Responses</div>
                        <div className="fw-bold">{enrollment.response_count || responses}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-muted small">No enrollment data available.</p>
              )}

              {/* Contact Info */}
              {leadDetail && (
                <div className="card border-0 bg-light mt-3">
                  <div className="card-body p-3">
                    <h6 className="fw-semibold small mb-2">Contact Info</h6>
                    <div className="mb-2">
                      <div className="text-muted small">Email</div>
                      <div className="small">{leadDetail.email || leadDetail.lead?.email || '—'}</div>
                    </div>
                    <div className="mb-2">
                      <div className="text-muted small">Company</div>
                      <div className="small">{leadDetail.company || leadDetail.lead?.company || '—'}</div>
                    </div>
                    <div className="mb-2">
                      <div className="text-muted small">Title</div>
                      <div className="small">{leadDetail.title || leadDetail.lead?.title || '—'}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
