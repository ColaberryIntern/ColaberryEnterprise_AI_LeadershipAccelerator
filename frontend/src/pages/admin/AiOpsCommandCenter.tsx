import React, { useCallback, useEffect, useState } from 'react';
import api from '../../utils/api';

/**
 * AI Ops Command Center — Phase 0 shell.
 *
 * Three columns:
 *   Left:   Waiting on Human queue (open BC todos, sorted by urgency)
 *   Center: KPI tiles + live system health
 *   Right:  Sync status + manual controls
 *
 * Phase 1 will add: Priority Engine scores driving the queue order,
 * Approval workspace, Run My Day mode.
 */

type Category =
  | 'human_required'
  | 'ai_can_finish'
  | 'ai_can_prepare'
  | 'can_eliminate'
  | 'waiting_dependency'
  | 'completed'
  | 'unscored';

interface HealthPayload {
  status: string;
  timestamp: string;
  todos_mirrored: number;
  open_approvals: number;
  sync_in_flight: boolean;
  priority_in_flight: boolean;
  last_sync: {
    started_at: string;
    finished_at: string;
    duration_ms: number;
    projects_seen: number;
    todos_seen: number;
    todos_inserted: number;
    todos_updated: number;
    error_count: number;
  } | null;
  last_priority_run: {
    started_at: string;
    finished_at: string;
    duration_ms: number;
    todos_scored: number;
    audit_rows_written: number;
    category_counts: Record<Category, number>;
    error_count: number;
  } | null;
}

interface OpsTodo {
  bc_id: string;
  project_id: string;
  title: string;
  status: string;
  due_on: string | null;
  urgency_score: number | null;
  category: Category;
  bc_app_url: string | null;
  bc_updated_at: string;
}

const CATEGORY_STYLE: Record<Category, { label: string; bg: string; fg: string }> = {
  human_required:     { label: 'Human required',     bg: '#3a1d22', fg: '#ff6b6b' },
  ai_can_finish:      { label: 'AI can finish',      bg: '#0d2b27', fg: '#5cd9a3' },
  ai_can_prepare:     { label: 'AI can prepare',     bg: '#0d2b27', fg: '#5cd9a3' },
  can_eliminate:      { label: 'Can eliminate',      bg: '#1f2937', fg: '#9ca3af' },
  waiting_dependency: { label: 'Waiting',            bg: '#2d2410', fg: '#ffb84d' },
  completed:          { label: 'Completed',          bg: '#0e1729', fg: '#8a99b8' },
  unscored:           { label: 'Unscored',           bg: '#0e1729', fg: '#8a99b8' },
};

function scoreColor(score: number | null): string {
  if (score == null) return '#8a99b8';
  if (score >= 70) return '#ff6b6b';
  if (score >= 40) return '#ffb84d';
  return '#8a99b8';
}

const palette = {
  bg: '#0b1220',
  panel: '#111b2e',
  border: '#1d2a44',
  text: '#e6edf7',
  textDim: '#8a99b8',
  accent: '#4dabf7',
  warn: '#ffb84d',
  err: '#ff6b6b',
  ok: '#5cd9a3',
};

const sectionStyle: React.CSSProperties = {
  background: palette.panel,
  border: `1px solid ${palette.border}`,
  borderRadius: 10,
  padding: 20,
};

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  if (diff < 0) return 'just now';
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const AiOpsCommandCenter: React.FC = () => {
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [todos, setTodos] = useState<OpsTodo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [scoring, setScoring] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [h, t] = await Promise.all([
        api.get<HealthPayload>('/api/admin/ops/health'),
        api.get<{ todos: OpsTodo[]; count: number }>('/api/admin/ops/todos?limit=100&status=active'),
      ]);
      setHealth(h.data);
      setTodos(t.data.todos);
      setError(null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  const triggerSync = async () => {
    setSyncing(true);
    try {
      await api.post('/api/admin/ops/sync');
      await refresh();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const triggerScore = async () => {
    setScoring(true);
    try {
      await api.post('/api/admin/ops/score');
      await refresh();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'score failed');
    } finally {
      setScoring(false);
    }
  };

  const kpis = [
    { label: 'Todos mirrored', value: health?.todos_mirrored ?? '—' },
    { label: 'Open approvals', value: health?.open_approvals ?? '—' },
    { label: 'Last sync', value: timeAgo(health?.last_sync?.finished_at) },
    { label: 'Sync errors', value: health?.last_sync?.error_count ?? '—' },
  ];

  return (
    <div style={{ background: palette.bg, minHeight: '100vh', color: palette.text, padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600 }}>AI Ops Command Center</h1>
          <div style={{ color: palette.textDim, fontSize: 13, marginTop: 4 }}>
            Phase 1 · Basecamp mirror + Priority Engine v0 (rule-based, no LLM)
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={refresh}
            style={{
              background: 'transparent',
              border: `1px solid ${palette.border}`,
              color: palette.text,
              padding: '8px 14px',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Refresh
          </button>
          <button
            onClick={triggerScore}
            disabled={scoring || health?.priority_in_flight}
            style={{
              background: 'transparent',
              border: `1px solid ${palette.border}`,
              color: palette.text,
              padding: '8px 14px',
              borderRadius: 6,
              cursor: scoring ? 'not-allowed' : 'pointer',
              opacity: scoring || health?.priority_in_flight ? 0.6 : 1,
            }}
          >
            {scoring || health?.priority_in_flight ? 'Scoring…' : 'Re-score'}
          </button>
          <button
            onClick={triggerSync}
            disabled={syncing || health?.sync_in_flight}
            style={{
              background: palette.accent,
              border: 'none',
              color: '#001225',
              padding: '8px 14px',
              borderRadius: 6,
              fontWeight: 600,
              cursor: syncing ? 'not-allowed' : 'pointer',
              opacity: syncing || health?.sync_in_flight ? 0.6 : 1,
            }}
          >
            {syncing || health?.sync_in_flight ? 'Syncing…' : 'Re-sync from Basecamp'}
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            background: '#3a1d22',
            border: `1px solid ${palette.err}`,
            color: palette.err,
            padding: 12,
            borderRadius: 8,
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {/* KPI row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 16,
          marginBottom: 24,
        }}
      >
        {kpis.map((k) => (
          <div key={k.label} style={sectionStyle}>
            <div style={{ color: palette.textDim, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {k.label}
            </div>
            <div style={{ fontSize: 28, fontWeight: 600, marginTop: 6 }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Three-column body */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 16 }}>
        {/* Waiting on Human */}
        <div style={sectionStyle}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Waiting on Human</h2>
          <div style={{ color: palette.textDim, fontSize: 12, marginTop: 4, marginBottom: 12 }}>
            All active todos. Priority Engine sorting lands in Phase 1.
          </div>
          {loading && <div style={{ color: palette.textDim }}>Loading…</div>}
          {!loading && todos.length === 0 && (
            <div style={{ color: palette.textDim, padding: 16 }}>No active todos.</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 600, overflowY: 'auto' }}>
            {todos.map((t) => {
              const cat = CATEGORY_STYLE[t.category] || CATEGORY_STYLE.unscored;
              const sc = scoreColor(t.urgency_score);
              return (
                <a
                  key={t.bc_id}
                  href={t.bc_app_url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    background: '#0e1729',
                    border: `1px solid ${palette.border}`,
                    borderRadius: 6,
                    padding: 12,
                    textDecoration: 'none',
                    color: palette.text,
                    display: 'block',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
                    {t.urgency_score != null && (
                      <div
                        style={{
                          flexShrink: 0,
                          width: 36,
                          height: 36,
                          borderRadius: 6,
                          background: '#0b1220',
                          border: `1px solid ${sc}`,
                          color: sc,
                          fontSize: 14,
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        title={`Urgency ${t.urgency_score}/100`}
                      >
                        {t.urgency_score}
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{t.title}</div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            background: cat.bg,
                            color: cat.fg,
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: 0.5,
                            textTransform: 'uppercase',
                            padding: '2px 8px',
                            borderRadius: 3,
                          }}
                        >
                          {cat.label}
                        </span>
                        <span style={{ color: palette.textDim, fontSize: 12 }}>proj {t.project_id}</span>
                        {t.due_on && <span style={{ color: palette.textDim, fontSize: 12 }}>due {t.due_on}</span>}
                        <span style={{ color: palette.textDim, fontSize: 12 }}>upd {timeAgo(t.bc_updated_at)}</span>
                      </div>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        </div>

        {/* Triage breakdown - live from Priority Engine v0 */}
        <div style={sectionStyle}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Triage Breakdown</h2>
          <div style={{ color: palette.textDim, fontSize: 12, marginTop: 4, marginBottom: 12 }}>
            Rule-based Priority Engine v0 · no LLM yet.
          </div>
          {health?.last_priority_run ? (
            <div style={{ display: 'grid', gap: 10 }}>
              {(Object.entries(health.last_priority_run.category_counts) as Array<[Category, number]>)
                .filter(([, n]) => n > 0)
                .sort((a, b) => b[1] - a[1])
                .map(([cat, n]) => {
                  const style = CATEGORY_STYLE[cat];
                  return (
                    <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span
                        style={{
                          background: style.bg,
                          color: style.fg,
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: 0.5,
                          textTransform: 'uppercase',
                          padding: '3px 10px',
                          borderRadius: 3,
                        }}
                      >
                        {style.label}
                      </span>
                      <span style={{ color: palette.text, fontWeight: 700, fontSize: 16 }}>{n}</span>
                    </div>
                  );
                })}
              <div style={{ borderTop: `1px solid ${palette.border}`, paddingTop: 10, marginTop: 4 }}>
                <Row
                  label="Last scored"
                  value={timeAgo(health.last_priority_run.finished_at)}
                />
                <Row label="Duration" value={`${Math.round(health.last_priority_run.duration_ms / 1000)}s`} />
                <Row label="Scored" value={String(health.last_priority_run.todos_scored)} />
                <Row
                  label="Errors"
                  value={String(health.last_priority_run.error_count)}
                  color={health.last_priority_run.error_count > 0 ? palette.err : palette.ok}
                />
              </div>
            </div>
          ) : (
            <div style={{ color: palette.textDim, padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 14, marginBottom: 8 }}>Priority engine has not run yet.</div>
              <div style={{ fontSize: 12 }}>Runs after each BC sync (every 2 min).</div>
            </div>
          )}
        </div>

        {/* System health */}
        <div style={sectionStyle}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>System Health</h2>
          <div style={{ color: palette.textDim, fontSize: 12, marginTop: 4, marginBottom: 12 }}>
            Basecamp mirror status.
          </div>
          {health?.last_sync ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <Row label="Projects scanned" value={String(health.last_sync.projects_seen)} />
              <Row label="Todos seen" value={String(health.last_sync.todos_seen)} />
              <Row label="Inserted" value={String(health.last_sync.todos_inserted)} />
              <Row label="Updated" value={String(health.last_sync.todos_updated)} />
              <Row
                label="Duration"
                value={`${Math.round(health.last_sync.duration_ms / 1000)}s`}
              />
              <Row
                label="Errors"
                value={String(health.last_sync.error_count)}
                color={health.last_sync.error_count > 0 ? palette.err : palette.ok}
              />
            </div>
          ) : (
            <div style={{ color: palette.textDim, padding: 16, textAlign: 'center' }}>
              No sync has completed yet. The scheduler runs every 2 min, or click Re-sync above.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const Row: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
    <span style={{ color: palette.textDim }}>{label}</span>
    <span style={{ color: color || palette.text, fontWeight: 600 }}>{value}</span>
  </div>
);

export default AiOpsCommandCenter;
