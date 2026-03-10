import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { IntelligenceProvider, useIntelligenceContext } from '../../../contexts/IntelligenceContext';
import { useIntelligenceQuery } from '../../../hooks/useIntelligenceQuery';
import {
  getHealth,
  getEntityNetwork,
  triggerDiscovery,
  getExecutiveSummary,
  getRankedInsights,
  getKPIs,
  getAnomalies,
  getForecasts,
  getRiskEntities,
  HealthStatus,
  EntityNetwork,
  EntityNode,
  EntityEdge,
  QueryResponse,
  VisualizationSpec,
} from '../../../services/intelligenceApi';
import IntelligenceAnalyticsGrid from '../../../components/admin/intelligence/IntelligenceAnalyticsGrid';
import InvestigationPanel from '../../../components/admin/intelligence/InvestigationPanel';
import ExecutiveInsightHeader from '../../../components/admin/intelligence/ExecutiveInsightHeader';
import ChartTypeSelector from '../../../components/admin/intelligence/ChartTypeSelector';
import ChartRenderer from '../../../components/admin/intelligence/ChartRenderer';
import AutoInsightsGrid from '../../../components/admin/intelligence/AutoInsightsGrid';

// ─── Adaptive Execution Steps ─────────────────────────────────────────────────
const EXECUTION_STEPS = [
  'Classifying intent...',
  'Planning data sources...',
  'Executing queries...',
  'Running ML models...',
  'Generating analysis...',
];

function useExecutionSteps(isProcessing: boolean) {
  const [step, setStep] = useState(0);
  const startRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isProcessing) {
      setStep(0);
      startRef.current = Date.now();
      // Adaptive: 2s for first 3, then 4s
      let count = 0;
      const tick = () => {
        count++;
        setStep((s) => Math.min(s + 1, EXECUTION_STEPS.length));
        if (intervalRef.current) clearInterval(intervalRef.current);
        const nextDelay = count < 3 ? 2000 : 4000;
        intervalRef.current = setInterval(tick, nextDelay);
      };
      intervalRef.current = setInterval(tick, 2000);
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
  if (!health) return null;
  const isOnline = health.engine_status === 'online';

  return (
    <div
      className="d-flex gap-3 align-items-center px-3 py-2 border-bottom"
      style={{ background: 'var(--color-bg-alt)', flexShrink: 0 }}
    >
      <span className={`badge ${isOnline ? 'bg-success' : 'bg-danger'}`}>
        Engine: {health.engine_status}
      </span>
      <small className="text-muted">{health.datasets_count} datasets</small>
      <small className="text-muted">{health.processes_count_24h} processes (24h)</small>
      {health.last_discovery && (
        <small className="text-muted ms-auto">
          Last scan: {new Date(health.last_discovery).toLocaleDateString()}
        </small>
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

// ─── SVG Entity Graph ─────────────────────────────────────────────────────────
const MAX_GRAPH_NODES = 50;

function EntityGraph({
  nodes,
  edges,
  onNodeClick,
}: {
  nodes: EntityNode[];
  edges: EntityEdge[];
  onNodeClick: (node: EntityNode) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Radial layout: hubs in inner ring, regular in outer ring
  const layout = useMemo(() => {
    const hubs = nodes.filter((n) => n.is_hub);
    const regular = nodes.filter((n) => !n.is_hub);
    const cx = 130;
    const cy = 130;
    const innerR = 40;
    const outerR = 100;

    const positions: Record<string, { x: number; y: number }> = {};

    hubs.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / Math.max(hubs.length, 1) - Math.PI / 2;
      positions[n.id] = {
        x: cx + innerR * Math.cos(angle),
        y: cy + innerR * Math.sin(angle),
      };
    });

    regular.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / Math.max(regular.length, 1) - Math.PI / 2;
      positions[n.id] = {
        x: cx + outerR * Math.cos(angle),
        y: cy + outerR * Math.sin(angle),
      };
    });

    return positions;
  }, [nodes]);

  // Normalize node sizes
  const maxRows = Math.max(...nodes.map((n) => n.row_count || 1), 1);

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 260 260"
      width="100%"
      style={{ maxHeight: 260, display: 'block' }}
    >
      {/* Edges */}
      {edges.map((edge, i) => {
        const from = layout[edge.source];
        const to = layout[edge.target];
        if (!from || !to) return null;
        return (
          <line
            key={`e-${i}`}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke="var(--color-border)"
            strokeWidth={0.8}
            opacity={0.5}
          />
        );
      })}
      {/* Nodes */}
      {nodes.map((node) => {
        const pos = layout[node.id];
        if (!pos) return null;
        const r = node.is_hub
          ? 10 + 8 * Math.min(node.row_count / maxRows, 1)
          : 5 + 6 * Math.min(node.row_count / maxRows, 1);
        const isHovered = hovered === node.id;

        return (
          <g
            key={node.id}
            style={{ cursor: 'pointer' }}
            onClick={() => onNodeClick(node)}
            onMouseEnter={() => setHovered(node.id)}
            onMouseLeave={() => setHovered(null)}
          >
            <circle
              cx={pos.x}
              cy={pos.y}
              r={r}
              fill={node.is_hub ? 'var(--color-primary)' : '#a0aec0'}
              stroke={isHovered ? 'var(--color-primary-light)' : 'transparent'}
              strokeWidth={2}
              opacity={isHovered ? 1 : 0.85}
            />
            {/* Label */}
            <text
              x={pos.x}
              y={pos.y + r + 10}
              textAnchor="middle"
              fontSize={7}
              fill={isHovered ? 'var(--color-primary)' : 'var(--color-text-light)'}
              fontWeight={node.is_hub ? 600 : 400}
            >
              {node.label.length > 14 ? node.label.slice(0, 12) + '..' : node.label}
            </text>
            {/* Hover tooltip */}
            {isHovered && (
              <text
                x={pos.x}
                y={pos.y - r - 4}
                textAnchor="middle"
                fontSize={7}
                fill="var(--color-text)"
                fontWeight={600}
              >
                {node.row_count.toLocaleString()} rows
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ─── Entity Map Panel ─────────────────────────────────────────────────────────
function EntityMapPanel({
  network,
  onRefresh,
}: {
  network: EntityNetwork | null;
  onRefresh: () => void;
}) {
  const { drillDown } = useIntelligenceContext();
  const [search, setSearch] = useState('');
  const [discovering, setDiscovering] = useState(false);
  const [viewMode, setViewMode] = useState<'graph' | 'list'>('graph');

  const handleDiscovery = async () => {
    setDiscovering(true);
    try {
      await triggerDiscovery();
      onRefresh();
    } catch {
      // silent
    } finally {
      setDiscovering(false);
    }
  };

  const handleNodeClick = useCallback(
    (node: EntityNode) => {
      drillDown(node.is_hub ? 'hub' : 'table', node.id, node.label);
    },
    [drillDown]
  );

  const filteredNodes = useMemo(() => {
    if (!network?.nodes) return [];
    if (!search.trim()) return network.nodes;
    const q = search.toLowerCase();
    return network.nodes.filter((n) => n.label.toLowerCase().includes(q));
  }, [network, search]);

  if (!network || !network.nodes.length) {
    return (
      <div className="d-flex flex-column align-items-center justify-content-center h-100 text-muted p-3">
        <div className="mb-2" style={{ fontSize: '2rem', opacity: 0.5 }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="3" />
            <circle cx="5" cy="6" r="2" />
            <circle cx="19" cy="6" r="2" />
            <circle cx="5" cy="18" r="2" />
            <circle cx="19" cy="18" r="2" />
            <line x1="9.5" y1="10.5" x2="6.5" y2="7.5" />
            <line x1="14.5" y1="10.5" x2="17.5" y2="7.5" />
            <line x1="9.5" y1="13.5" x2="6.5" y2="16.5" />
            <line x1="14.5" y1="13.5" x2="17.5" y2="16.5" />
          </svg>
        </div>
        <small className="mb-3 text-center">Run discovery to populate the entity map</small>
        <button
          className="btn btn-sm btn-primary"
          onClick={handleDiscovery}
          disabled={discovering}
        >
          {discovering ? (
            <>
              <span className="spinner-border spinner-border-sm me-1" role="status">
                <span className="visually-hidden">Loading...</span>
              </span>
              Discovering...
            </>
          ) : (
            'Run Discovery'
          )}
        </button>
      </div>
    );
  }

  const useGraph = viewMode === 'graph' && network.nodes.length <= MAX_GRAPH_NODES && !search;

  return (
    <div className="d-flex flex-column h-100">
      {/* Header */}
      <div className="p-2 border-bottom">
        <div className="d-flex justify-content-between align-items-center mb-2">
          <h6 className="fw-semibold mb-0 small" style={{ color: 'var(--color-primary)' }}>
            Entity Map ({filteredNodes.length})
          </h6>
          <div className="d-flex gap-1">
            <button
              className={`btn btn-sm ${viewMode === 'graph' ? 'btn-primary' : 'btn-outline-secondary'}`}
              style={{ fontSize: '0.6rem', padding: '1px 6px' }}
              onClick={() => setViewMode('graph')}
              title="Graph view"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="4" />
                <circle cx="4" cy="4" r="2" />
                <circle cx="20" cy="4" r="2" />
                <line x1="9" y1="9" x2="5.5" y2="5.5" />
                <line x1="15" y1="9" x2="18.5" y2="5.5" />
              </svg>
            </button>
            <button
              className={`btn btn-sm ${viewMode === 'list' ? 'btn-primary' : 'btn-outline-secondary'}`}
              style={{ fontSize: '0.6rem', padding: '1px 6px' }}
              onClick={() => setViewMode('list')}
              title="List view"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="4" y1="6" x2="20" y2="6" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="18" x2="20" y2="18" />
              </svg>
            </button>
            <button
              className="btn btn-sm btn-outline-secondary"
              style={{ fontSize: '0.6rem', padding: '1px 6px' }}
              onClick={handleDiscovery}
              disabled={discovering}
              title="Refresh"
            >
              {discovering ? '...' : '\u21BB'}
            </button>
          </div>
        </div>
        <input
          type="text"
          className="form-control form-control-sm"
          placeholder="Search entities..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Content */}
      <div className="flex-grow-1" style={{ overflowY: 'auto' }}>
        {useGraph ? (
          <div className="p-2">
            <EntityGraph
              nodes={network.nodes}
              edges={network.edges}
              onNodeClick={handleNodeClick}
            />
            {/* Legend */}
            <div className="d-flex gap-3 justify-content-center mt-1" style={{ fontSize: '0.6rem' }}>
              <span className="d-flex align-items-center gap-1">
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-primary)', display: 'inline-block' }} />
                Hub
              </span>
              <span className="d-flex align-items-center gap-1">
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#a0aec0', display: 'inline-block' }} />
                Table
              </span>
              <span className="text-muted">{network.edges.length} relationships</span>
            </div>
          </div>
        ) : (
          <div className="p-2">
            {filteredNodes.map((node) => (
              <div
                key={node.id}
                className="card border-0 shadow-sm mb-2"
                style={{
                  cursor: 'pointer',
                  borderLeft: node.is_hub
                    ? '3px solid var(--color-primary)'
                    : '3px solid var(--color-border)',
                }}
                onClick={() => handleNodeClick(node)}
              >
                <div className="card-body p-2">
                  <div className="d-flex justify-content-between align-items-center">
                    <span className="fw-medium small">{node.label}</span>
                    {node.is_hub && (
                      <span className="badge bg-warning text-dark" style={{ fontSize: '0.6rem' }}>
                        HUB
                      </span>
                    )}
                  </div>
                  <div className="d-flex gap-2 mt-1">
                    <small className="text-muted">{node.row_count.toLocaleString()} rows</small>
                    <small className="text-muted">{node.column_count} cols</small>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
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
      <ExecutiveInsightHeader kpis={kpis} loading={summaryLoading || analyticsLoading} />

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
            Intelligence Analytics
          </h6>
          <IntelligenceAnalyticsGrid
            anomalies={anomalies}
            forecasts={forecasts}
            riskEntities={riskEntities}
            entityNetwork={entityNetwork}
            loading={analyticsLoading}
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
        `Show ${scope.entity_name} revenue trends`,
        `Analyze ${scope.entity_name} patterns`,
      ];
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
      await query(question, scope.level !== 'global' ? scope : undefined);
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
    { key: 'map' as const, label: 'Entity Map' },
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

  // Health polling every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      getHealth().then((r) => setHealth(r.data)).catch(() => {});
      getKPIs().then((r) => setKpis(r.data)).catch(() => {});
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
      <div className="d-flex flex-column" style={{ height: 'calc(100vh - 60px)' }}>
        <SystemHealthBar health={health} />
        <ContextBreadcrumb />
        <MobileTabBar activeTab={mobileTab} onTabChange={setMobileTab} />

        <div className="flex-grow-1" style={{ minHeight: 0, overflow: 'hidden' }}>
          {mobileTab === 'map' && (
            <div style={{ height: '100%', overflowY: 'auto' }}>
              <EntityMapPanel network={network} onRefresh={loadNetwork} />
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
    <div className="d-flex flex-column" style={{ height: 'calc(100vh - 60px)' }}>
      <SystemHealthBar health={health} />
      <ContextBreadcrumb />

      <div className="d-flex flex-grow-1" style={{ minHeight: 0 }}>
        {/* Left Toggle */}
        <PanelToggle label="ENTITIES" side="left" isOpen={leftOpen} onClick={() => setLeftOpen(!leftOpen)} />

        {/* Left Panel: Entity Map */}
        <div
          style={{
            width: leftOpen ? 260 : 0,
            minWidth: leftOpen ? 260 : 0,
            transition: 'width 0.3s ease, min-width 0.3s ease',
            overflow: 'hidden',
            borderRight: leftOpen ? '1px solid var(--color-border)' : 'none',
          }}
        >
          <div style={{ width: 260, height: '100%' }}>
            <EntityMapPanel network={network} onRefresh={loadNetwork} />
          </div>
        </div>

        {/* Center Panel: Dynamic Canvas */}
        <div className="flex-grow-1" style={{ minWidth: 0, overflow: 'hidden' }}>
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
          />
        </div>

        {/* Right Panel: AI Assistant */}
        <div
          style={{
            width: rightOpen ? 380 : 0,
            minWidth: rightOpen ? 380 : 0,
            transition: 'width 0.3s ease, min-width 0.3s ease',
            overflow: 'hidden',
            borderLeft: rightOpen ? '1px solid var(--color-border)' : 'none',
          }}
        >
          <div style={{ width: 380, height: '100%' }}>
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
