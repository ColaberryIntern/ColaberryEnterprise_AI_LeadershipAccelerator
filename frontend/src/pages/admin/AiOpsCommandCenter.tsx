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

interface BcComment {
  id: number;
  content: string;
  creator: string;
  created_at: string;
  app_url: string;
}

type DecisionKind =
  | 'approve'
  | 'approve_and_continue'
  | 'approve_and_convert_to_skill'
  | 'revise'
  | 'reject'
  | 'escalate';

interface DecisionRow {
  id: string;
  decision: DecisionKind;
  decision_reasoning: string | null;
  decided_at: string;
  decided_by: string | null;
}

interface TodayStats {
  total_today: number;
  by_decision: Record<string, number>;
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
  const [expandedWorkspaceIds, setExpandedWorkspaceIds] = useState<Set<string>>(new Set());
  const [comments, setComments] = useState<Record<string, BcComment[]>>({});
  const [decisionsByTodo, setDecisionsByTodo] = useState<Record<string, DecisionRow[]>>({});
  const [reasoning, setReasoning] = useState<Record<string, string>>({});
  const [postToBc, setPostToBc] = useState<Record<string, boolean>>({});
  const [todayStats, setTodayStats] = useState<TodayStats | null>(null);
  const [decisionInFlight, setDecisionInFlight] = useState<Set<string>>(new Set());
  const [recentDecidedIds, setRecentDecidedIds] = useState<Record<string, DecisionKind>>({});

  const refresh = useCallback(async () => {
    try {
      const [h, p, q, t] = await Promise.all([
        api.get<HealthPayload>('/api/admin/ops/health'),
        api.get<{ projects: ProjectChip[] }>('/api/admin/ops/projects'),
        api.get<QueuePayload>(
          `/api/admin/ops/my-queue${selectedProject ? `?project_id=${selectedProject}` : ''}`,
        ),
        api.get<TodayStats>('/api/admin/ops/decisions/today?mine=true'),
      ]);
      setHealth(h.data);
      setProjects(p.data.projects);
      setQueue(q.data);
      setTodayStats(t.data);
      setError(null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'failed to load');
    } finally {
      setLoading(false);
    }
  }, [selectedProject]);

  const loadWorkspaceContext = useCallback(async (bcId: string) => {
    try {
      const [c, d] = await Promise.all([
        api.get<{ comments: BcComment[] }>(`/api/admin/ops/todos/${bcId}/comments`),
        api.get<{ decisions: DecisionRow[] }>(`/api/admin/ops/todos/${bcId}/decisions`),
      ]);
      setComments((prev) => ({ ...prev, [bcId]: c.data.comments }));
      setDecisionsByTodo((prev) => ({ ...prev, [bcId]: d.data.decisions }));
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'failed to load workspace');
    }
  }, []);

  const toggleWorkspace = (bcId: string) => {
    setExpandedWorkspaceIds((prev) => {
      const next = new Set(prev);
      if (next.has(bcId)) {
        next.delete(bcId);
      } else {
        next.add(bcId);
        if (!comments[bcId]) loadWorkspaceContext(bcId);
        if (postToBc[bcId] === undefined) {
          setPostToBc((p) => ({ ...p, [bcId]: true }));
        }
      }
      return next;
    });
  };

  // Flatten queue into ordered list for "advance to next" behavior on
  // Approve+Continue.
  const flatTaskIds = (queue?.projects || []).flatMap((p) =>
    p.todolists.flatMap((tl) => tl.tasks.map((t) => t.bc_id)),
  );

  const decide = async (bcId: string, decision: DecisionKind) => {
    if (decisionInFlight.has(bcId)) return;
    setDecisionInFlight((prev) => new Set(prev).add(bcId));
    try {
      const body = {
        todo_bc_id: bcId,
        decision,
        reasoning: reasoning[bcId] || null,
        post_to_bc: postToBc[bcId] !== false,
      };
      const r = await api.post<{ ok: boolean; bc_comment_url: string | null; bc_post_error: string | null }>(
        '/api/admin/ops/decisions',
        body,
      );
      if (r.data.bc_post_error) {
        setError(`Decision saved but BC comment failed: ${r.data.bc_post_error}`);
      }
      setRecentDecidedIds((prev) => ({ ...prev, [bcId]: decision }));
      // Refresh decisions trail for this todo
      try {
        const d = await api.get<{ decisions: DecisionRow[] }>(
          `/api/admin/ops/todos/${bcId}/decisions`,
        );
        setDecisionsByTodo((prev) => ({ ...prev, [bcId]: d.data.decisions }));
      } catch {
        // non-fatal
      }
      // Refresh today's stats
      try {
        const t = await api.get<TodayStats>('/api/admin/ops/decisions/today?mine=true');
        setTodayStats(t.data);
      } catch {
        // non-fatal
      }
      // Advance to next task on Approve+Continue
      if (decision === 'approve_and_continue') {
        const idx = flatTaskIds.indexOf(bcId);
        const nextId = idx >= 0 && idx + 1 < flatTaskIds.length ? flatTaskIds[idx + 1] : null;
        setExpandedWorkspaceIds((prev) => {
          const next = new Set(prev);
          next.delete(bcId);
          if (nextId) {
            next.add(nextId);
            if (!comments[nextId]) loadWorkspaceContext(nextId);
            if (postToBc[nextId] === undefined) {
              setPostToBc((p) => ({ ...p, [nextId]: true }));
            }
          }
          return next;
        });
        if (nextId) {
          setTimeout(() => {
            const el = document.getElementById(`task-${nextId}`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 50);
        }
      } else {
        setExpandedWorkspaceIds((prev) => {
          const next = new Set(prev);
          next.delete(bcId);
          return next;
        });
      }
      setReasoning((prev) => ({ ...prev, [bcId]: '' }));
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'decision failed');
    } finally {
      setDecisionInFlight((prev) => {
        const next = new Set(prev);
        next.delete(bcId);
        return next;
      });
    }
  };

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
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {todayStats && (
            <div
              title={`Today's decisions: ${Object.entries(todayStats.by_decision).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'none yet'}`}
              style={{
                background: palette.panel,
                border: `1px solid ${palette.border}`,
                borderRadius: 6,
                padding: '6px 12px',
                fontSize: 12,
                color: palette.textDim,
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ color: palette.ok, fontWeight: 700 }}>{todayStats.total_today}</span>{' '}
              decision{todayStats.total_today === 1 ? '' : 's'} today
            </div>
          )}
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
                      const wsOpen = expandedWorkspaceIds.has(t.bc_id);
                      const recentDecision = recentDecidedIds[t.bc_id];
                      return (
                        <div
                          id={`task-${t.bc_id}`}
                          key={t.bc_id}
                          style={{
                            background: '#0e1729',
                            border: `1px solid ${recentDecision ? palette.ok : palette.border}`,
                            borderRadius: 6,
                            padding: 12,
                            opacity: recentDecision ? 0.7 : 1,
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
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
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
                              <button
                                onClick={() => toggleWorkspace(t.bc_id)}
                                style={{
                                  background: wsOpen ? palette.ok : 'transparent',
                                  color: wsOpen ? '#001225' : palette.ok,
                                  border: `1px solid ${palette.ok}`,
                                  borderRadius: 5,
                                  padding: '6px 10px',
                                  fontSize: 11,
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {wsOpen ? 'Hide decision' : 'Decide'}
                              </button>
                            </div>
                          </div>
                          {wsOpen && (
                            <ApprovalWorkspace
                              taskId={t.bc_id}
                              comments={comments[t.bc_id]}
                              decisions={decisionsByTodo[t.bc_id]}
                              reasoning={reasoning[t.bc_id] || ''}
                              setReasoning={(v) => setReasoning((p) => ({ ...p, [t.bc_id]: v }))}
                              postToBc={postToBc[t.bc_id] !== false}
                              setPostToBc={(v) => setPostToBc((p) => ({ ...p, [t.bc_id]: v }))}
                              inFlight={decisionInFlight.has(t.bc_id)}
                              recentDecision={recentDecision}
                              onDecide={(kind) => decide(t.bc_id, kind)}
                            />
                          )}
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

const DECISION_BUTTONS: Array<{
  kind: DecisionKind;
  label: string;
  bg: string;
  fg: string;
}> = [
  { kind: 'approve',                     label: 'Approve',              bg: '#0d2b27', fg: '#5cd9a3' },
  { kind: 'approve_and_continue',        label: 'Approve + next',       bg: '#0d3b32', fg: '#5cd9a3' },
  { kind: 'approve_and_convert_to_skill',label: 'Approve + skill',      bg: '#0d2b27', fg: '#5cd9a3' },
  { kind: 'revise',                      label: 'Revise',               bg: '#2d2410', fg: '#ffb84d' },
  { kind: 'reject',                      label: 'Reject',               bg: '#3a1d22', fg: '#ff6b6b' },
  { kind: 'escalate',                    label: 'Escalate',             bg: '#0e1c4a', fg: '#a5b4fc' },
];

const DECISION_LABEL_MAP: Record<DecisionKind, string> = {
  approve: 'Approved',
  approve_and_continue: 'Approved + next',
  approve_and_convert_to_skill: 'Approved + skill captured',
  revise: 'Revise requested',
  reject: 'Rejected',
  escalate: 'Escalated',
};

function htmlToPlain(html: string): string {
  // Cheap strip — these BC comments are auto-generated HTML; we just want
  // a readable preview. (No XSS concern since we render the result as
  // textContent, not innerHTML.)
  return String(html || '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const ApprovalWorkspace: React.FC<{
  taskId: string;
  comments: BcComment[] | undefined;
  decisions: DecisionRow[] | undefined;
  reasoning: string;
  setReasoning: (v: string) => void;
  postToBc: boolean;
  setPostToBc: (v: boolean) => void;
  inFlight: boolean;
  recentDecision: DecisionKind | undefined;
  onDecide: (kind: DecisionKind) => void;
}> = ({ taskId, comments, decisions, reasoning, setReasoning, postToBc, setPostToBc, inFlight, recentDecision, onDecide }) => {
  return (
    <div
      style={{
        marginTop: 10,
        background: '#0b1220',
        border: `1px solid ${palette.border}`,
        borderRadius: 6,
        padding: 14,
        display: 'grid',
        gridTemplateColumns: '1.4fr 1fr',
        gap: 14,
      }}
    >
      {/* Left: BC thread + decision history */}
      <div>
        <div
          style={{
            fontSize: 11,
            color: palette.textDim,
            fontWeight: 700,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            marginBottom: 6,
          }}
        >
          Recent Basecamp comments
        </div>
        {comments === undefined && (
          <div style={{ color: palette.textDim, fontSize: 12 }}>Loading…</div>
        )}
        {comments && comments.length === 0 && (
          <div style={{ color: palette.textDim, fontSize: 12 }}>No comments yet on this todo.</div>
        )}
        {comments && comments.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
            {comments.slice().reverse().slice(0, 6).map((c) => (
              <div
                key={c.id}
                style={{
                  background: '#0e1729',
                  border: `1px solid ${palette.border}`,
                  borderRadius: 4,
                  padding: 8,
                  fontSize: 12,
                  color: palette.text,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    color: palette.textDim,
                    fontSize: 11,
                    marginBottom: 4,
                  }}
                >
                  <span>{c.creator}</span>
                  <span>{new Date(c.created_at).toLocaleString()}</span>
                </div>
                <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.45 }}>
                  {htmlToPlain(c.content).slice(0, 600)}
                  {htmlToPlain(c.content).length > 600 ? '…' : ''}
                </div>
              </div>
            ))}
          </div>
        )}

        {decisions && decisions.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div
              style={{
                fontSize: 11,
                color: palette.textDim,
                fontWeight: 700,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                marginBottom: 6,
              }}
            >
              Decision history
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {decisions.slice(0, 5).map((d) => (
                <div
                  key={d.id}
                  style={{
                    background: '#0e1729',
                    border: `1px solid ${palette.border}`,
                    borderRadius: 4,
                    padding: 6,
                    fontSize: 11,
                    color: palette.textDim,
                  }}
                >
                  <span style={{ color: palette.text, fontWeight: 700 }}>{DECISION_LABEL_MAP[d.decision] || d.decision}</span>
                  {' · '}
                  {new Date(d.decided_at).toLocaleString()}
                  {d.decided_by ? ` · ${d.decided_by}` : ''}
                  {d.decision_reasoning ? (
                    <div style={{ marginTop: 3, color: palette.text }}>{d.decision_reasoning}</div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right: decision form */}
      <div>
        <div
          style={{
            fontSize: 11,
            color: palette.textDim,
            fontWeight: 700,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            marginBottom: 6,
          }}
        >
          Your decision
        </div>
        <textarea
          value={reasoning}
          onChange={(e) => setReasoning(e.target.value)}
          placeholder="Optional reasoning. Posted on BC + saved in audit trail."
          rows={4}
          style={{
            width: '100%',
            background: '#0e1729',
            color: palette.text,
            border: `1px solid ${palette.border}`,
            borderRadius: 4,
            padding: 8,
            fontSize: 12,
            fontFamily: 'inherit',
            resize: 'vertical',
            marginBottom: 8,
            boxSizing: 'border-box',
          }}
        />
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: palette.textDim,
            marginBottom: 10,
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={postToBc}
            onChange={(e) => setPostToBc(e.target.checked)}
          />
          Post decision to Basecamp as a comment
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {DECISION_BUTTONS.map((b) => (
            <button
              key={b.kind}
              onClick={() => onDecide(b.kind)}
              disabled={inFlight}
              style={{
                background: b.bg,
                color: b.fg,
                border: `1px solid ${b.fg}`,
                borderRadius: 4,
                padding: '8px 10px',
                fontSize: 11,
                fontWeight: 700,
                cursor: inFlight ? 'not-allowed' : 'pointer',
                opacity: inFlight ? 0.5 : 1,
              }}
            >
              {b.label}
            </button>
          ))}
        </div>
        {recentDecision && (
          <div
            style={{
              marginTop: 10,
              fontSize: 12,
              color: palette.ok,
              fontWeight: 700,
            }}
          >
            {DECISION_LABEL_MAP[recentDecision]}. Logged + posted.
          </div>
        )}
        <div style={{ marginTop: 8, fontSize: 11, color: palette.textDim }}>
          BC todo: <code>#{taskId}</code>
        </div>
      </div>
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
