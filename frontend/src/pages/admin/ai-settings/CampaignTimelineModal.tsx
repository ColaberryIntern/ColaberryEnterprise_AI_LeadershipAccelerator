import React, { useState, useEffect } from 'react';
import api from '../../../utils/api';

interface TimelineEntry {
  type: 'activity' | 'error' | 'event';
  timestamp: string;
  data: any;
}

interface TimelineData {
  campaign_id: string;
  campaign_name: string;
  timeline: TimelineEntry[];
}

const TYPE_COLORS: Record<string, string> = {
  activity: 'primary',
  error: 'danger',
  event: 'info',
};

const RESULT_COLORS: Record<string, string> = {
  success: 'success',
  failed: 'danger',
  skipped: 'secondary',
  pending: 'warning',
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function getEntryLabel(entry: TimelineEntry): string {
  switch (entry.type) {
    case 'activity':
      return entry.data.action || 'Activity';
    case 'error':
      return entry.data.error_message || 'Error';
    case 'event':
      return entry.data.event_type || 'Event';
    default:
      return 'Unknown';
  }
}

function getEntrySource(entry: TimelineEntry): string {
  switch (entry.type) {
    case 'activity':
      return entry.data.agent?.agent_name || 'Agent';
    case 'error':
      return entry.data.component || 'System';
    case 'event':
      return entry.data.source || 'System';
    default:
      return '';
  }
}

export default function CampaignTimelineModal({
  campaignId,
  onClose,
}: {
  campaignId: string;
  onClose: () => void;
}) {
  const [timeline, setTimeline] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedEntry, setExpandedEntry] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/api/admin/ai-ops/campaigns/${campaignId}/timeline`);
        setTimeline(data);
      } catch (err) {
        console.error('Failed to fetch campaign timeline:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [campaignId]);

  return (
    <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} role="dialog" aria-modal="true">
      <div className="modal-dialog modal-lg modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title fw-bold">
              Campaign Timeline
              {timeline && <span className="fw-normal text-muted ms-2">— {timeline.campaign_name}</span>}
            </h5>
            <button type="button" className="btn-close" onClick={onClose} aria-label="Close" />
          </div>
          <div className="modal-body">
            {loading ? (
              <div className="text-center py-5">
                <div className="spinner-border spinner-border-sm text-primary" role="status">
                  <span className="visually-hidden">Loading...</span>
                </div>
              </div>
            ) : !timeline || timeline.timeline.length === 0 ? (
              <p className="text-muted">No timeline data found for this campaign.</p>
            ) : (
              <div className="position-relative" style={{ paddingLeft: 30 }}>
                {/* Vertical line */}
                <div
                  className="position-absolute"
                  style={{
                    left: 11,
                    top: 8,
                    bottom: 8,
                    width: 2,
                    backgroundColor: 'var(--color-border, #e2e8f0)',
                  }}
                />

                {timeline.timeline.map((entry, i) => {
                  const dotColor = entry.type === 'error' ? '#e53e3e' : entry.type === 'activity' ? '#2b6cb0' : '#38a169';

                  return (
                    <div key={i} className="position-relative mb-3">
                      {/* Dot */}
                      <div
                        className="position-absolute rounded-circle"
                        style={{
                          left: -24,
                          top: 6,
                          width: 12,
                          height: 12,
                          backgroundColor: dotColor,
                          border: '2px solid white',
                          boxShadow: `0 0 0 1px ${dotColor}`,
                        }}
                      />

                      {/* Entry Card */}
                      <div
                        className="card border-0 shadow-sm"
                        style={{ cursor: 'pointer' }}
                        onClick={() => setExpandedEntry(expandedEntry === i ? null : i)}
                      >
                        <div className="card-body py-2 px-3">
                          <div className="d-flex justify-content-between align-items-center">
                            <div className="d-flex gap-2 align-items-center">
                              <span className={`badge bg-${TYPE_COLORS[entry.type]}`} style={{ fontSize: '0.65rem' }}>
                                {entry.type}
                              </span>
                              <span className="small fw-medium text-truncate" style={{ maxWidth: 300 }}>
                                {getEntryLabel(entry)}
                              </span>
                            </div>
                            <div className="d-flex gap-2 align-items-center small text-muted">
                              <span>{getEntrySource(entry)}</span>
                              {entry.type === 'activity' && entry.data.result && (
                                <span className={`badge bg-${RESULT_COLORS[entry.data.result] || 'secondary'}`} style={{ fontSize: '0.65rem' }}>
                                  {entry.data.result}
                                </span>
                              )}
                              <span>{timeAgo(entry.timestamp)}</span>
                            </div>
                          </div>

                          {/* Expanded */}
                          {expandedEntry === i && (
                            <div className="mt-2 pt-2 border-top small">
                              <div className="text-muted mb-1">
                                {new Date(entry.timestamp).toLocaleString()}
                              </div>
                              {entry.type === 'activity' && entry.data.reason && (
                                <div className="mb-1"><strong>Reason:</strong> {entry.data.reason}</div>
                              )}
                              {entry.type === 'error' && entry.data.severity && (
                                <div className="mb-1">
                                  <strong>Severity:</strong>{' '}
                                  <span className={`badge bg-${entry.data.severity === 'critical' ? 'danger' : entry.data.severity === 'error' ? 'danger' : 'warning'}`}>
                                    {entry.data.severity}
                                  </span>
                                </div>
                              )}
                              {entry.type === 'event' && entry.data.payload && (
                                <pre className="small bg-light p-2 rounded mb-0" style={{ maxHeight: 120, overflow: 'auto' }}>
                                  {JSON.stringify(entry.data.payload, null, 2)}
                                </pre>
                              )}
                              {entry.type === 'activity' && entry.data.details && (
                                <pre className="small bg-light p-2 rounded mb-0" style={{ maxHeight: 120, overflow: 'auto' }}>
                                  {JSON.stringify(entry.data.details, null, 2)}
                                </pre>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
