import React, { useEffect, useState } from 'react';
import alumniApi from '../../utils/alumniApi';

interface TimelineEvent {
  id: string;
  event_type: string;
  event_timestamp: string;
  metadata: Record<string, any> | null;
}

interface ReferralTimelineProps {
  referralId: string;
  onClose: () => void;
}

const EVENT_LABELS: Record<string, { label: string; color: string }> = {
  referral_submitted: { label: 'Referral Submitted', color: 'secondary' },
  lead_created: { label: 'Lead Created', color: 'info' },
  campaign_assigned: { label: 'Campaign Assigned', color: 'info' },
  email_sent: { label: 'Email Sent', color: 'primary' },
  email_opened: { label: 'Email Opened', color: 'success' },
  link_clicked: { label: 'Link Clicked', color: 'success' },
  meeting_scheduled: { label: 'Meeting Scheduled', color: 'warning' },
  enrollment_completed: { label: 'Enrollment Completed', color: 'success' },
  commission_earned: { label: 'Commission Earned!', color: 'success' },
};

function ReferralTimeline({ referralId, onClose }: ReferralTimelineProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    alumniApi.get(`/api/referrals/${referralId}/timeline`)
      .then((res) => { if (!cancelled) setEvents(res.data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [referralId]);

  return (
    <div className="card border-0 shadow-sm mt-3 mb-3">
      <div className="card-header bg-white d-flex justify-content-between align-items-center">
        <span className="fw-semibold small" style={{ color: 'var(--color-primary)' }}>Referral Activity</span>
        <button className="btn btn-sm btn-outline-secondary py-0 px-2" onClick={onClose}>Close</button>
      </div>
      <div className="card-body p-3">
        {loading ? (
          <div className="text-center py-3">
            <div className="spinner-border spinner-border-sm" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
          </div>
        ) : events.length === 0 ? (
          <p className="text-muted small mb-0">No activity yet.</p>
        ) : (
          <div className="timeline">
            {events.map((event) => {
              const config = EVENT_LABELS[event.event_type] || { label: event.event_type, color: 'secondary' };
              return (
                <div key={event.id} className="d-flex align-items-start mb-3">
                  <span className={`badge bg-${config.color} me-3`} style={{ minWidth: 10, height: 10, padding: 0, borderRadius: '50%', marginTop: 6 }}>&nbsp;</span>
                  <div>
                    <div className="small fw-medium">{config.label}</div>
                    <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                      {new Date(event.event_timestamp).toLocaleString()}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default ReferralTimeline;
