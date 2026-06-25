import React, { useCallback, useEffect, useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import api from '../../utils/api';

/**
 * CB System Command — single management pane for CB System (the autonomous
 * Basecamp agent that powers the advisor's /my-day). Replaces the retired
 * "Run My Day" port. Reads /api/admin/cb-system/* (Postgres + host logs).
 *
 * Panes: Health · Throughput · Per-project · Activity · Exceptions · Components.
 */

type Overall = 'GREEN' | 'YELLOW' | 'RED';

interface HealthFlag { level: 'red' | 'yellow'; msg: string; }
interface Health {
  overall: Overall;
  flags: HealthFlag[];
  todos_mirrored: number;
  circuit_breaker_trips: number;
  dispatcher: {
    available: boolean;
    tick_count: number | null;
    mentions_found: number;
    llm_invocations: number;
    error_count: number;
    max_gap_minutes: number;
    last_tick: string | null;
  };
  last_sync: { finished_at: string; duration_ms: number; todos_seen: number; todos_updated: number; error_count: number } | null;
  generated_at: string;
}
interface ActivityItem {
  ts: string; requester: string; bucket_id?: number; comment_id?: number; model?: string;
  tools: string[]; replied: boolean; emailed: boolean; queued_followup: boolean;
  quality_flags: string[]; status: string; error: string | null;
}
interface ProjectRow {
  project_id: string; name: string; open_todos: number; human_required: number;
  waiting: number; avg_urgency: number | null; mentions_handled_7d: number;
}
interface ThroughputPoint { date: string; invocations: number; automations_fired: number; score_runs: number; agent_cost_usd: number; }
interface Throughput { days: number; total_invocations: number; total_cost_usd: number; series: ThroughputPoint[]; }
interface ExceptionItem { ts: string; requester: string; bucket_id?: number; comment_id?: number; kind: string; detail: string; }
interface Exceptions { handler_problems: ExceptionItem[]; circuit_breaker_trips: Array<{ key: string; at: string }>; error_count_3d: number; }
interface Component { key: string; name: string; cadence: string; status: string; last_run: string | null; detail: string; }

const STATUS_BADGE: Record<Overall, string> = { GREEN: 'bg-success', YELLOW: 'bg-warning text-dark', RED: 'bg-danger' };
const COMP_BADGE: Record<string, string> = { healthy: 'bg-success', degraded: 'bg-warning text-dark', unknown: 'bg-secondary' };

function shortTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return d.toISOString().slice(0, 10);
}

export default function CbSystemCommand() {
  const [health, setHealth] = useState<Health | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [throughput, setThroughput] = useState<Throughput | null>(null);
  const [exceptions, setExceptions] = useState<Exceptions | null>(null);
  const [components, setComponents] = useState<Component[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastLoaded, setLastLoaded] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [h, a, p, t, e, c] = await Promise.all([
        api.get('/api/admin/cb-system/health'),
        api.get('/api/admin/cb-system/activity?limit=30'),
        api.get('/api/admin/cb-system/projects'),
        api.get('/api/admin/cb-system/throughput?days=14'),
        api.get('/api/admin/cb-system/exceptions?limit=30'),
        api.get('/api/admin/cb-system/components'),
      ]);
      setHealth(h.data);
      setActivity(a.data.items || []);
      setProjects(p.data.projects || []);
      setThroughput(t.data);
      setExceptions(e.data);
      setComponents(c.data.components || []);
      setLastLoaded(new Date());
    } catch (err) {
      console.error('CB System load failed:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  const runSync = async () => {
    setSyncing(true);
    try { await api.post('/api/admin/ops/sync'); await load(); }
    catch (err) { console.error('sync failed', err); }
    finally { setSyncing(false); }
  };

  if (loading) {
    return <div className="text-center py-5"><div className="spinner-border text-primary" /></div>;
  }

  return (
    <div className="container-fluid py-3">
      {/* Header */}
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-4">
        <div>
          <h4 className="mb-0 fw-bold">CB System Command</h4>
          <div className="small text-muted">Autonomous Basecamp agent · the engine behind <code>/my-day</code></div>
        </div>
        <div className="d-flex align-items-center gap-2">
          {health && <span className={`badge ${STATUS_BADGE[health.overall]} fs-6`}>{health.overall}</span>}
          <span className="small text-muted">{lastLoaded ? `updated ${shortTime(lastLoaded.toISOString())}` : ''}</span>
          <button className="btn btn-sm btn-outline-secondary" onClick={load} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <button className="btn btn-sm btn-primary" onClick={runSync} disabled={syncing}>
            {syncing ? 'Syncing…' : 'Run sync now'}
          </button>
        </div>
      </div>

      {/* Anomaly flags */}
      {health && health.flags.length > 0 && (
        <div className={`alert ${health.overall === 'RED' ? 'alert-danger' : 'alert-warning'} py-2 mb-4`}>
          <strong className="me-2">Attention:</strong>
          {health.flags.map((f, i) => (
            <span key={i} className="me-3"><span className="text-uppercase fw-semibold small">{f.level}</span> {f.msg}</span>
          ))}
        </div>
      )}

      {/* Pane 1 — Health KPIs */}
      <div className="row g-3 mb-4">
        {[
          { label: 'To-dos tracked', value: health?.todos_mirrored ?? '—' },
          { label: 'Dispatcher ticks / 24h', value: health?.dispatcher.available ? (health?.dispatcher.tick_count ?? '—') : 'n/a', sub: 'expected ~480' },
          { label: '@CB mentions caught / 24h', value: health?.dispatcher.mentions_found ?? '—' },
          { label: 'Replies drafted / 24h', value: health?.dispatcher.llm_invocations ?? '—' },
          { label: 'Dispatcher errors / 24h', value: health?.dispatcher.error_count ?? '—', danger: (health?.dispatcher.error_count ?? 0) > 5 },
          { label: 'Circuit-breaker trips', value: health?.circuit_breaker_trips ?? 0, danger: (health?.circuit_breaker_trips ?? 0) > 0 },
        ].map((k, i) => (
          <div className="col-6 col-md-2" key={i}>
            <div className="card border-0 shadow-sm h-100">
              <div className="card-body py-3">
                <div className={`fs-4 fw-bold ${k.danger ? 'text-danger' : ''}`}>{k.value}</div>
                <div className="small text-muted">{k.label}</div>
                {k.sub && <div className="text-muted" style={{ fontSize: 11 }}>{k.sub}</div>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Pane 4 — Throughput */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">
          <span>Throughput &amp; cost · last {throughput?.days ?? 14} days</span>
          <span className="small text-muted">
            {throughput?.total_invocations ?? 0} invocations · ${Number(throughput?.total_cost_usd ?? 0).toFixed(2)} agent cost
          </span>
        </div>
        <div className="card-body" style={{ height: 260 }}>
          {throughput && throughput.series.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={throughput.series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => String(d).slice(5)} />
                <YAxis yAxisId="l" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="l" dataKey="invocations" name="@CB invocations" fill="#1a365d" radius={[3, 3, 0, 0]} />
                <Line yAxisId="r" dataKey="automations_fired" name="automations fired" stroke="#0369a1" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center text-muted py-5">No throughput data yet.</div>
          )}
        </div>
      </div>

      {/* Pane 3 — Per-project */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold">Per-project activity</div>
        <div className="table-responsive">
          <table className="table table-hover mb-0 align-middle">
            <thead className="table-light">
              <tr>
                <th>Project</th>
                <th className="text-end">Open to-dos</th>
                <th className="text-end">Human-required</th>
                <th className="text-end">Waiting</th>
                <th className="text-end">Avg urgency</th>
                <th className="text-end">Mentions handled (7d)</th>
              </tr>
            </thead>
            <tbody>
              {projects.length === 0 && <tr><td colSpan={6} className="text-center text-muted py-4">No projects.</td></tr>}
              {projects.slice(0, 20).map((p) => (
                <tr key={p.project_id}>
                  <td className="fw-semibold">{p.name}</td>
                  <td className="text-end">{p.open_todos}</td>
                  <td className="text-end">{p.human_required > 0 ? <span className="badge bg-danger-subtle text-danger">{p.human_required}</span> : <span className="text-muted">0</span>}</td>
                  <td className="text-end">{p.waiting || <span className="text-muted">0</span>}</td>
                  <td className="text-end">{p.avg_urgency ?? '—'}</td>
                  <td className="text-end">{p.mentions_handled_7d > 0 ? p.mentions_handled_7d : <span className="text-muted">0</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="row g-3 mb-4">
        {/* Pane 2 — Activity feed */}
        <div className="col-lg-7">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-header bg-white fw-semibold">Activity — recent @CB actions</div>
            <div className="table-responsive" style={{ maxHeight: 420, overflowY: 'auto' }}>
              <table className="table table-sm table-hover mb-0 align-middle">
                <thead className="table-light"><tr><th>When</th><th>Requester</th><th>Did</th><th>Outcome</th></tr></thead>
                <tbody>
                  {activity.length === 0 && <tr><td colSpan={4} className="text-center text-muted py-4">No recent activity (handler log not mounted or quiet).</td></tr>}
                  {activity.map((a, i) => (
                    <tr key={i}>
                      <td className="text-muted small text-nowrap">{shortTime(a.ts)}</td>
                      <td className="small">{a.requester}</td>
                      <td className="small">{a.tools.filter((t) => t !== 'finish').join(', ') || '—'}</td>
                      <td>
                        {a.status === 'error'
                          ? <span className="badge bg-danger">error</span>
                          : a.replied ? <span className="badge bg-success-subtle text-success">replied</span> : <span className="badge bg-secondary-subtle text-secondary">{a.status}</span>}
                        {a.queued_followup && <span className="badge bg-info-subtle text-info ms-1">followup</span>}
                        {a.emailed && <span className="badge bg-primary-subtle text-primary ms-1">emailed</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Pane 5 — Exceptions */}
        <div className="col-lg-5">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-header bg-white fw-semibold d-flex justify-content-between">
              <span>Exceptions &amp; quality</span>
              <span className="small text-muted">{exceptions?.error_count_3d ?? 0} in 3d</span>
            </div>
            <div className="card-body py-2" style={{ maxHeight: 420, overflowY: 'auto' }}>
              {exceptions && exceptions.circuit_breaker_trips.length > 0 && (
                <div className="alert alert-danger py-2 small mb-2">
                  <strong>{exceptions.circuit_breaker_trips.length} circuit-breaker trip(s)</strong> — duplicate-reply protection fired.
                </div>
              )}
              {(!exceptions || exceptions.handler_problems.length === 0) && (!exceptions || exceptions.circuit_breaker_trips.length === 0) && (
                <div className="text-center text-muted py-4">No exceptions. CB System is running clean.</div>
              )}
              {exceptions?.handler_problems.map((p, i) => (
                <div key={i} className="border-bottom py-2 small">
                  <div className="d-flex justify-content-between">
                    <span className={`badge ${p.kind === 'error' ? 'bg-danger' : 'bg-warning text-dark'}`}>{p.kind}</span>
                    <span className="text-muted">{shortTime(p.ts)}</span>
                  </div>
                  <div className="text-muted mt-1" style={{ wordBreak: 'break-word' }}>{p.detail || '—'}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Pane 6 — Components / controls */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold">Subsystems</div>
        <div className="table-responsive">
          <table className="table table-hover mb-0 align-middle">
            <thead className="table-light"><tr><th>Component</th><th>Cadence</th><th>Status</th><th>Last run</th><th>Detail</th></tr></thead>
            <tbody>
              {components.map((c) => (
                <tr key={c.key}>
                  <td className="fw-semibold">{c.name}</td>
                  <td className="small text-muted">{c.cadence}</td>
                  <td><span className={`badge ${COMP_BADGE[c.status] || 'bg-secondary'}`}>{c.status}</span></td>
                  <td className="small text-muted">{shortTime(c.last_run)}</td>
                  <td className="small text-muted">{c.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
