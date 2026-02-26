import React, { useState, useEffect } from 'react';
import api from '../../utils/api';

interface ActivityEntry {
  id: string;
  type: string;
  subject: string;
  body: string;
  metadata: Record<string, any> | null;
  adminUser?: { id: string; email: string };
  created_at: string;
}

interface ActivityTimelineProps {
  leadId: number;
  refreshKey?: number;
}

const TYPE_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  note: { icon: 'bi-pencil', color: '#6c757d', label: 'Note' },
  email_sent: { icon: 'bi-envelope', color: '#0d6efd', label: 'Email Sent' },
  email_opened: { icon: 'bi-envelope-open', color: '#198754', label: 'Email Opened' },
  call: { icon: 'bi-telephone', color: '#6f42c1', label: 'Call' },
  meeting: { icon: 'bi-calendar-event', color: '#fd7e14', label: 'Meeting' },
  status_change: { icon: 'bi-arrow-right-circle', color: '#0dcaf0', label: 'Stage Change' },
  score_change: { icon: 'bi-graph-up', color: '#dc3545', label: 'Score Change' },
  sms: { icon: 'bi-chat-dots', color: '#20c997', label: 'SMS' },
  system: { icon: 'bi-gear', color: '#adb5bd', label: 'System' },
};

function ActivityTimeline({ leadId, refreshKey }: ActivityTimelineProps) {
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActivities();
  }, [leadId, refreshKey]); // eslint-disable-line

  const fetchActivities = async () => {
    try {
      const res = await api.get(`/api/admin/leads/${leadId}/activities`);
      setActivities(res.data.activities);
    } catch (err) {
      console.error('Failed to fetch activities:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getConfig = (type: string) => TYPE_CONFIG[type] || TYPE_CONFIG.system;

  if (loading) {
    return <div className="text-center py-3"><div className="spinner-border spinner-border-sm text-primary" role="status"><span className="visually-hidden">Loading...</span></div></div>;
  }

  if (activities.length === 0) {
    return <p className="text-muted small mb-0">No activity yet</p>;
  }

  return (
    <div className="position-relative" style={{ paddingLeft: '24px' }}>
      {/* Vertical line */}
      <div
        className="position-absolute"
        style={{
          left: '8px',
          top: '4px',
          bottom: '4px',
          width: '2px',
          backgroundColor: '#dee2e6',
        }}
      />

      {activities.map((activity) => {
        const config = getConfig(activity.type);
        return (
          <div key={activity.id} className="mb-3 position-relative">
            {/* Dot */}
            <div
              className="position-absolute rounded-circle"
              style={{
                left: '-20px',
                top: '4px',
                width: '12px',
                height: '12px',
                backgroundColor: config.color,
                border: '2px solid white',
                boxShadow: '0 0 0 1px ' + config.color,
              }}
            />

            <div className="d-flex justify-content-between align-items-start">
              <div>
                <span
                  className="badge me-2"
                  style={{ backgroundColor: config.color, fontSize: '0.7rem' }}
                >
                  {config.label}
                </span>
                {activity.subject && (
                  <span className="small fw-medium">{activity.subject}</span>
                )}
              </div>
              <span className="text-muted" style={{ fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                {formatDate(activity.created_at)}
              </span>
            </div>

            {activity.body && (
              <div className="text-muted small mt-1" style={{ whiteSpace: 'pre-wrap' }}>
                {activity.body}
              </div>
            )}

            {activity.adminUser && (
              <div className="text-muted" style={{ fontSize: '0.7rem' }}>
                by {activity.adminUser.email}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default ActivityTimeline;
