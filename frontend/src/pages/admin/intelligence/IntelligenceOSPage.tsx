import React, { useState, useEffect, useCallback } from 'react';
import { IntelligenceProvider, useIntelligenceContext } from '../../../contexts/IntelligenceContext';
import { useIntelligenceQuery } from '../../../hooks/useIntelligenceQuery';
import {
  getHealth,
  getEntityNetwork,
  getExecutiveSummary,
  getRankedInsights,
  HealthStatus,
  EntityNetwork,
  QueryResponse,
  VisualizationSpec,
} from '../../../services/intelligenceApi';

// --- Sub-components inlined for simplicity ---

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

function ContextBreadcrumb() {
  const { scope, drillUp, resetScope, scopeHistory } = useIntelligenceContext();

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

function EntityMapPanel({ network }: { network: EntityNetwork | null }) {
  const { drillDown } = useIntelligenceContext();

  if (!network || !network.nodes.length) {
    return (
      <div className="d-flex align-items-center justify-content-center h-100 text-muted">
        <div className="text-center">
          <div className="mb-2" style={{ fontSize: '2rem' }}>&#x1f50d;</div>
          <small>Run discovery to populate entity map</small>
        </div>
      </div>
    );
  }

  return (
    <div className="p-2" style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 200px)' }}>
      <h6 className="fw-semibold mb-3 px-1" style={{ color: 'var(--color-primary)' }}>Entity Map</h6>
      {network.nodes.map((node) => (
        <div
          key={node.id}
          className="card border-0 shadow-sm mb-2 cursor-pointer"
          style={{ cursor: 'pointer' }}
          onClick={() => drillDown(node.is_hub ? 'hub' : 'table', node.id, node.label)}
        >
          <div className="card-body p-2">
            <div className="d-flex justify-content-between align-items-center">
              <span className="fw-medium small">{node.label}</span>
              {node.is_hub && <span className="badge bg-warning text-dark" style={{ fontSize: '0.65rem' }}>HUB</span>}
            </div>
            <div className="d-flex gap-2 mt-1">
              <small className="text-muted">{node.row_count.toLocaleString()} rows</small>
              <small className="text-muted">{node.column_count} cols</small>
            </div>
          </div>
        </div>
      ))}
      {network.edges.length > 0 && (
        <div className="mt-3 px-1">
          <small className="fw-semibold text-muted">Relationships ({network.edges.length})</small>
          {network.edges.slice(0, 10).map((edge, i) => (
            <div key={i} className="small text-muted mt-1">
              {edge.source} → {edge.target}
              <span className="ms-1 badge bg-light text-dark" style={{ fontSize: '0.6rem' }}>{edge.type}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DynamicCanvas({ visualizations, insights }: { visualizations: VisualizationSpec[]; insights: QueryResponse | null }) {
  if (!visualizations.length && !insights) {
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
    <div className="p-3" style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 200px)' }}>
      {insights?.narrative && (
        <div className="card border-0 shadow-sm mb-3">
          <div className="card-header bg-white fw-semibold" style={{ color: 'var(--color-primary)' }}>
            Executive Summary
          </div>
          <div className="card-body">
            <p className="mb-0 small" style={{ whiteSpace: 'pre-line' }}>{insights.narrative}</p>
          </div>
        </div>
      )}

      <div className="row g-3">
        {visualizations.map((viz, i) => (
          <div key={i} className="col-md-6">
            <div className="card border-0 shadow-sm">
              <div className="card-header bg-white fw-semibold small">
                {viz.title}
              </div>
              <div className="card-body p-3">
                <div className="d-flex align-items-center justify-content-center" style={{ minHeight: '180px' }}>
                  <div className="text-center text-muted">
                    <small className="badge bg-info">{viz.chart_type}</small>
                    <p className="mt-2 mb-0 small">{viz.data?.length || 0} data points</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {insights?.follow_ups && insights.follow_ups.length > 0 && (
        <div className="mt-3">
          <small className="fw-semibold text-muted">Follow-up questions:</small>
          <div className="d-flex flex-wrap gap-2 mt-2">
            {insights.follow_ups.map((q, i) => (
              <span key={i} className="badge bg-light text-dark border" style={{ cursor: 'pointer', fontSize: '0.75rem' }}>
                {q}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  visualizations?: VisualizationSpec[];
}

function AIAssistantPanel({
  onVisualizationsUpdate,
}: {
  onVisualizationsUpdate: (viz: VisualizationSpec[]) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const { response, loading, error, query } = useIntelligenceQuery();
  const { scope } = useIntelligenceContext();

  const starterQuestions = [
    'Give me an executive summary',
    'What are the top anomalies?',
    'Show me revenue trends',
    'Which entities are at risk?',
  ];

  useEffect(() => {
    if (response) {
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: response.narrative || 'No results found.',
        timestamp: new Date(),
        visualizations: response.visualizations,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      if (response.visualizations?.length) {
        onVisualizationsUpdate(response.visualizations);
      }
    }
  }, [response, onVisualizationsUpdate]);

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
      <div className="px-3 py-2 border-bottom">
        <h6 className="fw-semibold mb-0" style={{ color: 'var(--color-primary)' }}>AI Assistant</h6>
      </div>

      <div className="flex-grow-1 p-3" style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 320px)' }}>
        {messages.length === 0 && (
          <div className="text-center mt-4">
            <small className="text-muted d-block mb-3">Ask me anything about your data</small>
            <div className="d-flex flex-column gap-2">
              {starterQuestions.map((q, i) => (
                <button
                  key={i}
                  className="btn btn-sm btn-outline-secondary text-start"
                  onClick={() => handleSend(q)}
                >
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
                msg.role === 'user'
                  ? 'text-white'
                  : 'border'
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
            <div className="mt-1">
              <small className="text-muted" style={{ fontSize: '0.65rem' }}>
                {msg.timestamp.toLocaleTimeString()}
              </small>
            </div>
          </div>
        ))}

        {loading && (
          <div className="text-center">
            <div className="spinner-border spinner-border-sm text-primary" role="status">
              <span className="visually-hidden">Analyzing...</span>
            </div>
            <small className="text-muted d-block mt-1">Analyzing your question...</small>
          </div>
        )}

        {error && (
          <div className="alert alert-danger py-2 small">{error}</div>
        )}
      </div>

      <div className="p-3 border-top">
        <div className="input-group input-group-sm">
          <input
            type="text"
            className="form-control"
            placeholder="Ask a question..."
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
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Main Page ---

function IntelligenceOSContent() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [network, setNetwork] = useState<EntityNetwork | null>(null);
  const [visualizations, setVisualizations] = useState<VisualizationSpec[]>([]);
  const [insights, setInsights] = useState<QueryResponse | null>(null);

  useEffect(() => {
    getHealth().then((r) => setHealth(r.data)).catch(() => {});
    getEntityNetwork().then((r) => setNetwork(r.data)).catch(() => {});
  }, []);

  return (
    <div className="d-flex flex-column" style={{ height: 'calc(100vh - 60px)' }}>
      <SystemHealthBar health={health} />
      <ContextBreadcrumb />

      <div className="row g-0 flex-grow-1">
        {/* Left Panel: Entity Map */}
        <div className="col-3 border-end" style={{ overflowY: 'auto' }}>
          <EntityMapPanel network={network} />
        </div>

        {/* Center Panel: Dynamic Canvas */}
        <div className="col-6">
          <DynamicCanvas visualizations={visualizations} insights={insights} />
        </div>

        {/* Right Panel: AI Assistant */}
        <div className="col-3 border-start">
          <AIAssistantPanel onVisualizationsUpdate={setVisualizations} />
        </div>
      </div>
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
