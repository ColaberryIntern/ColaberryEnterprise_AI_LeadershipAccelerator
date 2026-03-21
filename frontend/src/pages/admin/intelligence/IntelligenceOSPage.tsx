import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { IntelligenceProvider, useIntelligenceContext } from '../../../contexts/IntelligenceContext';
import { useIntelligenceQuery } from '../../../hooks/useIntelligenceQuery';
import {
  getHealth,
  getEntityNetwork,
  getBusinessHierarchy,
  triggerDiscovery,
  getExecutiveSummary,
  getRankedInsights,
  getKPIs,
  getAnomalies,
  getForecasts,
  getRiskEntities,
  getEntityCharts,
  simulateAutonomyCycle,
  runAutonomyCycle,
  getDepartmentDetail,
  HealthStatus,
  EntityNetwork,
  BusinessEntityNetwork,
  QueryResponse,
  VisualizationSpec,
} from '../../../services/intelligenceApi';
import IntelligenceAnalyticsGrid from '../../../components/admin/intelligence/IntelligenceAnalyticsGrid';
import InvestigationPanel from '../../../components/admin/intelligence/InvestigationPanel';
import ExecutiveInsightHeader from '../../../components/admin/intelligence/ExecutiveInsightHeader';
import ChartTypeSelector from '../../../components/admin/intelligence/ChartTypeSelector';
import ChartRenderer from '../../../components/admin/intelligence/ChartRenderer';
import AutoInsightsGrid from '../../../components/admin/intelligence/AutoInsightsGrid';
import EntityNavigationPanel from '../../../components/admin/intelligence/entityPanel/EntityNavigationPanel';
import CoryPanel from '../../../components/admin/intelligence/CoryPanel';
import CoryBadge from '../../../components/admin/intelligence/CoryBadge';
import CoryOrb from '../../../components/admin/intelligence/CoryOrb';
import CoryOverlay from '../../../components/admin/intelligence/CoryOverlay';
import InitiativeStoryModal from '../../../components/admin/intelligence/InitiativeStoryModal';
import AgentDetailDrawer from '../../../components/admin/intelligence/AgentDetailDrawer';
import CoryCenterTabs from '../../../components/admin/intelligence/CoryCenterTabs';
import SituationalAwarenessPanel from '../../../components/admin/intelligence/SituationalAwarenessPanel';

// ─── Adaptive Execution Steps ─────────────────────────────────────────────────
const EXECUTION_STEPS = [
  'Classifying intent...',
  'Building entity context...',
  'Generating SQL query...',
  'Executing database query...',
  'Running ML models...',
  'Searching vector store...',
  'Analyzing agent logs...',
  'Synthesizing insights...',
  'Building visualizations...',
  'Generating follow-ups...',
];

function useExecutionSteps(isProcessing: boolean) {
  const [step, setStep] = useState(0);
  const startRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isProcessing) {
      setStep(0);
      startRef.current = Date.now();
      // Adaptive timing: fast for early steps, slower for ML/vector, fast for final
      let count = 0;
      const tick = () => {
        count++;
        setStep((s) => Math.min(s + 1, EXECUTION_STEPS.length));
        if (intervalRef.current) clearInterval(intervalRef.current);
        const nextDelay = count <= 4 ? 1500 : count <= 7 ? 2500 : 1500;
        intervalRef.current = setInterval(tick, nextDelay);
      };
      intervalRef.current = setInterval(tick, 1500);
    } else {
      setStep(0);
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isProcessing]);

  const elapsed = isProcessing ? Math.floor((Date.now() - startRef.current) / 1000) : 0;
  return { step, elapsed };
}

// ─── Responsive Breakpoint Hook ───────────────────────────────────────────────
function useBreakpoint() {
  const [width, setWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1400);

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return { isCompact: width < 992, isMedium: width < 1200 };
}

// ─── System Health Bar ────────────────────────────────────────────────────────
function SystemHealthBar({ health }: { health: HealthStatus | null }) {
  const navigate = useNavigate();

  return (
    <div
      className="d-flex gap-3 align-items-center px-3 py-2 border-bottom"
      style={{ background: 'var(--color-primary)', flexShrink: 0, color: '#fff' }}
    >
      {/* Back button */}
      <button
        className="btn btn-sm d-flex align-items-center gap-1"
        onClick={() => navigate('/admin/dashboard')}
        style={{
          color: 'rgba(255,255,255,0.85)',
          border: '1px solid rgba(255,255,255,0.25)',
          background: 'rgba(255,255,255,0.1)',
          fontSize: '0.75rem',
          padding: '3px 10px',
        }}
        aria-label="Back to Admin Dashboard"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path fillRule="evenodd" d="M15 8a.5.5 0 0 0-.5-.5H2.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L2.707 8.5H14.5A.5.5 0 0 0 15 8z"/>
        </svg>
        Admin
      </button>

      {/* Title */}
      <span className="fw-bold" style={{ fontSize: '0.85rem', letterSpacing: '0.5px' }}>
        Intelligence OS
      </span>

      {/* Health indicators */}
      {health && (
        <>
          <span className={`badge ${health.engine_status === 'online' ? 'bg-success' : 'bg-danger'}`} style={{ fontSize: '0.6rem' }}>
            {health.engine_status}
          </span>
          <small style={{ opacity: 0.7, fontSize: '0.7rem' }}>{health.datasets_count} datasets</small>
          <small style={{ opacity: 0.7, fontSize: '0.7rem' }}>{health.processes_count_24h} processes (24h)</small>
          {health.last_discovery && (
            <small style={{ opacity: 0.6, fontSize: '0.65rem' }} className="ms-auto">
              Last scan: {new Date(health.last_discovery).toLocaleDateString()}
            </small>
          )}
        </>
      )}
    </div>
  );
}

// ─── Context Breadcrumb ───────────────────────────────────────────────────────
function ContextBreadcrumb() {
  const { scope, drillUp, resetScope } = useIntelligenceContext();

  return (
    <nav
      className="d-flex align-items-center gap-2 px-3 py-2 border-bottom"
      style={{ flexShrink: 0 }}
    >
      <button
        className={`btn btn-sm ${scope.level === 'global' ? 'btn-primary' : 'btn-outline-secondary'}`}
        onClick={resetScope}
      >
        GLOBAL
      </button>
      {scope.level !== 'global' && (
        <>
          <span className="text-muted">/</span>
          <button className="btn btn-sm btn-outline-secondary" onClick={drillUp}>
            {scope.entity_type || 'GROUP'}
          </button>
          {scope.entity_name && (
            <>
              <span className="text-muted">/</span>
              <span className="badge bg-secondary">{scope.entity_name}</span>
            </>
          )}
        </>
      )}
    </nav>
  );
}

// ─── Department KPI Header ────────────────────────────────────────────────────

// Priority color map for initiative badges
const PRIORITY_COLORS: Record<string, string> = {
  critical: 'danger',
  high: 'warning',
  medium: 'info',
  low: 'secondary',
};

// Determine if a KPI trend is "good" (want higher) or "bad" (want lower like error rate, CAC, response time)
const LOWER_IS_BETTER = ['error rate', 'cac', 'avg response time', 'mttr', 'response time'];
function isGoodTrend(name: string, trend: string): boolean | null {
  if (trend === 'stable') return null;
  const lowerBetter = LOWER_IS_BETTER.some((k) => name.toLowerCase().includes(k));
  if (lowerBetter) return trend === 'down';
  return trend === 'up';
}

function DepartmentKPIHeader({
  detail,
  loading,
  onCoryClick,
}: {
  detail: any;
  loading: boolean;
  onCoryClick?: (context: string) => void;
}) {
  const [storyInitiativeId, setStoryInitiativeId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="d-flex gap-3 flex-wrap">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="intel-card-float flex-fill" style={{ minWidth: 140, maxWidth: 220 }}>
            <div className="card-body p-3">
              <div className="placeholder-glow">
                <span className="placeholder col-8 placeholder-sm mb-2 d-block" />
                <span className="placeholder col-5 placeholder-lg mb-1 d-block" />
                <span className="placeholder col-6 placeholder-xs d-block" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!detail) return null;

  const overview = detail.overview || {};
  const deptKpis: { name: string; value: number; unit: string; trend: string; delta?: number; prev_value?: number }[] = detail.kpis || [];
  const objectives: { title: string; progress: number }[] = detail.strategic_objectives || [];
  const building: any[] = detail.building || [];
  const achievements: any[] = detail.achievements || [];
  const risks: any[] = detail.risks || [];
  const maintenance: any[] = detail.maintenance || [];
  const deptColor = overview.color || 'var(--color-primary)';
  const deptName = overview.name || 'Department';

  // Score health rating
  const healthRating = overview.health_score >= 80 ? 'Excellent' : overview.health_score >= 60 ? 'Good' : overview.health_score >= 40 ? 'Fair' : 'Needs Attention';
  const healthColor = overview.health_score >= 80 ? 'var(--color-accent)' : overview.health_score >= 60 ? '#2b6cb0' : overview.health_score >= 40 ? '#d69e2e' : 'var(--color-secondary)';

  return (
    <div>
      {/* ── Row 1: Department Scorecard (Health + Innovation + Team + Initiatives in a clean row) ── */}
      <div
        className="card border-0 shadow-sm mb-3"
        style={{ borderTop: `3px solid ${deptColor}` }}
      >
        <div className="card-body p-3">
          <div className="d-flex align-items-center gap-2 mb-3">
            <span
              className="d-inline-block rounded-circle"
              style={{ width: 10, height: 10, background: deptColor, flexShrink: 0 }}
            />
            <span className="fw-semibold" style={{ fontSize: '0.85rem', color: 'var(--color-primary)' }}>{deptName} Department</span>
            <span className="badge" style={{ fontSize: '0.6rem', background: healthColor, color: '#fff' }}>{healthRating}</span>
            <small className="text-muted ms-auto" style={{ fontSize: '0.62rem' }}>Week-over-week</small>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
            {/* Health */}
            <div className="text-center">
              <div className="position-relative d-inline-block mb-1">
                <svg width="64" height="64" viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r="28" fill="none" stroke="var(--color-border)" strokeWidth="5" />
                  <circle
                    cx="32" cy="32" r="28" fill="none" stroke={healthColor} strokeWidth="5"
                    strokeDasharray={`${(overview.health_score / 100) * 175.9} 175.9`}
                    strokeLinecap="round" transform="rotate(-90 32 32)"
                  />
                  <text x="32" y="34" textAnchor="middle" fontSize="14" fontWeight="700" fill={healthColor}>
                    {Math.round(overview.health_score)}
                  </text>
                </svg>
              </div>
              <div className="text-muted fw-medium" style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Health</div>
            </div>

            {/* Innovation */}
            <div className="text-center">
              <div className="position-relative d-inline-block mb-1">
                <svg width="64" height="64" viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r="28" fill="none" stroke="var(--color-border)" strokeWidth="5" />
                  <circle
                    cx="32" cy="32" r="28" fill="none" stroke={deptColor} strokeWidth="5"
                    strokeDasharray={`${(overview.innovation_score / 100) * 175.9} 175.9`}
                    strokeLinecap="round" transform="rotate(-90 32 32)"
                  />
                  <text x="32" y="34" textAnchor="middle" fontSize="14" fontWeight="700" fill={deptColor}>
                    {Math.round(overview.innovation_score)}
                  </text>
                </svg>
              </div>
              <div className="text-muted fw-medium" style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Innovation</div>
            </div>

            {/* Team */}
            <div className="text-center d-flex flex-column align-items-center justify-content-center">
              <div className="fw-bold" style={{ fontSize: '1.6rem', color: 'var(--color-primary)', lineHeight: 1.1 }}>{overview.team_size}</div>
              <div className="text-muted fw-medium" style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Team</div>
            </div>

            {/* Initiatives Summary */}
            <div className="text-center d-flex flex-column align-items-center justify-content-center">
              <div className="d-flex align-items-baseline gap-1">
                <span className="fw-bold" style={{ fontSize: '1.6rem', color: '#805ad5', lineHeight: 1.1 }}>{building.length}</span>
                <small className="text-muted" style={{ fontSize: '0.65rem' }}>/ {building.length + achievements.length + maintenance.length}</small>
              </div>
              <div className="text-muted fw-medium" style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Active</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Row 2: KPI Cards with WoW Trends ── */}
      {deptKpis.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }} className="mb-3">
          {deptKpis.map((kpi, i) => {
            const good = isGoodTrend(kpi.name, kpi.trend);
            const trendColor = good === null ? '#718096' : good ? 'var(--color-accent)' : 'var(--color-secondary)';
            const trendSymbol = kpi.trend === 'up' ? '\u2191' : kpi.trend === 'down' ? '\u2193' : '\u2192';
            const deltaVal = kpi.delta != null ? Math.abs(kpi.delta) : null;

            return (
              <div
                key={i}
                className="card border-0 shadow-sm position-relative"
                style={{ borderLeft: `3px solid ${trendColor}` }}
              >
                <div className="card-body p-3">
                  {onCoryClick && (
                    <div style={{ position: 'absolute', top: 6, right: 6 }}>
                      <CoryBadge
                        onClick={() => onCoryClick(`Analyze the ${deptName} department KPI "${kpi.name}": current value is ${kpi.value}${kpi.unit}, trend is ${kpi.trend}${kpi.delta != null ? `, WoW change ${kpi.delta > 0 ? '+' : ''}${kpi.delta}%` : ''}. Give me a full analysis with context, risks, and recommendations.`)}
                        tooltip={`Ask Cory about ${kpi.name}`}
                        size={16}
                      />
                    </div>
                  )}
                  <small className="text-muted fw-medium text-uppercase d-block" style={{ fontSize: '0.6rem', letterSpacing: '0.5px' }}>
                    {kpi.name}
                  </small>
                  <div className="d-flex align-items-baseline gap-2 mt-1">
                    <span className="fw-bold" style={{ fontSize: '1.3rem', color: 'var(--color-primary)' }}>
                      {kpi.unit === '$' && '$'}{kpi.value}{kpi.unit === '%' ? '%' : ''}
                    </span>
                    {kpi.unit !== '%' && kpi.unit !== '$' && kpi.unit && (
                      <small className="text-muted" style={{ fontSize: '0.65rem' }}>{kpi.unit}</small>
                    )}
                  </div>
                  <div className="d-flex align-items-center gap-2 mt-1">
                    <span
                      className="d-flex align-items-center gap-1"
                      style={{ fontSize: '0.62rem', fontWeight: 600, color: trendColor }}
                    >
                      {trendSymbol}
                      {deltaVal != null ? `${deltaVal}% WoW` : (kpi.trend === 'stable' ? 'Stable' : kpi.trend)}
                    </span>
                    {good !== null && (
                      <span style={{ fontSize: '0.55rem', color: trendColor }}>{good ? '●' : '●'}</span>
                    )}
                    {kpi.prev_value != null && (
                      <small className="text-muted" style={{ fontSize: '0.55rem' }}>
                        was {kpi.unit === '$' && '$'}{kpi.prev_value}{kpi.unit === '%' ? '%' : ''}
                      </small>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Row 3: Strategic Objectives ── */}
      {objectives.length > 0 && (
        <div className="card border-0 shadow-sm mb-3">
          <div className="card-header bg-white fw-semibold small d-flex align-items-center gap-2" style={{ color: deptColor }}>
            Strategic Objectives
            <span className="badge bg-light text-muted border" style={{ fontSize: '0.6rem' }}>{objectives.length}</span>
          </div>
          <div className="card-body py-2 px-3">
            {objectives.map((obj, i) => {
              const objColor = obj.progress >= 70 ? 'var(--color-accent)' : obj.progress >= 40 ? '#d69e2e' : 'var(--color-secondary)';
              const objLabel = obj.progress >= 70 ? 'On Track' : obj.progress >= 40 ? 'In Progress' : 'Behind';
              return (
                <div key={i} className="mb-2">
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <small className="fw-medium" style={{ fontSize: '0.72rem' }}>{obj.title}</small>
                    <div className="d-flex align-items-center gap-2">
                      <span style={{ fontSize: '0.55rem', fontWeight: 600, color: objColor }}>{objLabel}</span>
                      <small className="text-muted" style={{ fontSize: '0.65rem' }}>{obj.progress}%</small>
                    </div>
                  </div>
                  <div className="progress" style={{ height: 6 }}>
                    <div className="progress-bar" style={{ width: `${obj.progress}%`, background: objColor }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Row 4: Building + Risks side by side (always visible) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '0.75rem' }} className="mb-3">
        {/* Building - Active Initiatives */}
        <div className="card border-0 shadow-sm" style={{ borderLeft: `3px solid ${deptColor}` }}>
          <div className="card-header bg-white d-flex align-items-center gap-2">
            <span className="fw-semibold small" style={{ color: 'var(--color-primary)' }}>Active Initiatives</span>
            {building.length > 0 && <span className="badge" style={{ fontSize: '0.55rem', background: deptColor, color: '#fff' }}>{building.length}</span>}
          </div>
          <div className="card-body py-2 px-3" style={{ maxHeight: 320, overflowY: 'auto' }}>
            {building.length > 0 ? building.map((init: any) => {
              const progColor = init.progress >= 80 ? 'var(--color-accent)' : init.progress >= 50 ? '#2b6cb0' : init.progress >= 25 ? '#d69e2e' : 'var(--color-secondary)';
              const progLabel = init.progress >= 80 ? 'Near Complete' : init.progress >= 50 ? 'On Track' : init.progress >= 25 ? 'Early' : 'Just Started';
              return (
                <div
                  key={init.id}
                  className="mb-3 p-2 rounded-2 border"
                  style={{ cursor: 'pointer', borderColor: 'var(--color-border)', transition: 'border-color 0.15s, box-shadow 0.15s' }}
                  onClick={() => setStoryInitiativeId(init.id)}
                  onMouseEnter={(e) => { const el = e.currentTarget; el.style.borderColor = deptColor; el.style.boxShadow = `0 0 0 1px ${deptColor}20`; }}
                  onMouseLeave={(e) => { const el = e.currentTarget; el.style.borderColor = 'var(--color-border)'; el.style.boxShadow = 'none'; }}
                >
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <span className="fw-medium small" style={{ color: 'var(--color-primary)' }}>{init.title}</span>
                    <div className="d-flex gap-1">
                      <span className={`badge bg-${PRIORITY_COLORS[init.priority] || 'secondary'}`} style={{ fontSize: '0.5rem' }}>{init.priority}</span>
                      <span className={`badge bg-${PRIORITY_COLORS[init.risk_level] || 'secondary'}`} style={{ fontSize: '0.5rem' }}>{init.risk_level} risk</span>
                    </div>
                  </div>
                  <div className="d-flex align-items-center gap-2 mb-1">
                    <div className="progress flex-grow-1" style={{ height: 6 }}>
                      <div className="progress-bar" style={{ width: `${init.progress}%`, background: progColor }} />
                    </div>
                    <span style={{ fontSize: '0.6rem', fontWeight: 600, color: progColor, whiteSpace: 'nowrap' }}>{init.progress}% · {progLabel}</span>
                  </div>
                  {init.owner && <div className="text-muted" style={{ fontSize: '0.6rem' }}>Owner: {init.owner}</div>}
                </div>
              );
            }) : <div className="text-muted small py-2">No active initiatives.</div>}
          </div>
        </div>

        {/* Risks */}
        <div className="card border-0 shadow-sm" style={{ borderLeft: '3px solid var(--color-secondary)' }}>
          <div className="card-header bg-white d-flex align-items-center gap-2">
            <span className="fw-semibold small" style={{ color: 'var(--color-primary)' }}>Risks & Alerts</span>
            {risks.length > 0 && <span className="badge bg-danger" style={{ fontSize: '0.55rem' }}>{risks.length}</span>}
            {risks.length === 0 && <span className="badge bg-success" style={{ fontSize: '0.55rem' }}>Clear</span>}
          </div>
          <div className="card-body py-2 px-3" style={{ maxHeight: 320, overflowY: 'auto' }}>
            {risks.length > 0 ? risks.map((r: any, i: number) => (
              <div
                key={r.id || i}
                className="mb-2 p-2 rounded-2"
                style={{
                  cursor: r.event_type === 'initiative_risk' ? 'pointer' : 'default',
                  background: r.severity === 'critical' ? 'rgba(229, 62, 62, 0.05)' : r.severity === 'high' ? 'rgba(221, 107, 32, 0.05)' : 'transparent',
                  border: `1px solid ${r.severity === 'critical' ? 'rgba(229, 62, 62, 0.2)' : r.severity === 'high' ? 'rgba(221, 107, 32, 0.15)' : 'var(--color-border)'}`,
                }}
                onClick={() => r.event_type === 'initiative_risk' && setStoryInitiativeId(r.id)}
              >
                <div className="d-flex align-items-center gap-1 small">
                  {r.severity && (
                    <span className={`badge bg-${PRIORITY_COLORS[r.severity] || 'secondary'}`} style={{ fontSize: '0.5rem' }}>{r.severity}</span>
                  )}
                  <span className="fw-medium" style={r.event_type === 'initiative_risk' ? { color: 'var(--color-primary-light)' } : {}}>{r.title}</span>
                </div>
                {r.description && <div className="text-muted mt-1" style={{ fontSize: '0.65rem' }}>{r.description}</div>}
              </div>
            )) : (
              <div className="text-center py-3">
                <div style={{ fontSize: '1.5rem', opacity: 0.3 }}>&#10003;</div>
                <div className="text-muted small">No active risks</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Row 5: Achievements + Maintenance side by side (always visible) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '0.75rem' }} className="mb-3">
        {/* Achievements */}
        <div className="card border-0 shadow-sm" style={{ borderLeft: '3px solid var(--color-accent)' }}>
          <div className="card-header bg-white d-flex align-items-center gap-2">
            <span className="fw-semibold small" style={{ color: 'var(--color-primary)' }}>Achievements</span>
            {achievements.length > 0 && <span className="badge bg-success" style={{ fontSize: '0.55rem' }}>{achievements.length}</span>}
          </div>
          <div className="card-body py-2 px-3" style={{ maxHeight: 240, overflowY: 'auto' }}>
            {achievements.length > 0 ? achievements.map((a: any) => (
              <div key={a.id} className="mb-2 p-2 rounded-2 small d-flex gap-2" style={{ background: 'rgba(56, 161, 105, 0.04)', border: '1px solid rgba(56, 161, 105, 0.12)' }}>
                <span style={{ color: 'var(--color-accent)', fontSize: '0.8rem', flexShrink: 0 }}>&#10003;</span>
                <div>
                  <div className="fw-medium">{a.title}</div>
                  {a.description && <div className="text-muted" style={{ fontSize: '0.65rem' }}>{a.description}</div>}
                </div>
              </div>
            )) : <div className="text-muted small py-2">No achievements yet.</div>}
          </div>
        </div>

        {/* Maintenance */}
        <div className="card border-0 shadow-sm" style={{ borderLeft: '3px solid #805ad5' }}>
          <div className="card-header bg-white d-flex align-items-center gap-2">
            <span className="fw-semibold small" style={{ color: 'var(--color-primary)' }}>Maintenance & On Hold</span>
            {maintenance.length > 0 && <span className="badge" style={{ fontSize: '0.55rem', background: '#805ad5', color: '#fff' }}>{maintenance.length}</span>}
          </div>
          <div className="card-body py-2 px-3" style={{ maxHeight: 240, overflowY: 'auto' }}>
            {maintenance.length > 0 ? maintenance.map((init: any) => (
              <div
                key={init.id}
                className="mb-2 p-2 rounded-2 small border"
                style={{ cursor: 'pointer', borderColor: 'var(--color-border)' }}
                onClick={() => setStoryInitiativeId(init.id)}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#805ad5'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border)'; }}
              >
                <div className="d-flex align-items-center gap-2">
                  <span className="badge" style={{ fontSize: '0.5rem', background: '#805ad5', color: '#fff' }}>On Hold</span>
                  <span className="fw-medium" style={{ color: 'var(--color-primary)' }}>{init.title}</span>
                </div>
                {init.owner && <div className="text-muted mt-1" style={{ fontSize: '0.6rem' }}>Owner: {init.owner}</div>}
              </div>
            )) : <div className="text-muted small py-2">No maintenance items.</div>}
          </div>
        </div>
      </div>

      {/* ── Ask Cory ── */}
      {onCoryClick && building.length > 0 && (
        <div className="mb-3">
          <button
            className="btn btn-sm btn-outline-secondary"
            style={{ fontSize: '0.7rem', borderRadius: 20 }}
            onClick={() => onCoryClick(`Give me a full status report on ${deptName}'s active initiatives: ${building.map((b: any) => b.title).join(', ')}. Include progress assessment, risks, and recommendations.`)}
          >
            Ask Cory about {deptName} initiatives
          </button>
        </div>
      )}

      <InitiativeStoryModal
        initiativeId={storyInitiativeId}
        onClose={() => setStoryInitiativeId(null)}
      />
    </div>
  );
}

// ─── Dynamic Canvas ───────────────────────────────────────────────────────────
function DynamicCanvas({
  visualizations,
  insights,
  summary,
  summaryLoading,
  autoInsights,
  onFollowUpClick,
  kpis,
  anomalies,
  forecasts,
  riskEntities,
  entityNetwork,
  analyticsLoading,
  investigationTarget,
  onInvestigate,
  onCloseInvestigation,
  entityType,
  onCoryClick,
  onAskCory,
  selectedEntity,
}: {
  visualizations: VisualizationSpec[];
  insights: QueryResponse | null;
  summary: Record<string, any> | null;
  summaryLoading: boolean;
  autoInsights: any[];
  onFollowUpClick: (question: string) => void;
  onCoryClick: (context: string) => void;
  onAskCory?: (question: string) => void;
  kpis: any;
  anomalies: any[];
  forecasts: any;
  riskEntities: any[];
  entityNetwork: EntityNetwork | null;
  analyticsLoading: boolean;
  investigationTarget: any;
  onInvestigate: (anomaly: any) => void;
  onCloseInvestigation: () => void;
  entityType?: string;
  selectedEntity?: { type: string; id: string; name: string } | null;
}) {
  const [activeChartType, setActiveChartType] = useState<string | null>(null);
  const [narrativeExpanded, setNarrativeExpanded] = useState(false);
  const [deptDetail, setDeptDetail] = useState<any>(null);
  const [deptLoading, setDeptLoading] = useState(false);
  const [coryInput, setCoryInput] = useState('');

  // Fetch department detail when a department is selected
  useEffect(() => {
    if (selectedEntity?.type === 'department' && selectedEntity.id) {
      setDeptLoading(true);
      getDepartmentDetail(selectedEntity.id)
        .then((r) => setDeptDetail(r.data))
        .catch(() => setDeptDetail(null))
        .finally(() => setDeptLoading(false));
    } else {
      setDeptDetail(null);
    }
  }, [selectedEntity]);

  const isDeptView = selectedEntity?.type === 'department' && deptDetail;

  const applicableTypes = useMemo(() => {
    if (!visualizations.length) return null;
    return [...new Set(visualizations.map((v) => v.chart_type))];
  }, [visualizations]);

  const filteredViz = useMemo(() => {
    if (!activeChartType) return visualizations;
    return visualizations.filter((v) => v.chart_type === activeChartType);
  }, [visualizations, activeChartType]);

  // Loading state
  if (summaryLoading && !visualizations.length && !insights) {
    return (
      <div className="p-4">
        <div className="placeholder-glow mb-3">
          <div className="d-flex gap-3 flex-wrap mb-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="card border-0 shadow-sm flex-fill" style={{ minWidth: 140 }}>
                <div className="card-body p-3">
                  <span className="placeholder col-8 placeholder-sm mb-2 d-block" />
                  <span className="placeholder col-5 placeholder-lg mb-1 d-block" />
                  <span className="placeholder col-6 placeholder-xs d-block" />
                </div>
              </div>
            ))}
          </div>
          <div className="card border-0 shadow-sm mb-3">
            <div className="card-body p-3">
              <span className="placeholder col-12 placeholder-sm mb-2 d-block" />
              <span className="placeholder col-10 placeholder-sm mb-2 d-block" />
              <span className="placeholder col-8 placeholder-sm d-block" />
            </div>
          </div>
          <div className="d-flex gap-3">
            <div className="card border-0 shadow-sm flex-fill" style={{ height: 200 }}>
              <div className="card-body d-flex align-items-center justify-content-center">
                <div className="spinner-border spinner-border-sm text-primary" role="status">
                  <span className="visually-hidden">Loading charts...</span>
                </div>
              </div>
            </div>
            <div className="card border-0 shadow-sm flex-fill" style={{ height: 200 }}>
              <div className="card-body d-flex align-items-center justify-content-center text-muted small">
                Loading executive summary...
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Empty state
  if (!visualizations.length && !insights && !summary) {
    return (
      <div className="d-flex align-items-center justify-content-center h-100 text-muted">
        <div className="text-center" style={{ maxWidth: 320 }}>
          <svg
            width="56"
            height="56"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            className="mb-3"
            style={{ opacity: 0.4 }}
          >
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
          <p className="mb-1 fw-medium" style={{ color: 'var(--color-text)' }}>
            Intelligence OS
          </p>
          <small className="d-block mb-1">
            Ask a question or click an entity to explore your data
          </small>
          <small className="text-muted" style={{ fontSize: '0.68rem' }}>
            Loading executive summary automatically...
          </small>
        </div>
      </div>
    );
  }

  const narrativeText = insights?.narrative || '';
  const isLongNarrative = narrativeText.length > 300;

  return (
    <div className="p-3" style={{ overflowY: 'auto', height: '100%' }}>
      {/* Section 1: Department KPI Header (when dept selected) or Executive KPI Header */}
      {isDeptView ? (
        <DepartmentKPIHeader detail={deptDetail} loading={deptLoading} onCoryClick={onCoryClick} />
      ) : (
        <ExecutiveInsightHeader kpis={kpis} loading={summaryLoading || analyticsLoading} entityType={entityType} onCoryClick={onCoryClick} />
      )}

      {/* Inline Cory Input */}
      {onAskCory && (
        <div className="mt-3 mb-2">
          <div className="input-group input-group-sm">
            <span className="input-group-text bg-white border-end-0" style={{ fontSize: '0.75rem', color: 'var(--color-primary-light)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z" />
                <line x1="10" y1="22" x2="14" y2="22" />
              </svg>
            </span>
            <input
              type="text"
              className="form-control border-start-0"
              placeholder="Ask Cory to update this dashboard..."
              value={coryInput}
              onChange={(e) => setCoryInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && coryInput.trim()) {
                  onAskCory(coryInput.trim());
                  setCoryInput('');
                }
              }}
              style={{ fontSize: '0.78rem' }}
            />
            <button
              className="btn btn-primary"
              disabled={!coryInput.trim()}
              onClick={() => {
                if (coryInput.trim()) {
                  onAskCory(coryInput.trim());
                  setCoryInput('');
                }
              }}
              style={{ fontSize: '0.75rem' }}
            >
              Ask
            </button>
          </div>
        </div>
      )}

      {/* Section 2: Narrative Summary (global level only) */}
      {narrativeText && !isDeptView && (
        <div className="card border-0 shadow-sm mb-3 mt-3">
          <div className="card-header bg-white fw-semibold small d-flex justify-content-between align-items-center"
            style={{ color: 'var(--color-primary)' }}
          >
            Executive Summary
            {isLongNarrative && (
              <button
                className="btn btn-sm btn-link text-muted p-0"
                style={{ fontSize: '0.68rem' }}
                onClick={() => setNarrativeExpanded(!narrativeExpanded)}
              >
                {narrativeExpanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
          <div className="card-body py-2 px-3">
            <p className="mb-0 small" style={{ whiteSpace: 'pre-line' }}>
              {isLongNarrative && !narrativeExpanded
                ? narrativeText.slice(0, 300) + '...'
                : narrativeText}
            </p>
          </div>
        </div>
      )}

      {/* Section 3: Chart Type Selector + Chart Grid */}
      {visualizations.length > 0 && (
        <div className="mt-2 mb-2">
          <ChartTypeSelector
            activeType={activeChartType}
            onTypeChange={setActiveChartType}
            applicableTypes={applicableTypes}
          />
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: '1rem',
        }}
      >
        {filteredViz.map((viz, i) => (
          <ChartRenderer key={i} visualization={viz} onCoryClick={onCoryClick} />
        ))}
      </div>

      {/* Intelligence Analytics Grid removed — entity-specific KPI charts above replace it */}

      {/* Section 5: Auto-Insights Grid */}
      {autoInsights.length > 0 && (
        <div className="mt-3">
          <h6 className="fw-semibold small mb-2" style={{ color: 'var(--color-primary)' }}>
            Key Insights
          </h6>
          <AutoInsightsGrid insights={autoInsights} onInsightClick={onFollowUpClick} onInvestigate={onInvestigate} />
        </div>
      )}

      {/* Section 6: Investigation Panel */}
      <InvestigationPanel anomaly={investigationTarget} onClose={onCloseInvestigation} />

      {/* Section 5: Follow-up Questions */}
      {insights?.follow_ups && insights.follow_ups.length > 0 && (
        <div className="mt-3">
          <small className="fw-semibold text-muted">Suggested follow-ups:</small>
          <div className="d-flex flex-wrap gap-2 mt-2">
            {insights.follow_ups.map((q, i) => (
              <button
                key={i}
                className="btn btn-sm btn-outline-secondary"
                style={{ fontSize: '0.72rem', borderRadius: 20 }}
                onClick={() => onFollowUpClick(q)}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Section 6: Sources */}
      {insights?.sources && insights.sources.length > 0 && (
        <div className="mt-3 pb-2">
          <small className="text-muted" style={{ fontSize: '0.6rem' }}>
            Sources: {insights.sources.join(' \u00B7 ')}
          </small>
        </div>
      )}
    </div>
  );
}

// ─── AI Assistant Panel ───────────────────────────────────────────────────────
interface NarrativeSections {
  executive_summary: string;
  key_findings: string[];
  risk_assessment: string;
  recommended_actions: string[];
  follow_up_areas: string[];
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  visualizations?: VisualizationSpec[];
  sources?: string[];
  executionPath?: string;
  pipelineSteps?: Array<{ step: number; name: string; status: string; duration_ms: number; detail?: string }>;
  insights?: Array<{ type: string; severity: string; message: string }>;
  recommendations?: string[];
  confidence?: number;
  narrativeSections?: NarrativeSections | null;
}

function AIAssistantPanel({
  onVisualizationsUpdate,
  onSummaryUpdate,
  onInsightsUpdate,
  externalQuery,
}: {
  onVisualizationsUpdate: (viz: VisualizationSpec[]) => void;
  onSummaryUpdate: (data: Record<string, any>) => void;
  onInsightsUpdate: (insights: any[]) => void;
  externalQuery: string | null;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const { response, loading, error, query } = useIntelligenceQuery();
  const { scope } = useIntelligenceContext();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { step: execStep, elapsed } = useExecutionSteps(loading);
  const [queryCount, setQueryCount] = useState(0);
  const processedExternalRef = useRef<string | null>(null);

  // Status indicators from last response
  const [statusDots, setStatusDots] = useState<string[]>([]);

  const starterQuestions = useMemo(() => {
    if (scope.level === 'entity' && scope.entity_name) {
      return [
        `What are the risk factors for ${scope.entity_name}?`,
        `Show ${scope.entity_name} performance trends`,
        `Analyze ${scope.entity_name} patterns`,
      ];
    }
    const scopeQuestions: Record<string, string[]> = {
      campaigns: [
        'What campaigns have the highest error rate?',
        'Show campaign conversion funnel',
        'Which campaigns are at risk?',
      ],
      leads: [
        'Which leads are most likely to convert?',
        'Show lead temperature distribution',
        'What is the pipeline stage breakdown?',
      ],
      students: [
        'What is the average completion rate?',
        'Which students are at dropout risk?',
        'Show cohort distribution',
      ],
      agents: [
        'Which agents have the most errors?',
        'Show automation impact metrics',
        'What is the agent execution frequency?',
      ],
    };
    if (scope.level !== 'global' && scope.entity_type && scopeQuestions[scope.entity_type]) {
      return scopeQuestions[scope.entity_type];
    }
    return [
      'Give me an executive summary',
      'What are the top anomalies?',
      'Show me revenue trends',
      'Which entities are at risk?',
    ];
  }, [scope]);

  useEffect(() => {
    if (response) {
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: response.narrative || 'No results found.',
        timestamp: new Date(),
        visualizations: response.visualizations,
        sources: response.sources,
        executionPath: response.execution_path,
        pipelineSteps: (response as any).pipelineSteps,
        insights: (response as any).insights,
        recommendations: (response as any).recommendations,
        confidence: (response as any).confidence,
        narrativeSections: (response as any).narrativeSections,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      if (response.visualizations?.length) {
        onVisualizationsUpdate(response.visualizations);
      }
      if (response.data) {
        onSummaryUpdate(response.data);
      }

      // Parse execution path for status dots (matches pipeline step names from queryEngine.ts)
      const path = response.execution_path || '';
      const dots: string[] = [];
      if (path.includes('classify_intent')) dots.push('Intent');
      if (path.includes('execute_sql')) dots.push('SQL');
      if (path.includes('execute_ml')) dots.push('ML');
      if (path.includes('execute_vector')) dots.push('Vector');
      if (path.includes('build_context')) dots.push('Insights');
      if (path.includes('select_visualization')) dots.push('Charts');
      if (path.includes('generate_narrative')) dots.push('Narrative');
      if (!dots.length) dots.push('SQL');
      setStatusDots(dots);
    }
  }, [response, onVisualizationsUpdate, onSummaryUpdate, onInsightsUpdate]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = useCallback(
    async (text?: string) => {
      const question = text || input.trim();
      if (!question || loading) return;

      const userMsg: ChatMessage = { role: 'user', content: question, timestamp: new Date() };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setQueryCount((c) => c + 1);
      // Auto-prepend entity context when scoped
      const contextPrefix = scope.level !== 'global' && scope.entity_name
        ? `[Analyzing: ${scope.entity_name}] `
        : '';
      await query(contextPrefix + question, scope.level !== 'global' ? scope : undefined);
    },
    [input, query, scope, loading]
  );

  // Handle external queries (from follow-up clicks / auto-insights)
  useEffect(() => {
    if (externalQuery && externalQuery !== processedExternalRef.current) {
      processedExternalRef.current = externalQuery;
      handleSend(externalQuery);
    }
  }, [externalQuery, handleSend]);

  return (
    <div className="d-flex flex-column h-100">
      {/* Header with status dots + query counter */}
      <div className="px-3 py-2 border-bottom d-flex justify-content-between align-items-center" style={{ flexShrink: 0 }}>
        <div className="d-flex align-items-center gap-2">
          <h6 className="fw-semibold mb-0" style={{ color: 'var(--color-primary)', fontSize: '0.85rem' }}>
            AI Assistant
          </h6>
          {queryCount > 0 && (
            <span className="badge bg-light text-muted border" style={{ fontSize: '0.55rem' }}>
              {queryCount} {queryCount === 1 ? 'query' : 'queries'}
            </span>
          )}
        </div>
        {statusDots.length > 0 && (
          <div className="d-flex gap-2">
            {statusDots.map((dot) => {
              const dotColor: Record<string, string> = {
                Intent: '#d69e2e',
                SQL: 'var(--color-accent)',
                ML: 'var(--color-accent)',
                Vector: 'var(--color-accent)',
                Insights: 'var(--color-primary-light)',
                Charts: 'var(--color-primary-light)',
                Narrative: 'var(--color-primary-light)',
              };
              return (
                <span key={dot} className="d-flex align-items-center gap-1" style={{ fontSize: '0.6rem' }}>
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: dotColor[dot] || 'var(--color-accent)',
                      display: 'inline-block',
                    }}
                  />
                  {dot}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Messages area */}
      <div className="flex-grow-1 p-3" style={{ overflowY: 'auto' }}>
        {messages.length === 0 && !loading && (
          <div className="text-center mt-3">
            <div
              className="mx-auto mb-3 d-flex align-items-center justify-content-center rounded-3"
              style={{
                width: 48,
                height: 48,
                background: 'rgba(26, 54, 93, 0.08)',
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z" />
                <line x1="10" y1="22" x2="14" y2="22" />
              </svg>
            </div>
            <h6 className="fw-semibold" style={{ color: 'var(--color-primary)', fontSize: '0.85rem' }}>
              Intelligence OS
            </h6>
            <small className="text-muted d-block mb-3" style={{ fontSize: '0.72rem', lineHeight: 1.5 }}>
              Analyze performance, detect anomalies, forecast trends, and surface actionable insights.
            </small>
            <div className="d-flex flex-column gap-2">
              {starterQuestions.map((q, i) => (
                <button
                  key={i}
                  className="btn btn-sm btn-outline-secondary text-start d-flex align-items-center gap-2"
                  style={{ fontSize: '0.73rem' }}
                  onClick={() => handleSend(q)}
                >
                  <span style={{ color: 'var(--color-primary-light)', fontWeight: 600 }}>?</span>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`mb-3 ${msg.role === 'user' ? 'text-end' : ''}`}>
            {msg.role === 'user' ? (
              <div
                className="d-inline-block px-2 py-1 rounded-3 small text-white"
                style={{
                  maxWidth: '90%',
                  background: 'var(--color-primary)',
                  textAlign: 'left',
                  fontSize: '0.78rem',
                  lineHeight: 1.5,
                }}
              >
                {msg.content}
              </div>
            ) : (
              <div style={{ fontSize: '0.78rem', lineHeight: 1.6, color: 'var(--color-text)' }}>
                {/* Structured narrative sections */}
                {msg.narrativeSections ? (
                  <div>
                    {/* Executive Summary */}
                    {msg.narrativeSections.executive_summary && (
                      <div className="mb-2">
                        <div className="fw-semibold mb-1" style={{ color: 'var(--color-primary)', fontSize: '0.82rem' }}>
                          Executive Summary
                        </div>
                        <div>{msg.narrativeSections.executive_summary}</div>
                      </div>
                    )}

                    {/* Key Findings */}
                    {msg.narrativeSections.key_findings?.length > 0 && (
                      <div className="mb-2">
                        <div className="fw-semibold mb-1" style={{ color: 'var(--color-primary)', fontSize: '0.82rem' }}>
                          Key Findings
                        </div>
                        <ul className="mb-0 ps-3" style={{ fontSize: '0.76rem' }}>
                          {msg.narrativeSections.key_findings.map((f, fi) => (
                            <li key={fi} className="mb-1">{f}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Risk Assessment */}
                    {msg.narrativeSections.risk_assessment && (
                      <div className="mb-2">
                        <div className="fw-semibold mb-1" style={{ color: 'var(--color-primary)', fontSize: '0.82rem' }}>
                          Risk Assessment
                        </div>
                        <div>{msg.narrativeSections.risk_assessment}</div>
                      </div>
                    )}

                    {/* Recommended Actions */}
                    {msg.narrativeSections.recommended_actions?.length > 0 && (
                      <div className="mb-2">
                        <div className="d-flex align-items-center justify-content-between mb-1">
                          <div className="fw-semibold" style={{ color: 'var(--color-primary)', fontSize: '0.82rem' }}>
                            Recommended Actions
                          </div>
                          <div className="d-flex gap-1">
                            <button
                              className="btn btn-sm btn-outline-primary"
                              style={{ fontSize: '0.65rem', padding: '2px 8px' }}
                              onClick={async () => {
                                try {
                                  const res = await simulateAutonomyCycle();
                                  const recs = res.data?.recommendations || [];
                                  alert(recs.length > 0
                                    ? `Simulation: ${recs.length} action(s) would execute.\n${recs.map((r: any) => `${r.action} (risk: ${r.risk_score}, conf: ${r.confidence_score})`).join('\n')}`
                                    : 'Simulation: No problems detected.');
                                } catch { alert('Simulation failed.'); }
                              }}
                            >
                              Simulate
                            </button>
                            <button
                              className="btn btn-sm btn-primary"
                              style={{ fontSize: '0.65rem', padding: '2px 8px' }}
                              onClick={async () => {
                                if (!window.confirm('Run autonomous cycle now? Safe actions (risk < 40) will auto-execute.')) return;
                                try {
                                  const res = await runAutonomyCycle();
                                  const d = res.data;
                                  alert(`Cycle complete: ${d.problems_detected} problems, ${d.decisions_created} decisions (${d.auto_executed} auto-executed, ${d.proposed} proposed)`);
                                } catch { alert('Cycle failed.'); }
                              }}
                            >
                              Execute
                            </button>
                          </div>
                        </div>
                        <div
                          className="ps-2 ms-1"
                          style={{ borderLeft: '3px solid var(--color-primary-light)', fontSize: '0.76rem' }}
                        >
                          {msg.narrativeSections.recommended_actions.map((a, ai) => (
                            <div key={ai} className="mb-1">Recommendation: {a}</div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Follow-Up Areas */}
                    {msg.narrativeSections.follow_up_areas?.length > 0 && (
                      <div className="mb-2">
                        <div className="fw-semibold mb-1" style={{ color: 'var(--color-primary)', fontSize: '0.82rem' }}>
                          Follow-Up Areas
                        </div>
                        <ul className="mb-0 ps-3" style={{ fontSize: '0.76rem' }}>
                          {msg.narrativeSections.follow_up_areas.map((f, fi) => (
                            <li key={fi} className="mb-1">{f}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ whiteSpace: 'pre-line' }}>{msg.content}</div>
                )}

                {/* Sources as badges */}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-2 mb-1">
                    {msg.sources.map((src, si) => (
                      <span
                        key={si}
                        className="badge bg-light text-muted border me-1"
                        style={{ fontSize: '0.55rem' }}
                      >
                        {src}
                      </span>
                    ))}
                  </div>
                )}

                {/* Path indicator */}
                {msg.executionPath && (
                  <div className="mt-1" style={{ fontSize: '0.58rem', color: 'var(--color-text-light)' }}>
                    Path: {msg.executionPath}
                  </div>
                )}

                {/* Pipeline steps (collapsible) */}
                {msg.pipelineSteps && msg.pipelineSteps.length > 0 && (
                  <div className="mt-1">
                    <details>
                      <summary
                        className="text-muted"
                        style={{ fontSize: '0.6rem', cursor: 'pointer' }}
                      >
                        Pipeline: {msg.pipelineSteps.filter((s) => s.status === 'completed').length}/{msg.pipelineSteps.length} steps
                        {msg.confidence != null && ` \u2022 ${(msg.confidence * 100).toFixed(0)}% confidence`}
                        {' \u2022 '}
                        {msg.pipelineSteps.reduce((sum, s) => sum + s.duration_ms, 0)}ms
                      </summary>
                      <div className="mt-1 ps-2 border-start" style={{ borderColor: 'var(--color-border)' }}>
                        {msg.pipelineSteps.map((ps) => (
                          <div
                            key={ps.step}
                            className="d-flex align-items-center gap-1"
                            style={{ fontSize: '0.58rem', color: ps.status === 'completed' ? 'var(--color-text)' : 'var(--color-text-light)' }}
                          >
                            <span style={{ color: ps.status === 'completed' ? 'var(--color-accent)' : ps.status === 'skipped' ? 'var(--color-text-light)' : 'var(--color-secondary)' }}>
                              {ps.status === 'completed' ? '\u2713' : ps.status === 'skipped' ? '\u2013' : '\u2717'}
                            </span>
                            <span>{ps.name}</span>
                            {ps.detail && <span className="text-muted">({ps.detail})</span>}
                            <span className="text-muted ms-auto">{ps.duration_ms}ms</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                )}
              </div>
            )}

            {/* Follow-up questions as cards */}
            {msg.role === 'assistant' && msg.recommendations && msg.recommendations.length > 0 && (
              <div className="mt-2 d-flex flex-column gap-1">
                {msg.recommendations.slice(0, 3).map((rec, ri) => (
                  <button
                    key={ri}
                    className="btn btn-sm text-start border rounded-2 w-100"
                    style={{
                      fontSize: '0.72rem',
                      padding: '6px 10px',
                      background: 'rgba(26, 54, 93, 0.03)',
                      color: 'var(--color-text)',
                      borderColor: 'var(--color-border)',
                      lineHeight: 1.4,
                    }}
                    onClick={() => handleSend(rec)}
                    onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'rgba(26, 54, 93, 0.08)'; }}
                    onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'rgba(26, 54, 93, 0.03)'; }}
                  >
                    {rec}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-1">
              <small className="text-muted" style={{ fontSize: '0.55rem' }}>
                {msg.timestamp.toLocaleTimeString()}
              </small>
            </div>
          </div>
        ))}

        {/* Execution step indicator */}
        {loading && (
          <div className="mb-2">
            <div className="border rounded-3 p-2 small" style={{ background: 'var(--color-bg-alt)' }}>
              <div className="d-flex align-items-center gap-2 mb-2">
                <div className="spinner-border spinner-border-sm text-primary" role="status">
                  <span className="visually-hidden">Analyzing...</span>
                </div>
                <small className="fw-medium" style={{ color: 'var(--color-primary)' }}>Processing query...</small>
              </div>
              {EXECUTION_STEPS.map((s, i) => (
                <div
                  key={i}
                  className="d-flex align-items-center gap-2 ms-3"
                  style={{
                    fontSize: '0.66rem',
                    color: i <= execStep ? 'var(--color-text)' : 'var(--color-text-light)',
                    opacity: i <= execStep ? 1 : 0.35,
                    transition: 'opacity 0.3s ease',
                  }}
                >
                  {i < execStep ? (
                    <span style={{ color: 'var(--color-accent)' }}>&#10003;</span>
                  ) : i === execStep ? (
                    <span
                      className="spinner-border spinner-border-sm"
                      style={{ width: 10, height: 10, borderWidth: 1 }}
                      role="status"
                    >
                      <span className="visually-hidden">Loading...</span>
                    </span>
                  ) : (
                    <span style={{ width: 10, display: 'inline-block' }}>&#x25CB;</span>
                  )}
                  {s}
                </div>
              ))}
              {execStep >= EXECUTION_STEPS.length && (
                <small className="text-muted ms-3 d-block mt-1" style={{ fontSize: '0.6rem' }}>
                  {elapsed > 20
                    ? 'Complex analysis in progress \u2014 this may take up to 2 minutes...'
                    : 'Finalizing results...'}
                </small>
              )}
            </div>
          </div>
        )}

        {error && <div className="alert alert-danger py-2 small">{error}</div>}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-2 border-top" style={{ flexShrink: 0 }}>
        <div className="input-group input-group-sm">
          <input
            type="text"
            className="form-control"
            placeholder="Ask about your business..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            disabled={loading}
          />
          <button
            className="btn btn-primary"
            onClick={() => handleSend()}
            disabled={loading || !input.trim()}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Collapsible Panel Toggle ─────────────────────────────────────────────────
function PanelToggle({
  label,
  side,
  isOpen,
  onClick,
}: {
  label: string;
  side: 'left' | 'right';
  isOpen: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="btn btn-sm d-flex align-items-center justify-content-center"
      style={{
        writingMode: 'vertical-rl',
        textOrientation: 'mixed',
        background: isOpen ? 'transparent' : 'var(--color-bg-alt)',
        border: 'none',
        borderLeft: side === 'right' ? '1px solid var(--color-border)' : 'none',
        borderRight: side === 'left' ? '1px solid var(--color-border)' : 'none',
        padding: '12px 4px',
        fontSize: '0.65rem',
        fontWeight: 600,
        color: 'var(--color-text-light)',
        letterSpacing: '0.5px',
        cursor: 'pointer',
        flexShrink: 0,
      }}
      onClick={onClick}
      title={isOpen ? `Collapse ${label}` : `Expand ${label}`}
    >
      {side === 'left' ? (isOpen ? '\u25C0' : '\u25B6') : isOpen ? '\u25B6' : '\u25C0'}{' '}
      {label}
    </button>
  );
}

// ─── Status Bar ───────────────────────────────────────────────────────────────
function StatusBar({ lastRefresh, isProcessing }: { lastRefresh: string; isProcessing: boolean }) {
  return (
    <div
      className="d-flex justify-content-between align-items-center px-3 py-1 border-top"
      style={{ background: 'var(--color-bg-alt)', fontSize: '0.65rem', flexShrink: 0 }}
    >
      <span className="text-muted">Last refresh: {lastRefresh}</span>
      <span className={isProcessing ? 'text-primary' : 'text-muted'}>
        {isProcessing ? 'Processing...' : 'Ready'}
      </span>
    </div>
  );
}

// ─── Mobile Tab Bar ───────────────────────────────────────────────────────────
function MobileTabBar({
  activeTab,
  onTabChange,
}: {
  activeTab: 'map' | 'canvas' | 'assistant';
  onTabChange: (tab: 'map' | 'canvas' | 'assistant') => void;
}) {
  const tabs = [
    { key: 'map' as const, label: 'Navigation' },
    { key: 'canvas' as const, label: 'Dashboard' },
    { key: 'assistant' as const, label: 'Cory' },
  ];

  return (
    <div className="d-flex border-bottom" style={{ flexShrink: 0 }}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          className={`btn btn-sm flex-fill rounded-0 ${
            activeTab === tab.key ? 'btn-primary' : 'btn-light'
          }`}
          style={{ fontSize: '0.75rem', fontWeight: 500, padding: '8px' }}
          onClick={() => onTabChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ─── Main Content ─────────────────────────────────────────────────────────────
function IntelligenceOSContent() {
  const { scope, selectedEntity } = useIntelligenceContext();
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [network, setNetwork] = useState<EntityNetwork | null>(null);
  const [visualizations, setVisualizations] = useState<VisualizationSpec[]>([]);
  const [insights, setInsights] = useState<QueryResponse | null>(null);
  const [summary, setSummary] = useState<Record<string, any> | null>(null);
  const [autoInsights, setAutoInsights] = useState<any[]>([]);
  const [lastRefresh, setLastRefresh] = useState(new Date().toLocaleString());
  const [isProcessing, setIsProcessing] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [externalQuery, setExternalQuery] = useState<string | null>(null);

  // Analytics state
  const [kpis, setKpis] = useState<any>(null);
  const [anomalies, setAnomalies] = useState<any[]>([]);
  const [forecasts, setForecasts] = useState<any>(null);
  const [riskEntities, setRiskEntities] = useState<any[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [investigationTarget, setInvestigationTarget] = useState<any>(null);

  // Business hierarchy state
  const [businessHierarchy, setBusinessHierarchy] = useState<BusinessEntityNetwork | null>(null);
  const [hierarchyLoading, setHierarchyLoading] = useState(true);

  // Panel state
  const { isCompact, isMedium } = useBreakpoint();
  const [leftOpen, setLeftOpen] = useState(true);
  const [coryOverlayOpen, setCoryOverlayOpen] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'map' | 'canvas' | 'assistant'>('canvas');
  // Auto-collapse left panel on medium screens
  useEffect(() => {
    if (isMedium && !isCompact) {
      setLeftOpen(false);
    } else if (!isMedium) {
      setLeftOpen(true);
    }
  }, [isMedium, isCompact]);

  // Scroll center panel to top when department selection changes
  const centerPanelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selectedEntity) {
      centerPanelRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [selectedEntity]);

  // Department content now shown in center panel — no drawer auto-open

  // Auto-open Cory if arriving via ?cory=open (from GlobalCoryWidget click)
  const [searchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get('cory') === 'open') {
      setCoryOverlayOpen(true);
      const contextPath = searchParams.get('context');
      // Context-aware greetings based on where the user came from
      const PAGE_GREETINGS: Record<string, string> = {
        '/': 'Hey! I saw you were on the homepage. Anything catching your eye — enrollment trends, marketing numbers, or the lead pipeline?',
        '/program': 'Hey! Coming from the Program page — want me to pull up curriculum engagement or session completion rates?',
        '/pricing': 'Hey! You were looking at Pricing. Want me to dig into conversion rates or how the pricing strategy is performing?',
        '/sponsorship': 'Hey! Coming from Sponsorship — want to look at sponsor engagement or ROI?',
        '/enroll': 'Hey! You were on Enrollment. Want me to check the funnel metrics or see where people are dropping off?',
        '/admin/dashboard': 'Hey! Coming from the Dashboard. Want the full executive briefing or something specific?',
        '/admin/campaigns': 'Hey! You were in Campaigns. Want me to break down performance or flag anything that needs attention?',
        '/admin/leads': 'Hey! Coming from Lead Management. Want a pipeline health check or help finding stalled leads?',
        '/admin/revenue': 'Hey! You were on Revenue. Need a trend analysis or want to look at the forecast?',
        '/admin/marketing': 'Hey! Coming from Marketing. Ready for an intel briefing on what\'s working?',
        '/admin/accelerator': 'Hey! You were in the Accelerator. Want to check student engagement or see who might be at risk?',
        '/admin/orchestration': 'Hey! Coming from Orchestration. Want to review the blueprint status or check section health?',
        '/admin/visitors': 'Hey! You were tracking Visitors. Want me to analyze traffic patterns or attribution?',
        '/admin/pipeline': 'Hey! Coming from the Pipeline view. Want to look at conversion rates across stages?',
        '/portal': 'Hey! You were in the Participant Portal. Want to check on student progress or spot anyone who needs follow-up?',
      };
      let greeting = '';
      if (contextPath) {
        greeting = PAGE_GREETINGS[contextPath] || '';
        if (!greeting) {
          for (const [prefix, msg] of Object.entries(PAGE_GREETINGS)) {
            if (contextPath.startsWith(prefix) && prefix !== '/') { greeting = msg; break; }
          }
        }
      }
      // Fallback: casual hallway greeting
      if (!greeting) {
        greeting = 'Hey! How\'s it going? Anything I can help you with today?';
      }
      setExternalQuery(greeting + '|' + Date.now());
    }
  // Run once on mount — searchParams is stable from useSearchParams
  }, [searchParams]);

  const loadNetwork = useCallback(() => {
    getEntityNetwork()
      .then((r) => setNetwork(r.data))
      .catch(() => {});
  }, []);

  // Initial load: health + network + auto executive summary
  useEffect(() => {
    getHealth()
      .then((r) => setHealth(r.data))
      .catch(() => {});
    loadNetwork();

    // Load business hierarchy
    setHierarchyLoading(true);
    getBusinessHierarchy()
      .then((r) => setBusinessHierarchy(r.data))
      .catch(() => {})
      .finally(() => setHierarchyLoading(false));

    // Auto-load executive summary
    setSummaryLoading(true);
    setIsProcessing(true);
    getExecutiveSummary()
      .then((r) => {
        const data = r.data;
        if (data.narrative) {
          setInsights(data);
        }
        if (data.visualizations?.length) {
          setVisualizations(data.visualizations);
        }
        if (data.data) {
          setSummary(data.data);
          // Extract KPIs from assistant pipeline insights (returned in data.data.insights)
          const pipelineInsights = data.data?.insights;
          if (Array.isArray(pipelineInsights) && pipelineInsights.length > 0) {
            const metricInsights = pipelineInsights.filter((i: any) => i.metric && i.value != null);
            if (metricInsights.length > 0) {
              setKpis((prev: any) => ({
                ...prev,
                cory_kpis: metricInsights.slice(0, 6).map((i: any) => ({
                  name: (i.metric || 'Metric').replace(/_/g, ' '),
                  label: (i.metric || 'Metric').replace(/_/g, ' '),
                  value: i.value,
                  source: 'executive_summary',
                })),
              }));
            }
          }
        }
        setLastRefresh(new Date().toLocaleString());
      })
      .catch(() => {
        // Fallback: silent — user can query manually
      })
      .finally(() => {
        setSummaryLoading(false);
        setIsProcessing(false);
      });

    // Load analytics data (KPIs, anomalies, forecasts, risk entities)
    setAnalyticsLoading(true);
    Promise.all([
      getKPIs().then((r) => setKpis(r.data)).catch(() => {}),
      getAnomalies().then((r) => setAnomalies(r.data || [])).catch(() => {}),
      getForecasts().then((r) => setForecasts(r.data)).catch(() => {}),
      getRiskEntities().then((r) => setRiskEntities(r.data || [])).catch(() => {}),
    ]).finally(() => setAnalyticsLoading(false));

    // Auto-load ranked insights — use actual insights from the pipeline, NOT chart data
    getRankedInsights()
      .then((r) => {
        const data = r.data;
        // Prefer pipeline insights (structured with message, severity, metric)
        const pipelineIns = data.data?.insights;
        if (Array.isArray(pipelineIns) && pipelineIns.length > 0) {
          setAutoInsights(pipelineIns
            .filter((i: any) => (i.message || '').trim().length > 5)
            .slice(0, 6)
            .map((i: any) => ({
              title: i.message || '',
              severity: i.severity || 'info',
              metric_value: i.value,
              description: i.message || '',
              trend: i.severity === 'warning' ? 'down' : 'stable',
            }))
          );
        } else if (data.follow_ups?.length) {
          // Fallback: use narrative findings as insights
          setAutoInsights(data.follow_ups.slice(0, 6).map((f: string) => ({
            title: f,
            severity: 'info',
            description: f,
            trend: 'stable',
          })));
        }
      })
      .catch(() => {});
  }, [loadNetwork]);

  // Unified scoped data loader — reloads ALL analytics + executive summary
  const loadScopedAnalytics = useCallback((entityType?: string, entityName?: string) => {
    const params = entityType ? { entity_type: entityType, entity_name: entityName } : undefined;
    console.log('[Intelligence OS] Loading analytics for scope:', entityType || 'global');

    setAnalyticsLoading(true);
    setSummaryLoading(true);
    setIsProcessing(true);
    setVisualizations([]); // Clear stale charts before loading new entity

    // Fetch all 7 data sources with entity scope
    Promise.all([
      getKPIs(params).then((r) => setKpis(r.data)).catch(() => {}),
      getAnomalies(params).then((r) => setAnomalies(r.data || [])).catch(() => {}),
      getForecasts(params).then((r) => setForecasts(r.data)).catch(() => {}),
      getRiskEntities(params).then((r) => setRiskEntities(r.data || [])).catch(() => {}),
      // Entity-specific KPI-driven charts (primary source when entity is scoped)
      getEntityCharts(params).then((r) => {
        const charts = r.data;
        if (Array.isArray(charts) && charts.length > 0) {
          setVisualizations(charts);
        }
      }).catch(() => {}),
      getExecutiveSummary(params).then((r) => {
        const data = r.data;
        if (data.narrative) setInsights(data);
        // Only use executive summary charts if no entity charts loaded
        if (data.visualizations?.length) {
          setVisualizations((prev: any) => (prev && prev.length > 0) ? prev : data.visualizations);
        }
        if (data.data) setSummary(data.data);
      }).catch(() => {}),
      getRankedInsights(params).then((r) => {
        const data = r.data;
        const pipelineIns = data.data?.insights;
        if (Array.isArray(pipelineIns) && pipelineIns.length > 0) {
          setAutoInsights(pipelineIns
            .filter((i: any) => (i.message || '').trim().length > 5)
            .slice(0, 6)
            .map((i: any) => ({
              title: i.message || '',
              severity: i.severity || 'info',
              metric_value: i.value,
              description: i.message || '',
              trend: i.severity === 'warning' ? 'down' : 'stable',
            }))
          );
        } else if (data.follow_ups?.length) {
          setAutoInsights(data.follow_ups.slice(0, 6).map((f: string) => ({
            title: f,
            severity: 'info',
            description: f,
            trend: 'stable',
          })));
        }
      }).catch(() => {}),
    ]).finally(() => {
      setAnalyticsLoading(false);
      setSummaryLoading(false);
      setIsProcessing(false);
      setLastRefresh(new Date().toLocaleString());
    });
  }, []);

  // Scope-aware reload: when entity is selected or reset to global
  const scopeKeyRef = useRef('global');
  useEffect(() => {
    const scopeKey = scope.level === 'global' ? 'global' : scope.entity_type || 'global';
    if (scopeKey === scopeKeyRef.current) return; // no change
    scopeKeyRef.current = scopeKey;

    const entityType = scope.level === 'global' ? undefined : scope.entity_type;
    const entityName = scope.level === 'global' ? undefined : scope.entity_name;
    loadScopedAnalytics(entityType, entityName);
  }, [scope, loadScopedAnalytics]);

  // Health polling every 60 seconds (health only — KPIs managed by scope loader)
  useEffect(() => {
    const interval = setInterval(() => {
      getHealth().then((r) => setHealth(r.data)).catch(() => {});
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Auto-trigger discovery if 0 datasets on first load
  useEffect(() => {
    if (health && health.datasets_count === 0) {
      triggerDiscovery().catch(() => {});
      // Re-poll health + network after discovery completes
      const timer = setTimeout(() => {
        getHealth().then((r) => setHealth(r.data)).catch(() => {});
        loadNetwork();
      }, 15000);
      return () => clearTimeout(timer);
    }
  }, [health, loadNetwork]);

  const handleVisualizationsUpdate = useCallback((viz: VisualizationSpec[]) => {
    setVisualizations(viz);
    setLastRefresh(new Date().toLocaleString());
    setIsProcessing(false);

    // Cross-populate analytics grid from Cory visualization data
    for (const v of viz) {
      if (v.chart_type === 'heatmap' && v.data?.length > 0) {
        setAnomalies((prev) => prev.length > 0 ? prev : v.data.map((d: any) => ({
          entity: d.label || d.name || 'Unknown',
          score: d.value || d.anomaly_score || 50,
          metric: v.title,
        })));
      }
      if ((v.chart_type === 'forecast' || v.chart_type === 'forecast_cone') && v.data?.length > 0) {
        setForecasts((prev: any) => prev || { data: v.data, title: v.title });
      }
      if ((v.chart_type === 'risk_matrix' || v.chart_type === 'scatter') && v.data?.length > 0) {
        setRiskEntities((prev) => prev.length > 0 ? prev : v.data.map((d: any) => ({
          name: d.label || d.entity || 'Unknown',
          risk_score: d.value || d.risk_score || 0,
          factors: [],
        })));
      }
    }
  }, []);

  const handleSummaryUpdate = useCallback((data: Record<string, any>) => {
    setSummary(data);
  }, []);

  const handleInsightsUpdate = useCallback((ins: any[]) => {
    // Map Cory insights into AutoInsightsGrid format — only include insights with meaningful messages
    const meaningfulInsights = ins.filter((i: any) => {
      const msg = (i.message || '').trim();
      // Filter out raw single-word values like "active", "draft", "completed"
      if (msg.length < 5 || !msg.includes(' ')) return false;
      return true;
    });
    setAutoInsights(meaningfulInsights.map((i: any) => ({
      title: i.message || i.title || '',
      severity: i.severity,
      metric_value: i.value,
      description: i.message || '',
      trend: i.severity === 'warning' ? 'down' : i.severity === 'critical' ? 'down' : 'stable',
    })));
    // Extract metric insights as dynamic KPI cards
    let kpiInsights = ins.filter((i: any) => i.metric && i.value != null);
    // Fallback: parse numbers from insight messages if no explicit metrics
    if (kpiInsights.length === 0) {
      const numberPattern = /(\d[\d,]*\.?\d*)\s*(leads?|enrollments?|campaigns?|students?|emails?|revenue|total|count|agents?|errors?)/gi;
      for (const insight of ins) {
        const matches = [...(insight.message || '').matchAll(numberPattern)];
        for (const match of matches) {
          kpiInsights.push({
            metric: match[2].charAt(0).toUpperCase() + match[2].slice(1),
            value: parseFloat(match[1].replace(/,/g, '')),
            severity: insight.severity,
          });
        }
        if (kpiInsights.length >= 4) break;
      }
    }
    if (kpiInsights.length > 0) {
      setKpis((prev: any) => ({
        ...prev,
        cory_kpis: kpiInsights.slice(0, 6).map((i: any) => ({
          name: (i.metric || 'Metric').replace(/_/g, ' '),
          value: i.value,
          unit: '',
          trend: i.severity === 'warning' ? 'down' : 'stable',
        })),
      }));
    }
  }, []);

  const handleNarrativeUpdate = useCallback((data: any) => {
    setInsights((prev: any) => ({
      ...(prev || {}),
      narrative: data.narrative,
      narrative_sections: data.narrative_sections,
      sources: data.sources,
      follow_ups: data.follow_ups,
    }));
  }, []);

  const handleFollowUpClick = useCallback((question: string) => {
    setExternalQuery(question + '|' + Date.now()); // Append timestamp to ensure uniqueness
    setCoryOverlayOpen(true); // Open Cory panel so user can see the response
    setIsProcessing(true);
  }, []);

  const handleCoryClick = useCallback((context: string) => {
    setExternalQuery(context + '|' + Date.now());
    setCoryOverlayOpen(true);
    setIsProcessing(true);
  }, []);

  const handleAgentClick = useCallback((agentId: string) => {
    setSelectedAgentId(agentId);
  }, []);

  const handleInvestigate = useCallback((anomaly: any) => {
    setInvestigationTarget(anomaly);
  }, []);

  // ── Compact (mobile) layout ──
  if (isCompact) {
    return (
      <div className="d-flex flex-column intel-page-enter" style={{ height: '100vh' }}>
        <SystemHealthBar health={health} />
        <ContextBreadcrumb />
        <MobileTabBar activeTab={mobileTab} onTabChange={setMobileTab} />

        <div className="flex-grow-1" style={{ minHeight: 0, overflow: 'hidden' }}>
          {mobileTab === 'map' && (
            <div style={{ height: '100%', overflowY: 'auto' }}>
              <EntityNavigationPanel network={network} businessHierarchy={businessHierarchy} hierarchyLoading={hierarchyLoading} onRefresh={loadNetwork} />
            </div>
          )}
          {mobileTab === 'canvas' && (
            <DynamicCanvas
              visualizations={visualizations}
              insights={insights}
              summary={summary}
              summaryLoading={summaryLoading}
              autoInsights={autoInsights}
              onFollowUpClick={handleFollowUpClick}
              onCoryClick={handleCoryClick}
              onAskCory={handleCoryClick}
              kpis={kpis}
              anomalies={anomalies}
              forecasts={forecasts}
              riskEntities={riskEntities}
              entityNetwork={network}
              analyticsLoading={analyticsLoading}
              investigationTarget={investigationTarget}
              onInvestigate={handleInvestigate}
              onCloseInvestigation={() => setInvestigationTarget(null)}
              entityType={selectedEntity?.type}
              selectedEntity={selectedEntity}
            />
          )}
          {mobileTab === 'assistant' && (
            <CoryPanel
              onVisualizationsUpdate={handleVisualizationsUpdate}
              onSummaryUpdate={handleSummaryUpdate}
              onInsightsUpdate={handleInsightsUpdate}
              onNarrativeUpdate={handleNarrativeUpdate}
              externalQuery={externalQuery}
            />
          )}
        </div>

        {/* Cory Orb (mobile — hidden when assistant tab is active) */}
        {mobileTab !== 'assistant' && (
          <>
            <CoryOrb
              onClick={() => setCoryOverlayOpen(!coryOverlayOpen)}
              isOpen={coryOverlayOpen}
            />
            <CoryOverlay isOpen={coryOverlayOpen} onClose={() => setCoryOverlayOpen(false)}>
              <CoryPanel
                onVisualizationsUpdate={handleVisualizationsUpdate}
                onSummaryUpdate={handleSummaryUpdate}
                onInsightsUpdate={handleInsightsUpdate}
                onNarrativeUpdate={handleNarrativeUpdate}
                externalQuery={externalQuery}
              />
            </CoryOverlay>
          </>
        )}

        <StatusBar lastRefresh={lastRefresh} isProcessing={isProcessing} />
      </div>
    );
  }

  // ── Desktop layout ──
  return (
    <div className="d-flex flex-column intel-page-enter" style={{ height: '100vh' }}>
      <SystemHealthBar health={health} />
      <ContextBreadcrumb />

      <div className="d-flex flex-grow-1" style={{ minHeight: 0, overflow: 'hidden' }}>
        {/* Left Toggle */}
        <PanelToggle label="NAV" side="left" isOpen={leftOpen} onClick={() => setLeftOpen(!leftOpen)} />

        {/* Left Panel: Entity Map */}
        <div
          className="intel-panel-slide"
          style={{
            width: leftOpen ? 400 : 0,
            minWidth: leftOpen ? 400 : 0,
            overflow: 'hidden',
            borderRight: leftOpen ? '1px solid rgba(226, 232, 240, 0.5)' : 'none',
          }}
        >
          <div style={{ width: 400, height: '100%' }}>
            <EntityNavigationPanel network={network} businessHierarchy={businessHierarchy} hierarchyLoading={hierarchyLoading} onRefresh={loadNetwork} />
          </div>
        </div>

        {/* Center Panel: Intelligence Dashboard */}
        <div className="flex-grow-1 intel-gradient-bg d-flex flex-column" style={{ minWidth: 0, overflow: 'hidden' }}>
          {/* Scope indicator */}
          {selectedEntity && (
            <div
              className="d-flex align-items-center gap-2 px-3 py-2 border-bottom intel-fade-in"
              style={{ flexShrink: 0, borderColor: 'rgba(226,232,240,0.5)', background: 'rgba(26, 54, 93, 0.03)' }}
            >
              <span
                className="badge"
                style={{ fontSize: '0.68rem', background: 'var(--color-primary)', color: '#fff' }}
              >
                {selectedEntity.name}
              </span>
              <small className="text-muted" style={{ fontSize: '0.65rem' }}>
                Context: {selectedEntity.type} &middot; All dashboard charts filtered
              </small>
            </div>
          )}

          <div ref={centerPanelRef} className="flex-grow-1" style={{ minHeight: 0, overflow: 'auto' }}>
            <SituationalAwarenessPanel />
            <CoryCenterTabs onAgentClick={handleAgentClick}>
              <DynamicCanvas
                visualizations={visualizations}
                insights={insights}
                summary={summary}
                summaryLoading={summaryLoading}
                autoInsights={autoInsights}
                onFollowUpClick={handleFollowUpClick}
                onCoryClick={handleCoryClick}
                kpis={kpis}
                anomalies={anomalies}
                forecasts={forecasts}
                riskEntities={riskEntities}
                entityNetwork={network}
                analyticsLoading={analyticsLoading}
                investigationTarget={investigationTarget}
                onInvestigate={handleInvestigate}
                onCloseInvestigation={() => setInvestigationTarget(null)}
                entityType={selectedEntity?.type}
                selectedEntity={selectedEntity}
              />
            </CoryCenterTabs>
          </div>
        </div>

        {/* Right Panel: Cory AI COO */}
        <CoryOverlay isOpen={coryOverlayOpen} onClose={() => setCoryOverlayOpen(false)}>
          <CoryPanel
            onVisualizationsUpdate={handleVisualizationsUpdate}
            onSummaryUpdate={handleSummaryUpdate}
            onInsightsUpdate={handleInsightsUpdate}
            onNarrativeUpdate={handleNarrativeUpdate}
            externalQuery={externalQuery}
          />
        </CoryOverlay>

      </div>

      {/* Cory Floating Orb */}
      <CoryOrb
        onClick={() => setCoryOverlayOpen(!coryOverlayOpen)}
        isOpen={coryOverlayOpen}
      />

      {/* Agent Detail Drawer */}
      <AgentDetailDrawer agentId={selectedAgentId} onClose={() => setSelectedAgentId(null)} />

      <StatusBar lastRefresh={lastRefresh} isProcessing={isProcessing} />
    </div>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────
export default function IntelligenceOSPage() {
  return (
    <IntelligenceProvider>
      <IntelligenceOSContent />
    </IntelligenceProvider>
  );
}
