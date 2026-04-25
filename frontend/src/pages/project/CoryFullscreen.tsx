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
import { useSearchParams, Link } from 'react-router-dom';
import portalApi from '../../utils/portalApi';

interface Message {
  role: 'user' | 'cory';
  text: string;
  buttons?: Array<{ label: string; prompt: string }>;
  timestamp: number;
}

export default function CoryFullscreen() {
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode') || 'build';
  const componentId = searchParams.get('componentId');
  const stepName = searchParams.get('stepName') || '';

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
        <div className="d-flex gap-2">
          <Link to="/portal/project/blueprint" className="btn btn-sm btn-outline-secondary" style={{ fontSize: 10 }}>
            <i className="bi bi-arrow-left me-1"></i>Blueprint
          </Link>
          <Link to="/portal/project/system-v2" className="btn btn-sm btn-outline-secondary" style={{ fontSize: 10 }}>
            <i className="bi bi-grid me-1"></i>System View
          </Link>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-grow-1 overflow-auto px-4 py-3" style={{ maxWidth: 800, margin: '0 auto', width: '100%' }}>
        {messages.map((msg, i) => (
          <div key={i} className={`d-flex ${msg.role === 'user' ? 'justify-content-end' : 'justify-content-start'} mb-3`}>
            <div style={{
              maxWidth: '85%',
              padding: '12px 16px',
              borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
              background: msg.role === 'user' ? 'var(--color-primary)' : '#fff',
              color: msg.role === 'user' ? '#fff' : 'var(--color-text)',
              fontSize: 13,
              lineHeight: 1.6,
              boxShadow: msg.role === 'cory' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              border: msg.role === 'cory' ? '1px solid var(--color-border)' : 'none',
              whiteSpace: 'pre-line',
            }}>
              {msg.role === 'cory' && (
                <div className="d-flex align-items-center gap-1 mb-2">
                  <i className="bi bi-robot" style={{ fontSize: 11, color: '#3b82f6' }}></i>
                  <span style={{ fontSize: 10, color: '#3b82f6', fontWeight: 600 }}>Cory</span>
                </div>
              )}
              {msg.text}

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
