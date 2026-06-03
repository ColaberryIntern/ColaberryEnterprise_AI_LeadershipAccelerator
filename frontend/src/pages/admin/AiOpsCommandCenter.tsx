import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  bc_app_url: string | null;
  due_on: string | null;
  bc_updated_at: string;
  urgency_score: number | null;
  category: Category;
  has_suggestion: boolean;
}

type ResourceKind = 'tool' | 'skill' | 'agent' | 'workflow' | 'mcp';

interface Resource {
  kind: ResourceKind;
  name: string;
  why: string;
}

interface Suggestion {
  action_kind: 'decision' | 'reply' | 'meeting' | 'research' | 'default';
  one_line: string;
  steps: string[];
  resources: Resource[];
  stop_conditions: string[];
  urgency_summary: string;
}

interface WorkspacePayload {
  todo: {
    bc_id: string;
    title: string;
    description: string | null;
    bc_app_url: string | null;
    project_id: string;
    project_name: string | null;
    todolist_name: string | null;
    due_on: string | null;
    bc_updated_at: string;
    urgency_score: number | null;
    category: Category;
  };
  suggestion: Suggestion;
  prompt: string;
  comments: BcComment[];
  comments_error: string | null;
  decisions: DecisionRow[];
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
  stale_hide_days: number;
  stale_hidden_count: number;
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

interface RunMyDayPayload {
  tasks: WorkspacePayload[];
  total: number;
  decided_by: string;
}

interface MetricsTodayPayload {
  date: string;
  metrics: {
    date: string;
    approvals_completed: number;
    approvals_open_at_end: number;
    approvals_avg_seconds: number | null;
    hours_saved_estimated: string | number;
  } | null;
}

interface StaleTodo {
  bc_id: string;
  project_id: string;
  project_name: string;
  todolist_name: string | null;
  title: string;
  bc_app_url: string | null;
  due_on: string | null;
  bc_updated_at: string;
  urgency_score: number | null;
  days_stale: number;
}

interface SkillRow {
  id: string;
  name: string;
  action_kind: string;
  captured_from_todo_bc_id: string | null;
  captured_from_todo_title: string | null;
  reasoning: string | null;
  decision: string | null;
  is_active: boolean;
  use_count: number;
  created_by: string | null;
  created_at: string;
}

interface AutomationRule {
  id: string;
  name: string;
  description: string | null;
  condition_jsonb: Record<string, any>;
  action_jsonb: Record<string, any>;
  is_active: boolean;
  last_fired_at: string | null;
  fire_count: number;
  created_at: string;
}

interface AutomationRunSummary {
  started_at: string;
  finished_at: string;
  rules_evaluated: number;
  rules_fired: number;
  fire_results: Array<{ rule_id: string; rule_name: string; rows_affected: number; error?: string }>;
}

type ViewMode = 'queue' | 'stale' | 'skills' | 'rules';

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
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showPromptIds, setShowPromptIds] = useState<Set<string>>(new Set());
  const [expandedWorkspaceIds, setExpandedWorkspaceIds] = useState<Set<string>>(new Set());
  const [workspaces, setWorkspaces] = useState<Record<string, WorkspacePayload>>({});
  const [workspaceLoading, setWorkspaceLoading] = useState<Set<string>>(new Set());
  const [workspaceError, setWorkspaceError] = useState<Record<string, string>>({});
  const [reasoning, setReasoning] = useState<Record<string, string>>({});
  const [postToBc, setPostToBc] = useState<Record<string, boolean>>({});
  const [todayStats, setTodayStats] = useState<TodayStats | null>(null);
  const [decisionInFlight, setDecisionInFlight] = useState<Set<string>>(new Set());
  const [recentDecidedIds, setRecentDecidedIds] = useState<Record<string, DecisionKind>>({});
  const [hideDecided, setHideDecided] = useState(false);
  const [runMyDayOpen, setRunMyDayOpen] = useState(false);
  const [runMyDayLoading, setRunMyDayLoading] = useState(false);
  const [runMyDayTasks, setRunMyDayTasks] = useState<WorkspacePayload[]>([]);
  const [runMyDayError, setRunMyDayError] = useState<string | null>(null);
  const [metricsToday, setMetricsToday] = useState<MetricsTodayPayload['metrics']>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('queue');
  const [staleTodos, setStaleTodos] = useState<StaleTodo[]>([]);
  const [staleLoading, setStaleLoading] = useState(false);
  const [staleSelected, setStaleSelected] = useState<Set<string>>(new Set());
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillsFilter, setSkillsFilter] = useState<string>('all');
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [lastAutomationRun, setLastAutomationRun] = useState<AutomationRunSummary | null>(null);
  const [weightDrafts, setWeightDrafts] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    try {
      const [h, p, q, t, m] = await Promise.all([
        api.get<HealthPayload>('/api/admin/ops/health'),
        api.get<{ projects: ProjectChip[] }>('/api/admin/ops/projects'),
        api.get<QueuePayload>(
          `/api/admin/ops/my-queue${selectedProject ? `?project_id=${selectedProject}` : ''}`,
        ),
        api.get<TodayStats>('/api/admin/ops/decisions/today?mine=true'),
        api.get<MetricsTodayPayload>('/api/admin/ops/metrics/today'),
      ]);
      setHealth(h.data);
      setProjects(p.data.projects);
      setQueue(q.data);
      setTodayStats(t.data);
      setMetricsToday(m.data.metrics);
      setError(null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'failed to load');
    } finally {
      setLoading(false);
    }
  }, [selectedProject]);

  const loadRunMyDay = useCallback(async () => {
    setRunMyDayLoading(true);
    setRunMyDayError(null);
    try {
      const r = await api.get<RunMyDayPayload>('/api/admin/ops/run-my-day?limit=5', { timeout: 15_000 });
      setRunMyDayTasks(r.data.tasks);
      // Hydrate workspaces cache so the Approval Workspace renders without a re-fetch
      const newWorkspaces: Record<string, WorkspacePayload> = {};
      for (const task of r.data.tasks) {
        newWorkspaces[task.todo.bc_id] = task;
      }
      setWorkspaces((prev) => ({ ...prev, ...newWorkspaces }));
    } catch (err: any) {
      setRunMyDayError(err?.response?.data?.error || err?.message || 'failed to load run-my-day');
    } finally {
      setRunMyDayLoading(false);
    }
  }, []);

  const enterRunMyDay = async () => {
    setRunMyDayOpen(true);
    await loadRunMyDay();
  };

  const exitRunMyDay = () => {
    setRunMyDayOpen(false);
  };

  const loadStale = useCallback(async () => {
    setStaleLoading(true);
    try {
      const r = await api.get<{ todos: StaleTodo[] }>('/api/admin/ops/stale-todos?limit=300');
      setStaleTodos(r.data.todos);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'failed to load stale todos');
    } finally {
      setStaleLoading(false);
    }
  }, []);

  const dismissStaleSelected = async (undismiss = false) => {
    if (staleSelected.size === 0) return;
    try {
      await api.post('/api/admin/ops/todos/dismiss', {
        bc_ids: Array.from(staleSelected),
        reason: 'archive',
        undismiss,
      });
      setStaleSelected(new Set());
      await loadStale();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'dismiss failed');
    }
  };

  const loadSkills = useCallback(async () => {
    setSkillsLoading(true);
    try {
      const r = await api.get<{ skills: SkillRow[] }>('/api/admin/ops/skills?include_inactive=true');
      setSkills(r.data.skills);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'failed to load skills');
    } finally {
      setSkillsLoading(false);
    }
  }, []);

  const toggleSkill = async (id: string) => {
    try {
      await api.post(`/api/admin/ops/skills/${id}/toggle`);
      await loadSkills();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'toggle failed');
    }
  };

  const deleteSkill = async (id: string) => {
    if (!window.confirm('Delete this skill?')) return;
    try {
      await api.delete(`/api/admin/ops/skills/${id}`);
      await loadSkills();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'delete failed');
    }
  };

  const loadRules = useCallback(async () => {
    setRulesLoading(true);
    try {
      const r = await api.get<{ rules: AutomationRule[]; last_run: AutomationRunSummary | null }>(
        '/api/admin/ops/automation-rules',
      );
      setRules(r.data.rules);
      setLastAutomationRun(r.data.last_run);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'failed to load automation rules');
    } finally {
      setRulesLoading(false);
    }
  }, []);

  const toggleRule = async (id: string) => {
    try {
      await api.post(`/api/admin/ops/automation-rules/${id}/toggle`);
      await loadRules();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'toggle failed');
    }
  };

  const runRulesNow = async () => {
    try {
      const r = await api.post<{ result: AutomationRunSummary }>('/api/admin/ops/automation-rules/run');
      setLastAutomationRun(r.data.result);
      await loadRules();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'rules run failed');
    }
  };

  const saveProjectWeight = async (bcId: string, raw: string) => {
    const weight = parseFloat(raw);
    if (!Number.isFinite(weight)) return;
    try {
      await api.post(`/api/admin/ops/projects/${bcId}/weight`, { weight });
      setWeightDrafts((p) => {
        const next = { ...p };
        delete next[bcId];
        return next;
      });
      await refresh();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'weight save failed');
    }
  };

  // Load tab data when switched
  useEffect(() => {
    if (viewMode === 'stale' && staleTodos.length === 0) loadStale();
    if (viewMode === 'skills' && skills.length === 0) loadSkills();
    if (viewMode === 'rules' && rules.length === 0) loadRules();
  }, [viewMode, staleTodos.length, skills.length, rules.length, loadStale, loadSkills, loadRules]);

  // (Keyboard shortcuts effect declared after `decide` below.)

  const loadWorkspace = useCallback(async (bcId: string) => {
    if (workspaces[bcId]) return; // already loaded
    setWorkspaceLoading((prev) => new Set(prev).add(bcId));
    setWorkspaceError((prev) => {
      const next = { ...prev };
      delete next[bcId];
      return next;
    });
    try {
      const r = await api.get<WorkspacePayload>(`/api/admin/ops/todos/${bcId}/workspace`, {
        timeout: 10_000,
      });
      setWorkspaces((prev) => ({ ...prev, [bcId]: r.data }));
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'failed to load workspace';
      setWorkspaceError((prev) => ({ ...prev, [bcId]: msg }));
    } finally {
      setWorkspaceLoading((prev) => {
        const next = new Set(prev);
        next.delete(bcId);
        return next;
      });
    }
  }, [workspaces]);

  const toggleWorkspace = (bcId: string) => {
    setExpandedWorkspaceIds((prev) => {
      const next = new Set(prev);
      if (next.has(bcId)) {
        next.delete(bcId);
      } else {
        next.add(bcId);
        if (!workspaces[bcId]) loadWorkspace(bcId);
        if (postToBc[bcId] === undefined) {
          setPostToBc((p) => ({ ...p, [bcId]: true }));
        }
      }
      return next;
    });
  };

  const togglePromptCopy = (bcId: string) => {
    setShowPromptIds((prev) => {
      const next = new Set(prev);
      if (next.has(bcId)) next.delete(bcId);
      else next.add(bcId);
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
            if (!workspaces[nextId]) loadWorkspace(nextId);
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

  // Keyboard shortcuts in Run My Day mode. We route through a ref so the
  // effect doesn't need to depend on `decide` (whose identity changes per
  // render). Keeps the deps list complete + avoids the
  // react-hooks/exhaustive-deps disable pattern that breaks prod builds.
  const decideRef = useRef(decide);
  decideRef.current = decide;
  useEffect(() => {
    if (!runMyDayOpen) return;
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName?.toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const firstOpenTask = runMyDayTasks.find(
        (t) => !recentDecidedIds[t.todo.bc_id],
      );
      if (!firstOpenTask) return;
      const bcId = firstOpenTask.todo.bc_id;
      const key = e.key.toLowerCase();
      const call = decideRef.current;
      if (key === 'a') { e.preventDefault(); call(bcId, 'approve_and_continue'); }
      else if (key === 's') { e.preventDefault(); call(bcId, 'approve_and_convert_to_skill'); }
      else if (key === 'r') { e.preventDefault(); call(bcId, 'revise'); }
      else if (key === 'x') { e.preventDefault(); call(bcId, 'reject'); }
      else if (key === 'e') { e.preventDefault(); call(bcId, 'escalate'); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [runMyDayOpen, runMyDayTasks, recentDecidedIds]);

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
            {queue && queue.stale_hidden_count > 0 && (
              <span style={{ marginLeft: 10 }}>
                · {queue.stale_hidden_count} stale todo{queue.stale_hidden_count === 1 ? '' : 's'} hidden (no BC activity in {queue.stale_hide_days}d)
              </span>
            )}
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
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              color: palette.textDim,
              cursor: 'pointer',
              userSelect: 'none',
              padding: '6px 10px',
              border: `1px solid ${palette.border}`,
              borderRadius: 6,
            }}
          >
            <input
              type="checkbox"
              checked={hideDecided}
              onChange={(e) => setHideDecided(e.target.checked)}
            />
            Hide decided
          </label>
          {!runMyDayOpen && (
            <button
              onClick={enterRunMyDay}
              disabled={runMyDayLoading}
              style={{
                background: palette.ok,
                border: 'none',
                color: '#001225',
                padding: '8px 14px',
                borderRadius: 6,
                fontWeight: 700,
                fontSize: 12,
                cursor: runMyDayLoading ? 'not-allowed' : 'pointer',
                opacity: runMyDayLoading ? 0.6 : 1,
              }}
            >
              {runMyDayLoading ? 'Loading…' : 'Run My Day'}
            </button>
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

      {/* Run My Day focused panel */}
      {runMyDayOpen && (
        <div
          style={{
            ...sectionStyle,
            marginBottom: 18,
            border: `1px solid ${palette.ok}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: palette.ok, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
                Run My Day
              </div>
              <h2 style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 700 }}>
                Top {runMyDayTasks.length} unresolved — work top to bottom
              </h2>
              <div style={{ color: palette.textDim, fontSize: 12, marginTop: 4 }}>
                {runMyDayTasks.filter((t) => recentDecidedIds[t.todo.bc_id]).length} of {runMyDayTasks.length} decided this session.
                Tasks you already decided today are excluded.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={loadRunMyDay} style={ghostBtn(runMyDayLoading)} disabled={runMyDayLoading}>
                {runMyDayLoading ? 'Reloading…' : 'Reload top 5'}
              </button>
              <button onClick={exitRunMyDay} style={ghostBtn(false)}>
                Exit Run My Day
              </button>
            </div>
          </div>
          {runMyDayError && (
            <div style={{ color: palette.err, fontSize: 13, marginBottom: 10 }}>{runMyDayError}</div>
          )}
          {!runMyDayLoading && runMyDayTasks.length === 0 && (
            <div style={{ color: palette.textDim, padding: 16, textAlign: 'center' }}>
              No unresolved high-priority tasks right now. You're caught up.
            </div>
          )}
          {runMyDayTasks.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {(hideDecided ? runMyDayTasks.filter((t) => !recentDecidedIds[t.todo.bc_id]) : runMyDayTasks).map((task, idx) => {
                const t = task.todo;
                const sc = scoreColor(t.urgency_score);
                const cat = CATEGORY_STYLE[t.category as Category] || CATEGORY_STYLE.unscored;
                const recentDecision = recentDecidedIds[t.bc_id];
                return (
                  <div
                    key={t.bc_id}
                    id={`task-${t.bc_id}`}
                    style={{
                      background: '#0e1729',
                      border: `1px solid ${recentDecision ? palette.ok : palette.border}`,
                      borderRadius: 6,
                      padding: 12,
                      opacity: recentDecision ? 0.7 : 1,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
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
                      >
                        {t.urgency_score}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, color: palette.textDim, marginBottom: 3 }}>
                          {idx + 1} of {runMyDayTasks.length} · {t.project_name} · {t.todolist_name || '(unfiled)'}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 500 }}>
                          {t.bc_app_url ? (
                            <a href={t.bc_app_url} target="_blank" rel="noopener noreferrer" style={{ color: palette.text, textDecoration: 'none' }}>
                              {t.title}
                            </a>
                          ) : t.title}
                        </div>
                        <div style={{ marginTop: 4, fontSize: 12, color: palette.textDim, display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ background: cat.bg, color: cat.fg, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', padding: '2px 8px', borderRadius: 3 }}>
                            {cat.label}
                          </span>
                          {t.due_on && <span>due {t.due_on}</span>}
                          <span>upd {timeAgo(t.bc_updated_at)}</span>
                          <span>#{t.bc_id}</span>
                        </div>
                      </div>
                    </div>
                    <ApprovalWorkspace
                      taskId={t.bc_id}
                      workspace={workspaces[t.bc_id]}
                      loading={workspaceLoading.has(t.bc_id)}
                      loadError={workspaceError[t.bc_id]}
                      reasoning={reasoning[t.bc_id] || ''}
                      setReasoning={(v) => setReasoning((p) => ({ ...p, [t.bc_id]: v }))}
                      postToBc={postToBc[t.bc_id] !== false}
                      setPostToBc={(v) => setPostToBc((p) => ({ ...p, [t.bc_id]: v }))}
                      inFlight={decisionInFlight.has(t.bc_id)}
                      recentDecision={recentDecision}
                      showPrompt={showPromptIds.has(t.bc_id)}
                      togglePrompt={() => togglePromptCopy(t.bc_id)}
                      copyPrompt={() => workspaces[t.bc_id]?.prompt && copyPrompt(t.bc_id, workspaces[t.bc_id].prompt)}
                      promptCopied={copiedId === t.bc_id}
                      onDecide={(kind) => decide(t.bc_id, kind)}
                      onRetry={() => loadWorkspace(t.bc_id)}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* View mode tab strip */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {(['queue', 'stale', 'skills', 'rules'] as ViewMode[]).map((vm) => (
          <button
            key={vm}
            onClick={() => setViewMode(vm)}
            style={{
              background: viewMode === vm ? palette.text : 'transparent',
              color: viewMode === vm ? palette.bg : palette.text,
              border: `1px solid ${palette.border}`,
              borderRadius: 6,
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {vm === 'queue' ? 'My queue' : vm === 'stale' ? `Stale review${queue && queue.stale_hidden_count > 0 ? ` (${queue.stale_hidden_count})` : ''}` : vm === 'skills' ? 'Captured skills' : 'Automation rules'}
          </button>
        ))}
      </div>

      {/* Stale review panel */}
      {viewMode === 'stale' && (
        <div style={sectionStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Stale todos — no Basecamp activity in 90+ days</h2>
              <div style={{ color: palette.textDim, fontSize: 12, marginTop: 4 }}>
                Bulk-select to dismiss (local mirror only — does not change Basecamp). Reversible.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={loadStale} style={ghostBtn(staleLoading)} disabled={staleLoading}>
                {staleLoading ? 'Loading…' : 'Reload'}
              </button>
              <button
                onClick={() => dismissStaleSelected(false)}
                disabled={staleSelected.size === 0}
                style={{
                  background: staleSelected.size > 0 ? palette.err : 'transparent',
                  color: staleSelected.size > 0 ? '#001225' : palette.textDim,
                  border: `1px solid ${palette.err}`,
                  borderRadius: 6,
                  padding: '8px 14px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: staleSelected.size > 0 ? 'pointer' : 'not-allowed',
                }}
              >
                Dismiss {staleSelected.size > 0 ? `(${staleSelected.size})` : ''}
              </button>
            </div>
          </div>
          {!staleLoading && staleTodos.length === 0 && (
            <div style={{ color: palette.textDim, padding: 16, textAlign: 'center' }}>
              No stale todos right now. The hidden-zombies counter on your queue header is 0.
            </div>
          )}
          {staleTodos.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 600, overflowY: 'auto' }}>
              <div style={{ fontSize: 11, color: palette.textDim, marginBottom: 4 }}>
                <label style={{ cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={staleSelected.size === staleTodos.length && staleTodos.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) setStaleSelected(new Set(staleTodos.map((t) => t.bc_id)));
                      else setStaleSelected(new Set());
                    }}
                  />{' '}
                  Select all {staleTodos.length}
                </label>
              </div>
              {staleTodos.map((t) => {
                const checked = staleSelected.has(t.bc_id);
                return (
                  <label
                    key={t.bc_id}
                    style={{
                      background: '#0e1729',
                      border: `1px solid ${checked ? palette.err : palette.border}`,
                      borderRadius: 4,
                      padding: 8,
                      cursor: 'pointer',
                      display: 'flex',
                      gap: 10,
                      alignItems: 'flex-start',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        setStaleSelected((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(t.bc_id);
                          else next.delete(t.bc_id);
                          return next;
                        });
                      }}
                      style={{ marginTop: 3 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>
                        {t.bc_app_url ? (
                          <a href={t.bc_app_url} target="_blank" rel="noopener noreferrer" style={{ color: palette.text, textDecoration: 'none' }}>
                            {t.title}
                          </a>
                        ) : t.title}
                      </div>
                      <div style={{ fontSize: 11, color: palette.textDim, marginTop: 2, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <span>{t.project_name}</span>
                        <span>{t.todolist_name || '(unfiled)'}</span>
                        <span style={{ color: palette.warn }}>{t.days_stale} days stale</span>
                        {t.due_on && <span>due {t.due_on}</span>}
                        <span>#{t.bc_id}</span>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Captured Skills panel */}
      {viewMode === 'skills' && (
        <div style={sectionStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Captured skills</h2>
              <div style={{ color: palette.textDim, fontSize: 12, marginTop: 4 }}>
                Decisions you marked "Approve + skill" become reusable patterns here.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                value={skillsFilter}
                onChange={(e) => setSkillsFilter(e.target.value)}
                style={{
                  background: '#0e1729',
                  color: palette.text,
                  border: `1px solid ${palette.border}`,
                  borderRadius: 6,
                  padding: '6px 10px',
                  fontSize: 12,
                }}
              >
                <option value="all">All kinds</option>
                <option value="reply">Reply</option>
                <option value="decision">Decision</option>
                <option value="meeting">Meeting</option>
                <option value="research">Research</option>
                <option value="default">Default</option>
              </select>
              <button onClick={loadSkills} style={ghostBtn(skillsLoading)} disabled={skillsLoading}>
                {skillsLoading ? 'Loading…' : 'Reload'}
              </button>
            </div>
          </div>
          {!skillsLoading && skills.length === 0 && (
            <div style={{ color: palette.textDim, padding: 16, textAlign: 'center' }}>
              No skills captured yet. Click "Approve + skill" on a decision to add the first one.
            </div>
          )}
          {skills.filter((s) => skillsFilter === 'all' || s.action_kind === skillsFilter).map((s) => (
            <div
              key={s.id}
              style={{
                background: '#0e1729',
                border: `1px solid ${palette.border}`,
                borderRadius: 6,
                padding: 10,
                marginBottom: 8,
                opacity: s.is_active ? 1 : 0.5,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: palette.textDim, marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{
                      background: '#0d2b27',
                      color: '#5cd9a3',
                      padding: '1px 6px',
                      borderRadius: 3,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      fontSize: 10,
                    }}>{s.action_kind}</span>
                    <span>used {s.use_count}×</span>
                    <span>captured {new Date(s.created_at).toLocaleDateString()}</span>
                    {s.created_by && <span>by {s.created_by}</span>}
                  </div>
                  {s.reasoning && (
                    <div style={{ fontSize: 12, color: palette.text, marginTop: 6, lineHeight: 1.45 }}>
                      {s.reasoning}
                    </div>
                  )}
                  {s.captured_from_todo_title && (
                    <div style={{ fontSize: 11, color: palette.textDim, marginTop: 4, fontStyle: 'italic' }}>
                      from: {s.captured_from_todo_title}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => toggleSkill(s.id)} style={ghostBtn(false)}>
                    {s.is_active ? 'Disable' : 'Enable'}
                  </button>
                  <button onClick={() => deleteSkill(s.id)} style={{
                    background: 'transparent',
                    color: palette.err,
                    border: `1px solid ${palette.err}`,
                    borderRadius: 4,
                    padding: '4px 10px',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Automation rules panel */}
      {viewMode === 'rules' && (
        <div style={sectionStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Automation rules</h2>
              <div style={{ color: palette.textDim, fontSize: 12, marginTop: 4 }}>
                Rule-based engine. Runs after each priority scoring pass (every 2 min).
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={loadRules} style={ghostBtn(rulesLoading)} disabled={rulesLoading}>
                {rulesLoading ? 'Loading…' : 'Reload'}
              </button>
              <button onClick={runRulesNow} style={primaryBtn(false)}>
                Run now
              </button>
            </div>
          </div>
          {lastAutomationRun && (
            <div style={{
              background: '#0e1729',
              border: `1px solid ${palette.border}`,
              borderRadius: 6,
              padding: 10,
              marginBottom: 14,
              fontSize: 12,
              color: palette.textDim,
            }}>
              <strong style={{ color: palette.text }}>Last run:</strong>{' '}
              {new Date(lastAutomationRun.finished_at).toLocaleString()} ·
              evaluated {lastAutomationRun.rules_evaluated} ·
              fired <span style={{ color: palette.ok }}>{lastAutomationRun.rules_fired}</span>
              {lastAutomationRun.fire_results.filter((f) => f.rows_affected > 0).length > 0 && (
                <div style={{ marginTop: 6 }}>
                  {lastAutomationRun.fire_results.filter((f) => f.rows_affected > 0).map((f) => (
                    <div key={f.rule_id}>
                      <span style={{ color: palette.text }}>{f.rule_name}</span>{' '}
                      → <span style={{ color: palette.ok }}>{f.rows_affected} rows</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {rules.map((r) => (
            <div
              key={r.id}
              style={{
                background: '#0e1729',
                border: `1px solid ${r.is_active ? palette.border : '#3a1d22'}`,
                borderRadius: 6,
                padding: 10,
                marginBottom: 8,
                opacity: r.is_active ? 1 : 0.5,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{r.name}</div>
                  {r.description && (
                    <div style={{ fontSize: 12, color: palette.textDim, marginTop: 4 }}>
                      {r.description}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: palette.textDim, marginTop: 6, display: 'flex', gap: 12 }}>
                    <span>fired {r.fire_count}×</span>
                    {r.last_fired_at && <span>last {timeAgo(r.last_fired_at)}</span>}
                  </div>
                  <pre style={{
                    background: '#0b1220',
                    border: `1px solid ${palette.border}`,
                    borderRadius: 4,
                    padding: 6,
                    fontSize: 11,
                    color: '#cbd5e1',
                    marginTop: 8,
                    overflow: 'auto',
                  }}>
{`if ${JSON.stringify(r.condition_jsonb)}\nthen ${JSON.stringify(r.action_jsonb)}`}
                  </pre>
                </div>
                <button onClick={() => toggleRule(r.id)} style={ghostBtn(false)}>
                  {r.is_active ? 'Disable' : 'Enable'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Project tab nav (queue mode only) */}
      {viewMode === 'queue' && (
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
      )}

      {/* Queue body (queue mode only) */}
      {viewMode === 'queue' && loading && <div style={{ color: palette.textDim }}>Loading your queue…</div>}
      {viewMode === 'queue' && !loading && queue && queue.projects.length === 0 && (
        <div style={{ ...sectionStyle, padding: 32, textAlign: 'center', color: palette.textDim }}>
          No open todos assigned to you in CB-managed projects right now.
        </div>
      )}
      {viewMode === 'queue' && !loading && queue && queue.projects.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {queue.projects
            .map((proj) => ({
              ...proj,
              todolists: proj.todolists
                .map((tl) => ({
                  ...tl,
                  tasks: hideDecided
                    ? tl.tasks.filter((t) => !recentDecidedIds[t.bc_id])
                    : tl.tasks,
                }))
                .filter((tl) => tl.tasks.length > 0),
            }))
            .filter((proj) => proj.todolists.length > 0)
            .map((proj) => (
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
                            <button
                              onClick={() => toggleWorkspace(t.bc_id)}
                              disabled={!t.has_suggestion}
                              title={t.has_suggestion ? undefined : 'Below suggestion threshold (urgency < 40)'}
                              style={{
                                background: wsOpen ? palette.ok : 'transparent',
                                color: wsOpen ? '#001225' : (t.has_suggestion ? palette.ok : palette.textDim),
                                border: `1px solid ${t.has_suggestion ? palette.ok : palette.border}`,
                                borderRadius: 5,
                                padding: '6px 12px',
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: t.has_suggestion ? 'pointer' : 'not-allowed',
                                whiteSpace: 'nowrap',
                                opacity: t.has_suggestion ? 1 : 0.5,
                              }}
                            >
                              {wsOpen ? 'Hide workspace' : 'Open workspace'}
                            </button>
                          </div>
                          {wsOpen && (
                            <ApprovalWorkspace
                              taskId={t.bc_id}
                              workspace={workspaces[t.bc_id]}
                              loading={workspaceLoading.has(t.bc_id)}
                              loadError={workspaceError[t.bc_id]}
                              reasoning={reasoning[t.bc_id] || ''}
                              setReasoning={(v) => setReasoning((p) => ({ ...p, [t.bc_id]: v }))}
                              postToBc={postToBc[t.bc_id] !== false}
                              setPostToBc={(v) => setPostToBc((p) => ({ ...p, [t.bc_id]: v }))}
                              inFlight={decisionInFlight.has(t.bc_id)}
                              recentDecision={recentDecision}
                              showPrompt={showPromptIds.has(t.bc_id)}
                              togglePrompt={() => togglePromptCopy(t.bc_id)}
                              copyPrompt={() =>
                                workspaces[t.bc_id]?.prompt && copyPrompt(t.bc_id, workspaces[t.bc_id].prompt)
                              }
                              promptCopied={copiedId === t.bc_id}
                              onDecide={(kind) => decide(t.bc_id, kind)}
                              onRetry={() => loadWorkspace(t.bc_id)}
                            />
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
        <>
        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <div style={sectionStyle}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Today's Pulse</h2>
            <div style={{ color: palette.textDim, fontSize: 12, marginTop: 4, marginBottom: 12 }}>
              Rollup of <code>ops_approval_queue</code> · refreshes every 5 min.
            </div>
            {metricsToday ? (
              <div style={{ display: 'grid', gap: 10 }}>
                <Row label="Decisions completed" value={String(metricsToday.approvals_completed)} />
                <Row
                  label="Avg time per decision"
                  value={
                    metricsToday.approvals_avg_seconds != null
                      ? `${Math.round(metricsToday.approvals_avg_seconds)}s`
                      : '—'
                  }
                />
                <Row
                  label="Hours saved (est)"
                  value={`${Number(metricsToday.hours_saved_estimated || 0).toFixed(1)}h`}
                  color={palette.ok}
                />
                <Row label="Approvals still open" value={String(metricsToday.approvals_open_at_end)} />
                <div style={{ color: palette.textDim, fontSize: 11, marginTop: 8 }}>
                  Hours-saved estimate: 0.25h per decision (conservative). Tuned in Phase 2 from real durations.
                </div>
              </div>
            ) : (
              <div style={{ color: palette.textDim, padding: 16, textAlign: 'center' }}>
                No decisions today yet. Make one to light this up.
              </div>
            )}
          </div>
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
        {/* Project weight knobs — tunes priority engine multiplier per project */}
        <div style={{ ...sectionStyle, marginTop: 16 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Project weights</h2>
          <div style={{ color: palette.textDim, fontSize: 12, marginTop: 4, marginBottom: 12 }}>
            Multiplier 0.0–2.0 applied to the priority engine's urgency score per project. 1.0 = neutral. Drop noisy admin projects to 0.4; lift strategic ones to 1.4.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
            {projects.filter((p) => p.is_cb_managed).map((p) => {
              const draft = weightDrafts[p.bc_id];
              const display = draft !== undefined ? draft : String(p.weight);
              return (
                <React.Fragment key={p.bc_id}>
                  <div style={{ fontSize: 12, color: palette.text, alignSelf: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {p.name}
                  </div>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="2"
                    value={display}
                    onChange={(e) => setWeightDrafts((prev) => ({ ...prev, [p.bc_id]: e.target.value }))}
                    onBlur={() => draft !== undefined && saveProjectWeight(p.bc_id, draft)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && draft !== undefined) {
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    style={{
                      background: '#0e1729',
                      color: palette.text,
                      border: `1px solid ${draft !== undefined ? palette.warn : palette.border}`,
                      borderRadius: 4,
                      padding: '4px 8px',
                      fontSize: 12,
                      width: 80,
                      textAlign: 'right',
                    }}
                  />
                </React.Fragment>
              );
            })}
          </div>
        </div>
        </>
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

const RESOURCE_KIND_STYLE: Record<ResourceKind, { label: string; bg: string; fg: string }> = {
  tool:     { label: 'Tool',     bg: '#0e1729', fg: '#4dabf7' },
  skill:    { label: 'Skill',    bg: '#0d2b27', fg: '#5cd9a3' },
  agent:    { label: 'Agent',    bg: '#1f0e2e', fg: '#c084fc' },
  workflow: { label: 'Workflow', bg: '#2d2410', fg: '#ffb84d' },
  mcp:      { label: 'MCP',      bg: '#0e1c4a', fg: '#a5b4fc' },
};

const ACTION_KIND_STYLE: Record<Suggestion['action_kind'], { label: string; color: string }> = {
  reply:    { label: 'REPLY',    color: '#4dabf7' },
  decision: { label: 'DECISION', color: '#ffb84d' },
  meeting:  { label: 'MEETING',  color: '#a5b4fc' },
  research: { label: 'RESEARCH', color: '#5cd9a3' },
  default:  { label: 'NEXT ACTION', color: '#cbd5e1' },
};

const ApprovalWorkspace: React.FC<{
  taskId: string;
  workspace: WorkspacePayload | undefined;
  loading: boolean;
  loadError: string | undefined;
  reasoning: string;
  setReasoning: (v: string) => void;
  postToBc: boolean;
  setPostToBc: (v: boolean) => void;
  inFlight: boolean;
  recentDecision: DecisionKind | undefined;
  showPrompt: boolean;
  togglePrompt: () => void;
  copyPrompt: () => void;
  promptCopied: boolean;
  onDecide: (kind: DecisionKind) => void;
  onRetry: () => void;
}> = ({
  taskId,
  workspace,
  loading,
  loadError,
  reasoning,
  setReasoning,
  postToBc,
  setPostToBc,
  inFlight,
  recentDecision,
  showPrompt,
  togglePrompt,
  copyPrompt,
  promptCopied,
  onDecide,
  onRetry,
}) => {
  if (loading && !workspace) {
    return (
      <div
        style={{
          marginTop: 10,
          background: '#0b1220',
          border: `1px solid ${palette.border}`,
          borderRadius: 6,
          padding: 14,
          color: palette.textDim,
          fontSize: 13,
        }}
      >
        Loading workspace…
      </div>
    );
  }

  if (loadError && !workspace) {
    return (
      <div
        style={{
          marginTop: 10,
          background: '#0b1220',
          border: `1px solid ${palette.err}`,
          borderRadius: 6,
          padding: 14,
          color: palette.err,
          fontSize: 13,
        }}
      >
        Failed to load workspace: {loadError}
        <button
          onClick={onRetry}
          style={{
            marginLeft: 10,
            background: 'transparent',
            border: `1px solid ${palette.err}`,
            color: palette.err,
            padding: '4px 10px',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!workspace) return null;
  const { suggestion, comments, comments_error, decisions, prompt } = workspace;
  const actionStyle = ACTION_KIND_STYLE[suggestion.action_kind] || ACTION_KIND_STYLE.default;

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
      {/* LEFT — the suggestion as primary content */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.8,
              padding: '2px 8px',
              borderRadius: 3,
              color: actionStyle.color,
              border: `1px solid ${actionStyle.color}`,
            }}
          >
            {actionStyle.label}
          </span>
          <span style={{ fontSize: 11, color: palette.textDim }}>
            {suggestion.urgency_summary}
          </span>
        </div>
        <div style={{ fontSize: 13.5, color: palette.text, marginBottom: 12, lineHeight: 1.5 }}>
          {suggestion.one_line}
        </div>

        <SectionHeading>Suggested steps</SectionHeading>
        <ol style={{ margin: '0 0 14px', padding: '0 0 0 22px', color: palette.text, fontSize: 12.5, lineHeight: 1.55 }}>
          {suggestion.steps.map((s, i) => (
            <li key={i} style={{ marginBottom: 4 }}>{s}</li>
          ))}
        </ol>

        <SectionHeading>Tools / Skills / Agents / Workflows</SectionHeading>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
          {suggestion.resources.map((r, i) => {
            const ks = RESOURCE_KIND_STYLE[r.kind];
            return (
              <div
                key={`${r.kind}:${r.name}:${i}`}
                style={{
                  background: '#0e1729',
                  border: `1px solid ${palette.border}`,
                  borderRadius: 4,
                  padding: '8px 10px',
                  fontSize: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span
                    style={{
                      background: ks.bg,
                      color: ks.fg,
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: 0.8,
                      textTransform: 'uppercase',
                      padding: '2px 6px',
                      borderRadius: 3,
                    }}
                  >
                    {ks.label}
                  </span>
                  <span style={{ color: palette.text, fontWeight: 700 }}>{r.name}</span>
                </div>
                <div style={{ color: palette.textDim, lineHeight: 1.5 }}>{r.why}</div>
              </div>
            );
          })}
        </div>

        {suggestion.stop_conditions.length > 0 && (
          <>
            <SectionHeading color={palette.warn}>Stop conditions</SectionHeading>
            <ul
              style={{
                margin: '0 0 14px',
                padding: '0 0 0 22px',
                color: palette.warn,
                fontSize: 12,
                lineHeight: 1.5,
              }}
            >
              {suggestion.stop_conditions.map((s, i) => (
                <li key={i} style={{ marginBottom: 3 }}>{s}</li>
              ))}
            </ul>
          </>
        )}

        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
            <button
              onClick={togglePrompt}
              style={{
                background: 'transparent',
                color: palette.accent,
                border: `1px solid ${palette.accent}`,
                borderRadius: 4,
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {showPrompt ? 'Hide raw prompt' : 'Show raw prompt for Claude Code'}
            </button>
            {showPrompt && (
              <button
                onClick={copyPrompt}
                style={{
                  background: promptCopied ? palette.ok : 'transparent',
                  color: promptCopied ? '#001225' : palette.text,
                  border: `1px solid ${promptCopied ? palette.ok : palette.border}`,
                  borderRadius: 4,
                  padding: '4px 10px',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {promptCopied ? 'Copied' : 'Copy'}
              </button>
            )}
          </div>
          {showPrompt && (
            <pre
              style={{
                background: '#0b1220',
                color: '#cbd5e1',
                border: `1px solid ${palette.border}`,
                borderRadius: 6,
                padding: 12,
                fontSize: 11.5,
                lineHeight: 1.55,
                margin: 0,
                maxHeight: 280,
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {prompt}
            </pre>
          )}
        </div>

        {comments.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <SectionHeading>Recent Basecamp comments ({comments.length})</SectionHeading>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto' }}>
              {comments.slice().reverse().slice(0, 4).map((c) => (
                <div
                  key={c.id}
                  style={{
                    background: '#0e1729',
                    border: `1px solid ${palette.border}`,
                    borderRadius: 4,
                    padding: 8,
                    fontSize: 11.5,
                    color: palette.text,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: palette.textDim, fontSize: 10.5, marginBottom: 3 }}>
                    <span>{c.creator}</span>
                    <span>{new Date(c.created_at).toLocaleString()}</span>
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.4 }}>
                    {htmlToPlain(c.content).slice(0, 420)}
                    {htmlToPlain(c.content).length > 420 ? '…' : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {comments_error && (
          <div style={{ marginTop: 10, fontSize: 11, color: palette.warn }}>
            BC comments unavailable: {comments_error}
          </div>
        )}

        {decisions.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <SectionHeading>Decision history</SectionHeading>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {decisions.slice(0, 4).map((d) => (
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
                  <span style={{ color: palette.text, fontWeight: 700 }}>
                    {DECISION_LABEL_MAP[d.decision] || d.decision}
                  </span>
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

      {/* RIGHT — decision form */}
      <div>
        <SectionHeading>Your decision</SectionHeading>
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
          <div style={{ marginTop: 10, fontSize: 12, color: palette.ok, fontWeight: 700 }}>
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

const SectionHeading: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color }) => (
  <div
    style={{
      fontSize: 10.5,
      color: color || palette.textDim,
      fontWeight: 700,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      marginBottom: 6,
    }}
  >
    {children}
  </div>
);

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
