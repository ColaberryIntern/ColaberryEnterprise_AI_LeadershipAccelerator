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

/** Subtype overrides for system activities — keyed by metadata.activity_subtype */
const SUBTYPE_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  email_clicked: { icon: 'bi-cursor', color: '#0dcaf0', label: 'Email Click' },
  website_signal: { icon: 'bi-globe2', color: '#6f42c1', label: 'Website Activity' },
  voice_call: { icon: 'bi-telephone-outbound', color: '#6f42c1', label: 'Maya Call' },
  strategy_call_booked: { icon: 'bi-calendar-check', color: '#198754', label: 'Strategy Call Booked' },
  voicemail_fallback_sms: { icon: 'bi-chat-left-text', color: '#e67e22', label: 'Voicemail Follow-up SMS' },
  post_call_sms: { icon: 'bi-chat-left-text', color: '#20c997', label: 'Post-Call SMS' },
};

function ActivityTimeline({ leadId, refreshKey }: ActivityTimelineProps) {
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [emailModal, setEmailModal] = useState<{ subject: string; body: string; to: string; sentAt: string } | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [expandedTranscripts, setExpandedTranscripts] = useState<Set<string>>(new Set());

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
      timeZone: 'America/Chicago',
    });
  };

  const getConfig = (activity: ActivityEntry) => {
    const subtype = activity.metadata?.activity_subtype;
    if (subtype && SUBTYPE_CONFIG[subtype]) return SUBTYPE_CONFIG[subtype];
    return TYPE_CONFIG[activity.type] || TYPE_CONFIG.system;
  };

  const openEmailPreview = async (activity: ActivityEntry) => {
    const emailId = activity.metadata?.scheduled_email_id;
    if (!emailId) return;
    setEmailLoading(true);
    try {
      const res = await api.get(`/api/admin/scheduled-emails/${emailId}/content`);
      const email = res.data.email;
      setEmailModal({
        subject: email.subject || activity.subject || 'No Subject',
        body: email.body || '',
        to: email.to_email || '',
        sentAt: email.sent_at || activity.created_at,
      });
    } catch {
      // Fallback: show activity subject/body
      setEmailModal({
        subject: activity.subject || 'Email',
        body: activity.body || 'Email content not available.',
        to: '',
        sentAt: activity.created_at,
      });
    } finally {
      setEmailLoading(false);
    }
  };

  const toggleTranscript = (id: string) => {
    setExpandedTranscripts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return <div className="text-center py-3"><div className="spinner-border spinner-border-sm text-primary" role="status"><span className="visually-hidden">Loading...</span></div></div>;
  }

  if (activities.length === 0) {
    return <p className="text-muted small mb-0">No activity yet</p>;
  }

  const isEmailActivity = (a: ActivityEntry) =>
    a.type === 'email_sent' || a.type === 'email_opened' || a.metadata?.activity_subtype === 'email_clicked';
  const isVoiceCall = (a: ActivityEntry) =>
    a.metadata?.activity_subtype === 'voice_call' || (a.type === 'call' && a.metadata?.call_id);
  const isFollowUpSms = (a: ActivityEntry) =>
    a.metadata?.activity_subtype === 'voicemail_fallback_sms' || a.metadata?.activity_subtype === 'post_call_sms';

  return (
    <>
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
          const config = getConfig(activity);
          const subtype = activity.metadata?.activity_subtype;
          const isWebsiteSignal = subtype === 'website_signal';
          const isEmailClick = subtype === 'email_clicked';
          const isCall = isVoiceCall(activity);
          const isEmail = isEmailActivity(activity);
          const hasEmailId = !!activity.metadata?.scheduled_email_id;
          const transcriptExpanded = expandedTranscripts.has(activity.id);

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
                    <i className={`bi ${config.icon} me-1`} />
                    {config.label}
                  </span>
                  {activity.subject && (
                    <span className="small fw-medium">{activity.subject}</span>
                  )}
                  {/* View Email button */}
                  {isEmail && hasEmailId && (
                    <button
                      className="btn btn-link btn-sm p-0 ms-2"
                      style={{ fontSize: '0.7rem' }}
                      onClick={() => openEmailPreview(activity)}
                      disabled={emailLoading}
                    >
                      <i className="bi bi-eye me-1" />View Email
                    </button>
                  )}
                </div>
                <span className="text-muted" style={{ fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                  {formatDate(activity.created_at)}
                </span>
              </div>

              {/* Voice call details */}
              {isCall && (
                <div className="mt-1 ms-1">
                  <div className="d-flex gap-2 align-items-center flex-wrap">
                    {activity.metadata?.disposition && (
                      <span className={`badge ${activity.metadata.disposition === 'voicemail' ? 'bg-warning text-dark' : 'bg-success'}`} style={{ fontSize: '0.65rem' }}>
                        {activity.metadata.disposition === 'voicemail' ? 'Voicemail' : activity.metadata.disposition}
                      </span>
                    )}
                    {activity.metadata?.duration && (
                      <span className="text-muted small">
                        <i className="bi bi-clock me-1" />
                        {Math.floor(activity.metadata.duration / 60)}m {activity.metadata.duration % 60}s
                      </span>
                    )}
                    {activity.metadata?.recording_url && (
                      <a
                        href={activity.metadata.recording_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-outline-secondary btn-sm py-0 px-1"
                        style={{ fontSize: '0.65rem' }}
                      >
                        <i className="bi bi-play-circle me-1" />Recording
                      </a>
                    )}
                    {activity.metadata?.has_transcript && activity.body && (
                      <button
                        className="btn btn-outline-secondary btn-sm py-0 px-1"
                        style={{ fontSize: '0.65rem' }}
                        onClick={() => toggleTranscript(activity.id)}
                      >
                        <i className={`bi ${transcriptExpanded ? 'bi-chevron-up' : 'bi-chevron-down'} me-1`} />
                        Transcript
                      </button>
                    )}
                  </div>
                  {/* Call summary — shown by default */}
                  {activity.metadata?.call_summary && (
                    <div className="mt-2 p-2 rounded small" style={{ backgroundColor: '#f8f9fa', borderLeft: '3px solid #6f42c1', fontSize: '0.8rem' }}>
                      <i className="bi bi-chat-square-text me-1 text-muted" />
                      {activity.metadata.call_summary}
                    </div>
                  )}
                  {transcriptExpanded && activity.body && (
                    <div
                      className="mt-2 p-2 bg-light rounded small"
                      style={{ whiteSpace: 'pre-wrap', maxHeight: '300px', overflowY: 'auto', fontSize: '0.8rem' }}
                    >
                      {activity.body}
                    </div>
                  )}
                </div>
              )}

              {/* Extra details for website signals */}
              {isWebsiteSignal && activity.metadata?.signal_type && (
                <div className="mt-1">
                  <span className="badge bg-light text-dark border me-1" style={{ fontSize: '0.65rem' }}>
                    {activity.metadata.signal_type.replace(/_/g, ' ')}
                  </span>
                  {activity.metadata.page_url && (
                    <span className="text-muted small">{activity.metadata.page_url}</span>
                  )}
                  {activity.metadata.depth_percent && (
                    <span className="text-muted small ms-1">({activity.metadata.depth_percent}% scrolled)</span>
                  )}
                </div>
              )}

              {/* Extra details for email clicks */}
              {isEmailClick && activity.metadata?.clicked_url && (
                <div className="text-muted small mt-1">
                  <i className="bi bi-link-45deg me-1" />
                  {activity.metadata.clicked_url}
                </div>
              )}

              {/* Strategy call meet link */}
              {activity.metadata?.activity_subtype === 'strategy_call_booked' && activity.metadata?.meet_link && (
                <div className="small mt-1">
                  <i className="bi bi-camera-video me-1 text-success" />
                  <a href={activity.metadata.meet_link} target="_blank" rel="noopener noreferrer" className="text-decoration-none">
                    Join Meeting
                  </a>
                </div>
              )}

              {/* Follow-up SMS body (expandable) */}
              {isFollowUpSms(activity) && activity.body && (
                <div className="mt-1">
                  <button
                    className="btn btn-outline-secondary btn-sm py-0 px-1"
                    style={{ fontSize: '0.65rem' }}
                    onClick={() => toggleTranscript(activity.id)}
                  >
                    <i className={`bi ${expandedTranscripts.has(activity.id) ? 'bi-chevron-up' : 'bi-chevron-down'} me-1`} />
                    View Message
                  </button>
                  {expandedTranscripts.has(activity.id) && (
                    <div className="mt-1 p-2 bg-light rounded small" style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem' }}>
                      {activity.body}
                    </div>
                  )}
                </div>
              )}

              {/* Generic body for non-special types */}
              {activity.body && !isEmailClick && !isWebsiteSignal && !isCall && !isFollowUpSms(activity) && activity.metadata?.activity_subtype !== 'strategy_call_booked' && (
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

      {/* Email Preview Modal */}
      {emailModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} role="dialog" aria-modal="true" onClick={() => setEmailModal(null)}>
          <div className="modal-dialog modal-lg modal-dialog-centered" onClick={e => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header">
                <div>
                  <h6 className="modal-title mb-0">{emailModal.subject}</h6>
                  <div className="text-muted small">
                    {emailModal.to && <span>To: {emailModal.to}</span>}
                    {emailModal.sentAt && <span className="ms-3">Sent: {formatDate(emailModal.sentAt)}</span>}
                  </div>
                </div>
                <button type="button" className="btn-close" onClick={() => setEmailModal(null)} />
              </div>
              <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                {emailModal.body.includes('<') ? (
                  <div dangerouslySetInnerHTML={{ __html: emailModal.body }} />
                ) : (
                  <div style={{ whiteSpace: 'pre-wrap' }}>{emailModal.body}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default ActivityTimeline;
