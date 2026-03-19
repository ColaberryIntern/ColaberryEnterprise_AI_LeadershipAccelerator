import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useIntelligenceContext } from '../../../contexts/IntelligenceContext';
import { useIntelligenceQuery } from '../../../hooks/useIntelligenceQuery';
import { sendCoryCommand, type CoryResponse, type ExecutiveBriefing } from '../../../services/coryApi';
import { simulateAutonomyCycle, runAutonomyCycle, type VisualizationSpec } from '../../../services/intelligenceApi';
import { formatConfidence, confidenceBadgeColor, smartTranslate } from '../../../utils/businessTranslator';
import { getAgentDisplayName } from '../../../utils/agentDisplayNames';
import FeedbackButtons from './FeedbackButtons';

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
  suggestedQuestions?: string[];
}

interface CoryPanelProps {
  onVisualizationsUpdate: (viz: VisualizationSpec[]) => void;
  onSummaryUpdate: (data: Record<string, any>) => void;
  onInsightsUpdate: (insights: any[]) => void;
  onNarrativeUpdate?: (narrative: { narrative: string; narrative_sections?: any; sources?: string[]; follow_ups?: string[] }) => void;
  externalQuery: string | null;
}

// ─── Markdown-like renderer ─────────────────────────────────────────────────

function renderFormattedText(text: string): React.ReactNode {
  if (!text) return null;
  // Split into paragraphs
  const paragraphs = text.split(/\n\n+/);
  return paragraphs.map((para, pi) => {
    // Check if it's a bullet list
    const lines = para.split('\n');
    const isList = lines.every((l) => /^[-•*]\s/.test(l.trim()) || l.trim() === '');
    if (isList) {
      const items = lines.filter((l) => l.trim());
      return (
        <ul key={pi} className="mb-2 ps-3" style={{ fontSize: 'inherit' }}>
          {items.map((item, ii) => (
            <li key={ii} className="mb-1">{renderInlineFormatting(item.replace(/^[-•*]\s+/, ''))}</li>
          ))}
        </ul>
      );
    }
    // Check if it's a numbered list
    const isNumbered = lines.every((l) => /^\d+[.)]\s/.test(l.trim()) || l.trim() === '');
    if (isNumbered) {
      const items = lines.filter((l) => l.trim());
      return (
        <ol key={pi} className="mb-2 ps-3" style={{ fontSize: 'inherit' }}>
          {items.map((item, ii) => (
            <li key={ii} className="mb-1">{renderInlineFormatting(item.replace(/^\d+[.)]\s+/, ''))}</li>
          ))}
        </ol>
      );
    }
    // Regular paragraph
    return <p key={pi} className="mb-2">{renderInlineFormatting(para.replace(/\n/g, ' '))}</p>;
  });
}

function renderInlineFormatting(text: string): React.ReactNode {
  // Split on bold (**text**) and internal links (→ /path)
  const parts = text.split(/(\*\*[^*]+\*\*|→\s*\/\S+)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    // Internal link: → /admin/tickets
    const linkMatch = part.match(/^→\s*(\/\S+)/);
    if (linkMatch) {
      return (
        <a
          key={i}
          href={linkMatch[1]}
          style={{ color: 'var(--color-primary-light)', fontWeight: 600, textDecoration: 'none', marginLeft: 4 }}
          onClick={(e) => {
            e.preventDefault();
            window.location.href = linkMatch[1];
          }}
        >
          View Tickets →
        </a>
      );
    }
    return part;
  });
}

// ─── Briefing Card (redesigned) ─────────────────────────────────────────────

const SEVERITY_ICONS: Record<string, { icon: string; color: string; bg: string }> = {
  problem: { icon: '!', color: 'var(--color-secondary)', bg: 'rgba(229, 62, 62, 0.08)' },
  analysis: { icon: 'i', color: 'var(--color-primary-light)', bg: 'rgba(43, 108, 176, 0.06)' },
  action: { icon: '\u2713', color: 'var(--color-accent)', bg: 'rgba(56, 161, 105, 0.06)' },
  impact: { icon: '\u2191', color: '#d69e2e', bg: 'rgba(214, 158, 46, 0.06)' },
};

function BriefingCard({ briefing, onDrillDown }: { briefing: ExecutiveBriefing; onDrillDown: (q: string) => void }) {
  // Determine the primary type for the card icon
  const cardType = briefing.problem_detected ? 'problem'
    : briefing.action_taken ? 'action'
    : briefing.expected_impact ? 'impact'
    : 'analysis';
  const style = SEVERITY_ICONS[cardType];

  const primaryText = briefing.problem_detected || briefing.analysis || briefing.action_taken || '';
  const hasDetails = !!(briefing.expected_impact || (briefing.analysis && briefing.problem_detected) || (briefing.action_taken && briefing.analysis));

  return (
    <div
      className="rounded-2 mb-2"
      style={{
        border: `1px solid ${style.color}20`,
        background: style.bg,
        padding: '10px 12px',
      }}
    >
      <div className="d-flex gap-2">
        <div
          className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0"
          style={{
            width: 22,
            height: 22,
            background: style.color,
            color: '#fff',
            fontSize: '0.65rem',
            fontWeight: 700,
            marginTop: 1,
          }}
        >
          {style.icon}
        </div>
        <div className="flex-grow-1" style={{ minWidth: 0 }}>
          {briefing.problem_detected && (
            <div className="fw-semibold mb-1" style={{ color: SEVERITY_ICONS.problem.color, fontSize: '0.8rem' }}>
              {briefing.problem_detected}
            </div>
          )}
          {briefing.analysis && (
            <div className="mb-1" style={{ fontSize: '0.78rem', lineHeight: 1.5, color: 'var(--color-text)' }}>
              {renderFormattedText(briefing.analysis)}
            </div>
          )}
          {briefing.action_taken && !briefing.analysis && (
            <div className="mb-1" style={{ fontSize: '0.78rem', color: 'var(--color-text)' }}>
              {briefing.action_taken}
            </div>
          )}
          {briefing.expected_impact && (
            <div
              className="mt-1 px-2 py-1 rounded-1"
              style={{
                fontSize: '0.74rem',
                background: 'rgba(214, 158, 46, 0.08)',
                border: '1px solid rgba(214, 158, 46, 0.15)',
                color: '#7c6a1e',
              }}
            >
              <strong>Recommendation:</strong> {briefing.expected_impact}
            </div>
          )}
          {/* Confidence + drill-down */}
          <div className="d-flex align-items-center justify-content-between mt-2">
            <div className="d-flex align-items-center gap-2">
              <div style={{ width: 40, height: 3, borderRadius: 2, background: 'var(--color-border)', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${Math.min(briefing.confidence, 100)}%`,
                    height: '100%',
                    borderRadius: 2,
                    background: briefing.confidence >= 70 ? 'var(--color-accent)' : briefing.confidence >= 40 ? '#d69e2e' : 'var(--color-secondary)',
                  }}
                />
              </div>
              <span style={{ fontSize: '0.58rem', color: 'var(--color-text-light)' }}>{formatConfidence(briefing.confidence / 100)}</span>
            </div>
            <div className="d-flex align-items-center gap-1">
              <FeedbackButtons
                contentType="briefing"
                contentKey={`briefing_${(primaryText || '').replace(/\s+/g, '_').toLowerCase().slice(0, 80)}`}
              />
              {hasDetails && (
                <button
                  className="btn btn-sm"
                  style={{
                    fontSize: '0.62rem',
                    padding: '1px 8px',
                    color: 'var(--color-primary-light)',
                    border: '1px solid var(--color-primary-light)',
                    background: 'transparent',
                    borderRadius: 12,
                  }}
                  onClick={() => onDrillDown(`Tell me more about: ${primaryText.slice(0, 80)}`)}
                >
                  Dive deeper
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Action Buttons ─────────────────────────────────────────────────────────

function ActionButtons({ onAction }: { onAction: (q: string) => void }) {
  return (
    <div className="d-flex flex-wrap gap-1 mt-2 mb-1">
      <button
        className="btn btn-sm"
        style={{ fontSize: '0.68rem', padding: '3px 10px', background: 'var(--color-primary)', color: '#fff', borderRadius: 16 }}
        onClick={async () => {
          try {
            const res = await simulateAutonomyCycle();
            const recs = res.data?.recommendations || [];
            onAction(recs.length > 0
              ? `Simulation result: ${recs.length} action(s) recommended. Top action: ${recs[0]?.action || 'none'}`
              : 'Simulation complete: No issues detected.');
          } catch { onAction('Simulation failed — check system status.'); }
        }}
      >
        Simulate Actions
      </button>
      <button
        className="btn btn-sm"
        style={{
          fontSize: '0.68rem',
          padding: '3px 10px',
          background: 'transparent',
          color: 'var(--color-accent)',
          border: '1px solid var(--color-accent)',
          borderRadius: 16,
        }}
        onClick={async () => {
          if (!window.confirm('Run autonomous cycle? Safe actions (risk < 40) will auto-execute.')) return;
          try {
            const res = await runAutonomyCycle();
            const d = res.data;
            const ticketLines = (d.tickets || []).map((t: any) =>
              `• TK-${t.ticket_number}: ${t.title} [${t.priority}] — Est: ${t.estimated_effort || 'N/A'}, Due: ${t.due_date || 'TBD'} → /admin/tickets`
            ).join('\n');
            const summary = `Cycle complete: ${d.problems_detected} problems detected, ${d.decisions_created} decisions (${d.auto_executed} auto-executed, ${d.proposed} proposed for review).`;
            onAction(ticketLines ? `${summary}\n\nTickets created:\n${ticketLines}` : summary);
          } catch { onAction('Cycle execution failed.'); }
        }}
      >
        Execute Cycle
      </button>
    </div>
  );
}

// ─── Narrative Sections (redesigned) ────────────────────────────────────────

function NarrativeDisplay({ sections, onDrillDown }: { sections: NarrativeSections; onDrillDown: (q: string) => void }) {
  return (
    <div>
      {sections.executive_summary && (
        <div className="mb-3">
          <div
            className="px-3 py-2 rounded-2"
            style={{ background: 'rgba(26, 54, 93, 0.04)', border: '1px solid rgba(26, 54, 93, 0.08)' }}
          >
            <div className="fw-semibold mb-1" style={{ color: 'var(--color-primary)', fontSize: '0.82rem' }}>
              Executive Summary
            </div>
            <div style={{ fontSize: '0.8rem', lineHeight: 1.65 }}>{renderFormattedText(sections.executive_summary)}</div>
          </div>
        </div>
      )}

      {sections.key_findings?.length > 0 && (
        <div className="mb-3">
          <div className="fw-semibold mb-2" style={{ color: 'var(--color-primary)', fontSize: '0.8rem' }}>
            Key Findings
          </div>
          {sections.key_findings.map((f, fi) => (
            <div
              key={fi}
              className="d-flex gap-2 mb-2 px-2 py-1 rounded-1"
              style={{ background: fi % 2 === 0 ? 'rgba(43, 108, 176, 0.03)' : 'transparent', fontSize: '0.78rem' }}
            >
              <span className="flex-shrink-0 fw-bold" style={{ color: 'var(--color-primary-light)', fontSize: '0.7rem', marginTop: 2 }}>
                {fi + 1}.
              </span>
              <div style={{ lineHeight: 1.5 }}>{renderInlineFormatting(f)}</div>
            </div>
          ))}
        </div>
      )}

      {sections.risk_assessment && (
        <div className="mb-3">
          <div
            className="px-3 py-2 rounded-2"
            style={{ background: 'rgba(229, 62, 62, 0.04)', border: '1px solid rgba(229, 62, 62, 0.1)' }}
          >
            <div className="fw-semibold mb-1" style={{ color: 'var(--color-secondary)', fontSize: '0.8rem' }}>
              Risk Assessment
            </div>
            <div style={{ fontSize: '0.78rem', lineHeight: 1.5 }}>{renderFormattedText(sections.risk_assessment)}</div>
          </div>
        </div>
      )}

      {sections.recommended_actions?.length > 0 && (
        <div className="mb-3">
          <div className="fw-semibold mb-2" style={{ color: 'var(--color-primary)', fontSize: '0.8rem' }}>
            Recommended Actions
          </div>
          {sections.recommended_actions.map((a, ai) => (
            <div key={ai} className="d-flex align-items-start gap-2 mb-2">
              <div
                className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0"
                style={{
                  width: 20,
                  height: 20,
                  background: 'var(--color-accent)',
                  color: '#fff',
                  fontSize: '0.6rem',
                  fontWeight: 700,
                  marginTop: 2,
                }}
              >
                {ai + 1}
              </div>
              <div className="flex-grow-1" style={{ fontSize: '0.78rem', lineHeight: 1.5 }}>
                {renderInlineFormatting(a)}
              </div>
              <button
                className="btn btn-sm flex-shrink-0"
                style={{
                  fontSize: '0.58rem',
                  padding: '1px 6px',
                  color: 'var(--color-primary-light)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 10,
                  marginTop: 2,
                }}
                onClick={() => onDrillDown(`How should we implement: ${a.slice(0, 60)}?`)}
              >
                How?
              </button>
            </div>
          ))}
          <ActionButtons onAction={(msg) => onDrillDown(msg)} />
        </div>
      )}

      {sections.follow_up_areas?.length > 0 && (
        <div className="mb-2">
          <div className="fw-semibold mb-1" style={{ color: 'var(--color-text-light)', fontSize: '0.72rem' }}>
            Areas to Investigate
          </div>
          <div className="d-flex flex-wrap gap-1">
            {sections.follow_up_areas.map((f, fi) => (
              <button
                key={fi}
                className="btn btn-sm"
                style={{
                  fontSize: '0.68rem',
                  padding: '3px 10px',
                  color: 'var(--color-primary)',
                  background: 'rgba(26, 54, 93, 0.04)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 16,
                }}
                onClick={() => onDrillDown(f)}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Cory Panel ──────────────────────────────────────────────────────────────

export default function CoryPanel({
  onVisualizationsUpdate,
  onSummaryUpdate,
  onInsightsUpdate,
  onNarrativeUpdate,
  externalQuery,
}: CoryPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const { response, loading: queryLoading, query } = useIntelligenceQuery();
  const { scope } = useIntelligenceContext();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastAssistantRef = useRef<HTMLDivElement>(null);
  const [queryCount, setQueryCount] = useState(0);
  const processedExternalRef = useRef<string | null>(null);
  const [coryStatus, setCoryStatus] = useState<'active' | 'thinking' | 'idle'>('active');

  const starterQuestions = useMemo(() => {
    if (scope.level === 'entity' && scope.entity_type === 'department' && scope.entity_name) {
      return [
        `How is ${scope.entity_name} performing?`,
        `What are ${scope.entity_name}'s biggest risks?`,
        `Show me ${scope.entity_name}'s KPIs and trends`,
        `What initiatives need attention in ${scope.entity_name}?`,
        `Compare ${scope.entity_name} to other departments`,
      ];
    }
    return [
      'Give me a business status briefing',
      'How is our lead pipeline performing?',
      'What are our enrollment and revenue trends?',
      'How are our campaigns converting?',
      'What needs my attention right now?',
    ];
  }, [scope]);

  // Scroll to start of latest assistant response (so user reads from the top)
  useEffect(() => {
    if (!loading && messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
      lastAssistantRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading]);

  // Handle assistant pipeline responses
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
        // Pass recent conversation history so Cory maintains context
        const recentHistory = messages.slice(-6).map((m) => ({
          role: m.role,
          content: m.content.substring(0, 300),
        }));

        const coryResult: CoryResponse = await sendCoryCommand(question, {
          entity_type: scope.level !== 'global' ? scope.entity_type : undefined,
          entity_name: scope.entity_name,
          conversation_history: recentHistory.length > 0 ? recentHistory : undefined,
        });

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
            suggestedQuestions: coryResult.suggested_questions,
          };
          setMessages((prev) => [...prev, msg]);
          if (ar.visualizations?.length) onVisualizationsUpdate(ar.visualizations);
          if (ar.data) onSummaryUpdate(ar.data);
          if (ar.insights?.length) onInsightsUpdate(ar.insights);
          if (onNarrativeUpdate && ar.narrative) {
            onNarrativeUpdate({
              narrative: ar.narrative,
              narrative_sections: ar.narrative_sections || ar.narrativeSections,
              sources: ar.sources,
              follow_ups: ar.recommendations,
            });
          }
        } else {
          const msg: ChatMessage = {
            role: 'assistant',
            content: coryResult.message,
            timestamp: new Date(),
            briefings: coryResult.briefings,
            agentsDispatched: coryResult.agents_dispatched,
            actionsTaken: coryResult.actions_taken,
            intent: coryResult.intent,
            suggestedQuestions: coryResult.suggested_questions,
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
    [input, loading, queryLoading, scope, messages, onVisualizationsUpdate, onSummaryUpdate, onInsightsUpdate, onNarrativeUpdate],
  );

  // Handle external queries
  useEffect(() => {
    if (externalQuery && externalQuery !== processedExternalRef.current) {
      processedExternalRef.current = externalQuery;
      const cleanQuery = externalQuery.replace(/\|\d+$/, '');
      handleSend(cleanQuery);
    }
  }, [externalQuery, handleSend]);

  return (
    <div className="d-flex flex-column h-100">
      {/* Status bar — scope badge + status indicator (compact, no avatar since CoryOverlay has the header) */}
      <div className="px-3 py-1 border-bottom d-flex align-items-center gap-2" style={{ flexShrink: 0 }}>
        {scope.level === 'entity' && scope.entity_name && (
          <span className="badge" style={{ fontSize: '0.52rem', background: 'var(--color-primary-light)', color: '#fff' }}>
            {scope.entity_name}
          </span>
        )}
        <span
          className="d-inline-block rounded-circle"
          style={{
            width: 7,
            height: 7,
            background: coryStatus === 'thinking' ? '#d69e2e' : 'var(--color-accent)',
            animation: coryStatus === 'thinking' ? 'pulse 1s ease infinite' : 'none',
          }}
          title={coryStatus}
        />
        {queryCount > 0 && (
          <span className="badge bg-light text-muted border" style={{ fontSize: '0.5rem' }}>{queryCount} queries</span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-grow-1 px-3 py-2" style={{ overflowY: 'auto' }}>
        {/* Empty state */}
        {messages.length === 0 && !loading && (
          <div className="text-center mt-4">
            <img
              src="/cory-avatar.jpg"
              alt="Cory"
              style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '3px solid rgba(26, 54, 93, 0.1)' }}
              className="mb-3"
            />
            <h6 className="fw-semibold" style={{ color: 'var(--color-primary)', fontSize: '0.88rem' }}>
              Cory &mdash; AI Chief Operating Officer
            </h6>
            <p className="text-muted mb-3" style={{ fontSize: '0.74rem', lineHeight: 1.5 }}>
              {scope.level === 'entity' && scope.entity_name ? (
                <>Focused on <strong>{scope.entity_name}</strong>. I&apos;ll analyze KPIs, growth metrics, risks, and recommend actions.</>
              ) : (
                <>I track your business metrics — pipeline, enrollments, campaigns, and revenue. Ask me anything about how the business is performing.</>
              )}
            </p>
            <div className="d-flex flex-column gap-2">
              {starterQuestions.map((q, i) => (
                <button
                  key={i}
                  className="btn btn-sm text-start d-flex align-items-center gap-2 w-100"
                  style={{
                    fontSize: '0.74rem',
                    padding: '8px 12px',
                    color: 'var(--color-text)',
                    background: 'rgba(26, 54, 93, 0.03)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 10,
                  }}
                  onClick={() => handleSend(q)}
                >
                  <span style={{ color: 'var(--color-primary)', fontWeight: 700, flexShrink: 0, fontSize: '0.6rem' }}>&#9654;</span>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message list */}
        {messages.map((msg, i) => (
          <div
            key={i}
            ref={msg.role === 'assistant' && i === messages.length - 1 ? lastAssistantRef : undefined}
            className={`mb-4 ${msg.role === 'user' ? 'text-end' : ''}`}
          >
            {msg.role === 'user' ? (
              <div
                className="d-inline-block px-3 py-2 rounded-3 text-white"
                style={{
                  maxWidth: '90%',
                  background: 'var(--color-primary)',
                  textAlign: 'left',
                  fontSize: '0.8rem',
                  lineHeight: 1.5,
                  borderRadius: '16px 16px 4px 16px',
                }}
              >
                {msg.content}
              </div>
            ) : (
              <div style={{ fontSize: '0.8rem', lineHeight: 1.6, color: 'var(--color-text)' }}>
                {/* Agent badges */}
                {msg.agentsDispatched && msg.agentsDispatched.length > 0 && (
                  <div className="mb-2 d-flex flex-wrap gap-1">
                    {msg.agentsDispatched.map((a, ai) => (
                      <span
                        key={ai}
                        className="badge"
                        style={{
                          fontSize: '0.52rem',
                          background: 'rgba(26, 54, 93, 0.06)',
                          color: 'var(--color-primary-light)',
                          border: '1px solid rgba(26, 54, 93, 0.12)',
                        }}
                      >
                        {getAgentDisplayName(a)}
                      </span>
                    ))}
                  </div>
                )}

                {/* Briefing cards */}
                {msg.briefings && msg.briefings.length > 0 && (
                  <div className="mb-2">
                    {msg.briefings.map((b, bi) => (
                      <BriefingCard key={bi} briefing={b} onDrillDown={handleSend} />
                    ))}
                  </div>
                )}

                {/* Structured narrative sections */}
                {msg.narrativeSections ? (
                  <NarrativeDisplay sections={msg.narrativeSections} onDrillDown={handleSend} />
                ) : !msg.briefings?.length ? (
                  <div style={{ lineHeight: 1.65 }}>{renderFormattedText(msg.content)}</div>
                ) : null}

                {/* Plain message with briefings */}
                {msg.briefings?.length && msg.content && !msg.narrativeSections ? (
                  <div
                    className="mt-2 px-3 py-2 rounded-2"
                    style={{ background: 'rgba(26, 54, 93, 0.03)', border: '1px solid rgba(26, 54, 93, 0.06)', lineHeight: 1.65 }}
                  >
                    {renderFormattedText(msg.content)}
                  </div>
                ) : null}

                {/* Insights */}
                {msg.insights && msg.insights.length > 0 && (
                  <div className="mt-2">
                    {msg.insights.slice(0, 3).map((ins, ii) => (
                      <div
                        key={ii}
                        className="d-flex align-items-start gap-2 mb-1 px-2 py-1 rounded-1"
                        style={{
                          fontSize: '0.72rem',
                          background: ins.severity === 'high' ? 'rgba(229, 62, 62, 0.04)' : 'rgba(43, 108, 176, 0.03)',
                          border: `1px solid ${ins.severity === 'high' ? 'rgba(229, 62, 62, 0.1)' : 'rgba(43, 108, 176, 0.06)'}`,
                        }}
                      >
                        <span style={{ color: ins.severity === 'high' ? 'var(--color-secondary)' : 'var(--color-primary-light)', flexShrink: 0 }}>
                          {ins.severity === 'high' ? '\u26A0' : '\u2139'}
                        </span>
                        <span>{ins.message}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Sources */}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-2">
                    <span style={{ fontSize: '0.55rem', color: 'var(--color-text-light)' }}>Sources: </span>
                    {msg.sources.map((src, si) => (
                      <span key={si} className="badge me-1" style={{ fontSize: '0.5rem', background: 'var(--color-bg-alt)', color: 'var(--color-text-light)', border: '1px solid var(--color-border)' }}>
                        {src}
                      </span>
                    ))}
                  </div>
                )}

                {/* Pipeline debug */}
                {msg.pipelineSteps && msg.pipelineSteps.length > 0 && (
                  <details className="mt-2">
                    <summary className="text-muted" style={{ fontSize: '0.58rem', cursor: 'pointer' }}>
                      Pipeline: {msg.pipelineSteps.filter((s) => s.status === 'completed').length}/{msg.pipelineSteps.length} steps
                      {msg.confidence != null && ` \u2022 ${(msg.confidence * 100).toFixed(0)}%`}
                      {' \u2022 '}{msg.pipelineSteps.reduce((sum, s) => sum + s.duration_ms, 0)}ms
                    </summary>
                    <div className="mt-1 ps-2 border-start" style={{ borderColor: 'var(--color-border)' }}>
                      {msg.pipelineSteps.map((ps) => (
                        <div
                          key={ps.step}
                          className="d-flex align-items-center gap-1"
                          style={{ fontSize: '0.55rem', color: ps.status === 'completed' ? 'var(--color-text)' : 'var(--color-text-light)' }}
                        >
                          <span style={{ color: ps.status === 'completed' ? 'var(--color-accent)' : ps.status === 'skipped' ? 'var(--color-text-light)' : 'var(--color-secondary)' }}>
                            {ps.status === 'completed' ? '\u2713' : ps.status === 'skipped' ? '\u2013' : '\u2717'}
                          </span>
                          <span>{ps.name}</span>
                          <span className="text-muted ms-auto">{ps.duration_ms}ms</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}

            {/* Message feedback */}
            {msg.role === 'assistant' && (
              <div className="mt-2">
                <FeedbackButtons
                  contentType="briefing"
                  contentKey={`cory_msg_${i}_${msg.timestamp.getTime()}`}
                  size="sm"
                />
              </div>
            )}

            {/* Suggested questions — last assistant message only */}
            {msg.role === 'assistant' && i === messages.length - 1 && msg.suggestedQuestions && msg.suggestedQuestions.length > 0 && !loading && (
              <div className="mt-3 d-flex flex-column gap-1">
                {msg.suggestedQuestions.slice(0, 2).map((q, qi) => (
                  <button
                    key={qi}
                    className="btn btn-sm text-start w-100 d-flex align-items-center gap-2"
                    style={{
                      fontSize: '0.72rem',
                      padding: '7px 12px',
                      background: 'rgba(26, 54, 93, 0.03)',
                      color: 'var(--color-text)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 10,
                    }}
                    onClick={() => handleSend(q)}
                  >
                    <span style={{ color: 'var(--color-primary)', fontWeight: 700, flexShrink: 0, fontSize: '0.6rem' }}>&#9654;</span>
                    {q}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-1">
              <small className="text-muted" style={{ fontSize: '0.52rem' }}>{msg.timestamp.toLocaleTimeString()}</small>
            </div>
          </div>
        ))}

        {/* Loading */}
        {loading && (
          <div className="mb-3 d-flex align-items-center gap-2" style={{ fontSize: '0.78rem', color: 'var(--color-text-light)' }}>
            <div className="spinner-border spinner-border-sm" role="status" style={{ width: 14, height: 14 }}>
              <span className="visually-hidden">Cory is thinking...</span>
            </div>
            <span>Cory is analyzing...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-2 border-top" style={{ flexShrink: 0, background: 'var(--color-bg-alt)' }}>
        <div className="d-flex gap-2">
          <input
            type="text"
            className="form-control form-control-sm"
            placeholder="Ask Cory anything..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            disabled={loading || queryLoading}
            style={{ fontSize: '0.8rem', borderRadius: 20, padding: '6px 14px' }}
          />
          <button
            className="btn btn-primary btn-sm"
            onClick={() => handleSend()}
            disabled={loading || queryLoading || !input.trim()}
            style={{ fontSize: '0.78rem', borderRadius: 20, padding: '6px 16px' }}
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
