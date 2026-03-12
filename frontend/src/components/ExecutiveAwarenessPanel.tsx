import React, { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ExecutiveEvent {
  id: string;
  title: string;
  description?: string;
  severity: number;
  status: string;
  created_at: string;
  metadata?: {
    executive_category?: string;
    executive_severity?: string;
    cluster_count?: number;
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function severityBadge(severity: number) {
  if (severity >= 5) return { label: 'Critical', cls: 'bg-danger' };
  if (severity >= 4) return { label: 'High', cls: 'bg-warning text-dark' };
  if (severity >= 2) return { label: 'Important', cls: 'bg-info' };
  return { label: 'Info', cls: 'bg-secondary' };
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function ExecutiveAwarenessPanel({ open, onClose }: Props) {
  const [events, setEvents] = useState<ExecutiveEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [acknowledging, setAcknowledging] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await api.get('/api/admin/executive-awareness/events', {
        params: { status: 'new', limit: 50 },
      });
      setEvents(res.data.events || []);
    } catch (err) {
      console.error('[ExecPanel] Failed to fetch events:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setLoading(true);
      fetchEvents();
    }
  }, [open, fetchEvents]);

  const handleAcknowledge = async (id: string) => {
    try {
      setAcknowledging(id);
      await api.post(`/api/admin/executive-awareness/acknowledge/${id}`);
      setEvents((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      console.error('[ExecPanel] Acknowledge failed:', err);
    } finally {
      setAcknowledging(null);
    }
  };

  const handleAcknowledgeAll = async () => {
    try {
      setAcknowledging('all');
      await api.post('/api/admin/executive-awareness/acknowledge-all');
      setEvents([]);
    } catch (err) {
      console.error('[ExecPanel] Acknowledge all failed:', err);
    } finally {
      setAcknowledging(null);
    }
  };

  if (!open) return null;

  // Sort: critical first, then by date
  const sorted = [...events].sort((a, b) => {
    if (b.severity !== a.severity) return b.severity - a.severity;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <>
      {/* Backdrop */}
      <div
        className="executive-panel-backdrop"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.3)',
          zIndex: 1049,
        }}
      />

      {/* Panel */}
      <div
        className="executive-awareness-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Executive Awareness Events"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: 420,
          maxWidth: '100vw',
          height: '100vh',
          background: 'var(--color-bg, #fff)',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
          zIndex: 1050,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div className="d-flex justify-content-between align-items-center p-3 border-bottom">
          <div>
            <h6 className="mb-0 fw-bold" style={{ color: 'var(--color-primary)' }}>
              Executive Events
            </h6>
            <span className="text-muted" style={{ fontSize: '0.75rem' }}>
              {events.length} unread event{events.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="d-flex gap-2">
            {events.length > 0 && (
              <button
                className="btn btn-outline-secondary btn-sm"
                onClick={handleAcknowledgeAll}
                disabled={acknowledging === 'all'}
              >
                {acknowledging === 'all' ? 'Clearing...' : 'Acknowledge All'}
              </button>
            )}
            <button
              className="btn-close"
              onClick={onClose}
              aria-label="Close panel"
            />
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem' }}>
          {loading ? (
            <div className="text-center py-5">
              <div className="spinner-border spinner-border-sm" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
            </div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-5 text-muted small">
              No unread executive events.
            </div>
          ) : (
            sorted.map((evt) => {
              const badge = severityBadge(evt.severity);
              const category = evt.metadata?.executive_category || 'system';
              const clusterCount = evt.metadata?.cluster_count || 1;

              return (
                <div
                  key={evt.id}
                  className="card border-0 shadow-sm mb-2"
                  style={{ borderLeft: `3px solid ${evt.severity >= 5 ? '#e53e3e' : evt.severity >= 4 ? '#dd6b20' : evt.severity >= 2 ? '#3182ce' : '#a0aec0'}` }}
                >
                  <div className="card-body py-2 px-3">
                    <div className="d-flex justify-content-between align-items-start mb-1">
                      <div className="d-flex gap-1 align-items-center flex-wrap">
                        <span className={`badge ${badge.cls}`} style={{ fontSize: '0.65rem' }}>
                          {badge.label}
                        </span>
                        <span className="badge bg-light text-dark" style={{ fontSize: '0.65rem' }}>
                          {category}
                        </span>
                        {clusterCount > 1 && (
                          <span className="badge bg-light text-muted" style={{ fontSize: '0.6rem' }}>
                            x{clusterCount}
                          </span>
                        )}
                      </div>
                      <span className="text-muted" style={{ fontSize: '0.65rem', whiteSpace: 'nowrap' }}>
                        {relativeTime(evt.created_at)}
                      </span>
                    </div>
                    <div className="small fw-medium mb-1">{evt.title}</div>
                    {evt.description && (
                      <div className="text-muted" style={{ fontSize: '0.72rem', lineHeight: 1.3 }}>
                        {evt.description.slice(0, 200)}
                      </div>
                    )}
                    <div className="mt-1 text-end">
                      <button
                        className="btn btn-outline-secondary btn-sm"
                        style={{ fontSize: '0.65rem', padding: '2px 8px' }}
                        onClick={() => handleAcknowledge(evt.id)}
                        disabled={acknowledging === evt.id}
                      >
                        {acknowledging === evt.id ? '...' : 'Acknowledge'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="border-top p-2 text-center">
          <a href="/admin/governance" className="text-muted small text-decoration-none">
            Governance Settings
          </a>
          <span className="text-muted mx-2">|</span>
          <a href="/admin/intelligence" className="text-muted small text-decoration-none">
            Intelligence OS
          </a>
        </div>
      </div>
    </>
  );
}
