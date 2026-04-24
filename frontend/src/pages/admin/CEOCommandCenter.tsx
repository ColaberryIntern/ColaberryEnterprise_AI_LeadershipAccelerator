import React, { useState, useEffect, useCallback, useRef } from 'react'; // eslint-disable-line
import api from '../../utils/api';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CompanyStatus {
  enabled: boolean;
  company: any;
  summary: any;
}

interface CompanyGoal {
  id: number;
  name: string;
  priority: string;
  status: string;
  current_value: number;
  target_value: number;
  unit: string;
  deadline: string;
  created_at: string;
  updated_at: string;
}

interface CompanyDirective {
  id: number;
  objective: string;
  priority: string;
  status: string;
  source: string;
  target_department: string;
  constraints: any;
  result_summary: string;
  cory_decision_id: string;
  created_at: string;
  updated_at: string;
}

interface DepartmentKpi {
  id: number;
  department: string;
  kpi_name: string;
  current_value: number;
  target_value: number;
  unit: string;
  trend: string;
}

interface CompanyBudget {
  id: number;
  department: string;
  allocated: number;
  spent: number;
  period: string;
}

interface CompanyAuditLog {
  id: number;
  event_type: string;
  actor: string;
  detail: string;
  created_at: string;
}

interface WorkforceAgent {
  name: string;
  department: string;
  status: string;
  last_heartbeat: string;
}

interface WorkforceInsight {
  agent_name: string;
  severity: string;
  issue: string;
  recommendation: string;
}

interface WorkforceReport {
  total: number;
  healthy: number;
  errored: number;
  idle: number;
  agents: WorkforceAgent[];
  insights: WorkforceInsight[];
}

interface Department {
  id: number;
  name: string;
  color: string;
}

interface Ticket {
  id: number;
  title: string;
  status: string;
  priority: string;
  department: string;
  created_at: string;
}

/* ------------------------------------------------------------------ */
/*  Colors & Constants                                                 */
/* ------------------------------------------------------------------ */

const BG = '#0a0e17';
const CARD_BG = '#111827';
const CARD_BORDER = 'rgba(255,255,255,0.08)';
const CARD_GLASS = 'rgba(255,255,255,0.03)';
const TEXT_WHITE = '#ffffff';
const TEXT_GRAY = '#9ca3af';
const TEXT_MUTED = '#6b7280';
const GREEN = '#38a169';
const AMBER = '#f59e0b';
const RED = '#e53e3e';
const BLUE = '#3b82f6';
const PURPLE = '#8b5cf6';

const PRIORITY_COLORS: Record<string, string> = {
  critical: RED,
  high: '#f97316',
  medium: BLUE,
  low: '#6b7280',
};

const STATUS_COLORS: Record<string, string> = {
  on_track: GREEN,
  at_risk: AMBER,
  behind: RED,
  completed: GREEN,
  proposed: AMBER,
  approved: BLUE,
  executing: PURPLE,
  executed: GREEN,
  rejected: RED,
  active: GREEN,
  healthy: GREEN,
  errored: RED,
  idle: TEXT_MUTED,
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function timeAgo(dateStr: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function daysRemaining(deadline: string): { text: string; color: string } {
  if (!deadline) return { text: 'No deadline', color: TEXT_MUTED };
  const diff = new Date(deadline).getTime() - Date.now();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days < 0) return { text: 'OVERDUE', color: RED };
  if (days === 0) return { text: 'Due today', color: AMBER };
  if (days <= 7) return { text: `${days} days left`, color: AMBER };
  return { text: `${days} days left`, color: TEXT_GRAY };
}

function healthColor(pct: number): string {
  if (pct >= 70) return GREEN;
  if (pct >= 40) return AMBER;
  return RED;
}

function settled<T>(r: PromiseSettledResult<{ data: T }>): T | null {
  return r.status === 'fulfilled' ? r.value.data : null;
}

/* ------------------------------------------------------------------ */
/*  Inline Style Helpers                                               */
/* ------------------------------------------------------------------ */

const glassCard: React.CSSProperties = {
  background: CARD_GLASS,
  border: `1px solid ${CARD_BORDER}`,
  borderRadius: 12,
  transition: 'box-shadow 0.3s ease, border-color 0.3s ease',
};

const sectionStyle: React.CSSProperties = {
  marginBottom: 48,
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function CEOCommandCenter() {
  // Data state
  const [status, setStatus] = useState<CompanyStatus | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [goals, setGoals] = useState<CompanyGoal[]>([]);
  const [directives, setDirectives] = useState<CompanyDirective[]>([]);
  const [kpis, setKpis] = useState<DepartmentKpi[]>([]);
  const [budgets, setBudgets] = useState<CompanyBudget[]>([]);
  const [audit, setAudit] = useState<CompanyAuditLog[]>([]);
  const [workforce, setWorkforce] = useState<WorkforceReport | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [cycling, setCycling] = useState(false);
  const [clock, setClock] = useState(new Date());
  const [selectedDirective, setSelectedDirective] = useState<CompanyDirective | null>(null);
  const [directiveFilter, setDirectiveFilter] = useState<string>('all');
  const [rejectReason, setRejectReason] = useState('');
  const [editingGoal, setEditingGoal] = useState<number | null>(null);
  const [addingGoal, setAddingGoal] = useState(false);
  const [newGoal, setNewGoal] = useState({ name: '', target_value: '', unit: '', priority: 'medium', deadline: '' });
  const [editGoalData, setEditGoalData] = useState<Partial<CompanyGoal>>({});
  const [expandedAudit, setExpandedAudit] = useState<number | null>(null);
  const [auditLimit, setAuditLimit] = useState(20);

  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clock tick
  useEffect(() => {
    clockRef.current = setInterval(() => setClock(new Date()), 1000);
    return () => { if (clockRef.current) clearInterval(clockRef.current); };
  }, []);

  // Data loading
  const loadAll = useCallback(async () => {
    const results = await Promise.allSettled([
      api.get('/api/admin/company/status'),
      api.get('/api/admin/company/goals'),
      api.get('/api/admin/company/directives'),
      api.get('/api/admin/company/kpis'),
      api.get('/api/admin/company/budgets'),
      api.get('/api/admin/company/audit'),
      api.get('/api/admin/company/workforce'),
      api.get('/api/admin/company/departments'),
      api.get('/api/admin/company/tickets'),
    ]);

    const [statusRes, goalsRes, directivesRes, kpisRes, budgetsRes, auditRes, workforceRes, deptRes, ticketsRes] = results;

    const s = settled<CompanyStatus>(statusRes as any);
    if (s) { setStatus(s); setEnabled(!!s.enabled); }
    const g = settled<CompanyGoal[]>(goalsRes as any);
    if (g) setGoals(Array.isArray(g) ? g : []);
    const d = settled<CompanyDirective[]>(directivesRes as any);
    if (d) setDirectives(Array.isArray(d) ? d : []);
    const k = settled<DepartmentKpi[]>(kpisRes as any);
    if (k) setKpis(Array.isArray(k) ? k : []);
    const b = settled<CompanyBudget[]>(budgetsRes as any);
    if (b) setBudgets(Array.isArray(b) ? b : []);
    const a = settled<CompanyAuditLog[]>(auditRes as any);
    if (a) setAudit(Array.isArray(a) ? a : []);
    const w = settled<WorkforceReport>(workforceRes as any);
    if (w) setWorkforce(w);
    const dp = settled<Department[]>(deptRes as any);
    if (dp) setDepartments(Array.isArray(dp) ? dp : []);
    const t = settled<Ticket[]>(ticketsRes as any);
    if (t) setTickets(Array.isArray(t) ? t : []);

    setLoading(false);
  }, []);

  const loadPolling = useCallback(async () => {
    const [dRes, aRes] = await Promise.allSettled([
      api.get('/api/admin/company/directives'),
      api.get('/api/admin/company/audit'),
    ]);
    const d = settled<CompanyDirective[]>(dRes as any);
    if (d) setDirectives(Array.isArray(d) ? d : []);
    const a = settled<CompanyAuditLog[]>(aRes as any);
    if (a) setAudit(Array.isArray(a) ? a : []);
  }, []);

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadPolling, 30000);
    return () => clearInterval(interval);
  }, [loadAll, loadPolling]);

  // Actions
  async function handleToggle() {
    const msg = enabled ? 'Disable the CEO Agent system?' : 'Enable the CEO Agent system?';
    if (!window.confirm(msg)) return;
    setToggling(true);
    try {
      await api.post('/api/admin/company/toggle');
      await loadAll();
    } catch (err) {
      console.error('Toggle failed:', err);
    }
    setToggling(false);
  }

  async function handleCycle() {
    if (!window.confirm('Run a strategic cycle now? This will analyze goals, generate directives, and dispatch work.')) return;
    setCycling(true);
    try {
      await api.post('/api/admin/company/cycle');
      await loadAll();
    } catch (err) {
      console.error('Cycle failed:', err);
    }
    setCycling(false);
  }

  async function handleApproveDirective(id: number) {
    try {
      await api.post(`/api/admin/company/directives/${id}/approve`);
      await loadAll();
      setSelectedDirective(null);
    } catch (err) {
      console.error('Approve failed:', err);
    }
  }

  async function handleRejectDirective(id: number) {
    if (!rejectReason.trim()) return;
    try {
      await api.post(`/api/admin/company/directives/${id}/reject`, { reason: rejectReason });
      setRejectReason('');
      await loadAll();
      setSelectedDirective(null);
    } catch (err) {
      console.error('Reject failed:', err);
    }
  }

  async function handleAddGoal() {
    if (!newGoal.name || !newGoal.target_value) return;
    try {
      await api.post('/api/admin/company/goals', {
        name: newGoal.name,
        target_value: Number(newGoal.target_value),
        unit: newGoal.unit || 'units',
        priority: newGoal.priority,
        deadline: newGoal.deadline || null,
      });
      setNewGoal({ name: '', target_value: '', unit: '', priority: 'medium', deadline: '' });
      setAddingGoal(false);
      await loadAll();
    } catch (err) {
      console.error('Add goal failed:', err);
    }
  }

  async function handleUpdateGoal(id: number) {
    try {
      await api.put(`/api/admin/company/goals/${id}`, editGoalData);
      setEditingGoal(null);
      setEditGoalData({});
      await loadAll();
    } catch (err) {
      console.error('Update goal failed:', err);
    }
  }

  // Computed values
  const goalsOnTrack = goals.filter(g => g.status === 'on_track' || g.status === 'completed').length;
  const goalsTotal = goals.length;
  const goalsPct = goalsTotal > 0 ? Math.round((goalsOnTrack / goalsTotal) * 100) : 0;

  const proposedDirectives = directives.filter(d => d.status === 'proposed').length;

  const fleetHealthy = workforce?.healthy ?? 0;
  const fleetTotal = workforce?.total ?? 0;
  const fleetPct = fleetTotal > 0 ? Math.round((fleetHealthy / fleetTotal) * 100) : 0;

  const totalAllocated = budgets.reduce((s, b) => s + (b.allocated || 0), 0);
  const totalSpent = budgets.reduce((s, b) => s + (b.spent || 0), 0);
  const budgetPct = totalAllocated > 0 ? Math.round((totalSpent / totalAllocated) * 100) : 0;

  const kpisUp = kpis.filter(k => k.trend === 'up').length;
  const kpisTotal = kpis.length;

  const openTickets = tickets.filter(t => t.status !== 'done' && t.status !== 'cancelled').length;

  const filteredDirectives = directiveFilter === 'all'
    ? directives
    : directives.filter(d => {
        if (directiveFilter === 'proposed') return d.status === 'proposed';
        if (directiveFilter === 'active') return d.status === 'approved' || d.status === 'executing';
        if (directiveFilter === 'completed') return d.status === 'executed' || d.status === 'rejected';
        return true;
      });

  // Group KPIs and budgets by department
  const deptMap = new Map<string, { kpis: DepartmentKpi[]; budget: CompanyBudget | null; dept: Department | null }>();
  departments.forEach(dept => {
    deptMap.set(dept.name, { kpis: [], budget: null, dept });
  });
  kpis.forEach(k => {
    const entry = deptMap.get(k.department) || { kpis: [], budget: null, dept: null };
    entry.kpis.push(k);
    deptMap.set(k.department, entry);
  });
  budgets.forEach(b => {
    const entry = deptMap.get(b.department) || { kpis: [], budget: null, dept: null };
    entry.budget = b;
    deptMap.set(b.department, entry);
  });

  const companyName = status?.company?.name || 'Colaberry';

  // Offline overlay
  const offlineOverlay = (
    <div style={{
      position: 'absolute', inset: 0, background: 'rgba(10,14,23,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      borderRadius: 12, zIndex: 5, backdropFilter: 'blur(4px)',
    }}>
      <span style={{ color: TEXT_MUTED, fontSize: 14, fontWeight: 500 }}>Enable system to view</span>
    </div>
  );

  /* ================================================================== */
  /*  RENDER                                                             */
  /* ================================================================== */

  return (
    <>
      <style>{`
        @keyframes cmdFadeIn {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes cmdPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes cmdGlow {
          0%, 100% { box-shadow: 0 0 0 rgba(59,130,246,0); }
          50% { box-shadow: 0 0 20px rgba(59,130,246,0.15); }
        }
        @keyframes cmdProgressRing {
          from { stroke-dashoffset: 314; }
        }
        .cmd-fade-1 { animation: cmdFadeIn 0.5s ease-out 0.1s both; }
        .cmd-fade-2 { animation: cmdFadeIn 0.5s ease-out 0.2s both; }
        .cmd-fade-3 { animation: cmdFadeIn 0.5s ease-out 0.3s both; }
        .cmd-fade-4 { animation: cmdFadeIn 0.5s ease-out 0.4s both; }
        .cmd-fade-5 { animation: cmdFadeIn 0.5s ease-out 0.5s both; }
        .cmd-fade-6 { animation: cmdFadeIn 0.5s ease-out 0.6s both; }
        .cmd-fade-7 { animation: cmdFadeIn 0.5s ease-out 0.7s both; }
        .cmd-card:hover {
          border-color: rgba(255,255,255,0.15) !important;
          box-shadow: 0 4px 24px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.05) !important;
        }
        .cmd-pulse { animation: cmdPulse 2s ease-in-out infinite; }
        .cmd-glow { animation: cmdGlow 3s ease-in-out infinite; }
        .cmd-toggle-track {
          width: 52px; height: 28px; border-radius: 14px; position: relative;
          cursor: pointer; transition: background 0.3s ease; border: none; padding: 0;
        }
        .cmd-toggle-thumb {
          width: 22px; height: 22px; border-radius: 50%; background: white;
          position: absolute; top: 3px; transition: left 0.3s ease;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }
        .cmd-dir-row:hover { background: rgba(255,255,255,0.04) !important; }
        .cmd-audit-row:hover { background: rgba(255,255,255,0.03) !important; }
        @media (prefers-reduced-motion: reduce) {
          .cmd-fade-1, .cmd-fade-2, .cmd-fade-3, .cmd-fade-4,
          .cmd-fade-5, .cmd-fade-6, .cmd-fade-7 { animation: none; opacity: 1; transform: none; }
          .cmd-pulse, .cmd-glow { animation: none; }
        }
        @media (max-width: 768px) {
          .cmd-kpi-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .cmd-goals-grid { grid-template-columns: 1fr !important; }
          .cmd-dir-split { flex-direction: column !important; }
          .cmd-dir-list, .cmd-dir-detail { width: 100% !important; min-width: 0 !important; }
          .cmd-dept-grid { grid-template-columns: 1fr !important; }
          .cmd-workforce-stats { grid-template-columns: repeat(2, 1fr) !important; }
          .cmd-command-bar { flex-wrap: wrap !important; height: auto !important; padding: 8px 16px !important; gap: 8px !important; }
        }
      `}</style>

      <div style={{
        minHeight: '100vh',
        background: BG,
        color: TEXT_WHITE,
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      }}>

        {/* ============================================================ */}
        {/* SECTION 1: Command Bar                                       */}
        {/* ============================================================ */}
        <div className="cmd-command-bar" style={{
          position: 'sticky', top: 0, zIndex: 100,
          height: 60, background: 'rgba(10,14,23,0.95)', backdropFilter: 'blur(12px)',
          borderBottom: `1px solid ${CARD_BORDER}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 24px',
        }}>
          {/* Left */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: TEXT_WHITE, letterSpacing: -0.5 }}>
              {companyName}
            </span>
            <span style={{
              fontSize: 11, fontWeight: 600, letterSpacing: 1,
              padding: '3px 10px', borderRadius: 12,
              background: enabled ? 'rgba(56,161,105,0.15)' : 'rgba(107,114,128,0.2)',
              color: enabled ? GREEN : TEXT_MUTED,
              textTransform: 'uppercase',
            }}>
              {enabled ? 'AUTONOMOUS' : 'OFFLINE'}
            </span>
          </div>

          {/* Center: Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: TEXT_GRAY }}>CEO Agent</span>
            <button
              className="cmd-toggle-track"
              onClick={handleToggle}
              disabled={toggling}
              style={{ background: enabled ? GREEN : '#374151' }}
              aria-label={enabled ? 'Disable CEO Agent' : 'Enable CEO Agent'}
            >
              <div className="cmd-toggle-thumb" style={{ left: enabled ? 27 : 3 }} />
            </button>
          </div>

          {/* Right */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={handleCycle}
              disabled={cycling || !enabled}
              style={{
                background: enabled ? BLUE : '#1f2937', color: enabled ? '#fff' : TEXT_MUTED,
                border: 'none', borderRadius: 8, padding: '6px 16px',
                fontSize: 12, fontWeight: 600, cursor: enabled ? 'pointer' : 'not-allowed',
                transition: 'background 0.2s',
              }}
            >
              {cycling ? 'Running...' : 'Run Strategic Cycle'}
            </button>

            <span style={{
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontSize: 14, color: TEXT_GRAY, fontWeight: 500, letterSpacing: 1,
              minWidth: 72, textAlign: 'center',
            }}>
              {clock.toLocaleTimeString('en-US', { hour12: false })}
            </span>

            <button
              onClick={() => loadAll()}
              disabled={!enabled}
              style={{
                background: enabled ? PURPLE : '#1f2937', color: enabled ? '#fff' : TEXT_MUTED,
                border: 'none', borderRadius: 8, padding: '6px 16px',
                fontSize: 12, fontWeight: 600, cursor: enabled ? 'pointer' : 'not-allowed',
                transition: 'background 0.2s',
              }}
            >
              Analyze Fleet
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div style={{ padding: '32px 24px', maxWidth: 1400, margin: '0 auto' }}>

          {/* Loading skeleton */}
          {loading && (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
              <div style={{ width: 40, height: 40, border: `3px solid ${CARD_BORDER}`, borderTopColor: BLUE, borderRadius: '50%', margin: '0 auto 16px', animation: 'spin 1s linear infinite' }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              <span style={{ color: TEXT_GRAY, fontSize: 14 }}>Initializing command center...</span>
            </div>
          )}

          {!loading && (
            <>
              {/* ============================================================ */}
              {/* SECTION 2: Mission Control KPIs                              */}
              {/* ============================================================ */}
              <div className="cmd-fade-1" style={sectionStyle}>
                <div className="cmd-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 16 }}>
                  <KPICard
                    label="Goals On Track"
                    value={`${goalsOnTrack}/${goalsTotal}`}
                    color={healthColor(goalsPct)}
                    disabled={!enabled}
                  />
                  <KPICard
                    label="Pending Directives"
                    value={String(proposedDirectives)}
                    color={proposedDirectives > 0 ? AMBER : GREEN}
                    pulse={proposedDirectives > 0}
                    disabled={!enabled}
                  />
                  <KPICard
                    label="Fleet Health"
                    value={`${fleetHealthy}/${fleetTotal}`}
                    color={healthColor(fleetPct)}
                    sub={fleetTotal > 0 ? `${fleetPct}%` : undefined}
                    disabled={!enabled}
                  />
                  <KPICard
                    label="Budget Utilization"
                    value={`${budgetPct}%`}
                    color={budgetPct > 90 ? RED : budgetPct > 70 ? AMBER : BLUE}
                    bar={budgetPct}
                    disabled={!enabled}
                  />
                  <KPICard
                    label="KPIs Trending Up"
                    value={`${kpisUp}/${kpisTotal}`}
                    color={kpisTotal > 0 && kpisUp / kpisTotal >= 0.5 ? GREEN : AMBER}
                    disabled={!enabled}
                  />
                  <KPICard
                    label="Open Tickets"
                    value={String(openTickets)}
                    color={openTickets > 10 ? RED : openTickets > 5 ? AMBER : GREEN}
                    disabled={!enabled}
                  />
                </div>
              </div>

              {/* ============================================================ */}
              {/* SECTION 3: Strategic Goals                                   */}
              {/* ============================================================ */}
              <div className="cmd-fade-2" style={sectionStyle}>
                <SectionHeader title="Strategic Goals" />
                <div style={{ position: 'relative' }}>
                  {!enabled && offlineOverlay}
                  <div className="cmd-goals-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                    {goals.map(goal => {
                      const pct = goal.target_value > 0 ? Math.min(Math.round((goal.current_value / goal.target_value) * 100), 100) : 0;
                      const dl = daysRemaining(goal.deadline);
                      const isEditing = editingGoal === goal.id;
                      const ringColor = PRIORITY_COLORS[goal.priority] || BLUE;

                      if (isEditing) {
                        return (
                          <div key={goal.id} className="cmd-card" style={{ ...glassCard, padding: 20, background: CARD_BG }}>
                            <div style={{ marginBottom: 12 }}>
                              <label style={{ fontSize: 11, color: TEXT_MUTED, display: 'block', marginBottom: 4 }}>Name</label>
                              <input
                                value={editGoalData.name ?? goal.name}
                                onChange={e => setEditGoalData({ ...editGoalData, name: e.target.value })}
                                style={inputStyle}
                              />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                              <div>
                                <label style={{ fontSize: 11, color: TEXT_MUTED, display: 'block', marginBottom: 4 }}>Target</label>
                                <input
                                  type="number"
                                  value={editGoalData.target_value ?? goal.target_value}
                                  onChange={e => setEditGoalData({ ...editGoalData, target_value: Number(e.target.value) })}
                                  style={inputStyle}
                                />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, color: TEXT_MUTED, display: 'block', marginBottom: 4 }}>Priority</label>
                                <select
                                  value={editGoalData.priority ?? goal.priority}
                                  onChange={e => setEditGoalData({ ...editGoalData, priority: e.target.value })}
                                  style={inputStyle}
                                >
                                  <option value="critical">Critical</option>
                                  <option value="high">High</option>
                                  <option value="medium">Medium</option>
                                  <option value="low">Low</option>
                                </select>
                              </div>
                            </div>
                            <div style={{ marginBottom: 12 }}>
                              <label style={{ fontSize: 11, color: TEXT_MUTED, display: 'block', marginBottom: 4 }}>Deadline</label>
                              <input
                                type="date"
                                value={editGoalData.deadline ?? (goal.deadline ? goal.deadline.split('T')[0] : '')}
                                onChange={e => setEditGoalData({ ...editGoalData, deadline: e.target.value })}
                                style={inputStyle}
                              />
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button onClick={() => handleUpdateGoal(goal.id)} style={{ ...btnSmall, background: GREEN }}>Save</button>
                              <button onClick={() => { setEditingGoal(null); setEditGoalData({}); }} style={{ ...btnSmall, background: '#374151' }}>Cancel</button>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={goal.id}
                          className="cmd-card"
                          style={{ ...glassCard, padding: 20, background: CARD_BG, cursor: 'pointer' }}
                          onClick={() => { setEditingGoal(goal.id); setEditGoalData({}); }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                            {/* Progress ring */}
                            <svg width={80} height={80} style={{ flexShrink: 0 }}>
                              <circle cx={40} cy={40} r={34} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={6} />
                              <circle
                                cx={40} cy={40} r={34} fill="none"
                                stroke={ringColor} strokeWidth={6}
                                strokeLinecap="round"
                                strokeDasharray={`${2 * Math.PI * 34}`}
                                strokeDashoffset={`${2 * Math.PI * 34 * (1 - pct / 100)}`}
                                transform="rotate(-90 40 40)"
                                style={{ transition: 'stroke-dashoffset 0.8s ease' }}
                              />
                              <text x={40} y={44} textAnchor="middle" fill={TEXT_WHITE} fontSize={16} fontWeight={700}>
                                {pct}%
                              </text>
                            </svg>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 15, fontWeight: 600, color: TEXT_WHITE, marginBottom: 6 }}>{goal.name}</div>
                              <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                                <span style={{
                                  fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 8,
                                  background: `${PRIORITY_COLORS[goal.priority] || BLUE}20`,
                                  color: PRIORITY_COLORS[goal.priority] || BLUE,
                                  textTransform: 'uppercase',
                                }}>
                                  {goal.priority}
                                </span>
                                <span style={{
                                  fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 8,
                                  background: `${STATUS_COLORS[goal.status] || TEXT_MUTED}20`,
                                  color: STATUS_COLORS[goal.status] || TEXT_MUTED,
                                }}>
                                  {(goal.status || '').replace(/_/g, ' ')}
                                </span>
                              </div>
                              <div style={{ fontSize: 12, color: TEXT_GRAY, marginBottom: 4 }}>
                                {goal.current_value} / {goal.target_value} {goal.unit}
                              </div>
                              <div style={{ fontSize: 11, color: dl.color }}>{dl.text}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* Add Goal card */}
                    {addingGoal ? (
                      <div className="cmd-card" style={{ ...glassCard, padding: 20, background: CARD_BG }}>
                        <div style={{ marginBottom: 10 }}>
                          <input
                            placeholder="Goal name"
                            value={newGoal.name}
                            onChange={e => setNewGoal({ ...newGoal, name: e.target.value })}
                            style={inputStyle}
                          />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                          <input
                            placeholder="Target value"
                            type="number"
                            value={newGoal.target_value}
                            onChange={e => setNewGoal({ ...newGoal, target_value: e.target.value })}
                            style={inputStyle}
                          />
                          <input
                            placeholder="Unit (e.g. %)"
                            value={newGoal.unit}
                            onChange={e => setNewGoal({ ...newGoal, unit: e.target.value })}
                            style={inputStyle}
                          />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                          <select
                            value={newGoal.priority}
                            onChange={e => setNewGoal({ ...newGoal, priority: e.target.value })}
                            style={inputStyle}
                          >
                            <option value="critical">Critical</option>
                            <option value="high">High</option>
                            <option value="medium">Medium</option>
                            <option value="low">Low</option>
                          </select>
                          <input
                            type="date"
                            value={newGoal.deadline}
                            onChange={e => setNewGoal({ ...newGoal, deadline: e.target.value })}
                            style={inputStyle}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={handleAddGoal} style={{ ...btnSmall, background: GREEN }}>Create</button>
                          <button onClick={() => setAddingGoal(false)} style={{ ...btnSmall, background: '#374151' }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="cmd-card"
                        onClick={() => enabled && setAddingGoal(true)}
                        style={{
                          ...glassCard, padding: 20, background: 'transparent',
                          border: `2px dashed ${CARD_BORDER}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          minHeight: 140, cursor: enabled ? 'pointer' : 'not-allowed',
                          opacity: enabled ? 0.6 : 0.3,
                        }}
                      >
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 32, color: TEXT_MUTED, marginBottom: 8 }}>+</div>
                          <div style={{ fontSize: 13, color: TEXT_MUTED }}>Add Goal</div>
                        </div>
                      </div>
                    )}
                  </div>
                  {goals.length === 0 && enabled && (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: TEXT_MUTED, fontSize: 13 }}>
                      No strategic goals defined yet. Click "Add Goal" to create one.
                    </div>
                  )}
                </div>
              </div>

              {/* ============================================================ */}
              {/* SECTION 4: CEO Directives                                    */}
              {/* ============================================================ */}
              <div className="cmd-fade-3" style={sectionStyle}>
                <SectionHeader title="CEO Directives" />
                <div style={{ position: 'relative' }}>
                  {!enabled && offlineOverlay}

                  {/* Filter tabs */}
                  <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
                    {(['all', 'proposed', 'active', 'completed'] as const).map(tab => (
                      <button
                        key={tab}
                        onClick={() => setDirectiveFilter(tab)}
                        style={{
                          background: directiveFilter === tab ? 'rgba(255,255,255,0.1)' : 'transparent',
                          border: `1px solid ${directiveFilter === tab ? 'rgba(255,255,255,0.2)' : 'transparent'}`,
                          borderRadius: 8, padding: '6px 14px',
                          color: directiveFilter === tab ? TEXT_WHITE : TEXT_MUTED,
                          fontSize: 12, fontWeight: 500, cursor: 'pointer',
                          textTransform: 'capitalize',
                        }}
                      >
                        {tab}
                        {tab === 'proposed' && proposedDirectives > 0 && (
                          <span style={{
                            marginLeft: 6, background: AMBER, color: '#000', fontSize: 10,
                            fontWeight: 700, borderRadius: 6, padding: '1px 5px',
                          }}>{proposedDirectives}</span>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Split layout */}
                  <div className="cmd-dir-split" style={{ display: 'flex', gap: 16, minHeight: 400 }}>
                    {/* Left: list */}
                    <div className="cmd-dir-list" style={{ width: '40%', minWidth: 320, overflowY: 'auto', maxHeight: 500 }}>
                      {filteredDirectives.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '40px 0', color: TEXT_MUTED, fontSize: 13 }}>
                          No directives found
                        </div>
                      )}
                      {filteredDirectives.map(d => (
                        <div
                          key={d.id}
                          className="cmd-dir-row"
                          onClick={() => setSelectedDirective(d)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '12px 14px', borderRadius: 8, cursor: 'pointer',
                            background: selectedDirective?.id === d.id ? 'rgba(255,255,255,0.06)' : 'transparent',
                            borderLeft: `3px solid ${STATUS_COLORS[d.status] || TEXT_MUTED}`,
                            marginBottom: 4,
                          }}
                        >
                          {/* Status dot */}
                          <div
                            className={d.status === 'proposed' ? 'cmd-pulse' : ''}
                            style={{
                              width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                              background: STATUS_COLORS[d.status] || TEXT_MUTED,
                            }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontSize: 13, color: TEXT_WHITE, fontWeight: 500,
                              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            }}>
                              {d.objective}
                            </div>
                            <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
                              <span style={{
                                fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 6,
                                background: `${PRIORITY_COLORS[d.priority] || BLUE}20`,
                                color: PRIORITY_COLORS[d.priority] || BLUE,
                                textTransform: 'uppercase',
                              }}>
                                {d.priority}
                              </span>
                              {d.target_department && (
                                <span style={{
                                  fontSize: 9, padding: '1px 6px', borderRadius: 6,
                                  background: 'rgba(139,92,246,0.15)', color: PURPLE,
                                }}>
                                  {d.target_department}
                                </span>
                              )}
                              <span style={{ fontSize: 10, color: TEXT_MUTED, marginLeft: 'auto' }}>
                                {timeAgo(d.created_at)}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Right: detail */}
                    <div className="cmd-dir-detail" style={{
                      flex: 1, ...glassCard, background: CARD_BG, padding: 24,
                      display: 'flex', flexDirection: 'column',
                    }}>
                      {selectedDirective ? (
                        <>
                          <div style={{ fontSize: 17, fontWeight: 600, color: TEXT_WHITE, marginBottom: 16, lineHeight: 1.4 }}>
                            {selectedDirective.objective}
                          </div>

                          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                            <span style={{
                              fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: 8,
                              background: `${STATUS_COLORS[selectedDirective.status] || TEXT_MUTED}20`,
                              color: STATUS_COLORS[selectedDirective.status] || TEXT_MUTED,
                              textTransform: 'uppercase',
                            }}>
                              {selectedDirective.status}
                            </span>
                            <span style={{
                              fontSize: 10, padding: '3px 10px', borderRadius: 8,
                              background: 'rgba(59,130,246,0.12)', color: BLUE,
                            }}>
                              Source: {selectedDirective.source || 'CEO_AGENT'}
                            </span>
                            {selectedDirective.target_department && (
                              <span style={{
                                fontSize: 10, padding: '3px 10px', borderRadius: 8,
                                background: 'rgba(139,92,246,0.12)', color: PURPLE,
                              }}>
                                Dept: {selectedDirective.target_department}
                              </span>
                            )}
                          </div>

                          {/* Constraints */}
                          {selectedDirective.constraints && (
                            <div style={{ marginBottom: 16 }}>
                              <div style={{ fontSize: 11, color: TEXT_MUTED, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Constraints</div>
                              <pre style={{
                                background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: 12,
                                fontSize: 11, color: TEXT_GRAY, overflowX: 'auto',
                                border: `1px solid ${CARD_BORDER}`, margin: 0,
                                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                              }}>
                                {typeof selectedDirective.constraints === 'string'
                                  ? selectedDirective.constraints
                                  : JSON.stringify(selectedDirective.constraints, null, 2)}
                              </pre>
                            </div>
                          )}

                          {/* Cory Decision */}
                          {selectedDirective.cory_decision_id && (
                            <div style={{ marginBottom: 16 }}>
                              <span style={{ fontSize: 11, color: TEXT_MUTED }}>Cory Decision: </span>
                              <span style={{ fontSize: 12, color: BLUE, fontFamily: 'monospace' }}>
                                {selectedDirective.cory_decision_id}
                              </span>
                            </div>
                          )}

                          {/* Result summary */}
                          {selectedDirective.result_summary && (
                            <div style={{ marginBottom: 16 }}>
                              <div style={{ fontSize: 11, color: TEXT_MUTED, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Result</div>
                              <div style={{ fontSize: 13, color: TEXT_GRAY, lineHeight: 1.5 }}>
                                {selectedDirective.result_summary}
                              </div>
                            </div>
                          )}

                          {/* Action buttons for proposed */}
                          {selectedDirective.status === 'proposed' && (
                            <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: `1px solid ${CARD_BORDER}` }}>
                              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                                <button
                                  onClick={() => handleApproveDirective(selectedDirective.id)}
                                  style={{ ...btnSmall, background: GREEN, flex: 1, padding: '10px 0', fontSize: 13 }}
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => rejectReason.trim() && handleRejectDirective(selectedDirective.id)}
                                  disabled={!rejectReason.trim()}
                                  style={{
                                    ...btnSmall, background: rejectReason.trim() ? RED : '#374151',
                                    flex: 1, padding: '10px 0', fontSize: 13,
                                    cursor: rejectReason.trim() ? 'pointer' : 'not-allowed',
                                  }}
                                >
                                  Reject
                                </button>
                              </div>
                              <input
                                placeholder="Rejection reason (required to reject)"
                                value={rejectReason}
                                onChange={e => setRejectReason(e.target.value)}
                                style={{ ...inputStyle, width: '100%' }}
                              />
                            </div>
                          )}
                        </>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: TEXT_MUTED, fontSize: 13 }}>
                          Select a directive to view details
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* ============================================================ */}
              {/* SECTION 5: Department Performance                            */}
              {/* ============================================================ */}
              <div className="cmd-fade-4" style={sectionStyle}>
                <SectionHeader title="Department Performance" />
                <div style={{ position: 'relative' }}>
                  {!enabled && offlineOverlay}
                  <div className="cmd-dept-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                    {Array.from(deptMap.entries()).map(([deptName, data]) => {
                      const budget = data.budget;
                      const deptKpis = data.kpis.slice(0, 3);
                      const deptColor = data.dept?.color || BLUE;
                      const budgetPctLocal = budget && budget.allocated > 0
                        ? Math.round((budget.spent / budget.allocated) * 100) : 0;

                      // Derive health score from KPI performance
                      const kpiScores = data.kpis.map(k =>
                        k.target_value > 0 ? Math.min((k.current_value / k.target_value) * 100, 100) : 50
                      );
                      const healthScore = kpiScores.length > 0
                        ? Math.round(kpiScores.reduce((a, b) => a + b, 0) / kpiScores.length)
                        : 50;

                      return (
                        <div key={deptName} className="cmd-card" style={{ ...glassCard, padding: 18, background: CARD_BG }}>
                          {/* Header */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: deptColor }} />
                            <span style={{ fontSize: 14, fontWeight: 600, color: TEXT_WHITE }}>{deptName}</span>
                          </div>

                          {/* Health Score bar */}
                          <div style={{ marginBottom: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                              <span style={{ fontSize: 11, color: TEXT_MUTED }}>Health Score</span>
                              <span style={{ fontSize: 11, fontWeight: 600, color: healthColor(healthScore) }}>{healthScore}/100</span>
                            </div>
                            <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>
                              <div style={{
                                height: '100%', borderRadius: 3, width: `${healthScore}%`,
                                background: `linear-gradient(90deg, ${RED}, ${AMBER}, ${GREEN})`,
                                backgroundSize: '300% 100%',
                                backgroundPosition: `${100 - healthScore}% 0`,
                                transition: 'width 0.6s ease',
                              }} />
                            </div>
                          </div>

                          {/* Budget bar */}
                          {budget && (
                            <div style={{ marginBottom: 12 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                <span style={{ fontSize: 11, color: TEXT_MUTED }}>Budget</span>
                                <span style={{ fontSize: 11, color: TEXT_GRAY }}>
                                  ${(budget.spent || 0).toLocaleString()} / ${(budget.allocated || 0).toLocaleString()}
                                </span>
                              </div>
                              <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                                <div style={{
                                  height: '100%', borderRadius: 2, width: `${Math.min(budgetPctLocal, 100)}%`,
                                  background: budgetPctLocal > 90 ? RED : budgetPctLocal > 70 ? AMBER : BLUE,
                                  transition: 'width 0.6s ease',
                                }} />
                              </div>
                            </div>
                          )}

                          {/* KPIs */}
                          {deptKpis.length > 0 && (
                            <div>
                              {deptKpis.map(k => (
                                <div key={k.id} style={{
                                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                  padding: '4px 0', borderTop: `1px solid ${CARD_BORDER}`,
                                }}>
                                  <span style={{ fontSize: 11, color: TEXT_GRAY, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {k.kpi_name}
                                  </span>
                                  <span style={{ fontSize: 12, fontWeight: 600, color: TEXT_WHITE, marginLeft: 8 }}>
                                    {k.current_value}{k.unit ? ` ${k.unit}` : ''}
                                  </span>
                                  <span style={{
                                    marginLeft: 6, fontSize: 14,
                                    color: k.trend === 'up' ? GREEN : k.trend === 'down' ? RED : TEXT_MUTED,
                                  }}>
                                    {k.trend === 'up' ? '\u2191' : k.trend === 'down' ? '\u2193' : '\u2192'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                          {deptKpis.length === 0 && !budget && (
                            <div style={{ fontSize: 12, color: TEXT_MUTED, textAlign: 'center', padding: '8px 0' }}>No data</div>
                          )}
                        </div>
                      );
                    })}
                    {deptMap.size === 0 && enabled && (
                      <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px 0', color: TEXT_MUTED, fontSize: 13 }}>
                        No departments configured yet.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ============================================================ */}
              {/* SECTION 6: Workforce Intelligence                            */}
              {/* ============================================================ */}
              <div className="cmd-fade-5" style={sectionStyle}>
                <div style={{
                  background: 'linear-gradient(135deg, rgba(17,24,39,1) 0%, rgba(30,41,59,1) 100%)',
                  borderRadius: 16, padding: 28, border: `1px solid ${CARD_BORDER}`,
                  position: 'relative',
                }}>
                  {!enabled && offlineOverlay}
                  <SectionHeader title="Workforce Intelligence" />

                  {/* Stat boxes */}
                  <div className="cmd-workforce-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
                    <StatBox label="Total Agents" value={workforce?.total ?? 0} color={BLUE} icon={'\u2699'} />
                    <StatBox label="Healthy" value={workforce?.healthy ?? 0} color={GREEN} icon={'\u2714'} />
                    <StatBox label="Errored" value={workforce?.errored ?? 0} color={RED} icon={'\u2716'} />
                    <StatBox label="Idle" value={workforce?.idle ?? 0} color={TEXT_MUTED} icon={'\u23F8'} />
                  </div>

                  {/* Stacked distribution bar */}
                  {(workforce?.total ?? 0) > 0 && (
                    <div style={{ marginBottom: 24 }}>
                      <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', background: 'rgba(255,255,255,0.04)' }}>
                        {(workforce?.healthy ?? 0) > 0 && (
                          <div style={{ width: `${((workforce?.healthy ?? 0) / (workforce?.total ?? 1)) * 100}%`, background: GREEN, transition: 'width 0.6s ease' }} />
                        )}
                        {(workforce?.errored ?? 0) > 0 && (
                          <div style={{ width: `${((workforce?.errored ?? 0) / (workforce?.total ?? 1)) * 100}%`, background: RED, transition: 'width 0.6s ease' }} />
                        )}
                        {(workforce?.idle ?? 0) > 0 && (
                          <div style={{ width: `${((workforce?.idle ?? 0) / (workforce?.total ?? 1)) * 100}%`, background: TEXT_MUTED, transition: 'width 0.6s ease' }} />
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                        <LegendDot label="Healthy" color={GREEN} />
                        <LegendDot label="Errored" color={RED} />
                        <LegendDot label="Idle" color={TEXT_MUTED} />
                      </div>
                    </div>
                  )}

                  {/* Insights */}
                  {workforce?.insights && workforce.insights.length > 0 && (
                    <div>
                      <div style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Insights</div>
                      <div style={{ display: 'grid', gap: 10 }}>
                        {workforce.insights.map((insight, i) => {
                          const sevColor = insight.severity === 'high' ? RED : insight.severity === 'medium' ? AMBER : BLUE;
                          return (
                            <div key={i} style={{
                              ...glassCard, padding: '12px 16px', background: CARD_BG,
                              borderLeft: `3px solid ${sevColor}`,
                            }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: TEXT_WHITE, marginBottom: 4 }}>
                                {insight.agent_name}
                              </div>
                              <div style={{ fontSize: 12, color: TEXT_GRAY, marginBottom: 4 }}>
                                {insight.issue}
                              </div>
                              {insight.recommendation && (
                                <div style={{ fontSize: 11, color: TEXT_MUTED, fontStyle: 'italic' }}>
                                  {insight.recommendation}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {(workforce?.total ?? 0) === 0 && enabled && (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: TEXT_MUTED, fontSize: 13 }}>
                      No agents deployed yet.
                    </div>
                  )}
                </div>
              </div>

              {/* ============================================================ */}
              {/* SECTION 7: Audit Trail                                       */}
              {/* ============================================================ */}
              <div className="cmd-fade-6" style={sectionStyle}>
                <SectionHeader title="Audit Trail" />
                <div style={{ position: 'relative' }}>
                  {!enabled && offlineOverlay}
                  <div style={{ ...glassCard, background: CARD_BG, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${CARD_BORDER}` }}>
                          <th style={thStyle}>Time</th>
                          <th style={thStyle}>Event</th>
                          <th style={thStyle}>Actor</th>
                          <th style={thStyle}>Detail</th>
                        </tr>
                      </thead>
                      <tbody>
                        {audit.length === 0 && (
                          <tr>
                            <td colSpan={4} style={{ textAlign: 'center', padding: '24px 0', color: TEXT_MUTED, fontSize: 13 }}>
                              {enabled ? 'No audit entries yet' : 'Enable system to view'}
                            </td>
                          </tr>
                        )}
                        {audit.slice(0, auditLimit).map((entry, i) => {
                          const isExpanded = expandedAudit === i;
                          const typeColor = entry.event_type?.includes('error') || entry.event_type?.includes('fail') ? RED
                            : entry.event_type?.includes('approve') || entry.event_type?.includes('success') ? GREEN
                            : entry.event_type?.includes('reject') || entry.event_type?.includes('disable') ? AMBER
                            : entry.event_type?.includes('cycle') || entry.event_type?.includes('execute') ? PURPLE
                            : BLUE;
                          return (
                            <tr
                              key={entry.id || i}
                              className="cmd-audit-row"
                              onClick={() => setExpandedAudit(isExpanded ? null : i)}
                              style={{ borderBottom: `1px solid ${CARD_BORDER}`, cursor: 'pointer' }}
                            >
                              <td style={{ ...tdStyle, width: 90, color: TEXT_MUTED, fontSize: 11 }}>
                                {timeAgo(entry.created_at)}
                              </td>
                              <td style={{ ...tdStyle, width: 140 }}>
                                <span style={{
                                  fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                                  background: `${typeColor}20`, color: typeColor,
                                }}>
                                  {(entry.event_type || '').replace(/_/g, ' ')}
                                </span>
                              </td>
                              <td style={{ ...tdStyle, width: 120, color: TEXT_GRAY, fontSize: 12 }}>
                                {entry.actor || '-'}
                              </td>
                              <td style={{ ...tdStyle, color: TEXT_GRAY, fontSize: 12 }}>
                                {isExpanded
                                  ? entry.detail
                                  : (entry.detail || '').length > 80
                                    ? entry.detail.slice(0, 80) + '...'
                                    : entry.detail || '-'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {audit.length > auditLimit && (
                      <div style={{ textAlign: 'center', padding: '12px 0', borderTop: `1px solid ${CARD_BORDER}` }}>
                        <button
                          onClick={() => setAuditLimit(prev => prev + 20)}
                          style={{
                            background: 'transparent', border: `1px solid ${CARD_BORDER}`,
                            borderRadius: 8, padding: '6px 20px', color: TEXT_GRAY,
                            fontSize: 12, cursor: 'pointer',
                          }}
                        >
                          Load More
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 style={{
      fontSize: 16, fontWeight: 700, color: TEXT_WHITE, marginBottom: 16,
      letterSpacing: -0.3, fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      {title}
    </h2>
  );
}

function KPICard({ label, value, color, sub, pulse, bar, disabled }: {
  label: string; value: string; color: string; sub?: string;
  pulse?: boolean; bar?: number; disabled?: boolean;
}) {
  return (
    <div className={`cmd-card ${pulse ? 'cmd-glow' : ''}`} style={{
      ...glassCard, background: CARD_BG, padding: '18px 16px',
      borderLeft: `3px solid ${color}`,
      opacity: disabled ? 0.35 : 1,
    }}>
      <div className={pulse ? 'cmd-pulse' : ''} style={{ fontSize: 28, fontWeight: 700, color, lineHeight: 1, marginBottom: 4 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: TEXT_GRAY, marginBottom: 2 }}>{sub}</div>}
      {bar !== undefined && (
        <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, marginBottom: 6, marginTop: 4 }}>
          <div style={{ height: '100%', borderRadius: 2, width: `${Math.min(bar, 100)}%`, background: color, transition: 'width 0.6s ease' }} />
        </div>
      )}
      <div style={{ fontSize: 11, color: TEXT_MUTED }}>{label}</div>
    </div>
  );
}

function StatBox({ label, value, color, icon }: {
  label: string; value: number; color: string; icon: string;
}) {
  return (
    <div className="cmd-card" style={{
      ...glassCard, background: CARD_BG, padding: 18, textAlign: 'center',
    }}>
      <div style={{ fontSize: 22, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color, lineHeight: 1, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 11, color: TEXT_MUTED }}>{label}</div>
    </div>
  );
}

function LegendDot({ label, color }: { label: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
      <span style={{ fontSize: 11, color: TEXT_GRAY }}>{label}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared Inline Styles                                               */
/* ------------------------------------------------------------------ */

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(0,0,0,0.3)',
  border: `1px solid ${CARD_BORDER}`,
  borderRadius: 8,
  padding: '8px 12px',
  color: TEXT_WHITE,
  fontSize: 13,
  outline: 'none',
  fontFamily: "'Inter', system-ui, sans-serif",
};

const btnSmall: React.CSSProperties = {
  border: 'none',
  borderRadius: 8,
  padding: '8px 16px',
  color: '#fff',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: "'Inter', system-ui, sans-serif",
};

const thStyle: React.CSSProperties = {
  padding: '10px 14px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 600,
  color: TEXT_MUTED,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
};

const tdStyle: React.CSSProperties = {
  padding: '10px 14px',
  verticalAlign: 'top',
};
