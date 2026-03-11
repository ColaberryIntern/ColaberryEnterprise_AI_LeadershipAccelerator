import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../../utils/api';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AgentDetail {
  agent: {
    id: string;
    agent_name: string;
    agent_type: string;
    status: string;
    category: string;
    trigger_type: string;
    schedule: string | null;
    description: string | null;
    enabled: boolean;
    run_count: number;
    error_count: number;
    avg_duration_ms: number | null;
    last_run_at: string | null;
    last_error: string | null;
    last_error_at: string | null;
    module: string | null;
    source_file: string | null;
    config: Record<string, any> | null;
    last_result: Record<string, any> | null;
    next_run_at: string | null;
    next_run_label: string | null;
  };
  recent_activity: Array<{
    id: string;
    action: string;
    result: string;
    confidence: number | null;
    duration_ms: number | null;
    trace_id: string | null;
    created_at: string;
    campaign?: { name: string; status: string };
  }>;
  actions_today: number;
  errors_today: number;
}

interface TraceStep {
  id: string;
  action: string;
  result: string;
  confidence: number | null;
  duration_ms: number | null;
  reason: string | null;
  details: Record<string, any> | null;
  created_at: string;
  agent?: { agent_name: string; agent_type: string; category: string };
  campaign?: { name: string; status: string };
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  idle: 'secondary',
  running: 'primary',
  paused: 'warning',
  error: 'danger',
};

const CATEGORY_COLORS: Record<string, string> = {
  outbound: 'primary',
  behavioral: 'info',
  maintenance: 'secondary',
  ai_ops: 'warning',
  accelerator: 'success',
};

const RESULT_COLORS: Record<string, string> = {
  success: 'success',
  failed: 'danger',
  skipped: 'secondary',
  pending: 'warning',
};

const DOT_COLORS: Record<string, string> = {
  success: '#38a169',
  failed: '#e53e3e',
  skipped: '#718096',
  pending: '#e0a800',
};

type DrawerTab = 'overview' | 'timeline' | 'errors';

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function formatDuration(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ─── Component ───────────────────────────────────────────────────────────────

interface AgentDetailDrawerProps {
  agentId: string | null;
  onClose: () => void;
}

export default function AgentDetailDrawer({ agentId, onClose }: AgentDetailDrawerProps) {
  const [detail, setDetail] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [controlLoading, setControlLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<DrawerTab>('overview');
  const [expandedTraceId, setExpandedTraceId] = useState<string | null>(null);
  const [traceSteps, setTraceSteps] = useState<TraceStep[]>([]);
  const [traceLoading, setTraceLoading] = useState(false);
  const [errors, setErrors] = useState<any[]>([]);
  const [errorsLoading, setErrorsLoading] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!agentId) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [agentId, onClose]);

  // Focus drawer on open
  useEffect(() => {
    if (agentId && drawerRef.current) {
      drawerRef.current.focus();
    }
  }, [agentId]);

  // Fetch agent detail
  useEffect(() => {
    if (!agentId) return;
    setLoading(true);
    setActiveTab('overview');
    setExpandedTraceId(null);
    (async () => {
      try {
        const { data } = await api.get(`/api/admin/ai-ops/registry/${agentId}`);
        setDetail(data);
      } catch (err) {
        console.error('Failed to fetch agent detail:', err);
        setDetail(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [agentId]);

  // Fetch errors when errors tab selected
  useEffect(() => {
    if (activeTab !== 'errors' || !agentId) return;
    setErrorsLoading(true);
    (async () => {
      try {
        const { data } = await api.get('/api/admin/ai-ops/errors', { params: { agent_id: agentId, limit: 50 } });
        setErrors(data.errors || []);
      } catch {
        setErrors([]);
      } finally {
        setErrorsLoading(false);
      }
    })();
  }, [activeTab, agentId]);

  const handleControl = useCallback(async (action: string) => {
    if (!agentId) return;
    setControlLoading(true);
    try {
      await api.post(`/api/admin/ai-ops/registry/${agentId}/control`, { action });
      const { data } = await api.get(`/api/admin/ai-ops/registry/${agentId}`);
      setDetail(data);
    } catch (err) {
      console.error('Failed to control agent:', err);
    } finally {
      setControlLoading(false);
    }
  }, [agentId]);

  const loadTrace = useCallback(async (traceId: string) => {
    if (expandedTraceId === traceId) {
      setExpandedTraceId(null);
      return;
    }
    setExpandedTraceId(traceId);
    setTraceLoading(true);
    try {
      const { data } = await api.get(`/api/admin/ai-ops/trace/${traceId}`);
      setTraceSteps(data.steps || []);
    } catch {
      setTraceSteps([]);
    } finally {
      setTraceLoading(false);
    }
  }, [expandedTraceId]);

  if (!agentId) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.2)',
          zIndex: 1040,
        }}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Agent Detail"
        tabIndex={-1}
        className="cory-overlay-slide"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: 480,
          maxWidth: '100vw',
          height: '100vh',
          zIndex: 1045,
          background: '#fff',
          borderLeft: '1px solid var(--color-border)',
          boxShadow: '-8px 0 30px rgba(0, 0, 0, 0.12)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          className="d-flex align-items-center justify-content-between px-3 py-2 border-bottom"
          style={{ flexShrink: 0, background: 'var(--color-bg-alt)' }}
        >
          <span className="fw-bold small">Agent Detail</span>
          <button className="btn btn-sm btn-outline-secondary" onClick={onClose} aria-label="Close drawer">
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="flex-grow-1" style={{ minHeight: 0, overflowY: 'auto' }}>
          {loading ? (
            <div className="text-center py-5">
              <div className="spinner-border spinner-border-sm text-primary" role="status">
                <span className="visually-hidden">Loading agent...</span>
              </div>
            </div>
          ) : !detail ? (
            <p className="text-muted p-3">Agent not found</p>
          ) : (
            <>
              {/* Agent Header */}
              <div className="px-3 pt-3 pb-2">
                <h6 className="fw-bold mb-1">{detail.agent.agent_name}</h6>
                <div className="d-flex gap-2 align-items-center flex-wrap mb-2">
                  <span className={`badge bg-${STATUS_COLORS[detail.agent.status] || 'secondary'}`}>
                    {detail.agent.status}
                  </span>
                  <span className={`badge bg-${CATEGORY_COLORS[detail.agent.category] || 'secondary'}`}>
                    {detail.agent.category?.replace('_', ' ')}
                  </span>
                  <span className={`badge bg-${detail.agent.enabled ? 'success' : 'danger'}`}>
                    {detail.agent.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <div className="d-flex gap-1">
                  {detail.agent.status === 'paused' ? (
                    <button className="btn btn-sm btn-outline-success" onClick={() => handleControl('resume')} disabled={controlLoading}>
                      Resume
                    </button>
                  ) : (
                    <button className="btn btn-sm btn-outline-warning" onClick={() => handleControl('pause')} disabled={controlLoading}>
                      Pause
                    </button>
                  )}
                  <button
                    className={`btn btn-sm ${detail.agent.enabled ? 'btn-outline-danger' : 'btn-outline-success'}`}
                    onClick={() => handleControl(detail.agent.enabled ? 'disable' : 'enable')}
                    disabled={controlLoading}
                  >
                    {detail.agent.enabled ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <nav className="nav nav-tabs px-3" style={{ flexShrink: 0 }}>
                {([
                  { key: 'overview' as DrawerTab, label: 'Overview' },
                  { key: 'timeline' as DrawerTab, label: 'Timeline' },
                  { key: 'errors' as DrawerTab, label: `Errors (${detail.agent.error_count})` },
                ]).map((t) => (
                  <button
                    key={t.key}
                    className={`nav-link ${activeTab === t.key ? 'active' : ''}`}
                    style={{ fontSize: '0.78rem', padding: '6px 12px' }}
                    onClick={() => setActiveTab(t.key)}
                  >
                    {t.label}
                  </button>
                ))}
              </nav>

              <div className="p-3">
                {activeTab === 'overview' && <OverviewTab detail={detail} />}
                {activeTab === 'timeline' && (
                  <TimelineTab
                    activity={detail.recent_activity}
                    expandedTraceId={expandedTraceId}
                    traceSteps={traceSteps}
                    traceLoading={traceLoading}
                    onTraceClick={loadTrace}
                  />
                )}
                {activeTab === 'errors' && <ErrorsTab errors={errors} loading={errorsLoading} />}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Overview Tab ────────────────────────────────────────────────────────────

function OverviewTab({ detail }: { detail: AgentDetail }) {
  return (
    <>
      {detail.agent.description && (
        <p className="small text-muted mb-3">{detail.agent.description}</p>
      )}

      {/* Metadata */}
      <div className="row g-2 mb-3">
        {[
          { label: 'Type', value: detail.agent.agent_type },
          { label: 'Schedule', value: detail.agent.schedule || '—', extra: detail.agent.next_run_label ? `Next: ${detail.agent.next_run_label}` : undefined },
          { label: 'Module', value: detail.agent.module || '—' },
          { label: 'Last Run', value: timeAgo(detail.agent.last_run_at) },
        ].map((m) => (
          <div key={m.label} className="col-6">
            <div className="card border-0 bg-light">
              <div className="card-body py-2 px-2 text-center">
                <div className="small text-muted" style={{ fontSize: '0.68rem' }}>{m.label}</div>
                <div className="fw-medium small text-truncate">{m.value}</div>
                {m.extra && <div className="small text-primary" style={{ fontSize: '0.68rem' }}>{m.extra}</div>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* KPIs */}
      <div className="row g-2 mb-3">
        {[
          { label: 'Total Runs', value: detail.agent.run_count, color: 'var(--color-primary)' },
          { label: 'Avg Duration', value: formatDuration(detail.agent.avg_duration_ms), color: 'var(--color-primary-light)' },
          { label: 'Actions Today', value: detail.actions_today, color: 'var(--color-accent)' },
          { label: 'Errors Today', value: detail.errors_today, color: detail.errors_today > 0 ? 'var(--color-secondary)' : 'var(--color-accent)' },
        ].map((k) => (
          <div key={k.label} className="col-6">
            <div className="card border-0 shadow-sm">
              <div className="card-body py-2 px-2 text-center">
                <div className="small text-muted" style={{ fontSize: '0.68rem' }}>{k.label}</div>
                <div className="fw-bold" style={{ color: k.color, fontSize: '1.1rem' }}>{k.value}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Last Error */}
      {detail.agent.last_error && (
        <div className="alert alert-danger small mb-3 py-2">
          <strong>Last Error</strong> ({timeAgo(detail.agent.last_error_at)}):
          <div className="mt-1">{detail.agent.last_error}</div>
        </div>
      )}

      {/* Config */}
      {detail.agent.config && Object.keys(detail.agent.config).length > 0 && (
        <div className="mb-3">
          <label className="form-label small fw-medium text-muted">Configuration</label>
          <pre className="small bg-light p-2 rounded mb-0" style={{ maxHeight: 160, overflow: 'auto', fontSize: '0.72rem' }}>
            {JSON.stringify(detail.agent.config, null, 2)}
          </pre>
        </div>
      )}

      {/* Last Result */}
      {detail.agent.last_result && (
        <div>
          <label className="form-label small fw-medium text-muted">Last Execution Result</label>
          <div className="bg-light p-2 rounded small">
            {(() => {
              const r = detail.agent.last_result!;
              if (r.campaigns_scanned != null) {
                return (
                  <div className="d-flex flex-wrap gap-2">
                    <span>Scanned <strong>{r.campaigns_scanned}</strong></span>
                    {r.healthy != null && <span className="badge bg-success">{r.healthy} healthy</span>}
                    {r.degraded > 0 && <span className="badge bg-warning text-dark">{r.degraded} degraded</span>}
                    {r.critical > 0 && <span className="badge bg-danger">{r.critical} critical</span>}
                    <span className="text-muted">{formatDuration(r.duration_ms)}</span>
                  </div>
                );
              }
              if (r.campaigns_processed != null) {
                return (
                  <div className="d-flex flex-wrap gap-2">
                    <span>Processed <strong>{r.campaigns_processed}</strong></span>
                    <span>{(r.actions_taken ?? 0) > 0 ? <strong>{r.actions_taken} action(s)</strong> : <span className="text-muted">No issues</span>}</span>
                    {(r.errors ?? 0) > 0 && <span className="badge bg-danger">{r.errors} error(s)</span>}
                    <span className="text-muted">{formatDuration(r.duration_ms)}</span>
                  </div>
                );
              }
              return <pre className="mb-0" style={{ maxHeight: 150, overflow: 'auto', fontSize: '0.72rem' }}>{JSON.stringify(r, null, 2)}</pre>;
            })()}
          </div>
        </div>
      )}
    </>
  );
}

// ─── Timeline Tab ────────────────────────────────────────────────────────────

function TimelineTab({
  activity,
  expandedTraceId,
  traceSteps,
  traceLoading,
  onTraceClick,
}: {
  activity: AgentDetail['recent_activity'];
  expandedTraceId: string | null;
  traceSteps: TraceStep[];
  traceLoading: boolean;
  onTraceClick: (traceId: string) => void;
}) {
  if (activity.length === 0) {
    return <p className="text-muted small">No execution history yet.</p>;
  }

  return (
    <div>
      {activity.map((a) => (
        <div key={a.id} className="mb-2">
          <div className="card border-0 shadow-sm">
            <div className="card-body py-2 px-3">
              <div className="d-flex justify-content-between align-items-center">
                <div className="d-flex gap-2 align-items-center">
                  <span className={`badge bg-${RESULT_COLORS[a.result] || 'secondary'}`} style={{ fontSize: '0.65rem' }}>
                    {a.result}
                  </span>
                  <span className="small">
                    {a.action === 'scan_completed_no_issues' ? 'No issues' :
                     a.action === 'agent_execution_completed' ? 'Completed' : a.action}
                  </span>
                </div>
                <small className="text-muted">{timeAgo(a.created_at)}</small>
              </div>
              <div className="d-flex gap-2 align-items-center mt-1">
                {a.campaign?.name && <small className="text-muted">{a.campaign.name}</small>}
                {a.confidence != null && (
                  <span className={`badge bg-${Number(a.confidence) >= 0.8 ? 'success' : Number(a.confidence) >= 0.6 ? 'warning' : 'danger'}`} style={{ fontSize: '0.6rem' }}>
                    {(Number(a.confidence) * 100).toFixed(0)}%
                  </span>
                )}
                {a.duration_ms != null && <small className="text-muted">{formatDuration(a.duration_ms)}</small>}
                {a.trace_id && (
                  <button
                    className="btn btn-sm btn-link p-0 text-primary"
                    style={{ fontSize: '0.7rem' }}
                    onClick={() => onTraceClick(a.trace_id!)}
                  >
                    Trace &rarr;
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Inline Trace Viewer */}
          {expandedTraceId === a.trace_id && (
            <div className="ms-3 mt-1 mb-2">
              {traceLoading ? (
                <div className="text-center py-2">
                  <div className="spinner-border spinner-border-sm text-primary" role="status">
                    <span className="visually-hidden">Loading trace...</span>
                  </div>
                </div>
              ) : traceSteps.length === 0 ? (
                <p className="text-muted small">No trace data.</p>
              ) : (
                <TraceTimeline steps={traceSteps} />
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Inline Trace Timeline ──────────────────────────────────────────────────

function TraceTimeline({ steps }: { steps: TraceStep[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="position-relative" style={{ paddingLeft: 24 }}>
      <div
        className="position-absolute"
        style={{ left: 8, top: 6, bottom: 6, width: 2, backgroundColor: 'var(--color-border)' }}
      />
      {steps.map((step) => (
        <div key={step.id} className="position-relative mb-2">
          <div
            className="position-absolute rounded-circle"
            style={{
              left: -20,
              top: 5,
              width: 10,
              height: 10,
              backgroundColor: DOT_COLORS[step.result] || '#718096',
              border: '2px solid white',
              boxShadow: '0 0 0 1px ' + (DOT_COLORS[step.result] || '#718096'),
            }}
          />
          <div
            className="bg-light rounded p-2 small"
            style={{ cursor: 'pointer' }}
            onClick={() => setExpanded(expanded === step.id ? null : step.id)}
          >
            <div className="d-flex justify-content-between align-items-center">
              <div className="d-flex gap-1 align-items-center">
                <span className="fw-medium" style={{ fontSize: '0.75rem' }}>{step.action}</span>
                <span className={`badge bg-${RESULT_COLORS[step.result] || 'secondary'}`} style={{ fontSize: '0.6rem' }}>
                  {step.result}
                </span>
              </div>
              <span className="text-muted" style={{ fontSize: '0.65rem' }}>
                {step.duration_ms != null ? formatDuration(step.duration_ms) : ''}
              </span>
            </div>
            {expanded === step.id && (
              <div className="mt-1 pt-1 border-top" style={{ fontSize: '0.72rem' }}>
                {step.reason && <div className="mb-1"><strong>Reason:</strong> {step.reason}</div>}
                {step.details && Object.keys(step.details).length > 0 && (
                  <pre className="bg-white p-1 rounded mb-0 mt-1" style={{ maxHeight: 120, overflow: 'auto', fontSize: '0.68rem' }}>
                    {JSON.stringify(step.details, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Errors Tab ──────────────────────────────────────────────────────────────

function ErrorsTab({ errors, loading }: { errors: any[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="text-center py-3">
        <div className="spinner-border spinner-border-sm text-primary" role="status">
          <span className="visually-hidden">Loading errors...</span>
        </div>
      </div>
    );
  }

  if (errors.length === 0) {
    return <p className="text-muted small">No errors recorded for this agent.</p>;
  }

  return (
    <div>
      {errors.map((err: any, i: number) => (
        <div key={err.id || i} className="card border-0 shadow-sm mb-2">
          <div className="card-body py-2 px-3">
            <div className="d-flex justify-content-between align-items-start">
              <span className="badge bg-danger" style={{ fontSize: '0.65rem' }}>
                {err.error_type || 'Error'}
              </span>
              <small className="text-muted">{timeAgo(err.created_at)}</small>
            </div>
            <div className="small mt-1">{err.message || err.error_message || 'Unknown error'}</div>
            {err.stack_trace && (
              <pre className="small bg-light p-2 rounded mt-1 mb-0" style={{ maxHeight: 100, overflow: 'auto', fontSize: '0.68rem' }}>
                {err.stack_trace}
              </pre>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
