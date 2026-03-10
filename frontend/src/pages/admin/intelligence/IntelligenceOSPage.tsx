import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { IntelligenceProvider, useIntelligenceContext } from '../../../contexts/IntelligenceContext';
import { useIntelligenceQuery } from '../../../hooks/useIntelligenceQuery';
import {
  getHealth,
  getEntityNetwork,
  triggerDiscovery,
  HealthStatus,
  EntityNetwork,
  QueryResponse,
  VisualizationSpec,
} from '../../../services/intelligenceApi';
import ExecutiveInsightHeader from '../../../components/admin/intelligence/ExecutiveInsightHeader';
import ChartTypeSelector from '../../../components/admin/intelligence/ChartTypeSelector';
import ChartRenderer from '../../../components/admin/intelligence/ChartRenderer';

// --- Execution step indicator for AI processing ---
const EXECUTION_STEPS = [
  'Classifying intent...',
  'Planning data sources...',
  'Executing queries...',
  'Running ML models...',
  'Generating analysis...',
];

function useExecutionSteps(isProcessing: boolean) {
  const [step, setStep] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isProcessing) {
      setStep(0);
      intervalRef.current = setInterval(() => {
        setStep((s) => Math.min(s + 1, EXECUTION_STEPS.length));
      }, 3000);
    } else {
      setStep(0);
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isProcessing]);

  return step;
}

// --- System Health Bar ---
function SystemHealthBar({ health }: { health: HealthStatus | null }) {
  if (!health) return null;
  const isOnline = health.engine_status === 'online';

  return (
    <div className="d-flex gap-3 align-items-center px-3 py-2 border-bottom" style={{ background: 'var(--color-bg-alt)' }}>
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

// --- Context Breadcrumb ---
function ContextBreadcrumb() {
  const { scope, drillUp, resetScope } = useIntelligenceContext();

  return (
    <nav className="d-flex align-items-center gap-2 px-3 py-2 border-bottom">
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

// --- Entity Map Panel ---
function EntityMapPanel({ network, onRefresh }: { network: EntityNetwork | null; onRefresh: () => void }) {
  const { drillDown } = useIntelligenceContext();
  const [search, setSearch] = useState('');
  const [discovering, setDiscovering] = useState(false);

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

  const filteredNodes = useMemo(() => {
    if (!network?.nodes) return [];
    if (!search.trim()) return network.nodes;
    const q = search.toLowerCase();
    return network.nodes.filter((n) => n.label.toLowerCase().includes(q));
  }, [network, search]);

  if (!network || !network.nodes.length) {
    return (
      <div className="d-flex flex-column align-items-center justify-content-center h-100 text-muted p-3">
        <div className="mb-2" style={{ fontSize: '2rem' }}>&#x1f50d;</div>
        <small className="mb-3">Run discovery to populate entity map</small>
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

  return (
    <div className="d-flex flex-column h-100">
      <div className="p-2 border-bottom">
        <input
          type="text"
          className="form-control form-control-sm"
          placeholder="Search entities..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="p-2 flex-grow-1" style={{ overflowY: 'auto' }}>
        <div className="d-flex justify-content-between align-items-center mb-2 px-1">
          <h6 className="fw-semibold mb-0 small" style={{ color: 'var(--color-primary)' }}>
            Entity Map ({filteredNodes.length})
          </h6>
          <button
            className="btn btn-outline-primary"
            style={{ fontSize: '0.6rem', padding: '1px 6px' }}
            onClick={handleDiscovery}
            disabled={discovering}
          >
            {discovering ? '...' : 'Refresh'}
          </button>
        </div>
        {filteredNodes.map((node) => (
          <div
            key={node.id}
            className="card border-0 shadow-sm mb-2"
            style={{
              cursor: 'pointer',
              borderLeft: node.is_hub ? '3px solid var(--color-primary)' : '3px solid var(--color-border)',
            }}
            onClick={() => drillDown(node.is_hub ? 'hub' : 'table', node.id, node.label)}
          >
            <div className="card-body p-2">
              <div className="d-flex justify-content-between align-items-center">
                <span className="fw-medium small">{node.label}</span>
                {node.is_hub && (
                  <span className="badge bg-warning text-dark" style={{ fontSize: '0.6rem' }}>HUB</span>
                )}
              </div>
              <div className="d-flex gap-2 mt-1">
                <small className="text-muted">{node.row_count.toLocaleString()} rows</small>
                <small className="text-muted">{node.column_count} cols</small>
              </div>
            </div>
          </div>
        ))}
        {network.edges.length > 0 && !search && (
          <div className="mt-3 px-1">
            <small className="fw-semibold text-muted">Relationships ({network.edges.length})</small>
            {network.edges.slice(0, 10).map((edge, i) => (
              <div key={i} className="small text-muted mt-1">
                {edge.source} → {edge.target}
                <span className="ms-1 badge bg-light text-dark" style={{ fontSize: '0.55rem' }}>{edge.type}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Dynamic Canvas ---
function DynamicCanvas({
  visualizations,
  insights,
  summary,
  summaryLoading,
}: {
  visualizations: VisualizationSpec[];
  insights: QueryResponse | null;
  summary: Record<string, any> | null;
  summaryLoading: boolean;
}) {
  const [activeChartType, setActiveChartType] = useState<string | null>(null);

  const applicableTypes = useMemo(() => {
    if (!visualizations.length) return null;
    return [...new Set(visualizations.map((v) => v.chart_type))];
  }, [visualizations]);

  const filteredViz = useMemo(() => {
    if (!activeChartType) return visualizations;
    return visualizations.filter((v) => v.chart_type === activeChartType);
  }, [visualizations, activeChartType]);

  if (!visualizations.length && !insights && !summary) {
    return (
      <div className="d-flex align-items-center justify-content-center h-100 text-muted">
        <div className="text-center">
          <div className="mb-2" style={{ fontSize: '2.5rem' }}>&#x1f4ca;</div>
          <p className="mb-1">Ask a question to see visualizations</p>
          <small>Or click an entity in the map to explore</small>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3" style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 160px)' }}>
      {/* Executive KPI Header */}
      <ExecutiveInsightHeader summary={summary} loading={summaryLoading} />

      {/* Chart Type Selector */}
      {visualizations.length > 0 && (
        <div className="mt-2 mb-2">
          <ChartTypeSelector
            activeType={activeChartType}
            onTypeChange={setActiveChartType}
            applicableTypes={applicableTypes}
          />
        </div>
      )}

      {/* Narrative Summary */}
      {insights?.narrative && (
        <div className="card border-0 shadow-sm mb-3">
          <div className="card-header bg-white fw-semibold small" style={{ color: 'var(--color-primary)' }}>
            Executive Summary
          </div>
          <div className="card-body">
            <p className="mb-0 small" style={{ whiteSpace: 'pre-line' }}>{insights.narrative}</p>
          </div>
        </div>
      )}

      {/* Chart Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
          gap: '1rem',
        }}
      >
        {filteredViz.map((viz, i) => (
          <ChartRenderer key={i} visualization={viz} />
        ))}
      </div>

      {/* Follow-up Questions */}
      {insights?.follow_ups && insights.follow_ups.length > 0 && (
        <div className="mt-3">
          <small className="fw-semibold text-muted">Follow-up questions:</small>
          <div className="d-flex flex-wrap gap-2 mt-2">
            {insights.follow_ups.map((q, i) => (
              <span
                key={i}
                className="badge bg-light text-dark border"
                style={{ cursor: 'pointer', fontSize: '0.72rem' }}
              >
                {q}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// --- AI Assistant Panel ---
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
}: {
  onVisualizationsUpdate: (viz: VisualizationSpec[]) => void;
  onSummaryUpdate: (data: Record<string, any>) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const { response, loading, error, query } = useIntelligenceQuery();
  const { scope } = useIntelligenceContext();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const execStep = useExecutionSteps(loading);

  // Status indicators from last response
  const [statusDots, setStatusDots] = useState<string[]>([]);

  const starterQuestions = useMemo(() => {
    if (scope.level === 'entity' && scope.entity_name) {
      return [
        `What are the risk factors for ${scope.entity_name}?`,
        `Show ${scope.entity_name} revenue trends`,
        `Analyze ${scope.entity_name} complaint patterns`,
        `Forecast ${scope.entity_name} for next 90 days`,
      ];
    }
    return [
      'Give me an executive summary',
      'What are the top anomalies?',
      'Show me revenue trends',
      'Which entities are at risk?',
      'Forecast revenue for next 30 days',
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

      // Extract summary data for KPI header
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
  }, [response, onVisualizationsUpdate, onSummaryUpdate]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = useCallback(async (text?: string) => {
    const question = text || input.trim();
    if (!question) return;

    const userMsg: ChatMessage = { role: 'user', content: question, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    await query(question, scope.level !== 'global' ? scope : undefined);
  }, [input, query, scope]);

  return (
    <div className="d-flex flex-column h-100">
      {/* Header with status dots */}
      <div className="px-3 py-2 border-bottom d-flex justify-content-between align-items-center">
        <h6 className="fw-semibold mb-0" style={{ color: 'var(--color-primary)' }}>AI Assistant</h6>
        {statusDots.length > 0 && (
          <div className="d-flex gap-2">
            {statusDots.map((dot) => (
              <span key={dot} className="d-flex align-items-center gap-1" style={{ fontSize: '0.6rem' }}>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#38a169',
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
      <div className="flex-grow-1 p-3" style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 320px)' }}>
        {messages.length === 0 && (
          <div className="text-center mt-3">
            {/* Welcome icon */}
            <div
              className="mx-auto mb-3 d-flex align-items-center justify-content-center rounded-3"
              style={{
                width: 48,
                height: 48,
                background: 'rgba(26, 54, 93, 0.1)',
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/>
                <line x1="10" y1="22" x2="14" y2="22"/>
              </svg>
            </div>
            <h6 className="fw-semibold" style={{ color: 'var(--color-primary)', fontSize: '0.9rem' }}>
              Intelligence OS
            </h6>
            <small className="text-muted d-block mb-3" style={{ fontSize: '0.72rem' }}>
              Ask questions about your data. I can analyze performance, detect anomalies, forecast trends, and surface actionable insights.
            </small>
            <div className="d-flex flex-column gap-2">
              {starterQuestions.map((q, i) => (
                <button
                  key={i}
                  className="btn btn-sm btn-outline-secondary text-start d-flex align-items-center gap-2"
                  style={{ fontSize: '0.75rem' }}
                  onClick={() => handleSend(q)}
                >
                  <span style={{ color: 'var(--color-primary-light)' }}>?</span>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`mb-3 ${msg.role === 'user' ? 'text-end' : ''}`}>
            <div
              className={`d-inline-block p-2 rounded-3 small ${
                msg.role === 'user' ? 'text-white' : 'border'
              }`}
              style={{
                maxWidth: '90%',
                background: msg.role === 'user' ? 'var(--color-primary)' : 'var(--color-bg-alt)',
                textAlign: 'left',
                whiteSpace: 'pre-line',
              }}
            >
              {msg.content}
            </div>
            {/* Sources badges */}
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
              <small className="text-muted" style={{ fontSize: '0.6rem' }}>
                {msg.timestamp.toLocaleTimeString()}
              </small>
            </div>
          </div>
        ))}

        {/* Execution step indicator */}
        {loading && (
          <div className="mb-3">
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
                    fontSize: '0.68rem',
                    color: i <= execStep ? 'var(--color-text)' : 'var(--color-text-light)',
                    opacity: i <= execStep ? 1 : 0.4,
                  }}
                >
                  {i < execStep ? (
                    <span style={{ color: 'var(--color-accent)' }}>&#10003;</span>
                  ) : i === execStep ? (
                    <span className="spinner-border spinner-border-sm" style={{ width: 10, height: 10, borderWidth: 1 }} role="status">
                      <span className="visually-hidden">Loading...</span>
                    </span>
                  ) : (
                    <span style={{ width: 10, display: 'inline-block' }}>&#x25CB;</span>
                  )}
                  {s}
                </div>
              ))}
              {execStep >= EXECUTION_STEPS.length && (
                <small className="text-muted ms-3 d-block mt-1" style={{ fontSize: '0.62rem' }}>
                  Still analyzing — complex queries may take up to 2 minutes...
                </small>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="alert alert-danger py-2 small">{error}</div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-top">
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

// --- Status Bar ---
function StatusBar({ lastRefresh }: { lastRefresh: string }) {
  return (
    <div
      className="d-flex justify-content-between align-items-center px-3 py-1 border-top"
      style={{ background: 'var(--color-bg-alt)', fontSize: '0.65rem' }}
    >
      <span className="text-muted">Last refresh: {lastRefresh}</span>
      <span className="text-muted">Ready</span>
    </div>
  );
}

// --- Main Page ---
function IntelligenceOSContent() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [network, setNetwork] = useState<EntityNetwork | null>(null);
  const [visualizations, setVisualizations] = useState<VisualizationSpec[]>([]);
  const [insights, setInsights] = useState<QueryResponse | null>(null);
  const [summary, setSummary] = useState<Record<string, any> | null>(null);
  const [lastRefresh, setLastRefresh] = useState(new Date().toLocaleString());

  const loadNetwork = useCallback(() => {
    getEntityNetwork().then((r) => setNetwork(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    getHealth().then((r) => setHealth(r.data)).catch(() => {});
    loadNetwork();
  }, [loadNetwork]);

  const handleVisualizationsUpdate = useCallback((viz: VisualizationSpec[]) => {
    setVisualizations(viz);
    setLastRefresh(new Date().toLocaleString());
  }, []);

  const handleSummaryUpdate = useCallback((data: Record<string, any>) => {
    setSummary(data);
  }, []);

  return (
    <div className="d-flex flex-column" style={{ height: 'calc(100vh - 60px)' }}>
      <SystemHealthBar health={health} />
      <ContextBreadcrumb />

      <div className="row g-0 flex-grow-1" style={{ minHeight: 0 }}>
        {/* Left Panel: Entity Map */}
        <div className="col-3 border-end" style={{ overflowY: 'auto' }}>
          <EntityMapPanel network={network} onRefresh={loadNetwork} />
        </div>

        {/* Center Panel: Dynamic Canvas */}
        <div className="col-6" style={{ overflowY: 'auto' }}>
          <DynamicCanvas
            visualizations={visualizations}
            insights={insights}
            summary={summary}
            summaryLoading={false}
          />
        </div>

        {/* Right Panel: AI Assistant */}
        <div className="col-3 border-start">
          <AIAssistantPanel
            onVisualizationsUpdate={handleVisualizationsUpdate}
            onSummaryUpdate={handleSummaryUpdate}
          />
        </div>
      </div>

      <StatusBar lastRefresh={lastRefresh} />
    </div>
  );
}

export default function IntelligenceOSPage() {
  return (
    <IntelligenceProvider>
      <IntelligenceOSContent />
    </IntelligenceProvider>
  );
}
