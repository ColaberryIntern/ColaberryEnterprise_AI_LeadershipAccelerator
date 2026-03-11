import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useIntelligenceContext } from '../../../contexts/IntelligenceContext';
import { useIntelligenceQuery } from '../../../hooks/useIntelligenceQuery';
import { sendCoryCommand, type CoryResponse, type ExecutiveBriefing } from '../../../services/coryApi';
import { simulateAutonomyCycle, runAutonomyCycle, type VisualizationSpec } from '../../../services/intelligenceApi';

// ─── Types ───────────────────────────────────────────────────────────────────

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
  briefings?: ExecutiveBriefing[];
  agentsDispatched?: string[];
  actionsTaken?: string[];
  intent?: string;
}

interface CoryPanelProps {
  onVisualizationsUpdate: (viz: VisualizationSpec[]) => void;
  onSummaryUpdate: (data: Record<string, any>) => void;
  onInsightsUpdate: (insights: any[]) => void;
  externalQuery: string | null;
}

// ─── Briefing Card ───────────────────────────────────────────────────────────

function BriefingCard({ briefing }: { briefing: ExecutiveBriefing }) {
  return (
    <div className="mb-2">
      {briefing.problem_detected && (
        <div className="ps-2 mb-1" style={{ borderLeft: '3px solid var(--color-secondary)', fontSize: '0.76rem' }}>
          <span className="fw-semibold" style={{ color: 'var(--color-secondary)' }}>Problem: </span>
          {briefing.problem_detected}
        </div>
      )}
      {briefing.analysis && (
        <div className="ps-2 mb-1" style={{ borderLeft: '3px solid var(--color-primary-light)', fontSize: '0.76rem' }}>
          <span className="fw-semibold" style={{ color: 'var(--color-primary-light)' }}>Analysis: </span>
          {briefing.analysis}
        </div>
      )}
      {briefing.action_taken && (
        <div className="ps-2 mb-1" style={{ borderLeft: '3px solid var(--color-accent)', fontSize: '0.76rem' }}>
          <span className="fw-semibold" style={{ color: 'var(--color-accent)' }}>Action: </span>
          {briefing.action_taken}
        </div>
      )}
      {briefing.expected_impact && (
        <div className="ps-2 mb-1" style={{ borderLeft: '3px solid var(--color-primary)', fontSize: '0.76rem' }}>
          <span className="fw-semibold" style={{ color: 'var(--color-primary)' }}>Impact: </span>
          {briefing.expected_impact}
        </div>
      )}
      <div className="d-flex align-items-center gap-1 mt-1">
        <div
          style={{
            width: `${Math.min(briefing.confidence, 100)}%`,
            height: 3,
            borderRadius: 2,
            background: briefing.confidence >= 70 ? 'var(--color-accent)' : briefing.confidence >= 40 ? '#d69e2e' : 'var(--color-secondary)',
            maxWidth: 80,
          }}
        />
        <span style={{ fontSize: '0.6rem', color: 'var(--color-text-light)' }}>{briefing.confidence}%</span>
      </div>
    </div>
  );
}

// ─── Cory Panel ──────────────────────────────────────────────────────────────

export default function CoryPanel({
  onVisualizationsUpdate,
  onSummaryUpdate,
  onInsightsUpdate,
  externalQuery,
}: CoryPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const { response, loading: queryLoading, query } = useIntelligenceQuery();
  const { scope } = useIntelligenceContext();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [queryCount, setQueryCount] = useState(0);
  const processedExternalRef = useRef<string | null>(null);
  const [coryStatus, setCoryStatus] = useState<'active' | 'thinking' | 'idle'>('active');

  const starterQuestions = useMemo(() => [
    'Give me a status briefing',
    'What are our biggest growth opportunities?',
    'Show me department health',
    'What experiments are running?',
    'Which agents need attention?',
  ], []);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Handle assistant pipeline responses (for analytical queries routed through Cory)
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
      if (response.visualizations?.length) onVisualizationsUpdate(response.visualizations);
      if (response.data) onSummaryUpdate(response.data);
    }
  }, [response, onVisualizationsUpdate, onSummaryUpdate, onInsightsUpdate]);

  const handleSend = useCallback(
    async (text?: string) => {
      const question = text || input.trim();
      if (!question || loading || queryLoading) return;

      const userMsg: ChatMessage = { role: 'user', content: question, timestamp: new Date() };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setQueryCount((c) => c + 1);
      setLoading(true);
      setCoryStatus('thinking');

      try {
        // Route through Cory
        const coryResult: CoryResponse = await sendCoryCommand(question, {
          entity_type: scope.level !== 'global' ? scope.entity_type : undefined,
          entity_name: scope.entity_name,
        });

        // If Cory returned an assistant response, use its pipeline data
        if (coryResult.assistant_response) {
          const ar = coryResult.assistant_response;
          const msg: ChatMessage = {
            role: 'assistant',
            content: coryResult.message || ar.narrative || 'Analysis complete.',
            timestamp: new Date(),
            visualizations: ar.visualizations,
            sources: ar.sources,
            executionPath: ar.execution_path,
            pipelineSteps: ar.pipelineSteps,
            insights: ar.insights,
            recommendations: ar.recommendations,
            confidence: ar.confidence,
            narrativeSections: ar.narrative_sections || ar.narrativeSections,
            briefings: coryResult.briefings,
            agentsDispatched: coryResult.agents_dispatched,
            actionsTaken: coryResult.actions_taken,
            intent: coryResult.intent,
          };
          setMessages((prev) => [...prev, msg]);
          if (ar.visualizations?.length) onVisualizationsUpdate(ar.visualizations);
          if (ar.data) onSummaryUpdate(ar.data);
        } else {
          // Cory-only response (briefing, hire, etc.)
          const msg: ChatMessage = {
            role: 'assistant',
            content: coryResult.message,
            timestamp: new Date(),
            briefings: coryResult.briefings,
            agentsDispatched: coryResult.agents_dispatched,
            actionsTaken: coryResult.actions_taken,
            intent: coryResult.intent,
          };
          setMessages((prev) => [...prev, msg]);
        }
      } catch (err: any) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `I encountered an issue: ${err.message}`, timestamp: new Date() },
        ]);
      } finally {
        setLoading(false);
        setCoryStatus('active');
      }
    },
    [input, loading, queryLoading, scope, onVisualizationsUpdate, onSummaryUpdate],
  );

  // Handle external queries
  useEffect(() => {
    if (externalQuery && externalQuery !== processedExternalRef.current) {
      processedExternalRef.current = externalQuery;
      handleSend(externalQuery);
    }
  }, [externalQuery, handleSend]);

  return (
    <div className="d-flex flex-column h-100">
      {/* Header */}
      <div className="px-3 py-2 border-bottom d-flex justify-content-between align-items-center" style={{ flexShrink: 0 }}>
        <div className="d-flex align-items-center gap-2">
          <div
            className="d-flex align-items-center justify-content-center rounded-circle fw-bold text-white"
            style={{ width: 28, height: 28, background: 'var(--color-primary)', fontSize: '0.75rem' }}
          >
            C
          </div>
          <div>
            <h6 className="fw-semibold mb-0" style={{ color: 'var(--color-primary)', fontSize: '0.85rem' }}>
              Cory &mdash; AI COO
            </h6>
          </div>
          <span
            className="d-inline-block rounded-circle"
            style={{
              width: 8,
              height: 8,
              background: coryStatus === 'thinking' ? '#d69e2e' : 'var(--color-accent)',
              animation: coryStatus === 'thinking' ? 'pulse 1s ease infinite' : 'none',
            }}
            title={coryStatus}
          />
          {queryCount > 0 && (
            <span className="badge bg-light text-muted border" style={{ fontSize: '0.55rem' }}>
              {queryCount}
            </span>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-grow-1 p-3" style={{ overflowY: 'auto' }}>
        {messages.length === 0 && !loading && (
          <div className="text-center mt-3">
            <div
              className="mx-auto mb-3 d-flex align-items-center justify-content-center rounded-circle"
              style={{ width: 56, height: 56, background: 'rgba(26, 54, 93, 0.08)' }}
            >
              <span style={{ fontSize: '1.5rem', color: 'var(--color-primary)', fontWeight: 700 }}>C</span>
            </div>
            <h6 className="fw-semibold" style={{ color: 'var(--color-primary)', fontSize: '0.85rem' }}>
              Cory &mdash; AI Chief Operating Officer
            </h6>
            <small className="text-muted d-block mb-3" style={{ fontSize: '0.72rem', lineHeight: 1.5 }}>
              I coordinate {'>'}40 AI agents across 5 departments.<br />
              Ask me for briefings, analysis, or to hire new agents.
            </small>
            <div className="d-flex flex-column gap-2">
              {starterQuestions.map((q, i) => (
                <button
                  key={i}
                  className="btn btn-sm btn-outline-secondary text-start d-flex align-items-center gap-2"
                  style={{ fontSize: '0.73rem' }}
                  onClick={() => handleSend(q)}
                >
                  <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>&#9654;</span>
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
                style={{ maxWidth: '90%', background: 'var(--color-primary)', textAlign: 'left', fontSize: '0.78rem', lineHeight: 1.5 }}
              >
                {msg.content}
              </div>
            ) : (
              <div style={{ fontSize: '0.78rem', lineHeight: 1.6, color: 'var(--color-text)' }}>
                {/* Agents dispatched badge */}
                {msg.agentsDispatched && msg.agentsDispatched.length > 0 && (
                  <div className="mb-2 d-flex flex-wrap gap-1">
                    {msg.agentsDispatched.map((a, ai) => (
                      <span key={ai} className="badge bg-light text-muted border" style={{ fontSize: '0.55rem' }}>
                        {a}
                      </span>
                    ))}
                  </div>
                )}

                {/* Briefing cards */}
                {msg.briefings && msg.briefings.length > 0 && (
                  <div className="mb-2">
                    {msg.briefings.map((b, bi) => (
                      <BriefingCard key={bi} briefing={b} />
                    ))}
                  </div>
                )}

                {/* Structured narrative sections (from assistant pipeline) */}
                {msg.narrativeSections ? (
                  <div>
                    {msg.narrativeSections.executive_summary && (
                      <div className="mb-2">
                        <div className="fw-semibold mb-1" style={{ color: 'var(--color-primary)', fontSize: '0.82rem' }}>
                          Executive Summary
                        </div>
                        <div>{msg.narrativeSections.executive_summary}</div>
                      </div>
                    )}
                    {msg.narrativeSections.key_findings?.length > 0 && (
                      <div className="mb-2">
                        <div className="fw-semibold mb-1" style={{ color: 'var(--color-primary)', fontSize: '0.82rem' }}>Key Findings</div>
                        <ul className="mb-0 ps-3" style={{ fontSize: '0.76rem' }}>
                          {msg.narrativeSections.key_findings.map((f, fi) => <li key={fi} className="mb-1">{f}</li>)}
                        </ul>
                      </div>
                    )}
                    {msg.narrativeSections.risk_assessment && (
                      <div className="mb-2">
                        <div className="fw-semibold mb-1" style={{ color: 'var(--color-primary)', fontSize: '0.82rem' }}>Risk Assessment</div>
                        <div>{msg.narrativeSections.risk_assessment}</div>
                      </div>
                    )}
                    {msg.narrativeSections.recommended_actions?.length > 0 && (
                      <div className="mb-2">
                        <div className="d-flex align-items-center justify-content-between mb-1">
                          <div className="fw-semibold" style={{ color: 'var(--color-primary)', fontSize: '0.82rem' }}>Recommended Actions</div>
                          <div className="d-flex gap-1">
                            <button className="btn btn-sm btn-outline-primary" style={{ fontSize: '0.65rem', padding: '2px 8px' }}
                              onClick={async () => {
                                try {
                                  const res = await simulateAutonomyCycle();
                                  const recs = res.data?.recommendations || [];
                                  alert(recs.length > 0
                                    ? `Simulation: ${recs.length} action(s) would execute.\n${recs.map((r: any) => `${r.action} (risk: ${r.risk_score}, conf: ${r.confidence_score})`).join('\n')}`
                                    : 'Simulation: No problems detected.');
                                } catch { alert('Simulation failed.'); }
                              }}>Simulate</button>
                            <button className="btn btn-sm btn-primary" style={{ fontSize: '0.65rem', padding: '2px 8px' }}
                              onClick={async () => {
                                if (!window.confirm('Run autonomous cycle now? Safe actions (risk < 40) will auto-execute.')) return;
                                try {
                                  const res = await runAutonomyCycle();
                                  const d = res.data;
                                  alert(`Cycle complete: ${d.problems_detected} problems, ${d.decisions_created} decisions (${d.auto_executed} auto-executed, ${d.proposed} proposed)`);
                                } catch { alert('Cycle failed.'); }
                              }}>Execute</button>
                          </div>
                        </div>
                        <div className="ps-2 ms-1" style={{ borderLeft: '3px solid var(--color-primary-light)', fontSize: '0.76rem' }}>
                          {msg.narrativeSections.recommended_actions.map((a, ai) => <div key={ai} className="mb-1">{a}</div>)}
                        </div>
                      </div>
                    )}
                    {msg.narrativeSections.follow_up_areas?.length > 0 && (
                      <div className="mb-2">
                        <div className="fw-semibold mb-1" style={{ color: 'var(--color-primary)', fontSize: '0.82rem' }}>Follow-Up</div>
                        <ul className="mb-0 ps-3" style={{ fontSize: '0.76rem' }}>
                          {msg.narrativeSections.follow_up_areas.map((f, fi) => <li key={fi} className="mb-1">{f}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : !msg.briefings?.length ? (
                  <div style={{ whiteSpace: 'pre-line' }}>{msg.content}</div>
                ) : null}

                {/* Plain message when we have briefings but also a message */}
                {msg.briefings?.length && msg.content && !msg.narrativeSections ? (
                  <div className="mt-1" style={{ whiteSpace: 'pre-line' }}>{msg.content}</div>
                ) : null}

                {/* Sources */}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-2 mb-1">
                    {msg.sources.map((src, si) => (
                      <span key={si} className="badge bg-light text-muted border me-1" style={{ fontSize: '0.55rem' }}>{src}</span>
                    ))}
                  </div>
                )}

                {/* Pipeline steps */}
                {msg.pipelineSteps && msg.pipelineSteps.length > 0 && (
                  <div className="mt-1">
                    <details>
                      <summary className="text-muted" style={{ fontSize: '0.6rem', cursor: 'pointer' }}>
                        Pipeline: {msg.pipelineSteps.filter((s) => s.status === 'completed').length}/{msg.pipelineSteps.length} steps
                        {msg.confidence != null && ` \u2022 ${(msg.confidence * 100).toFixed(0)}% confidence`}
                        {' \u2022 '}{msg.pipelineSteps.reduce((sum, s) => sum + s.duration_ms, 0)}ms
                      </summary>
                      <div className="mt-1 ps-2 border-start" style={{ borderColor: 'var(--color-border)' }}>
                        {msg.pipelineSteps.map((ps) => (
                          <div key={ps.step} className="d-flex align-items-center gap-1"
                            style={{ fontSize: '0.58rem', color: ps.status === 'completed' ? 'var(--color-text)' : 'var(--color-text-light)' }}>
                            <span style={{ color: ps.status === 'completed' ? 'var(--color-accent)' : ps.status === 'skipped' ? 'var(--color-text-light)' : 'var(--color-secondary)' }}>
                              {ps.status === 'completed' ? '\u2713' : ps.status === 'skipped' ? '\u2013' : '\u2717'}
                            </span>
                            <span>{ps.name}</span>
                            <span className="text-muted ms-auto">{ps.duration_ms}ms</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                )}
              </div>
            )}

            {/* Follow-up suggestions */}
            {msg.role === 'assistant' && msg.recommendations && msg.recommendations.length > 0 && (
              <div className="mt-2 d-flex flex-column gap-1">
                {msg.recommendations.slice(0, 3).map((rec, ri) => (
                  <button key={ri} className="btn btn-sm text-start border rounded-2 w-100"
                    style={{ fontSize: '0.72rem', padding: '6px 10px', background: 'rgba(26, 54, 93, 0.03)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }}
                    onClick={() => handleSend(rec)}>
                    {rec}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-1">
              <small className="text-muted" style={{ fontSize: '0.55rem' }}>{msg.timestamp.toLocaleTimeString()}</small>
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {loading && (
          <div className="mb-3 d-flex align-items-center gap-2" style={{ fontSize: '0.76rem', color: 'var(--color-text-light)' }}>
            <div className="spinner-border spinner-border-sm" role="status" style={{ width: 14, height: 14 }}>
              <span className="visually-hidden">Cory is thinking...</span>
            </div>
            Cory is analyzing...
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-2 border-top" style={{ flexShrink: 0 }}>
        <div className="input-group input-group-sm">
          <input
            type="text"
            className="form-control form-control-sm"
            placeholder="Ask Cory anything..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            disabled={loading || queryLoading}
            style={{ fontSize: '0.78rem' }}
          />
          <button
            className="btn btn-primary btn-sm"
            onClick={() => handleSend()}
            disabled={loading || queryLoading || !input.trim()}
            style={{ fontSize: '0.78rem' }}
          >
            Send
          </button>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
