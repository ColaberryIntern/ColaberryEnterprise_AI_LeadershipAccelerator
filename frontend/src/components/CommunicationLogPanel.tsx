import React, { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import EmailPreview from './EmailPreview';

interface CommLog {
  id: string;
  lead_id: number | null;
  campaign_id: string | null;
  simulation_id: string | null;
  simulation_step_id: string | null;
  channel: string;
  direction: string;
  delivery_mode: string;
  status: string;
  to_address: string | null;
  from_address: string | null;
  subject: string | null;
  body: string | null;
  provider: string | null;
  provider_message_id: string | null;
  provider_response: Record<string, any> | null;
  error_message: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
}

const CHANNEL_ICONS: Record<string, string> = {
  email: '\u2709',
  sms: '\ud83d\udcf1',
  voice: '\ud83d\udcde',
};

const MODE_BADGES: Record<string, { label: string; color: string }> = {
  live: { label: 'LIVE', color: 'success' },
  test_redirect: { label: 'TEST', color: 'warning' },
  simulated: { label: 'SIM', color: 'secondary' },
};

const STATUS_COLORS: Record<string, string> = {
  sent: 'success',
  delivered: 'success',
  pending: 'secondary',
  failed: 'danger',
  skipped: 'warning',
  bounced: 'danger',
  simulated: 'secondary',
};

function timeStr(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function CommunicationLogPanel({ simulationId }: { simulationId: string }) {
  const [comms, setComms] = useState<CommLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [directionFilter, setDirectionFilter] = useState<string>('all');

  const fetchComms = useCallback(async () => {
    try {
      const { data } = await api.get(`/api/admin/simulations/${simulationId}/comms`);
      setComms(data);
    } catch (err) {
      console.error('Failed to fetch comms:', err);
    } finally {
      setLoading(false);
    }
  }, [simulationId]);

  useEffect(() => {
    fetchComms();
    const interval = setInterval(fetchComms, 5000);
    return () => clearInterval(interval);
  }, [fetchComms]);

  const filtered = comms.filter((c) => {
    if (channelFilter !== 'all' && c.channel !== channelFilter) return false;
    if (directionFilter !== 'all' && c.direction !== directionFilter) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="text-center py-3">
        <div className="spinner-border spinner-border-sm text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Filters */}
      <div className="d-flex gap-2 mb-2 flex-wrap align-items-center">
        <select
          className="form-select form-select-sm"
          style={{ maxWidth: 120 }}
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value)}
        >
          <option value="all">All Channels</option>
          <option value="email">Email</option>
          <option value="sms">SMS</option>
          <option value="voice">Voice</option>
        </select>
        <select
          className="form-select form-select-sm"
          style={{ maxWidth: 120 }}
          value={directionFilter}
          onChange={(e) => setDirectionFilter(e.target.value)}
        >
          <option value="all">All</option>
          <option value="outbound">Outbound</option>
          <option value="inbound">Inbound</option>
        </select>
        <span className="small text-muted">{filtered.length} message{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {filtered.length === 0 ? (
        <p className="text-muted small mb-0">No communications logged yet.</p>
      ) : (
        <div className="d-flex flex-column gap-1">
          {filtered.map((c) => {
            const isExpanded = expandedId === c.id;
            const modeBadge = MODE_BADGES[c.delivery_mode] || { label: c.delivery_mode, color: 'secondary' };
            const statusColor = STATUS_COLORS[c.status] || 'secondary';
            const dirArrow = c.direction === 'inbound' ? '\u2193' : '\u2191';
            const transcript = c.provider_response?.transcript;

            return (
              <div
                key={c.id}
                className="card border-0 shadow-sm"
                style={{ cursor: 'pointer' }}
                onClick={() => setExpandedId(isExpanded ? null : c.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setExpandedId(isExpanded ? null : c.id)}
              >
                <div className="card-body py-2 px-3">
                  <div className="d-flex justify-content-between align-items-center">
                    <div className="d-flex gap-2 align-items-center">
                      <span style={{ fontSize: '0.9rem' }}>{CHANNEL_ICONS[c.channel] || ''}</span>
                      <span className="small fw-bold" style={{ color: c.direction === 'inbound' ? 'var(--color-primary-light)' : 'var(--color-text)' }}>
                        {dirArrow}
                      </span>
                      <span className="badge bg-secondary" style={{ fontSize: '0.55rem', textTransform: 'uppercase' }}>
                        {c.channel}
                      </span>
                      {c.to_address && (
                        <span className="small text-muted text-truncate" style={{ maxWidth: 160 }}>
                          {c.direction === 'inbound' ? `from: ${c.from_address || '?'}` : `to: ${c.to_address}`}
                        </span>
                      )}
                      {c.subject && (
                        <span className="small text-truncate" style={{ maxWidth: 200 }}>
                          {c.subject}
                        </span>
                      )}
                    </div>
                    <div className="d-flex gap-1 align-items-center">
                      <span className={`badge bg-${modeBadge.color}`} style={{ fontSize: '0.55rem' }}>
                        {modeBadge.label}
                      </span>
                      <span className={`badge bg-${statusColor}`} style={{ fontSize: '0.55rem' }}>
                        {c.status}
                      </span>
                      {c.provider && (
                        <span className="badge bg-light text-dark" style={{ fontSize: '0.55rem' }}>
                          {c.provider}
                        </span>
                      )}
                      <span className="small text-muted" style={{ fontSize: '0.65rem' }}>
                        {timeStr(c.created_at)}
                      </span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-2 pt-2 border-top" onClick={(e) => e.stopPropagation()}>
                      {c.channel === 'email' && c.body ? (
                        <div className="mb-2">
                          <EmailPreview
                            from={c.from_address || undefined}
                            to={c.to_address || undefined}
                            subject={c.subject || undefined}
                            body={c.body}
                            date={c.created_at}
                            messageId={c.provider_message_id || undefined}
                          />
                        </div>
                      ) : c.body ? (
                        <div className="mb-2">
                          <div className="small fw-medium text-muted mb-1">Body</div>
                          <div
                            className="small bg-light p-2 rounded"
                            style={{ maxHeight: 200, overflowY: 'auto', whiteSpace: 'pre-wrap' }}
                          >
                            {c.body.replace(/<[^>]+>/g, '')}
                          </div>
                        </div>
                      ) : null}

                      {transcript && (
                        <div className="mb-2">
                          <div className="small fw-medium text-muted mb-1">Transcript</div>
                          <div
                            className="small bg-light p-2 rounded"
                            style={{ maxHeight: 200, overflowY: 'auto', whiteSpace: 'pre-wrap' }}
                          >
                            {typeof transcript === 'string' ? transcript : JSON.stringify(transcript, null, 2)}
                          </div>
                        </div>
                      )}

                      {c.error_message && (
                        <div className="mb-2">
                          <div className="small fw-medium text-danger mb-1">Error</div>
                          <div className="small text-danger">{c.error_message}</div>
                        </div>
                      )}

                      {c.provider_response && (
                        <details className="mb-1">
                          <summary className="small text-muted" style={{ cursor: 'pointer' }}>Provider Response</summary>
                          <pre className="small bg-light p-2 rounded mt-1 mb-0" style={{ maxHeight: 150, overflowY: 'auto', fontSize: '0.7rem' }}>
                            {JSON.stringify(c.provider_response, null, 2)}
                          </pre>
                        </details>
                      )}

                      <div className="d-flex gap-2 small text-muted mt-1">
                        {c.provider_message_id && <span>ID: {c.provider_message_id}</span>}
                        {c.metadata?.step_index != null && <span>Step #{c.metadata.step_index + 1}</span>}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
