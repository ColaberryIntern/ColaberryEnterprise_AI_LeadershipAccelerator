import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
}: {
  visualizations: VisualizationSpec[];
  insights: QueryResponse | null;
  summary: Record<string, any> | null;
  summaryLoading: boolean;
  autoInsights: any[];
  onFollowUpClick: (question: string) => void;
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
}) {
  const [activeChartType, setActiveChartType] = useState<string | null>(null);
  const [narrativeExpanded, setNarrativeExpanded] = useState(false);

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
      {/* Section 1: Executive KPI Header */}
      <ExecutiveInsightHeader kpis={kpis} loading={summaryLoading || analyticsLoading} entityType={entityType} />

      {/* Section 2: Narrative Summary */}
      {narrativeText && (
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
          <ChartRenderer key={i} visualization={viz} />
        ))}
      </div>

      {/* Section 4: Intelligence Analytics Grid */}
      {(!analyticsLoading || anomalies.length > 0 || riskEntities.length > 0) && (
        <div className="mt-3">
          <h6 className="fw-semibold small mb-2" style={{ color: 'var(--color-primary)' }}>
            {entityType ? `${entityType.charAt(0).toUpperCase() + entityType.slice(1)} Analytics` : 'Intelligence Analytics'}
          </h6>
          <IntelligenceAnalyticsGrid
            anomalies={anomalies}
            forecasts={forecasts}
            riskEntities={riskEntities}
            entityNetwork={entityNetwork}
            loading={analyticsLoading}
            entityType={entityType}
          />
        </div>
      )}

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
      };
      setMessages((prev) => [...prev, assistantMsg]);

      if (response.visualizations?.length) {
        onVisualizationsUpdate(response.visualizations);
      }
      if (response.data) {
        onSummaryUpdate(response.data);
      }

      // Parse execution path for status dots
      const path = response.execution_path || '';
      const dots: string[] = [];
      if (path.includes('sql') || path.includes('SQL')) dots.push('SQL');
      if (path.includes('ml') || path.includes('ML')) dots.push('ML');
      if (path.includes('vector') || path.includes('Vector')) dots.push('Vector');
      if (path.includes('llm') || path.includes('LLM')) dots.push('LLM');
      if (!dots.length) dots.push('SQL', 'LLM');
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
            {statusDots.map((dot) => (
              <span key={dot} className="d-flex align-items-center gap-1" style={{ fontSize: '0.6rem' }}>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'var(--color-accent)',
                    display: 'inline-block',
                  }}
                />
                {dot}
              </span>
            ))}
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
          <div key={i} className={`mb-2 ${msg.role === 'user' ? 'text-end' : ''}`}>
            <div
              className={`d-inline-block px-2 py-1 rounded-3 small ${
                msg.role === 'user' ? 'text-white' : 'border'
              }`}
              style={{
                maxWidth: '90%',
                background: msg.role === 'user' ? 'var(--color-primary)' : 'var(--color-bg-alt)',
                textAlign: 'left',
                whiteSpace: 'pre-line',
                fontSize: '0.78rem',
                lineHeight: 1.5,
              }}
            >
              {msg.content}
            </div>
            {/* Pipeline steps summary */}
            {msg.pipelineSteps && msg.pipelineSteps.length > 0 && (
              <div className="mt-1 ms-1">
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
            {/* Insights */}
            {msg.insights && msg.insights.length > 0 && (
              <div className="mt-1">
                {msg.insights.slice(0, 3).map((ins, ii) => (
                  <div
                    key={ii}
                    className="d-flex align-items-start gap-1 ms-1"
                    style={{ fontSize: '0.65rem', lineHeight: 1.4 }}
                  >
                    <span style={{ color: ins.severity === 'critical' ? 'var(--color-secondary)' : ins.severity === 'warning' ? '#d69e2e' : 'var(--color-primary-light)' }}>
                      {ins.severity === 'critical' ? '\u26A0' : ins.severity === 'warning' ? '\u25B2' : '\u2022'}
                    </span>
                    <span>{ins.message}</span>
                  </div>
                ))}
              </div>
            )}
            {/* Recommendations as clickable follow-ups */}
            {msg.recommendations && msg.recommendations.length > 0 && (
              <div className="mt-1 d-flex flex-wrap gap-1">
                {msg.recommendations.slice(0, 3).map((rec, ri) => (
                  <button
                    key={ri}
                    className="btn btn-sm btn-outline-secondary"
                    style={{ fontSize: '0.58rem', padding: '1px 6px' }}
                    onClick={() => handleSend(rec)}
                  >
                    {rec}
                  </button>
                ))}
              </div>
            )}
            {msg.sources && msg.sources.length > 0 && (
              <div className="mt-1">
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
    { key: 'assistant' as const, label: 'AI Assistant' },
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
  const [rightOpen, setRightOpen] = useState(true);
  const [mobileTab, setMobileTab] = useState<'map' | 'canvas' | 'assistant'>('canvas');
  // Auto-collapse left panel on medium screens
  useEffect(() => {
    if (isMedium && !isCompact) {
      setLeftOpen(false);
      setRightOpen(true);
    } else if (!isMedium) {
      setLeftOpen(true);
      setRightOpen(true);
    }
  }, [isMedium, isCompact]);

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

    // Auto-load ranked insights
    getRankedInsights()
      .then((r) => {
        const data = r.data;
        // Try to extract insight cards from the response
        if (data.data && Array.isArray(data.data)) {
          setAutoInsights(data.data);
        } else if (data.visualizations?.length) {
          // Extract insights from visualization data
          const viz = data.visualizations[0];
          if (viz?.data?.length) {
            setAutoInsights(
              viz.data.slice(0, 6).map((d: Record<string, any>) => ({
                title: d.title || d.label || d.name || 'Insight',
                severity: d.severity || d.risk_level || d.priority,
                description: d.description || d.detail || d.narrative,
                metric_value: d.metric_value || d.value || d.score,
                trend: d.trend || d.direction,
              }))
            );
          }
        }
      })
      .catch(() => {});
  }, [loadNetwork]);

  // Unified scoped data loader — reloads ALL analytics + executive summary
  const loadScopedAnalytics = useCallback((entityType?: string) => {
    const params = entityType ? { entity_type: entityType } : undefined;
    console.log('[Intelligence OS] Loading analytics for scope:', entityType || 'global');

    setAnalyticsLoading(true);
    setSummaryLoading(true);
    setIsProcessing(true);

    // Fetch all 6 data sources with entity scope
    Promise.all([
      getKPIs(params).then((r) => setKpis(r.data)).catch(() => {}),
      getAnomalies(params).then((r) => setAnomalies(r.data || [])).catch(() => {}),
      getForecasts(params).then((r) => setForecasts(r.data)).catch(() => {}),
      getRiskEntities(params).then((r) => setRiskEntities(r.data || [])).catch(() => {}),
      getExecutiveSummary(params).then((r) => {
        const data = r.data;
        if (data.narrative) setInsights(data);
        if (data.visualizations?.length) setVisualizations(data.visualizations);
        if (data.data) setSummary(data.data);
      }).catch(() => {}),
      getRankedInsights(params).then((r) => {
        const data = r.data;
        if (data.data && Array.isArray(data.data)) {
          setAutoInsights(data.data);
        } else if (data.visualizations?.length) {
          const viz = data.visualizations[0];
          if (viz?.data?.length) {
            setAutoInsights(
              viz.data.slice(0, 6).map((d: Record<string, any>) => ({
                title: d.title || d.label || d.name || 'Insight',
                severity: d.severity || d.risk_level || d.priority,
                description: d.description || d.detail || d.narrative,
                metric_value: d.metric_value || d.value || d.score,
                trend: d.trend || d.direction,
              }))
            );
          }
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
    loadScopedAnalytics(entityType);
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
  }, []);

  const handleSummaryUpdate = useCallback((data: Record<string, any>) => {
    setSummary(data);
  }, []);

  const handleInsightsUpdate = useCallback((ins: any[]) => {
    setAutoInsights(ins);
  }, []);

  const handleFollowUpClick = useCallback((question: string) => {
    setExternalQuery(question + '|' + Date.now()); // Append timestamp to ensure uniqueness
    setIsProcessing(true);
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
            />
          )}
          {mobileTab === 'assistant' && (
            <AIAssistantPanel
              onVisualizationsUpdate={handleVisualizationsUpdate}
              onSummaryUpdate={handleSummaryUpdate}
              onInsightsUpdate={handleInsightsUpdate}
              externalQuery={externalQuery}
            />
          )}
        </div>

        <StatusBar lastRefresh={lastRefresh} isProcessing={isProcessing} />
      </div>
    );
  }

  // ── Desktop layout ──
  return (
    <div className="d-flex flex-column intel-page-enter" style={{ height: '100vh' }}>
      <SystemHealthBar health={health} />
      <ContextBreadcrumb />

      <div className="d-flex flex-grow-1" style={{ minHeight: 0 }}>
        {/* Left Toggle */}
        <PanelToggle label="NAV" side="left" isOpen={leftOpen} onClick={() => setLeftOpen(!leftOpen)} />

        {/* Left Panel: Entity Map */}
        <div
          className="intel-panel-slide"
          style={{
            width: leftOpen ? 320 : 0,
            minWidth: leftOpen ? 320 : 0,
            overflow: 'hidden',
            borderRight: leftOpen ? '1px solid rgba(226, 232, 240, 0.5)' : 'none',
          }}
        >
          <div style={{ width: 320, height: '100%' }}>
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

          <div className="flex-grow-1" style={{ minHeight: 0, overflow: 'auto' }}>
            <DynamicCanvas
              visualizations={visualizations}
              insights={insights}
              summary={summary}
              summaryLoading={summaryLoading}
              autoInsights={autoInsights}
              onFollowUpClick={handleFollowUpClick}
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
            />
          </div>
        </div>

        {/* Right Panel: AI Assistant */}
        <div
          className="intel-panel-slide"
          style={{
            width: rightOpen ? 400 : 0,
            minWidth: rightOpen ? 400 : 0,
            overflow: 'hidden',
            borderLeft: rightOpen ? '1px solid rgba(226, 232, 240, 0.5)' : 'none',
          }}
        >
          <div style={{ width: 400, height: '100%' }}>
            <AIAssistantPanel
              onVisualizationsUpdate={handleVisualizationsUpdate}
              onSummaryUpdate={handleSummaryUpdate}
              onInsightsUpdate={handleInsightsUpdate}
              externalQuery={externalQuery}
            />
          </div>
        </div>

        {/* Right Toggle */}
        <PanelToggle label="AI" side="right" isOpen={rightOpen} onClick={() => setRightOpen(!rightOpen)} />
      </div>

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
