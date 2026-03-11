import { useState, useCallback, useRef, useEffect } from 'react';
import { chatWithDeptHead, evaluateIdea, type IdeaEvaluation } from '../../../services/intelligenceApi';

interface Props {
  departmentSlug: string;
  departmentName: string;
  departmentColor: string;
  headName: string;
  headTitle: string;
  onClose: () => void;
}

interface ChatMsg {
  role: 'user' | 'head';
  content: string;
  evaluation?: IdeaEvaluation;
}

export default function DeptHeadChat({ departmentSlug, departmentName, departmentColor, headName, headTitle, onClose }: Props) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = useCallback(async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || loading) return;

    setInput('');
    const userMsg: ChatMsg = { role: 'user', content: msg };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const { data } = await chatWithDeptHead(departmentSlug, msg, history);
      setMessages((prev) => [...prev, { role: 'head', content: data.response }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'head', content: 'I apologize, I encountered an issue. Please try again.' }]);
    }
    setLoading(false);
  }, [input, loading, messages, departmentSlug]);

  const handleEvaluateIdea = useCallback(async () => {
    const idea = input.trim();
    if (!idea || evaluating) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: `[IDEA PROPOSAL] ${idea}` }]);
    setEvaluating(true);
    setLoading(true);

    try {
      const { data: evaluation } = await evaluateIdea(departmentSlug, idea);
      const summaryMsg = buildEvaluationSummary(evaluation);
      setMessages((prev) => [...prev, { role: 'head', content: summaryMsg, evaluation }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'head', content: 'I was unable to complete the evaluation. Please try again.' }]);
    }
    setEvaluating(false);
    setLoading(false);
  }, [input, evaluating, departmentSlug]);

  const initials = headName.split(' ').map((n) => n[0]).join('').slice(0, 2);

  return (
    <div className="d-flex flex-column h-100">
      {/* Header */}
      <div
        className="d-flex align-items-center gap-2 px-3 py-2"
        style={{ background: departmentColor, color: '#fff', flexShrink: 0 }}
      >
        <div
          className="rounded-circle d-flex align-items-center justify-content-center fw-bold"
          style={{ width: 28, height: 28, background: 'rgba(255,255,255,0.2)', fontSize: '0.7rem' }}
        >
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="fw-semibold" style={{ fontSize: '0.8rem' }}>{headName}</div>
          <div style={{ fontSize: '0.6rem', opacity: 0.8 }}>{headTitle} · {departmentName}</div>
        </div>
        <button
          className="btn btn-sm px-2 py-0"
          style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.65rem', border: '1px solid rgba(255,255,255,0.3)' }}
          onClick={onClose}
        >
          Back
        </button>
      </div>

      {/* Messages */}
      <div className="flex-grow-1 p-2" style={{ overflowY: 'auto', minHeight: 0 }}>
        {messages.length === 0 && !loading && (
          <div className="text-center py-3">
            <div
              className="mx-auto mb-2 rounded-circle d-flex align-items-center justify-content-center fw-bold text-white"
              style={{ width: 40, height: 40, background: departmentColor, fontSize: '0.85rem' }}
            >
              {initials}
            </div>
            <div className="fw-semibold small" style={{ color: departmentColor }}>{headName}</div>
            <small className="text-muted d-block mb-2" style={{ fontSize: '0.68rem' }}>
              {headTitle} · Ask me anything about {departmentName}
            </small>
            <div className="d-flex flex-column gap-1">
              {[
                `What are ${departmentName}'s top priorities?`,
                `How is the team performing?`,
                `What risks should I know about?`,
              ].map((q, i) => (
                <button
                  key={i}
                  className="btn btn-sm btn-outline-secondary text-start"
                  style={{ fontSize: '0.68rem' }}
                  onClick={() => handleSend(q)}
                >
                  <span style={{ color: departmentColor, fontWeight: 600 }}>&#9654; </span>{q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`mb-2 ${msg.role === 'user' ? 'text-end' : ''}`}>
            {msg.role === 'user' ? (
              <div
                className="d-inline-block px-2 py-1 rounded-3 text-white"
                style={{ maxWidth: '90%', background: 'var(--color-primary)', textAlign: 'left', fontSize: '0.73rem', lineHeight: 1.5 }}
              >
                {msg.content}
              </div>
            ) : (
              <div style={{ fontSize: '0.73rem', lineHeight: 1.5 }}>
                {/* Evaluation card */}
                {msg.evaluation ? (
                  <EvaluationCard evaluation={msg.evaluation} color={departmentColor} />
                ) : (
                  <div style={{ whiteSpace: 'pre-line' }}>{msg.content}</div>
                )}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="d-flex align-items-center gap-2 mb-2" style={{ fontSize: '0.72rem', color: 'var(--color-text-light)' }}>
            <div className="spinner-border spinner-border-sm" role="status" style={{ width: 12, height: 12 }}>
              <span className="visually-hidden">{evaluating ? 'Researching...' : 'Thinking...'}</span>
            </div>
            {evaluating ? 'Researching feasibility...' : `${headName.split(' ')[0]} is thinking...`}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-2 border-top" style={{ flexShrink: 0 }}>
        <div className="d-flex gap-1 mb-1">
          <button
            className="btn btn-sm flex-grow-1"
            style={{
              fontSize: '0.62rem',
              background: departmentColor,
              color: '#fff',
              opacity: !input.trim() || loading ? 0.5 : 1,
            }}
            onClick={handleEvaluateIdea}
            disabled={!input.trim() || loading}
            title="Submit as a formal idea proposal for research and evaluation"
          >
            Propose Idea
          </button>
        </div>
        <div className="input-group input-group-sm">
          <input
            type="text"
            className="form-control form-control-sm"
            placeholder={`Ask ${headName.split(' ')[0]} anything...`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            disabled={loading}
            style={{ fontSize: '0.73rem' }}
          />
          <button
            className="btn btn-primary btn-sm"
            onClick={() => handleSend()}
            disabled={loading || !input.trim()}
            style={{ fontSize: '0.73rem' }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Evaluation Report Card ────────────────────────────────────────────────

function EvaluationCard({ evaluation, color }: { evaluation: IdeaEvaluation; color: string }) {
  const [showFull, setShowFull] = useState(false);
  const isAutoImpl = evaluation.recommendation === 'auto_implement';
  const isNotRec = evaluation.recommendation === 'not_recommended';

  return (
    <div className="rounded-2 border" style={{ background: 'var(--color-bg-alt)' }}>
      {/* Header */}
      <div className="px-2 py-1 d-flex align-items-center justify-content-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <span className="fw-semibold" style={{ fontSize: '0.72rem', color }}>Idea Evaluation Report</span>
        <span
          className={`badge bg-${isAutoImpl ? 'success' : isNotRec ? 'danger' : 'warning'}`}
          style={{ fontSize: '0.55rem' }}
        >
          {isAutoImpl ? 'Auto-Implementing' : isNotRec ? 'Not Recommended' : 'Needs Your Approval'}
        </span>
      </div>

      {/* Scores */}
      <div className="px-2 py-1 d-flex gap-2 border-bottom">
        <div className="text-center flex-grow-1">
          <div className="fw-bold" style={{ fontSize: '1rem', color: evaluation.feasibility_score >= 70 ? 'var(--color-accent)' : evaluation.feasibility_score >= 40 ? '#d69e2e' : 'var(--color-secondary)' }}>
            {evaluation.feasibility_score}
          </div>
          <div className="text-muted" style={{ fontSize: '0.55rem' }}>Feasibility</div>
        </div>
        <div className="text-center flex-grow-1">
          <div className="fw-bold" style={{ fontSize: '1rem', color: evaluation.confidence >= 75 ? 'var(--color-accent)' : evaluation.confidence >= 50 ? '#d69e2e' : 'var(--color-secondary)' }}>
            {evaluation.confidence}%
          </div>
          <div className="text-muted" style={{ fontSize: '0.55rem' }}>Confidence</div>
        </div>
        <div className="text-center flex-grow-1">
          <div className="fw-bold" style={{ fontSize: '0.75rem', color }}>{evaluation.estimated_timeline}</div>
          <div className="text-muted" style={{ fontSize: '0.55rem' }}>Timeline</div>
        </div>
      </div>

      {/* Summary */}
      <div className="px-2 py-1" style={{ fontSize: '0.7rem' }}>
        <div className="fw-semibold mb-1" style={{ color }}>Impact</div>
        <div className="text-muted mb-1">{evaluation.estimated_impact}</div>

        <div className="fw-semibold mb-1" style={{ color }}>Risk</div>
        <div className="text-muted mb-1">{evaluation.risk_assessment}</div>

        {isAutoImpl && (
          <div className="rounded-2 p-1 mb-1" style={{ background: 'rgba(56, 161, 105, 0.1)', border: '1px solid var(--color-accent)' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--color-accent)' }}>
              High confidence ({evaluation.confidence}%). Implementing directly and reporting to COO.
            </div>
          </div>
        )}

        {!isAutoImpl && !isNotRec && (
          <div className="rounded-2 p-1 mb-1" style={{ background: 'rgba(214, 158, 46, 0.1)', border: '1px solid #d69e2e' }}>
            <div style={{ fontSize: '0.65rem', color: '#d69e2e' }}>
              Confidence below threshold ({evaluation.confidence}%). Awaiting your approval before proceeding.
            </div>
          </div>
        )}
      </div>

      {/* Expand/collapse full report */}
      <div className="px-2 pb-1">
        <button
          className="btn btn-sm w-100 text-start"
          style={{ fontSize: '0.62rem', color: 'var(--color-primary-light)' }}
          onClick={() => setShowFull(!showFull)}
        >
          {showFull ? '▾ Hide' : '▸ Show'} full research + COO report
        </button>
        {showFull && (
          <div style={{ fontSize: '0.68rem' }}>
            <div className="fw-semibold mt-1 mb-1" style={{ color }}>Research Summary</div>
            <div className="text-muted mb-2" style={{ whiteSpace: 'pre-line' }}>{evaluation.research_summary}</div>

            {evaluation.implementation_plan.length > 0 && (
              <>
                <div className="fw-semibold mb-1" style={{ color }}>Implementation Plan</div>
                <ol className="mb-2 ps-3" style={{ fontSize: '0.65rem' }}>
                  {evaluation.implementation_plan.map((step, i) => (
                    <li key={i} className="text-muted mb-1">{step}</li>
                  ))}
                </ol>
              </>
            )}

            <div className="fw-semibold mb-1" style={{ color }}>COO Report</div>
            <div
              className="rounded-2 p-2 mb-1"
              style={{ background: '#fff', border: '1px solid var(--color-border)', fontSize: '0.65rem', whiteSpace: 'pre-line' }}
            >
              {evaluation.coo_report}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function buildEvaluationSummary(ev: IdeaEvaluation): string {
  const recText = ev.recommendation === 'auto_implement'
    ? `Confidence is ${ev.confidence}% — above threshold. I'm proceeding with implementation and will report to Cory (COO).`
    : ev.recommendation === 'not_recommended'
    ? `I don't recommend this. Feasibility is only ${ev.feasibility_score}/100.`
    : `Confidence is ${ev.confidence}% — below the auto-implement threshold. I need your approval before proceeding.`;

  return `I've completed my evaluation of your idea.\n\nFeasibility: ${ev.feasibility_score}/100 | Confidence: ${ev.confidence}% | Timeline: ${ev.estimated_timeline}\n\n${recText}`;
}
