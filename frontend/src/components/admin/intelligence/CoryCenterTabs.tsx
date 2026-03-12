import React, { useState, useEffect, useCallback } from 'react';
import {
  getCoryAgents,
  getCoryTimeline,
  getCoryStatus,
  type AgentInfo,
  type TimelineEntry,
  type CoryStatusReport,
} from '../../../services/coryApi';
import { useIntelligenceContext } from '../../../contexts/IntelligenceContext';
import ActivityTab from './tabs/ActivityTab';
import HealthTab from './tabs/HealthTab';
import ErrorsTab from './tabs/ErrorsTab';
import QAScanTab from './tabs/QAScanTab';
import SafetyTab from './tabs/SafetyTab';
import InitiativesTab from './tabs/InitiativesTab';
import RoadmapTab from './tabs/RoadmapTab';
import DeptTimelineTab from './tabs/DeptTimelineTab';
import InnovationTab from './tabs/InnovationTab';
import RevenueImpactTab from './tabs/RevenueImpactTab';

// ─── Types ───────────────────────────────────────────────────────────────────

type TabKey = 'dashboard' | 'orchestration' | 'timeline' | 'impact' | 'activity' | 'health' | 'errors' | 'qa' | 'safety' | 'initiatives' | 'roadmap' | 'dept-timeline' | 'innovation' | 'revenue';

interface CoryCenterTabsProps {
  children: React.ReactNode; // DynamicCanvas goes here as the "dashboard" tab content
  onAgentClick?: (agentId: string) => void;
}

// ─── Color Maps ──────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  idle: '#718096',
  running: '#2b6cb0',
  paused: '#d69e2e',
  error: '#e53e3e',
};

const RISK_COLORS: Record<string, string> = {
  safe: '#38a169',
  moderate: '#d69e2e',
  risky: '#dd6b20',
  dangerous: '#e53e3e',
  unknown: '#718096',
};

const DEPT_COLORS: Record<string, string> = {
  Intelligence: '#2b6cb0',
  Operations: '#38a169',
  Growth: '#805ad5',
  Maintenance: '#718096',
  Security: '#e53e3e',
};

// ─── Orchestration Tab ───────────────────────────────────────────────────────

function OrchestrationGraph({ onAgentClick, entityFilter }: { onAgentClick?: (agentId: string) => void; entityFilter?: { type: string; id: string; name: string } | null }) {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAgents = useCallback(async () => {
    try {
      const data = await getCoryAgents();
      setAgents(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAgents();
    const interval = setInterval(fetchAgents, 30000);
    return () => clearInterval(interval);
  }, [fetchAgents]);

  if (loading) return <div className="text-center p-4 text-muted">Loading agent graph...</div>;

  // Filter agents by department if entity filter is active
  const filteredAgents = entityFilter?.type === 'department'
    ? agents.filter((a) => (a.department || '').toLowerCase() === entityFilter.name.toLowerCase())
    : agents;

  // Group by department
  const departments = entityFilter?.type === 'department'
    ? [entityFilter.name]
    : ['Intelligence', 'Operations', 'Growth', 'Maintenance', 'Security'];
  const grouped: Record<string, AgentInfo[]> = {};
  for (const dept of departments) grouped[dept] = [];
  for (const agent of filteredAgents) {
    const dept = agent.department || 'Operations';
    if (!grouped[dept]) grouped[dept] = [];
    grouped[dept].push(agent);
  }

  // Compute fleet stats from filtered agents
  const total = filteredAgents.length;
  const running = filteredAgents.filter((a) => a.status === 'running').length;
  const errored = filteredAgents.filter((a) => a.status === 'error').length;
  const paused = filteredAgents.filter((a) => a.status === 'paused').length;
  const idle = total - running - errored - paused;

  return (
    <div className="p-3" style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 220px)' }}>
      {/* Fleet Overview KPIs */}
      <div className="d-flex gap-2 mb-3 flex-wrap">
        {[
          { label: 'Total Agents', value: total, color: 'var(--color-primary)' },
          { label: 'Running', value: running, color: 'var(--color-primary-light)' },
          { label: 'Idle', value: idle, color: '#718096' },
          { label: 'Errored', value: errored, color: 'var(--color-secondary)' },
          { label: 'Paused', value: paused, color: '#d69e2e' },
        ].map((kpi) => (
          <div key={kpi.label} className="card border-0 shadow-sm flex-fill" style={{ minWidth: 90 }}>
            <div className="card-body py-2 px-3 text-center">
              <div className="fw-bold" style={{ fontSize: '1.1rem', color: kpi.color }}>{kpi.value}</div>
              <div className="text-muted" style={{ fontSize: '0.65rem' }}>{kpi.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="row g-3">
        {departments.map((dept) => (
          <div key={dept} className="col-12 col-lg-6 col-xl-4">
            <div className="card border-0 shadow-sm h-100">
              <div className="card-header bg-white py-2 d-flex align-items-center gap-2">
                <div
                  className="rounded-circle"
                  style={{ width: 10, height: 10, background: DEPT_COLORS[dept] || '#718096' }}
                />
                <span className="fw-semibold" style={{ fontSize: '0.82rem' }}>{dept}</span>
                <span className="badge bg-light text-muted border ms-auto" style={{ fontSize: '0.6rem' }}>
                  {grouped[dept].length} agents
                </span>
              </div>
              <div className="card-body p-2">
                {grouped[dept].length === 0 ? (
                  <div className="text-muted text-center py-2" style={{ fontSize: '0.72rem' }}>No agents</div>
                ) : (
                  <div className="d-flex flex-column gap-1">
                    {grouped[dept].map((agent) => (
                      <div
                        key={agent.id}
                        className="d-flex align-items-center gap-2 px-2 py-1 rounded-2"
                        role={onAgentClick ? 'button' : undefined}
                        tabIndex={onAgentClick ? 0 : undefined}
                        onClick={onAgentClick ? () => onAgentClick(agent.id) : undefined}
                        onKeyDown={onAgentClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAgentClick(agent.id); } } : undefined}
                        style={{
                          fontSize: '0.72rem',
                          background: agent.status === 'running' ? 'rgba(43, 108, 176, 0.06)' : 'transparent',
                          border: agent.status === 'running' ? '1px solid rgba(43, 108, 176, 0.2)' : '1px solid transparent',
                          cursor: onAgentClick ? 'pointer' : 'default',
                        }}
                      >
                        <div
                          className="rounded-circle flex-shrink-0"
                          style={{
                            width: 8,
                            height: 8,
                            background: STATUS_COLORS[agent.status] || '#718096',
                            animation: agent.status === 'running' ? 'cory-pulse 1.5s ease infinite' : 'none',
                          }}
                        />
                        <span className="text-truncate flex-grow-1" title={agent.agent_name}>
                          {agent.agent_name}
                        </span>
                        {agent.error_count > 0 && (
                          <span className="badge bg-danger" style={{ fontSize: '0.5rem' }}>{agent.error_count}</span>
                        )}
                        <span className="text-muted flex-shrink-0" style={{ fontSize: '0.6rem' }}>
                          {agent.run_count}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes cory-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(43, 108, 176, 0.4); }
          50% { box-shadow: 0 0 0 4px rgba(43, 108, 176, 0); }
        }
      `}</style>
    </div>
  );
}

// ─── Timeline Tab ────────────────────────────────────────────────────────────

function ReasoningTimeline({ entityFilter }: { entityFilter?: { type: string; id: string; name: string } | null }) {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTimeline = useCallback(async () => {
    try {
      const data = await getCoryTimeline(30);
      setEntries(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTimeline();
    const interval = setInterval(fetchTimeline, 30000);
    return () => clearInterval(interval);
  }, [fetchTimeline]);

  if (loading) return <div className="text-center p-4 text-muted">Loading timeline...</div>;
  if (entries.length === 0) return <div className="text-center p-4 text-muted">No autonomous decisions in the last 48 hours.</div>;

  return (
    <div className="p-3" style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 220px)' }}>
      <div className="position-relative" style={{ paddingLeft: 20 }}>
        <div
          className="position-absolute"
          style={{ left: 7, top: 0, bottom: 0, width: 2, background: 'var(--color-border)' }}
        />
        {entries.map((entry, i) => (
          <div key={i} className="mb-3 position-relative">
            <div
              className="position-absolute rounded-circle"
              style={{
                left: -16,
                top: 4,
                width: 12,
                height: 12,
                background: RISK_COLORS[entry.risk_tier] || '#718096',
                border: '2px solid white',
              }}
            />
            <div className="card border-0 shadow-sm">
              <div className="card-body p-2">
                <div className="d-flex justify-content-between align-items-start mb-1">
                  <span
                    className="badge"
                    style={{
                      fontSize: '0.55rem',
                      background: RISK_COLORS[entry.risk_tier] || '#718096',
                      color: 'white',
                    }}
                  >
                    {entry.risk_tier} &middot; risk {entry.risk_score}
                  </span>
                  <small className="text-muted" style={{ fontSize: '0.6rem' }}>
                    {new Date(entry.time).toLocaleString()}
                  </small>
                </div>
                <div className="fw-semibold mb-1" style={{ fontSize: '0.76rem', color: 'var(--color-primary)' }}>
                  {entry.problem_detected}
                </div>
                <div className="text-muted mb-1" style={{ fontSize: '0.72rem' }}>
                  {entry.analysis}
                </div>
                <div className="d-flex flex-wrap gap-2 mb-1" style={{ fontSize: '0.68rem' }}>
                  <span><strong>Decision:</strong> {entry.decision}</span>
                  <span><strong>Status:</strong> {entry.execution}</span>
                </div>
                <div className="d-flex align-items-center gap-2" style={{ fontSize: '0.68rem' }}>
                  <span className="text-muted">{entry.impact}</span>
                  <div className="ms-auto d-flex align-items-center gap-1">
                    <div
                      style={{
                        width: `${Math.min(entry.confidence, 100) * 0.5}px`,
                        height: 3,
                        borderRadius: 2,
                        background: entry.confidence >= 70 ? 'var(--color-accent)' : entry.confidence >= 40 ? '#d69e2e' : 'var(--color-secondary)',
                      }}
                    />
                    <span style={{ fontSize: '0.6rem' }}>{entry.confidence}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Impact Tab ──────────────────────────────────────────────────────────────

function ImpactMetrics({ entityFilter }: { entityFilter?: { type: string; id: string; name: string } | null }) {
  const [status, setStatus] = useState<CoryStatusReport | null>(null);
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCoryStatus()
      .then(setStatus)
      .catch((err) => {
        console.error('[ImpactMetrics] Failed to load:', err?.response?.status, err?.message);
        setError(err?.response?.status === 401 ? 'Session expired — please log in again.' : `Failed to load metrics: ${err?.message || 'Unknown error'}`);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center p-4 text-muted">Loading metrics...</div>;
  if (error) return <div className="text-center p-4 text-muted">{error}</div>;
  if (!status) return <div className="text-center p-4 text-muted">Unable to load metrics.</div>;

  // Filter departments if entity filter active
  const filteredDepts = entityFilter?.type === 'department'
    ? status.departments.filter((d) => d.department.toLowerCase() === entityFilter.name.toLowerCase())
    : status.departments;

  const filteredFleet = entityFilter?.type === 'department'
    ? {
        total: filteredDepts.reduce((s, d) => s + d.agent_count, 0),
        healthy: filteredDepts.reduce((s, d) => s + d.healthy, 0),
        errored: filteredDepts.reduce((s, d) => s + d.errored, 0),
        paused: filteredDepts.reduce((s, d) => s + d.paused, 0),
      }
    : status.agent_fleet;

  const kpis = [
    { label: 'Problems Solved', value: status.decisions_24h.executed, color: 'var(--color-accent)' },
    { label: 'Experiments Running', value: status.experiments_running, color: '#805ad5' },
    { label: 'Avg Confidence', value: `${status.avg_confidence}%`, color: 'var(--color-primary-light)' },
    { label: 'System Risk', value: status.system_risk_level, color: status.system_risk_level === 'high' ? 'var(--color-secondary)' : status.system_risk_level === 'moderate' ? '#d69e2e' : 'var(--color-accent)' },
    { label: 'Active Agents', value: filteredFleet.healthy, color: 'var(--color-primary)' },
  ];

  return (
    <div className="p-3" style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 220px)' }}>
      {/* KPI Cards */}
      <div className="row g-2 mb-3">
        {kpis.map((kpi, i) => (
          <div key={i} className="col-6 col-md-4 col-xl">
            <div className="card border-0 shadow-sm text-center p-2">
              <div className="fw-bold" style={{ fontSize: '1.2rem', color: kpi.color }}>{kpi.value}</div>
              <div className="text-muted" style={{ fontSize: '0.68rem' }}>{kpi.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Fleet Health */}
      <div className="card border-0 shadow-sm mb-3">
        <div className="card-header bg-white fw-semibold" style={{ fontSize: '0.82rem' }}>Agent Fleet Health</div>
        <div className="card-body p-3">
          <div className="d-flex gap-3 mb-2">
            <div className="text-center">
              <div className="fw-bold" style={{ fontSize: '1.1rem', color: 'var(--color-primary)' }}>{filteredFleet.total}</div>
              <small className="text-muted" style={{ fontSize: '0.65rem' }}>Total</small>
            </div>
            <div className="text-center">
              <div className="fw-bold" style={{ fontSize: '1.1rem', color: 'var(--color-accent)' }}>{filteredFleet.healthy}</div>
              <small className="text-muted" style={{ fontSize: '0.65rem' }}>Healthy</small>
            </div>
            <div className="text-center">
              <div className="fw-bold" style={{ fontSize: '1.1rem', color: 'var(--color-secondary)' }}>{filteredFleet.errored}</div>
              <small className="text-muted" style={{ fontSize: '0.65rem' }}>Errored</small>
            </div>
            <div className="text-center">
              <div className="fw-bold" style={{ fontSize: '1.1rem', color: '#d69e2e' }}>{filteredFleet.paused}</div>
              <small className="text-muted" style={{ fontSize: '0.65rem' }}>Paused</small>
            </div>
          </div>
          <div className="progress" style={{ height: 6 }}>
            <div className="progress-bar bg-success" style={{ width: `${(status.agent_fleet.healthy / Math.max(status.agent_fleet.total, 1)) * 100}%` }} />
            <div className="progress-bar bg-danger" style={{ width: `${(status.agent_fleet.errored / Math.max(status.agent_fleet.total, 1)) * 100}%` }} />
            <div className="progress-bar bg-warning" style={{ width: `${(status.agent_fleet.paused / Math.max(status.agent_fleet.total, 1)) * 100}%` }} />
          </div>
        </div>
      </div>

      {/* Decisions 24h */}
      <div className="card border-0 shadow-sm mb-3">
        <div className="card-header bg-white fw-semibold" style={{ fontSize: '0.82rem' }}>Decisions (24h)</div>
        <div className="card-body p-3">
          <div className="row g-2 text-center">
            <div className="col">
              <div className="fw-bold" style={{ color: 'var(--color-primary)' }}>{status.decisions_24h.total}</div>
              <small className="text-muted" style={{ fontSize: '0.65rem' }}>Total</small>
            </div>
            <div className="col">
              <div className="fw-bold" style={{ color: 'var(--color-accent)' }}>{status.decisions_24h.executed}</div>
              <small className="text-muted" style={{ fontSize: '0.65rem' }}>Executed</small>
            </div>
            <div className="col">
              <div className="fw-bold" style={{ color: '#d69e2e' }}>{status.decisions_24h.proposed}</div>
              <small className="text-muted" style={{ fontSize: '0.65rem' }}>Proposed</small>
            </div>
            <div className="col">
              <div className="fw-bold" style={{ color: 'var(--color-secondary)' }}>{status.decisions_24h.rejected}</div>
              <small className="text-muted" style={{ fontSize: '0.65rem' }}>Rejected</small>
            </div>
          </div>
        </div>
      </div>

      {/* Department Summary */}
      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white fw-semibold" style={{ fontSize: '0.82rem' }}>Departments</div>
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="table table-hover mb-0" style={{ fontSize: '0.72rem' }}>
              <thead className="table-light">
                <tr>
                  <th>Department</th>
                  <th className="text-center">Agents</th>
                  <th className="text-center">Healthy</th>
                  <th className="text-center">Errored</th>
                </tr>
              </thead>
              <tbody>
                {filteredDepts.map((d) => (
                  <tr key={d.department}>
                    <td>
                      <span className="d-inline-block rounded-circle me-1" style={{ width: 8, height: 8, background: DEPT_COLORS[d.department] || '#718096' }} />
                      {d.department}
                    </td>
                    <td className="text-center">{d.agent_count}</td>
                    <td className="text-center text-success">{d.healthy}</td>
                    <td className="text-center text-danger">{d.errored}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function CoryCenterTabs({ children, onAgentClick }: CoryCenterTabsProps) {
  const { selectedEntity, resetScope } = useIntelligenceContext();
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [errorCount, setErrorCount] = useState(0);

  // Convert context entity to filter prop shape
  const entityFilter = selectedEntity ? { type: selectedEntity.type, id: selectedEntity.id, name: selectedEntity.name } : null;

  const tabs: { key: TabKey; label: string; badge?: number }[] = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'orchestration', label: 'Orchestration' },
    { key: 'activity', label: 'Activity' },
    { key: 'health', label: 'Health' },
    { key: 'errors', label: 'Errors', badge: errorCount },
    { key: 'qa', label: 'QA & Scans' },
    { key: 'safety', label: 'Safety' },
    { key: 'timeline', label: 'Timeline' },
    { key: 'impact', label: 'Impact' },
    { key: 'initiatives', label: 'Initiatives' },
    { key: 'roadmap', label: 'Roadmap' },
    { key: 'dept-timeline', label: 'Dept Timeline' },
    { key: 'innovation', label: 'Innovation' },
    { key: 'revenue', label: 'Revenue' },
  ];

  return (
    <div className="d-flex flex-column h-100">
      {/* Tab Bar */}
      <div className="px-3 pt-2" style={{ flexShrink: 0 }}>
        <ul className="nav nav-tabs flex-wrap" style={{ fontSize: '0.78rem' }}>
          {tabs.map((tab) => (
            <li key={tab.key} className="nav-item">
              <button
                className={`nav-link ${activeTab === tab.key ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.key)}
                style={{ padding: '6px 14px', fontSize: '0.76rem', whiteSpace: 'nowrap' }}
              >
                {tab.label}
                {tab.badge != null && tab.badge > 0 && (
                  <span className="badge bg-danger ms-1" style={{ fontSize: '0.6rem' }}>{tab.badge}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Active Filter Indicator */}
      {entityFilter && (
        <div
          className="d-flex align-items-center gap-2 px-3 py-2 border-bottom"
          style={{ flexShrink: 0, background: 'rgba(26, 54, 93, 0.04)', fontSize: '0.75rem' }}
        >
          <span className="text-muted">Filtered by:</span>
          <span className="badge bg-primary">{entityFilter.name}</span>
          <span className="text-muted">({entityFilter.type})</span>
          <button
            className="btn btn-sm btn-outline-secondary py-0 px-2 ms-auto"
            style={{ fontSize: '0.68rem' }}
            onClick={resetScope}
          >
            Clear filter
          </button>
        </div>
      )}

      {/* Tab Content */}
      <div className="flex-grow-1" style={{ overflowY: 'auto' }}>
        {activeTab === 'dashboard' && children}
        {activeTab === 'orchestration' && <OrchestrationGraph onAgentClick={onAgentClick} entityFilter={entityFilter} />}
        {activeTab === 'activity' && <ActivityTab entityFilter={entityFilter} />}
        {activeTab === 'health' && <HealthTab entityFilter={entityFilter} />}
        {activeTab === 'errors' && <ErrorsTab onErrorCountChange={setErrorCount} entityFilter={entityFilter} />}
        {activeTab === 'qa' && <QAScanTab entityFilter={entityFilter} />}
        {activeTab === 'safety' && <SafetyTab entityFilter={entityFilter} />}
        {activeTab === 'timeline' && <ReasoningTimeline entityFilter={entityFilter} />}
        {activeTab === 'impact' && <ImpactMetrics entityFilter={entityFilter} />}
        {activeTab === 'initiatives' && <InitiativesTab entityFilter={entityFilter} />}
        {activeTab === 'roadmap' && <RoadmapTab entityFilter={entityFilter} />}
        {activeTab === 'dept-timeline' && <DeptTimelineTab entityFilter={entityFilter} />}
        {activeTab === 'innovation' && <InnovationTab entityFilter={entityFilter} />}
        {activeTab === 'revenue' && <RevenueImpactTab entityFilter={entityFilter} />}
      </div>
    </div>
  );
}
