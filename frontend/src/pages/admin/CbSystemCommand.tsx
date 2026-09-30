import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import api from '../../utils/api';
import { PageHeader, StatCard, StatusBadge, SectionCard } from '../../components/admin/shell';
import { TrustSignal } from '../../components/admin/shell/trust';

/**
 * CB System Command — single management pane for CB System (the autonomous
 * Basecamp agent that powers the advisor's /my-day). Replaces the retired
 * "Run My Day" port. Reads /api/admin/cb-system/* (Postgres + host logs).
 *
 * Panes: Health · Throughput · Per-project · Activity · Exceptions · Components.
 */

type Overall = 'GREEN' | 'YELLOW' | 'RED';
type BadgeTone = 'success' | 'danger' | 'warning' | 'info' | 'neutral' | 'primary';

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

// Overall health -> StatusBadge tone (GREEN/YELLOW/RED come from the CB System API).
const OVERALL_TONE: Record<Overall, BadgeTone> = { GREEN: 'success', YELLOW: 'warning', RED: 'danger' };
// Subsystem status string -> StatusBadge tone.
const COMP_TONE: Record<string, BadgeTone> = { healthy: 'success', degraded: 'warning', unknown: 'neutral' };

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

  // Per-page trust signal — CB System is a live host-side agent feed.
  const trust: TrustSignal = useMemo(() => ({
    level: 'live',
    source: 'CB system',
    updatedAt: new Date().toISOString(),
    summary: health
      ? `CB System ${health.overall.toLowerCase()} · ${health.dispatcher.mentions_found} @CB mentions caught / 24h.`
      : 'Live health, throughput, and activity from the autonomous Basecamp agent.',
    href: '/admin/trust',
    pillars: [
      {
        name: 'Dispatcher',
        status: health?.dispatcher.available ? 'live' : 'stale',
        evidence: [{ label: 'Ticks / 24h', value: String(health?.dispatcher.tick_count ?? '—') }],
      },
    ],
  }), [health]);

  if (loading) {
    return <div className="text-center py-5"><div className="spinner-border text-primary" /></div>;
  }

  return (
    <>
      <PageHeader
        title="CB System"
        icon="robot-2-line"
        subtitle="Autonomous Basecamp agent · the engine behind /my-day."
        breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'CB System' }]}
        trust={trust}
        actions={
          <>
            <button className="btn btn-outline-secondary btn-sm" onClick={load} disabled={refreshing}>
              <i className="ri-refresh-line" aria-hidden="true" /> {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
            <button className="btn btn-primary btn-sm" onClick={runSync} disabled={syncing}>
              <i className="ri-loop-right-line" aria-hidden="true" /> {syncing ? 'Syncing…' : 'Run sync now'}
            </button>
          </>
        }
      >
        <div className="d-flex flex-wrap align-items-center gap-2">
          {health && <StatusBadge label={health.overall} tone={OVERALL_TONE[health.overall]} icon="pulse-line" />}
          <span className="small text-muted">{lastLoaded ? `updated ${shortTime(lastLoaded.toISOString())}` : ''}</span>
        </div>
      </PageHeader>

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
          { label: 'To-dos tracked', value: health?.todos_mirrored ?? '—', icon: 'list-check-2', tone: 'info' as BadgeTone },
          { label: 'Dispatcher ticks / 24h', value: health?.dispatcher.available ? (health?.dispatcher.tick_count ?? '—') : 'n/a', hint: 'expected ~480', icon: 'timer-flash-line', tone: 'info' as BadgeTone },
          { label: '@CB mentions caught / 24h', value: health?.dispatcher.mentions_found ?? '—', icon: 'at-line', tone: 'primary' as BadgeTone },
          { label: 'Replies drafted / 24h', value: health?.dispatcher.llm_invocations ?? '—', icon: 'chat-3-line', tone: 'success' as BadgeTone },
          { label: 'Dispatcher errors / 24h', value: health?.dispatcher.error_count ?? '—', icon: 'error-warning-line', tone: ((health?.dispatcher.error_count ?? 0) > 5 ? 'danger' : 'neutral') as BadgeTone },
          { label: 'Circuit-breaker trips', value: health?.circuit_breaker_trips ?? 0, icon: 'shield-flash-line', tone: ((health?.circuit_breaker_trips ?? 0) > 0 ? 'danger' : 'neutral') as BadgeTone },
        ].map((k, i) => (
          <div className="col-6 col-md-2" key={i}>
            <StatCard label={k.label} value={k.value} icon={k.icon} tone={k.tone} hint={k.hint} />
          </div>
        ))}
      </div>

      {/* Pane 4 — Throughput */}
      <div className="mb-4">
        <SectionCard
          title={`Throughput & cost · last ${throughput?.days ?? 14} days`}
          icon="bar-chart-grouped-line"
          actions={
            <span className="small text-muted">
              {throughput?.total_invocations ?? 0} invocations · ${Number(throughput?.total_cost_usd ?? 0).toFixed(2)} agent cost
            </span>
          }
        >
          <div style={{ height: 260 }}>
            {throughput && throughput.series.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={throughput.series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => String(d).slice(5)} />
                  <YAxis yAxisId="l" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar yAxisId="l" dataKey="invocations" name="@CB invocations" fill="var(--red-500)" radius={[3, 3, 0, 0]} />
                  <Line yAxisId="r" dataKey="automations_fired" name="automations fired" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center text-muted py-5">No throughput data yet.</div>
            )}
          </div>
        </SectionCard>
      </div>

      {/* Pane 3 — Per-project */}
      <div className="mb-4">
        <SectionCard title="Per-project activity" icon="folders-line" padded={false}>
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
                    <td className="text-end">{p.human_required > 0 ? <StatusBadge label={String(p.human_required)} tone="danger" /> : <span className="text-muted">0</span>}</td>
                    <td className="text-end">{p.waiting || <span className="text-muted">0</span>}</td>
                    <td className="text-end">{p.avg_urgency ?? '—'}</td>
                    <td className="text-end">{p.mentions_handled_7d > 0 ? p.mentions_handled_7d : <span className="text-muted">0</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>

      <div className="row g-3 mb-4">
        {/* Pane 2 — Activity feed */}
        <div className="col-lg-7">
          <SectionCard title="Activity — recent @CB actions" icon="history-line" padded={false} className="h-100">
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
                      <td className="d-flex flex-wrap gap-1">
                        {a.status === 'error'
                          ? <StatusBadge label="error" tone="danger" />
                          : a.replied ? <StatusBadge label="replied" tone="success" /> : <StatusBadge label={a.status} tone="neutral" />}
                        {a.queued_followup && <StatusBadge label="followup" tone="info" />}
                        {a.emailed && <StatusBadge label="emailed" tone="primary" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>

        {/* Pane 5 — Exceptions */}
        <div className="col-lg-5">
          <SectionCard
            title="Exceptions & quality"
            icon="error-warning-line"
            className="h-100"
            actions={<span className="small text-muted">{exceptions?.error_count_3d ?? 0} in 3d</span>}
          >
            <div style={{ maxHeight: 420, overflowY: 'auto' }}>
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
                    <StatusBadge label={p.kind} tone={p.kind === 'error' ? 'danger' : 'warning'} />
                    <span className="text-muted">{shortTime(p.ts)}</span>
                  </div>
                  <div className="text-muted mt-1" style={{ wordBreak: 'break-word' }}>{p.detail || '—'}</div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>

      {/* Pane 6 — Components / controls */}
      <div className="mb-4">
        <SectionCard title="Subsystems" icon="apps-2-line" padded={false}>
          <div className="table-responsive">
            <table className="table table-hover mb-0 align-middle">
              <thead className="table-light"><tr><th>Component</th><th>Cadence</th><th>Status</th><th>Last run</th><th>Detail</th></tr></thead>
              <tbody>
                {components.map((c) => (
                  <tr key={c.key}>
                    <td className="fw-semibold">{c.name}</td>
                    <td className="small text-muted">{c.cadence}</td>
                    <td><StatusBadge label={c.status} tone={COMP_TONE[c.status] || 'neutral'} /></td>
                    <td className="small text-muted">{shortTime(c.last_run)}</td>
                    <td className="small text-muted">{c.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>
    </>
  );
}
