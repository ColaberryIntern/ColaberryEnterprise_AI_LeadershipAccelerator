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

interface HealthPayload {
  status: string;
  timestamp: string;
  todos_mirrored: number;
  open_approvals: number;
  sync_in_flight: boolean;
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
}

interface OpsTodo {
  bc_id: string;
  project_id: string;
  title: string;
  status: string;
  due_on: string | null;
  urgency_score: number | null;
  category: string;
  bc_app_url: string | null;
  bc_updated_at: string;
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
            Phase 0 · Basecamp mirror live · Priority Engine pending
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
            {todos.map((t) => (
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
                <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{t.title}</div>
                <div style={{ color: palette.textDim, fontSize: 12, display: 'flex', gap: 12 }}>
                  <span>proj {t.project_id}</span>
                  {t.due_on && <span>due {t.due_on}</span>}
                  <span>upd {timeAgo(t.bc_updated_at)}</span>
                  {t.urgency_score != null && <span style={{ color: palette.warn }}>U {t.urgency_score}</span>}
                </div>
              </a>
            ))}
          </div>
        </div>

        {/* Today's pulse (placeholder for metrics tile) */}
        <div style={sectionStyle}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Today's Pulse</h2>
          <div style={{ color: palette.textDim, fontSize: 12, marginTop: 4, marginBottom: 12 }}>
            Approvals completed, hours saved, revenue protected. Lands in Phase 1.
          </div>
          <div style={{ color: palette.textDim, padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 14, marginBottom: 8 }}>Metrics aggregation arrives with Priority Engine.</div>
            <div style={{ fontSize: 12 }}>Target ship: 2026-06-16</div>
          </div>
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
