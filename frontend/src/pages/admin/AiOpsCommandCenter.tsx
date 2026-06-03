import React, { useCallback, useEffect, useState } from 'react';
import api from '../../utils/api';

/**
 * AI Ops Command Center — Phase 1.
 *
 * Scope: only todos assigned to Ali in CB-managed projects.
 *
 * Layout:
 *   - Header: title + global controls (Re-score, Re-sync from Basecamp)
 *   - Project nav tabs: every CB-managed project with open Ali-assigned
 *     count; an "All" tab aggregates them
 *   - Body: grouped tree Project -> Todolist -> Task, sorted by urgency
 *     within each todolist. Tasks at urgency >= 40 expand a copyable
 *     Claude Code prompt block ("Run in Claude Code").
 *   - Footer collapsible: System Health + Triage Breakdown (kept from
 *     Phase 0 for ops visibility).
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

interface ProjectChip {
  bc_id: string;
  name: string;
  is_cb_managed: boolean;
  weight: number;
  ali_open_count: number;
  ali_red_count: number;
}

interface QueueTask {
  bc_id: string;
  title: string;
  description: string | null;
  bc_app_url: string | null;
  due_on: string | null;
  bc_updated_at: string;
  urgency_score: number | null;
  category: Category;
  recommended_prompt: string | null;
}

interface QueueTodolist {
  todolist_id: string | null;
  todolist_name: string | null;
  tasks: QueueTask[];
}

interface QueueProject {
  project_id: string;
  project_name: string;
  todolists: QueueTodolist[];
  task_count: number;
  red_count: number;
}

interface QueuePayload {
  projects: QueueProject[];
  total_tasks: number;
  assignee_bc_id: string;
  project_filter: string | null;
  prompt_threshold_urgency: number;
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

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
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
  const [projects, setProjects] = useState<ProjectChip[]>([]);
  const [queue, setQueue] = useState<QueuePayload | null>(null);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [opsPanelOpen, setOpsPanelOpen] = useState(false);
  const [expandedPromptIds, setExpandedPromptIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [h, p, q] = await Promise.all([
        api.get<HealthPayload>('/api/admin/ops/health'),
        api.get<{ projects: ProjectChip[] }>('/api/admin/ops/projects'),
        api.get<QueuePayload>(
          `/api/admin/ops/my-queue${selectedProject ? `?project_id=${selectedProject}` : ''}`,
        ),
      ]);
      setHealth(h.data);
      setProjects(p.data.projects);
      setQueue(q.data);
      setError(null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'failed to load');
    } finally {
      setLoading(false);
    }
  }, [selectedProject]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 60_000);
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

  const toggleCbManaged = async (proj: ProjectChip) => {
    try {
      await api.post(`/api/admin/ops/projects/${proj.bc_id}/cb-managed`, {
        is_cb_managed: !proj.is_cb_managed,
      });
      await refresh();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'toggle failed');
    }
  };

  const togglePrompt = (id: string) => {
    setExpandedPromptIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const copyPrompt = async (id: string, prompt: string) => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopiedId(id);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
    } catch {
      // silent
    }
  };

  const allOpenCount = projects.reduce((s, p) => s + p.ali_open_count, 0);
  const allRedCount = projects.reduce((s, p) => s + p.ali_red_count, 0);

  return (
    <div style={{ background: palette.bg, minHeight: '100vh', color: palette.text, padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600 }}>AI Ops Command Center</h1>
          <div style={{ color: palette.textDim, fontSize: 13, marginTop: 4 }}>
            Phase 1 · Your queue across CB-managed Basecamp projects · prompt for high-priority tasks
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={triggerScore}
            disabled={scoring || health?.priority_in_flight}
            style={ghostBtn(scoring || !!health?.priority_in_flight)}
          >
            {scoring || health?.priority_in_flight ? 'Scoring…' : 'Re-score'}
          </button>
          <button
            onClick={triggerSync}
            disabled={syncing || health?.sync_in_flight}
            style={primaryBtn(syncing || !!health?.sync_in_flight)}
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

      {/* Project tab nav */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 18,
          padding: 4,
          background: palette.panel,
          border: `1px solid ${palette.border}`,
          borderRadius: 10,
        }}
      >
        <ProjectTab
          label="All projects"
          active={selectedProject === null}
          count={allOpenCount}
          redCount={allRedCount}
          onClick={() => setSelectedProject(null)}
        />
        {projects.map((p) => (
          <ProjectTab
            key={p.bc_id}
            label={p.name}
            active={selectedProject === p.bc_id}
            count={p.ali_open_count}
            redCount={p.ali_red_count}
            onClick={() => setSelectedProject(p.bc_id)}
            onDoubleClick={() => toggleCbManaged(p)}
            dimmed={!p.is_cb_managed}
          />
        ))}
      </div>

      {/* Queue body */}
      {loading && <div style={{ color: palette.textDim }}>Loading your queue…</div>}
      {!loading && queue && queue.projects.length === 0 && (
        <div style={{ ...sectionStyle, padding: 32, textAlign: 'center', color: palette.textDim }}>
          No open todos assigned to you in CB-managed projects right now.
        </div>
      )}
      {!loading && queue && queue.projects.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {queue.projects.map((proj) => (
            <div key={proj.project_id} style={sectionStyle}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{proj.project_name}</h2>
                <div style={{ color: palette.textDim, fontSize: 12 }}>
                  {proj.task_count} task{proj.task_count === 1 ? '' : 's'}
                  {proj.red_count > 0 && (
                    <span style={{ color: palette.err, marginLeft: 8 }}>· {proj.red_count} red</span>
                  )}
                </div>
              </div>
              {proj.todolists.map((tl) => (
                <div key={`${proj.project_id}:${tl.todolist_id || 'none'}`} style={{ marginTop: 14 }}>
                  <div
                    style={{
                      color: palette.textDim,
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: 1,
                      textTransform: 'uppercase',
                      marginBottom: 8,
                      paddingBottom: 6,
                      borderBottom: `1px solid ${palette.border}`,
                    }}
                  >
                    {tl.todolist_name || '(unfiled)'} · {tl.tasks.length} task{tl.tasks.length === 1 ? '' : 's'}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {tl.tasks.map((t) => {
                      const cat = CATEGORY_STYLE[t.category] || CATEGORY_STYLE.unscored;
                      const sc = scoreColor(t.urgency_score);
                      const expanded = expandedPromptIds.has(t.bc_id);
                      const copied = copiedId === t.bc_id;
                      return (
                        <div
                          key={t.bc_id}
                          style={{
                            background: '#0e1729',
                            border: `1px solid ${palette.border}`,
                            borderRadius: 6,
                            padding: 12,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                            {t.urgency_score != null && (
                              <div
                                title={`Urgency ${t.urgency_score}/100`}
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
                              >
                                {t.urgency_score}
                              </div>
                            )}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                                {t.bc_app_url ? (
                                  <a
                                    href={t.bc_app_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ color: palette.text, textDecoration: 'none' }}
                                  >
                                    {t.title}
                                  </a>
                                ) : (
                                  t.title
                                )}
                              </div>
                              <div
                                style={{
                                  display: 'flex',
                                  gap: 8,
                                  alignItems: 'center',
                                  flexWrap: 'wrap',
                                  fontSize: 12,
                                  color: palette.textDim,
                                }}
                              >
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
                                {t.due_on && <span>due {t.due_on}</span>}
                                <span>upd {timeAgo(t.bc_updated_at)}</span>
                                <span style={{ color: palette.textDim }}>#{t.bc_id}</span>
                              </div>
                            </div>
                            {t.recommended_prompt && (
                              <button
                                onClick={() => togglePrompt(t.bc_id)}
                                style={{
                                  background: expanded ? palette.accent : 'transparent',
                                  color: expanded ? '#001225' : palette.accent,
                                  border: `1px solid ${palette.accent}`,
                                  borderRadius: 5,
                                  padding: '6px 10px',
                                  fontSize: 11,
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {expanded ? 'Hide prompt' : 'Run in Claude Code'}
                              </button>
                            )}
                          </div>
                          {expanded && t.recommended_prompt && (
                            <div style={{ marginTop: 10 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                <div style={{ fontSize: 11, color: palette.textDim, letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: 700 }}>
                                  Paste into Claude Code
                                </div>
                                <button
                                  onClick={() => copyPrompt(t.bc_id, t.recommended_prompt || '')}
                                  style={{
                                    background: copied ? palette.ok : 'transparent',
                                    color: copied ? '#001225' : palette.text,
                                    border: `1px solid ${copied ? palette.ok : palette.border}`,
                                    borderRadius: 4,
                                    padding: '4px 10px',
                                    fontSize: 11,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                  }}
                                >
                                  {copied ? 'Copied' : 'Copy'}
                                </button>
                              </div>
                              <pre
                                style={{
                                  background: '#0b1220',
                                  color: '#cbd5e1',
                                  border: `1px solid ${palette.border}`,
                                  borderRadius: 6,
                                  padding: 12,
                                  fontSize: 12,
                                  lineHeight: 1.55,
                                  margin: 0,
                                  maxHeight: 360,
                                  overflow: 'auto',
                                  whiteSpace: 'pre-wrap',
                                  wordBreak: 'break-word',
                                }}
                              >
                                {t.recommended_prompt}
                              </pre>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Ops panel toggle */}
      <div style={{ marginTop: 24 }}>
        <button
          onClick={() => setOpsPanelOpen((o) => !o)}
          style={{
            background: 'transparent',
            border: `1px solid ${palette.border}`,
            color: palette.textDim,
            padding: '8px 14px',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          {opsPanelOpen ? 'Hide system + triage stats' : 'Show system + triage stats'}
        </button>
      </div>
      {opsPanelOpen && (
        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={sectionStyle}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Triage Breakdown</h2>
            <div style={{ color: palette.textDim, fontSize: 12, marginTop: 4, marginBottom: 12 }}>
              Across ALL active todos (not just yours).
            </div>
            {health?.last_priority_run ? (
              <div style={{ display: 'grid', gap: 10 }}>
                {(Object.entries(health.last_priority_run.category_counts) as Array<[Category, number]>)
                  .filter(([, n]) => n > 0)
                  .sort((a, b) => b[1] - a[1])
                  .map(([cat, n]) => {
                    const style = CATEGORY_STYLE[cat];
                    return (
                      <div
                        key={cat}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                      >
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
                  <Row label="Last scored" value={timeAgo(health.last_priority_run.finished_at)} />
                  <Row
                    label="Duration"
                    value={`${Math.round(health.last_priority_run.duration_ms / 1000)}s`}
                  />
                  <Row label="Scored" value={String(health.last_priority_run.todos_scored)} />
                  <Row
                    label="Errors"
                    value={String(health.last_priority_run.error_count)}
                    color={health.last_priority_run.error_count > 0 ? palette.err : palette.ok}
                  />
                </div>
              </div>
            ) : (
              <div style={{ color: palette.textDim, padding: 16 }}>Engine has not run yet.</div>
            )}
          </div>
          <div style={sectionStyle}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>System Health</h2>
            <div style={{ color: palette.textDim, fontSize: 12, marginTop: 4, marginBottom: 12 }}>
              Basecamp mirror status.
            </div>
            {health?.last_sync ? (
              <div style={{ display: 'grid', gap: 10 }}>
                <Row label="Todos mirrored" value={String(health.todos_mirrored)} />
                <Row label="Projects scanned" value={String(health.last_sync.projects_seen)} />
                <Row label="Todos seen" value={String(health.last_sync.todos_seen)} />
                <Row label="Inserted" value={String(health.last_sync.todos_inserted)} />
                <Row label="Updated" value={String(health.last_sync.todos_updated)} />
                <Row
                  label="Duration"
                  value={`${Math.round(health.last_sync.duration_ms / 1000)}s`}
                />
                <Row label="Last sync" value={timeAgo(health.last_sync.finished_at)} />
                <Row
                  label="Errors"
                  value={String(health.last_sync.error_count)}
                  color={health.last_sync.error_count > 0 ? palette.err : palette.ok}
                />
              </div>
            ) : (
              <div style={{ color: palette.textDim, padding: 16 }}>No sync has completed yet.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const ProjectTab: React.FC<{
  label: string;
  active: boolean;
  count: number;
  redCount: number;
  onClick: () => void;
  onDoubleClick?: () => void;
  dimmed?: boolean;
}> = ({ label, active, count, redCount, onClick, onDoubleClick, dimmed }) => (
  <button
    onClick={onClick}
    onDoubleClick={onDoubleClick}
    title={onDoubleClick ? 'Double-click to toggle CB-managed' : undefined}
    style={{
      background: active ? palette.accent : 'transparent',
      color: active ? '#001225' : dimmed ? palette.textDim : palette.text,
      border: `1px solid ${active ? palette.accent : palette.border}`,
      borderRadius: 6,
      padding: '8px 14px',
      fontSize: 12,
      fontWeight: 600,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      opacity: dimmed ? 0.5 : 1,
    }}
  >
    <span>{label}</span>
    <span
      style={{
        background: active ? 'rgba(0,18,37,0.18)' : '#0b1220',
        color: active ? '#001225' : palette.textDim,
        borderRadius: 10,
        padding: '1px 7px',
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      {count}
    </span>
    {redCount > 0 && (
      <span
        style={{
          background: active ? '#001225' : '#3a1d22',
          color: palette.err,
          borderRadius: 10,
          padding: '1px 7px',
          fontSize: 10,
          fontWeight: 700,
        }}
      >
        {redCount}
      </span>
    )}
  </button>
);

const Row: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
    <span style={{ color: palette.textDim }}>{label}</span>
    <span style={{ color: color || palette.text, fontWeight: 600 }}>{value}</span>
  </div>
);

function ghostBtn(disabled: boolean): React.CSSProperties {
  return {
    background: 'transparent',
    border: `1px solid ${palette.border}`,
    color: palette.text,
    padding: '8px 14px',
    borderRadius: 6,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    fontSize: 12,
  };
}

function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    background: palette.accent,
    border: 'none',
    color: '#001225',
    padding: '8px 14px',
    borderRadius: 6,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    fontSize: 12,
  };
}

export default AiOpsCommandCenter;
