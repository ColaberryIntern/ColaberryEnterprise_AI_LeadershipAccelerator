import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../utils/api';

interface ChatMessageData {
  id?: string;
  role: 'visitor' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
  visitor_type?: string;
}

interface QuickReply {
  label: string;
  value: string;
}

function getQuickReplies(pathname: string): QuickReply[] {
  const path = pathname.toLowerCase();
  if (path.includes('pricing') || path.includes('investment')) {
    return [
      { label: "What's the investment?", value: "What's the program investment and what's included?" },
      { label: 'ROI & value', value: 'How does this compare to hiring a consulting firm?' },
      { label: 'Group rates', value: 'Do you offer group or corporate rates?' },
    ];
  }
  if (path.includes('program') || path.includes('curriculum') || path.includes('course')) {
    return [
      { label: 'What do I build?', value: 'What will I actually build during the program?' },
      { label: 'Session breakdown', value: 'Walk me through the 5 sessions.' },
      { label: 'Is this for me?', value: "I'm a technical director — is this the right fit?" },
    ];
  }
  if (path.includes('enroll') || path.includes('register') || path.includes('apply')) {
    return [
      { label: 'Secure my spot', value: 'I want to enroll in the next cohort.' },
      { label: 'When does it start?', value: 'When does the next cohort start?' },
      { label: 'Talk to advisor', value: 'Can I speak with someone before enrolling?' },
    ];
  }
  return [
    { label: 'What is this program?', value: 'What is the Enterprise AI Leadership Accelerator?' },
    { label: 'What do I leave with?', value: 'What deliverables do I leave with after the program?' },
    { label: 'Book a strategy call', value: 'I would like to book a strategy call.' },
  ];
}

/* Simple markdown-like renderer for assistant messages */
function renderFormattedContent(text: string): React.ReactNode {
  // Split into paragraphs
  const paragraphs = text.split(/\n\n+/);

  return paragraphs.map((para, pi) => {
    // Numbered list: lines starting with (1), 1., 1)
    const numberedLines = para.split('\n').filter(l => l.trim());
    const isNumberedList = numberedLines.length > 1 && numberedLines.every(l => /^\s*(\(\d+\)|\d+[\.\)])\s/.test(l));
    if (isNumberedList) {
      return (
        <ol key={pi} style={{ paddingLeft: '20px', margin: '8px 0' }}>
          {numberedLines.map((line, li) => (
            <li key={li} style={{ marginBottom: '4px' }}>
              {renderInline(line.replace(/^\s*(\(\d+\)|\d+[\.\)])\s*/, ''))}
            </li>
          ))}
        </ol>
      );
    }

    // Bullet list: lines starting with - or •
    const bulletLines = para.split('\n').filter(l => l.trim());
    const isBulletList = bulletLines.length > 1 && bulletLines.every(l => /^\s*[-•]\s/.test(l));
    if (isBulletList) {
      return (
        <ul key={pi} style={{ paddingLeft: '20px', margin: '8px 0' }}>
          {bulletLines.map((line, li) => (
            <li key={li} style={{ marginBottom: '4px' }}>
              {renderInline(line.replace(/^\s*[-•]\s*/, ''))}
            </li>
          ))}
        </ul>
      );
    }

    // Regular paragraph
    const lines = para.split('\n');
    return (
      <p key={pi} style={{ margin: '0 0 8px 0', lineHeight: '1.6' }}>
        {lines.map((line, li) => (
          <React.Fragment key={li}>
            {li > 0 && <br />}
            {renderInline(line)}
          </React.Fragment>
        ))}
      </p>
    );
  });
}

function renderInline(text: string): React.ReactNode {
  // Bold: **text** or __text__
  const parts = text.split(/(\*\*[^*]+\*\*|__[^_]+__)/g);
  return parts.map((part, i) => {
    if (/^\*\*(.+)\*\*$/.test(part)) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (/^__(.+)__$/.test(part)) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

const MayaChatWidget: React.FC = () => {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showButton, setShowButton] = useState(false);
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [isReturningVisitor, setIsReturningVisitor] = useState(false);
  const [isExecutive, setIsExecutive] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prevPathnameRef = useRef(location.pathname);

  const isAdminPage = location.pathname.startsWith('/admin');
  const doNotTrack = navigator.doNotTrack === '1';
  const visitorId = typeof window !== 'undefined' ? localStorage.getItem('cb_visitor_fp') : null;

  // Delayed appearance
  useEffect(() => {
    if (isAdminPage || doNotTrack) return;
    const timer = setTimeout(() => setShowButton(true), 3000);
    return () => clearTimeout(timer);
  }, [isAdminPage, doNotTrack]);

  // Restore conversation from sessionStorage
  useEffect(() => {
    const savedId = sessionStorage.getItem('cb_chat_conversation_id');
    if (savedId) {
      setConversationId(savedId);
      api.get(`/api/chat/history/${savedId}`)
        .then(res => {
          if (Array.isArray(res.data)) {
            setMessages(res.data.map((m: any) => ({
              role: m.role,
              content: m.content,
              timestamp: m.timestamp,
              visitor_type: m.visitor_type,
            })));
            setInitialized(true);
          }
        })
        .catch(() => {
          sessionStorage.removeItem('cb_chat_conversation_id');
        });
    }
  }, []);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen, isFullScreen]);

  // Context update on page navigation
  useEffect(() => {
    if (prevPathnameRef.current !== location.pathname && conversationId) {
      api.post('/api/chat/context-update', {
        conversation_id: conversationId,
        page_url: window.location.href,
        page_path: location.pathname,
      }).catch(() => {});
      setShowQuickReplies(true);
    }
    prevPathnameRef.current = location.pathname;
  }, [location.pathname, conversationId]);

  // Proactive chat polling
  useEffect(() => {
    if (!visitorId || isAdminPage || doNotTrack || isOpen || conversationId) return;
    const interval = setInterval(() => {
      api.get(`/api/chat/proactive-check?visitor_id=${visitorId}`)
        .then(res => {
          if (res.data?.show_proactive) {
            handleOpen('proactive_behavioral', res.data.trigger_context);
          }
        })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [visitorId, isAdminPage, doNotTrack, isOpen, conversationId]);

  // Escape key to exit full screen
  useEffect(() => {
    if (!isFullScreen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullScreen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isFullScreen]);

  const handleOpen = useCallback(async (triggerType = 'visitor_initiated', triggerContext?: any) => {
    setIsOpen(true);

    if (conversationId && initialized) return;

    if (!visitorId) {
      setMessages([{
        role: 'assistant',
        content: "Hi, I'm Maya, Director of Admissions at Colaberry. I'm here to help you explore the Enterprise AI Leadership Accelerator — a 5-session intensive where technical leaders build a working AI proof of capability for their organization. What would you like to know?",
      }]);
      setInitialized(true);
      return;
    }

    try {
      const sessionId = sessionStorage.getItem('cb_session_id') || undefined;
      const res = await api.post('/api/chat/start', {
        visitor_id: visitorId,
        session_id: sessionId,
        page_url: window.location.href,
        page_path: location.pathname,
        trigger_type: triggerType,
        trigger_context: triggerContext,
      });

      if (res.data?.conversation_id) {
        setConversationId(res.data.conversation_id);
        sessionStorage.setItem('cb_chat_conversation_id', res.data.conversation_id);

        if (res.data.returning_visitor) {
          setIsReturningVisitor(true);
          localStorage.setItem('maya_daily_greeting_shown', new Date().toISOString().slice(0, 10));
        }

        if (res.data.visitor_type === 'ceo') {
          setIsExecutive(true);
        }

        setMessages([{
          role: 'assistant',
          content: res.data.greeting,
          visitor_type: res.data.visitor_type,
        }]);
      }
    } catch {
      setMessages([{
        role: 'assistant',
        content: "Hi, I'm Maya, Director of Admissions at Colaberry. I'm here to help you explore the Enterprise AI Leadership Accelerator. What questions can I answer for you?",
      }]);
    }

    setInitialized(true);
  }, [conversationId, initialized, visitorId, location.pathname]);

  const handleClose = useCallback(() => {
    if (isFullScreen) {
      setIsFullScreen(false);
    } else {
      setIsOpen(false);
    }
  }, [isFullScreen]);

  const handleSend = useCallback(async (messageOverride?: string) => {
    const messageText = messageOverride || input.trim();
    if (!messageText || sending) return;

    if (!messageOverride) setInput('');
    setShowQuickReplies(false);
    setMessages(prev => [...prev, { role: 'visitor', content: messageText }]);
    setSending(true);

    try {
      if (conversationId) {
        const res = await api.post('/api/chat/message', {
          conversation_id: conversationId,
          content: messageText,
        });
        if (res.data?.message) {
          const assistantMsg: ChatMessageData = {
            role: 'assistant',
            content: res.data.message,
          };
          if (res.data.visitor_type === 'ceo') {
            setIsExecutive(true);
            assistantMsg.visitor_type = 'ceo';
          }
          setMessages(prev => [...prev, assistantMsg]);
        }
      } else {
        // No conversation yet — try to start one
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: "I'd love to help! Let me connect you properly — could you try refreshing the page? If the issue persists, you can always book a strategy call or reach us through the contact page.",
        }]);
      }
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'I apologize, I had trouble with that. Could you try again?',
      }]);
    } finally {
      setSending(false);
    }
  }, [input, sending, conversationId]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleQuickReply = useCallback((reply: QuickReply) => {
    handleSend(reply.value);
  }, [handleSend]);

  // Auto-resize textarea
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, []);

  if (isAdminPage || doNotTrack || !showButton) return null;

  const quickReplies = getQuickReplies(location.pathname);

  // Full-screen layout
  if (isOpen && isFullScreen) {
    return (
      <>
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            backgroundColor: '#f9fafb',
            display: 'flex',
            flexDirection: 'column',
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Chat with Maya — AI Admissions Advisor"
        >
          {/* Header */}
          <div
            className="d-flex align-items-center justify-content-between px-4 py-3"
            style={{
              backgroundColor: 'var(--color-primary, #1a365d)',
              color: '#ffffff',
              minHeight: '56px',
              flexShrink: 0,
            }}
          >
            <div className="d-flex align-items-center gap-3">
              <div
                className="d-flex align-items-center justify-content-center fw-bold"
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--color-accent, #38a169)',
                  fontSize: '16px',
                  flexShrink: 0,
                }}
              >
                M
              </div>
              <div>
                <div className="fw-semibold" style={{ fontSize: '16px' }}>Maya — AI Admissions Advisor</div>
                <div style={{ fontSize: '12px', opacity: 0.8 }}>
                  Colaberry Enterprise AI Division
                  {isReturningVisitor && ' · Welcome back'}
                </div>
              </div>
            </div>
            <div className="d-flex align-items-center gap-2">
              <button
                onClick={() => setIsFullScreen(false)}
                className="btn btn-link text-white p-1"
                title="Exit full screen"
                aria-label="Exit full screen"
                style={{ opacity: 0.8 }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" />
                  <line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              </button>
              <button
                onClick={() => { setIsFullScreen(false); setIsOpen(false); }}
                className="btn btn-link text-white p-1"
                aria-label="Close chat"
                style={{ fontSize: '22px', lineHeight: 1, opacity: 0.8 }}
              >
                &times;
              </button>
            </div>
          </div>

          {/* Messages — centered container */}
          <div className="flex-grow-1 overflow-auto" style={{ backgroundColor: '#f9fafb' }}>
            <div style={{ maxWidth: '768px', margin: '0 auto', padding: '24px 24px 0' }}>
              {messages.map((msg, i) => (
                <div key={i} style={{ marginBottom: '24px' }}>
                  {msg.role === 'assistant' ? (
                    <div className="d-flex gap-3" style={{ alignItems: 'flex-start' }}>
                      <div
                        className="d-flex align-items-center justify-content-center fw-bold flex-shrink-0"
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          backgroundColor: 'var(--color-accent, #38a169)',
                          color: '#fff',
                          fontSize: '13px',
                          marginTop: '2px',
                        }}
                      >
                        M
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {msg.visitor_type === 'ceo' && (
                          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-primary)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Executive Insight
                          </div>
                        )}
                        <div style={{ color: 'var(--color-text, #2d3748)', fontSize: '15px', lineHeight: '1.7' }}>
                          {renderFormattedContent(msg.content)}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="d-flex gap-3 justify-content-end">
                      <div
                        style={{
                          maxWidth: '80%',
                          padding: '12px 16px',
                          borderRadius: '18px 18px 4px 18px',
                          backgroundColor: 'var(--color-primary, #1a365d)',
                          color: '#ffffff',
                          fontSize: '15px',
                          lineHeight: '1.6',
                        }}
                      >
                        {msg.content}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Quick replies */}
              {showQuickReplies && messages.length > 0 && messages.length <= 2 && !sending && (
                <div className="d-flex flex-wrap gap-2 mb-3" style={{ paddingLeft: '44px' }}>
                  {quickReplies.map((reply, i) => (
                    <button
                      key={i}
                      className="btn btn-outline-secondary btn-sm"
                      style={{
                        borderRadius: '20px',
                        fontSize: '13px',
                        padding: '6px 16px',
                        borderColor: 'var(--color-border, #e2e8f0)',
                        color: 'var(--color-text, #2d3748)',
                        transition: 'all 0.15s ease',
                      }}
                      onClick={() => handleQuickReply(reply)}
                      onMouseEnter={e => {
                        e.currentTarget.style.backgroundColor = 'var(--color-primary, #1a365d)';
                        e.currentTarget.style.color = '#fff';
                        e.currentTarget.style.borderColor = 'var(--color-primary, #1a365d)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.backgroundColor = '';
                        e.currentTarget.style.color = 'var(--color-text, #2d3748)';
                        e.currentTarget.style.borderColor = 'var(--color-border, #e2e8f0)';
                      }}
                    >
                      {reply.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Typing indicator */}
              {sending && (
                <div className="d-flex gap-3" style={{ marginBottom: '24px' }}>
                  <div
                    className="d-flex align-items-center justify-content-center fw-bold flex-shrink-0"
                    style={{
                      width: '32px', height: '32px', borderRadius: '50%',
                      backgroundColor: 'var(--color-accent, #38a169)', color: '#fff', fontSize: '13px',
                    }}
                  >
                    M
                  </div>
                  <div style={{ padding: '8px 0' }}>
                    <span className="maya-typing-dots" />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} style={{ height: '24px' }} />
            </div>
          </div>

          {/* Input — centered container */}
          <div style={{ borderTop: '1px solid var(--color-border, #e2e8f0)', backgroundColor: '#ffffff', flexShrink: 0 }}>
            <div style={{ maxWidth: '768px', margin: '0 auto', padding: '16px 24px' }}>
              <div
                className="d-flex align-items-end gap-3"
                style={{
                  border: '1px solid var(--color-border, #e2e8f0)',
                  borderRadius: '12px',
                  padding: '12px 16px',
                  backgroundColor: '#f9fafb',
                }}
              >
                <textarea
                  ref={inputRef}
                  className="border-0 flex-grow-1"
                  placeholder="Message Maya..."
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  disabled={sending}
                  maxLength={2000}
                  rows={1}
                  style={{
                    backgroundColor: 'transparent',
                    resize: 'none',
                    outline: 'none',
                    fontSize: '15px',
                    lineHeight: '1.5',
                    maxHeight: '120px',
                    overflow: 'auto',
                  }}
                />
                <button
                  onClick={() => handleSend()}
                  disabled={!input.trim() || sending}
                  className="btn p-0 border-0 flex-shrink-0"
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    backgroundColor: input.trim() ? 'var(--color-primary, #1a365d)' : '#e2e8f0',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'background-color 0.15s ease',
                  }}
                  aria-label="Send message"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                  </svg>
                </button>
              </div>
              <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '11px', color: '#a0aec0' }}>
                Maya is an AI assistant. Verify important details with our admissions team.
              </div>
            </div>
          </div>
        </div>
        <style>{mayaStyles}</style>
      </>
    );
  }

  return (
    <>
      {/* Floating chat button */}
      {!isOpen && (
        <button
          onClick={() => handleOpen()}
          className="position-fixed shadow-lg border-0 d-flex align-items-center justify-content-center"
          style={{
            bottom: '24px',
            right: '24px',
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            backgroundColor: 'var(--color-accent, #38a169)',
            color: '#ffffff',
            zIndex: 9998,
            cursor: 'pointer',
            transition: 'transform 0.2s ease',
          }}
          aria-label="Chat with Maya — AI Admissions Advisor"
          onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.1)')}
          onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
        >
          <span className="fw-bold" style={{ fontSize: '20px' }}>M</span>
        </button>
      )}

      {/* Mini chat window */}
      {isOpen && !isFullScreen && (
        <div
          className="position-fixed shadow-lg d-flex flex-column"
          style={{
            bottom: '24px',
            right: '24px',
            width: '400px',
            height: '560px',
            maxHeight: 'calc(100vh - 48px)',
            maxWidth: 'calc(100vw - 32px)',
            borderRadius: '16px',
            backgroundColor: '#ffffff',
            zIndex: 9999,
            overflow: 'hidden',
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Chat with Maya — AI Admissions Advisor"
        >
          {/* Header */}
          <div
            className="d-flex align-items-center justify-content-between px-3 py-2"
            style={{
              backgroundColor: 'var(--color-primary, #1a365d)',
              color: '#ffffff',
              minHeight: '52px',
              flexShrink: 0,
            }}
          >
            <div className="d-flex align-items-center gap-2">
              <div
                className="d-flex align-items-center justify-content-center fw-bold"
                style={{
                  width: '32px', height: '32px', borderRadius: '50%',
                  backgroundColor: 'var(--color-accent, #38a169)', color: '#ffffff',
                  fontSize: '14px', flexShrink: 0,
                }}
              >
                M
              </div>
              <div>
                <span className="fw-semibold" style={{ fontSize: '14px' }}>Maya — AI Admissions Advisor</span>
                {isReturningVisitor && (
                  <div style={{ fontSize: '11px', opacity: 0.85 }}>Welcome back</div>
                )}
              </div>
            </div>
            <div className="d-flex align-items-center gap-1">
              {/* Expand button */}
              <button
                onClick={() => setIsFullScreen(true)}
                className="btn btn-link text-white p-1"
                title="Expand to full screen"
                aria-label="Expand to full screen"
                style={{ opacity: 0.8, fontSize: '14px' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              </button>
              <button
                onClick={handleClose}
                className="btn btn-link text-white p-1"
                aria-label="Close chat"
                style={{ fontSize: '20px', lineHeight: 1, opacity: 0.8 }}
              >
                &times;
              </button>
            </div>
          </div>

          {/* Messages */}
          <div
            className="flex-grow-1 overflow-auto px-3 py-2"
            style={{ backgroundColor: '#f9fafb' }}
          >
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`d-flex mb-3 ${msg.role === 'visitor' ? 'justify-content-end' : 'justify-content-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div
                    className="d-flex align-items-start justify-content-center fw-bold flex-shrink-0 me-2"
                    style={{
                      width: '28px', height: '28px', borderRadius: '50%',
                      backgroundColor: 'var(--color-accent, #38a169)', color: '#fff',
                      fontSize: '12px', marginTop: '2px',
                    }}
                  >
                    M
                  </div>
                )}
                <div
                  style={{
                    maxWidth: msg.role === 'visitor' ? '80%' : '85%',
                    padding: msg.role === 'visitor' ? '10px 14px' : '10px 14px',
                    borderRadius: msg.role === 'visitor' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                    backgroundColor: msg.role === 'visitor' ? 'var(--color-primary, #1a365d)' : '#ffffff',
                    color: msg.role === 'visitor' ? '#ffffff' : 'var(--color-text, #2d3748)',
                    border: msg.role === 'visitor'
                      ? 'none'
                      : msg.visitor_type === 'ceo'
                        ? '2px solid var(--color-primary, #1a365d)'
                        : '1px solid var(--color-border, #e2e8f0)',
                    fontSize: '14px',
                    lineHeight: '1.6',
                    wordBreak: 'break-word',
                  }}
                >
                  {msg.visitor_type === 'ceo' && msg.role === 'assistant' && (
                    <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-primary)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Executive Insight
                    </div>
                  )}
                  {msg.role === 'assistant' ? renderFormattedContent(msg.content) : msg.content}
                </div>
              </div>
            ))}

            {/* Quick replies */}
            {showQuickReplies && messages.length > 0 && messages.length <= 2 && !sending && (
              <div className="d-flex flex-wrap gap-1 mb-2" style={{ paddingLeft: '36px' }}>
                {quickReplies.map((reply, i) => (
                  <button
                    key={i}
                    className="btn btn-sm btn-outline-secondary"
                    style={{
                      fontSize: '12px',
                      borderRadius: '16px',
                      whiteSpace: 'nowrap',
                      padding: '4px 12px',
                      borderColor: 'var(--color-border, #e2e8f0)',
                      color: 'var(--color-text-light, #718096)',
                    }}
                    onClick={() => handleQuickReply(reply)}
                  >
                    {reply.label}
                  </button>
                ))}
              </div>
            )}

            {/* Typing indicator */}
            {sending && (
              <div className="d-flex justify-content-start mb-2">
                <div
                  className="d-flex align-items-center justify-content-center fw-bold flex-shrink-0 me-2"
                  style={{
                    width: '28px', height: '28px', borderRadius: '50%',
                    backgroundColor: 'var(--color-accent, #38a169)', color: '#fff', fontSize: '12px',
                  }}
                >
                  M
                </div>
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: '14px 14px 14px 4px',
                    backgroundColor: '#ffffff',
                    border: '1px solid var(--color-border, #e2e8f0)',
                  }}
                >
                  <span className="maya-typing-dots" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div
            className="d-flex align-items-end gap-2 px-3 py-2"
            style={{ borderTop: '1px solid var(--color-border, #e2e8f0)', flexShrink: 0 }}
          >
            <textarea
              ref={inputRef}
              className="form-control border-0 flex-grow-1"
              placeholder="Message Maya..."
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              disabled={sending}
              maxLength={2000}
              rows={1}
              style={{
                backgroundColor: '#f7fafc',
                resize: 'none',
                fontSize: '14px',
                lineHeight: '1.4',
                maxHeight: '80px',
                overflow: 'auto',
                borderRadius: '8px',
                padding: '8px 12px',
              }}
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || sending}
              className="btn btn-sm px-2 flex-shrink-0"
              style={{
                backgroundColor: input.trim() ? 'var(--color-primary, #1a365d)' : 'var(--color-accent, #38a169)',
                color: '#ffffff',
                borderRadius: '8px',
                minWidth: '36px',
                height: '36px',
                transition: 'background-color 0.15s ease',
              }}
              aria-label="Send message"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <style>{mayaStyles}</style>
    </>
  );
};

const mayaStyles = `
  @keyframes mayaDot {
    0%, 20% { opacity: 0.2; }
    50% { opacity: 1; }
    100% { opacity: 0.2; }
  }
  .maya-typing-dots::after {
    content: '...';
    display: inline-block;
    animation: mayaDot 1.4s infinite;
    font-size: 20px;
    letter-spacing: 2px;
    color: #a0aec0;
  }
`;

export default MayaChatWidget;
