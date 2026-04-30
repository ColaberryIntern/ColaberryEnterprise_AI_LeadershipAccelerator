/**
 * CoryFullscreen — Full-screen AI Architect Chat
 *
 * Two modes:
 * - Learn Mode (?mode=learn&componentId=xxx&stepName=yyy) — contextual BP explanation
 * - Build Mode (?mode=build) — describe and create new functionality
 *
 * Uses existing ArchitectChat backend (/architect/start + /turn)
 * Sessions persist in ArchitectSession table
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import portalApi from '../../utils/portalApi';

interface Message {
  role: 'user' | 'cory';
  text: string;
  buttons?: Array<{ label: string; prompt: string }>;
  timestamp: number;
}

// Hardcoded explanation rendered when the user clicks "Learn About This"
// on the synthetic Project Kickoff task. The kickoff isn't a real BP, so
// the normal architect/learn endpoint has nothing meaningful to say
// about it — and would default to muttering about unmatched requirements.
const KICKOFF_LEARN_TEXT = `## What "Project Kickoff" actually is

This is your **first action** on a brand-new project — a one-time pass that builds **the entire foundation in a single session**, end to end. Not just a skeleton. The goal is to come out of the kickoff with every load-bearing layer in place, so the per-component flow afterwards is about depth and polish, not scaffolding.

It is **not** a regular task. It only ever appears once: the moment you sync the kickoff report, the kickoff disappears and the per-component task list takes over.

## What happens when you click "Generate Build Prompt"

A Claude Code prompt is copied to your clipboard. When you paste it into Claude Code, it runs four steps:

1. **Plan mode — verify foundation files.** Claude confirms \`CLAUDE.md\` and your \`*Build_Guide*.md\` exist at the repo root and reads them end to end. CLAUDE.md is your operating contract. The build guide is the spec.
2. **Plan mode — propose all foundation phases.** A complete sprint plan covering the *whole foundation*: 3–6 phases ordered by dependency (data → backend → UI → integrations → polish). Each phase lists files, tests, and any governance boundaries it would cross. You confirm the plan once.
3. **Execute every phase end to end.** Claude executes phase 1, then phase 2, then phase 3, all the way through. It may briefly tell you what just shipped and that the next phase is starting, but it does **not** wait for your confirmation between phases. It only stops for genuine blockers — a governance boundary that needs your decision, a credential it can't fabricate, or a failing test it cannot resolve. Otherwise it keeps moving.
4. **One consolidated report at the end.** Once every phase is either complete or explicitly marked deferred, Claude returns a single report covering the whole build. You paste that back into the portal **once** — not after each phase.

## Why we do it this way

A fresh project has no foundation. Asking you to "Improve UI for Value Proposition" before there's a frontend, or "Build Backend Services for Customer Acquisition" before there's a database — that's busywork. You'd open Claude Code 29 times to build 29 BPs from scratch instead of running it once for the whole thing.

The kickoff buys you the entire foundation in one session. The per-component flow that takes over afterwards is for sharpening, not scaffolding.

## You can interrupt — but the default is "keep going"

Between phases, Claude will tell you the next phase is starting. If something is off, you can interrupt and redirect. If you don't, Claude proceeds automatically. The user-clicks-to-proceed model would turn this into 5 separate sessions; the goal is one session that delivers everything.

## What unlocks after the kickoff syncs

The full per-component recommendation flow:

- **Build** tasks for capabilities still missing layers
- **Health** tasks for things the build guide says should exist but the code doesn't show
- **Improve** tasks for capabilities at low maturity
- **UI** tasks routed through the UI Advisor for layout / usability / mobile responsiveness

Each one targets exactly one business process at a time, with its own focused Claude Code prompt.

## What you should do right now

Close this and click **Generate Build Prompt** on the kickoff task. Run it in Claude Code. Let it work through every phase. When it hands you the final report, paste that back into the portal. That's the entire first-day flow.`;

export default function CoryFullscreen() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const mode = searchParams.get('mode') || 'build';
  const componentId = searchParams.get('componentId');
  const stepName = searchParams.get('stepName') || '';

  // Close goes back to wherever the user was. window.history is the
  // most accurate signal — if there's something to go back to, use it;
  // otherwise fall back to the Blueprint.
  const handleClose = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/portal/project/blueprint');
  };

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, []);

  // Initialize session and auto-send first message
  useEffect(() => {
    if (initialized) return;
    setInitialized(true);

    const init = async () => {
      // Special case: the synthetic kickoff "component" doesn't exist
      // in the DB. Skip the API entirely and render a kickoff-specific
      // explanation. Without this, Cory's learn endpoint would 404 (or
      // worse, find nothing and ramble about unmatched requirements).
      if (mode === 'learn' && componentId === '__project_kickoff__') {
        setMessages([{
          role: 'cory',
          text: KICKOFF_LEARN_TEXT,
          buttons: [
            { label: 'Generate the kickoff prompt', prompt: '__navigate__/portal/project/blueprint' },
            { label: 'What happens after Wave 1?', prompt: 'After I run the kickoff prompt and paste my report back, what does the system look like and what tasks come next? Walk me through the post-kickoff flow.' },
            { label: 'Why not just build one BP at a time from the start?', prompt: 'Why does the kickoff scaffold the whole project in one wave instead of letting me build one business process at a time from day one? What problem is this solving?' },
          ],
          timestamp: Date.now(),
        }]);
        return;
      }
      try {
        // Start a new ArchitectChat session
        const startRes = await portalApi.post('/api/portal/project/architect/start');
        const sid = startRes.data.session_id;
        setSessionId(sid);

        if (mode === 'learn' && componentId) {
          // Learn Mode: fetch BP context and send learn prompt
          setSending(true);
          setMessages([{ role: 'cory', text: 'Let me look into this for you...', timestamp: Date.now() }]);

          try {
            const learnRes = await portalApi.post('/api/portal/project/architect/learn', { componentId, stepName });
            const response = learnRes.data.response || learnRes.data.message || 'I can help you understand this component.';
            const buttons = generateContinuationButtons(stepName, 'learn');
            setMessages([{ role: 'cory', text: response, buttons, timestamp: Date.now() }]);
            setSessionId(learnRes.data.session_id || sid);
          } catch {
            // Fallback: send as a regular turn
            const context = `[LEARN MODE] Explain what "${stepName}" means. Help me understand what this business process does, why it matters, what happens if skipped, how it connects to the system, and what comes next. Keep it structured and practical.`;
            const turnRes = await portalApi.post('/api/portal/project/architect/turn', { session_id: sid, input: context });
            const reply = turnRes.data.message || turnRes.data.response || 'Let me explain this component.';
            const buttons = generateContinuationButtons(stepName, 'learn');
            setMessages([{ role: 'cory', text: reply, buttons, timestamp: Date.now() }]);
          }
          setSending(false);
        } else {
          // Build Mode: show welcome
          setMessages([{
            role: 'cory',
            text: 'Hey! I\'m Cory, your AI System Architect.\n\nI can help you design and build new functionality for your system. Just describe what you need — a new feature, a dashboard, an automation, an API — and I\'ll help you plan it out.\n\nWhat would you like to build?',
            timestamp: Date.now(),
          }]);
        }
      } catch (err) {
        setMessages([{ role: 'cory', text: 'Having trouble connecting. Please try refreshing the page.', timestamp: Date.now() }]);
      }
    };

    init();
  }, [initialized, mode, componentId, stepName]);

  // Send a message
  const handleSend = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || sending) return;

    setMessages(prev => [...prev, { role: 'user', text: msg, timestamp: Date.now() }]);
    setInput('');
    setSending(true);
    scrollToBottom();

    try {
      let sid = sessionId;
      if (!sid) {
        const startRes = await portalApi.post('/api/portal/project/architect/start');
        sid = startRes.data.session_id;
        setSessionId(sid);
      }

      const res = await portalApi.post('/api/portal/project/architect/turn', { session_id: sid, input: msg });
      const reply = res.data.message || res.data.response || 'I\'m processing that. Let me think...';
      const phase = res.data.phase || 'active';

      // Generate continuation buttons based on the response
      const buttons = generateContinuationButtons(msg, phase === 'complete' ? 'complete' : mode);

      setMessages(prev => [...prev, { role: 'cory', text: reply, buttons, timestamp: Date.now() }]);

      // If BP was created, show success
      if (res.data.created_bp) {
        setMessages(prev => [...prev, {
          role: 'cory',
          text: `I\'ve created a new business process: **${res.data.created_bp.name}**\n\nYou can now find it in your System Map. Click below to view it.`,
          buttons: [
            { label: 'View in System', prompt: '__navigate__/portal/project/system-v2' },
            { label: 'Build It Now', prompt: `__navigate__/portal/project/system-v2?componentId=${res.data.created_bp.id}&tab=build` },
          ],
          timestamp: Date.now(),
        }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: 'cory', text: 'Sorry, I had trouble processing that. Please try again.', timestamp: Date.now() }]);
    } finally {
      setSending(false);
      scrollToBottom();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Escape closes Cory regardless of focus location. Inline the
  // navigation so the effect's dep list stays stable (production
  // eslint config doesn't ship react-hooks/exhaustive-deps and a
  // disable comment would break the build).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (window.history.length > 1) navigate(-1);
      else navigate('/portal/project/blueprint');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  const handleButtonClick = (button: { label: string; prompt: string }) => {
    if (button.prompt.startsWith('__navigate__')) {
      window.location.href = button.prompt.replace('__navigate__', '');
      return;
    }
    handleSend(button.prompt);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)', background: '#fafbfc' }}>
      {/* Header */}
      <div className="d-flex align-items-center justify-content-between px-4 py-2" style={{ borderBottom: '1px solid var(--color-border)', background: '#fff' }}>
        <div className="d-flex align-items-center gap-2">
          <i className="bi bi-robot" style={{ color: '#3b82f6', fontSize: 20 }}></i>
          <div>
            <h6 className="fw-bold mb-0" style={{ fontSize: 14, color: 'var(--color-primary)' }}>
              Cory — AI System Architect
            </h6>
            <span className="text-muted" style={{ fontSize: 10 }}>
              {mode === 'learn' ? `Learning: ${stepName}` : 'Build Mode'}
            </span>
          </div>
        </div>
        <div className="d-flex gap-2 align-items-center">
          <Link to="/portal/project/blueprint" className="btn btn-sm btn-outline-secondary" style={{ fontSize: 10 }}>
            <i className="bi bi-arrow-left me-1"></i>Blueprint
          </Link>
          <Link to="/portal/project/system-v2" className="btn btn-sm btn-outline-secondary" style={{ fontSize: 10 }}>
            <i className="bi bi-grid me-1"></i>System View
          </Link>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            style={{ fontSize: 10 }}
            onClick={handleClose}
            title="Close Cory (Esc)"
            aria-label="Close Cory"
          >
            <i className="bi bi-x-lg me-1"></i>Close
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-grow-1 overflow-auto px-4 py-3" style={{ maxWidth: 800, margin: '0 auto', width: '100%' }}>
        {messages.map((msg, i) => (
          <div key={i} className={`d-flex ${msg.role === 'user' ? 'justify-content-end' : 'justify-content-start'} mb-3`}>
            <div style={{
              maxWidth: '85%',
              padding: '14px 18px',
              borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
              background: msg.role === 'user' ? 'var(--color-primary)' : '#fff',
              color: msg.role === 'user' ? '#fff' : 'var(--color-text)',
              fontSize: msg.role === 'cory' ? 15 : 14,
              lineHeight: 1.65,
              boxShadow: msg.role === 'cory' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              border: msg.role === 'cory' ? '1px solid var(--color-border)' : 'none',
            }}>
              {msg.role === 'cory' && (
                <div className="d-flex align-items-center gap-1 mb-2">
                  <i className="bi bi-robot" style={{ fontSize: 12, color: '#3b82f6' }}></i>
                  <span style={{ fontSize: 11, color: '#3b82f6', fontWeight: 600 }}>Cory</span>
                </div>
              )}
              {msg.role === 'cory' ? (
                <div className="cory-md">
                  <ReactMarkdown
                    components={{
                      h1: ({ children }) => <h4 style={{ fontSize: 19, fontWeight: 700, color: 'var(--color-primary)', marginTop: 8, marginBottom: 10 }}>{children}</h4>,
                      h2: ({ children }) => <h5 style={{ fontSize: 17, fontWeight: 700, color: 'var(--color-primary)', marginTop: 14, marginBottom: 8 }}>{children}</h5>,
                      h3: ({ children }) => <h6 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-primary)', marginTop: 12, marginBottom: 6 }}>{children}</h6>,
                      p: ({ children }) => <p style={{ fontSize: 15, lineHeight: 1.65, marginBottom: 10 }}>{children}</p>,
                      strong: ({ children }) => <strong style={{ fontWeight: 700, color: 'var(--color-text)' }}>{children}</strong>,
                      em: ({ children }) => <em style={{ fontStyle: 'italic' }}>{children}</em>,
                      ul: ({ children }) => <ul style={{ fontSize: 15, lineHeight: 1.65, paddingLeft: 22, marginBottom: 10 }}>{children}</ul>,
                      ol: ({ children }) => <ol style={{ fontSize: 15, lineHeight: 1.65, paddingLeft: 22, marginBottom: 10 }}>{children}</ol>,
                      li: ({ children }) => <li style={{ marginBottom: 4 }}>{children}</li>,
                      code: ({ children }) => <code style={{ background: '#f1f5f9', padding: '1px 6px', borderRadius: 4, fontSize: 13, fontFamily: 'monospace' }}>{children}</code>,
                      blockquote: ({ children }) => <blockquote style={{ borderLeft: '3px solid #cbd5e1', paddingLeft: 12, marginLeft: 0, color: '#475569', fontStyle: 'italic' }}>{children}</blockquote>,
                      a: ({ href, children }) => <a href={href} style={{ color: 'var(--color-primary-light)', textDecoration: 'underline' }} target="_blank" rel="noopener noreferrer">{children}</a>,
                    }}
                  >
                    {msg.text}
                  </ReactMarkdown>
                </div>
              ) : (
                <span style={{ whiteSpace: 'pre-line' }}>{msg.text}</span>
              )}

              {/* Continuation buttons */}
              {msg.buttons && msg.buttons.length > 0 && (
                <div className="d-flex flex-column gap-2 mt-3 pt-3" style={{ borderTop: '1px solid #e2e8f0' }}>
                  {msg.buttons.map((btn, bi) => (
                    <button
                      key={bi}
                      className="btn btn-sm text-start"
                      style={{
                        background: '#f0f4ff',
                        border: '1px solid #bfdbfe',
                        borderRadius: 8,
                        color: 'var(--color-primary)',
                        fontSize: 12,
                        padding: '8px 12px',
                        fontWeight: 500,
                      }}
                      onClick={() => handleButtonClick(btn)}
                      disabled={sending}
                    >
                      <i className="bi bi-arrow-right-circle me-2" style={{ fontSize: 11 }}></i>
                      {btn.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {sending && (
          <div className="d-flex justify-content-start mb-3">
            <div style={{ padding: '12px 16px', borderRadius: '16px 16px 16px 4px', background: '#fff', border: '1px solid var(--color-border)', fontSize: 13 }}>
              <span className="spinner-border spinner-border-sm me-2" style={{ width: 12, height: 12 }}></span>
              <span className="text-muted">Cory is thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef}></div>
      </div>

      {/* Input bar */}
      <div className="px-4 py-3" style={{ borderTop: '1px solid var(--color-border)', background: '#fff' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <div className="d-flex gap-2">
            <textarea
              ref={inputRef}
              className="form-control"
              rows={1}
              placeholder={mode === 'learn' ? 'Ask a follow-up question...' : 'Describe what you want to build...'}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending}
              style={{
                fontSize: 13,
                borderRadius: 12,
                resize: 'none',
                borderColor: '#e2e8f0',
                padding: '10px 14px',
              }}
            />
            <button
              className="btn btn-primary"
              style={{ borderRadius: 12, padding: '0 16px', fontSize: 14 }}
              disabled={!input.trim() || sending}
              onClick={() => handleSend()}
            >
              {sending ? <span className="spinner-border spinner-border-sm" style={{ width: 14, height: 14 }}></span> : <i className="bi bi-send"></i>}
            </button>
          </div>
          <div className="text-center mt-1" style={{ fontSize: 9, color: '#94a3b8' }}>
            Cory uses AI to help you understand and build your system. Responses may need verification.
          </div>
        </div>
      </div>
    </div>
  );
}

// Generate 3 continuation buttons based on context
function generateContinuationButtons(topic: string, context: string): Array<{ label: string; prompt: string }> {
  const shortTopic = topic.length > 40 ? topic.substring(0, 40) + '...' : topic;

  if (context === 'complete') {
    return [
      { label: 'What should I build next?', prompt: 'What should I build next based on the current system state?' },
      { label: 'Explain the system architecture', prompt: 'Give me an overview of my current system architecture and how everything connects.' },
      { label: 'Show improvement opportunities', prompt: 'What are the top improvement opportunities across my system?' },
    ];
  }

  if (context === 'learn') {
    return [
      { label: `Dive deeper into ${shortTopic}`, prompt: `Explain ${topic} in more detail. What are the key implementation patterns and common pitfalls?` },
      { label: 'How does this connect to other components?', prompt: `How does ${topic} connect to and depend on other components in the system? Show me the relationships.` },
      { label: 'Show me how to build this', prompt: `Walk me through the implementation steps for ${topic}. What files would I create and what would the code structure look like?` },
    ];
  }

  // Build mode
  return [
    { label: 'Tell me more about the requirements', prompt: 'What specific requirements should I consider? Ask me clarifying questions.' },
    { label: 'Show the technical design', prompt: 'Show me the technical architecture for what we discussed — layers, components, and data flow.' },
    { label: 'Create the business process', prompt: 'I\'m ready. Create the business process and add it to my system.' },
  ];
}
