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
      { label: "What's the ROI?", value: "What's the ROI of this program?" },
      { label: 'Payment options', value: 'What payment options are available?' },
      { label: 'Compare plans', value: 'Can you compare the different plans?' },
    ];
  }
  if (path.includes('program') || path.includes('curriculum') || path.includes('course')) {
    return [
      { label: 'Curriculum details', value: 'Can you tell me more about the curriculum?' },
      { label: 'Time commitment', value: 'What is the time commitment?' },
      { label: 'Prerequisites', value: 'What are the prerequisites?' },
    ];
  }
  if (path.includes('enroll') || path.includes('register') || path.includes('apply')) {
    return [
      { label: 'Start enrollment', value: 'I want to start the enrollment process.' },
      { label: 'Upcoming cohorts', value: 'When do upcoming cohorts start?' },
      { label: 'Talk to advisor', value: 'Can I speak with an admissions advisor?' },
    ];
  }
  return [
    { label: 'Program overview', value: 'Tell me about the AI Leadership Accelerator program.' },
    { label: 'Who is it for?', value: 'Who is this program designed for?' },
    { label: 'Book a call', value: 'I would like to book a strategy call.' },
  ];
}

const MayaChatWidget: React.FC = () => {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
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
  const inputRef = useRef<HTMLInputElement>(null);
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
  }, [isOpen]);

  // Context update on page navigation (instead of closing conversation)
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

  // Proactive chat polling every 5 seconds when widget is closed
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitorId, isAdminPage, doNotTrack, isOpen, conversationId]);

  const handleOpen = useCallback(async (triggerType = 'visitor_initiated', triggerContext?: any) => {
    setIsOpen(true);

    if (conversationId && initialized) return;

    if (!visitorId) {
      setMessages([{
        role: 'assistant',
        content: 'Hi, I\'m Maya, your AI Admissions Advisor. How can I help you explore the AI Leadership Accelerator program today?',
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
    } catch (err) {
      setMessages([{
        role: 'assistant',
        content: 'Hi, I\'m Maya. How can I help you learn about the AI Leadership Accelerator program?',
      }]);
    }

    setInitialized(true);
  }, [conversationId, initialized, visitorId, location.pathname]);

  const handleClose = useCallback(async () => {
    setIsOpen(false);
    // Do not close conversation — keep it alive for context updates
  }, []);

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
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'Thanks for your interest! For the best experience, please reach out through our contact page or book a strategy call.',
        }]);
      }
    } catch (err) {
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

  if (isAdminPage || doNotTrack || !showButton) return null;

  const quickReplies = getQuickReplies(location.pathname);

  return (
    <>
      {/* Chat button */}
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

      {/* Chat window */}
      {isOpen && (
        <div
          className="position-fixed shadow-lg d-flex flex-column"
          style={{
            bottom: '24px',
            right: '24px',
            width: '380px',
            height: '520px',
            maxHeight: 'calc(100vh - 48px)',
            borderRadius: '12px',
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
            }}
          >
            <div className="d-flex align-items-center gap-2">
              <div
                className="d-flex align-items-center justify-content-center fw-bold"
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--color-accent, #38a169)',
                  color: '#ffffff',
                  fontSize: '14px',
                  flexShrink: 0,
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
            <button
              onClick={handleClose}
              className="btn btn-link text-white p-0"
              aria-label="Close chat"
              style={{ fontSize: '18px', lineHeight: 1 }}
            >
              &times;
            </button>
          </div>

          {/* Messages */}
          <div
            className="flex-grow-1 overflow-auto px-3 py-2"
            style={{ backgroundColor: '#f7fafc' }}
          >
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`d-flex mb-2 ${msg.role === 'visitor' ? 'justify-content-end' : 'justify-content-start'}`}
              >
                <div
                  className="px-3 py-2"
                  style={{
                    maxWidth: '85%',
                    borderRadius: msg.role === 'visitor' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                    backgroundColor: msg.role === 'visitor' ? '#e8f0fe' : '#ffffff',
                    border: msg.role === 'visitor'
                      ? 'none'
                      : msg.visitor_type === 'ceo'
                        ? '2px solid var(--color-primary, #1a365d)'
                        : '1px solid var(--color-border, #e2e8f0)',
                    fontSize: '14px',
                    lineHeight: '1.5',
                    color: 'var(--color-text, #2d3748)',
                    wordBreak: 'break-word',
                  }}
                >
                  {msg.visitor_type === 'ceo' && msg.role === 'assistant' && (
                    <div className="mb-1" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-primary, #1a365d)' }}>
                      Executive Insight
                    </div>
                  )}
                  {msg.content}
                </div>
              </div>
            ))}

            {/* Quick replies */}
            {showQuickReplies && messages.length > 0 && messages.length <= 2 && !sending && (
              <div className="d-flex flex-wrap gap-1 mb-2">
                {quickReplies.map((reply, i) => (
                  <button
                    key={i}
                    className="btn btn-sm btn-outline-secondary"
                    style={{
                      fontSize: '12px',
                      borderRadius: '16px',
                      whiteSpace: 'nowrap',
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
                  className="px-3 py-2"
                  style={{
                    borderRadius: '12px 12px 12px 2px',
                    backgroundColor: '#ffffff',
                    border: '1px solid var(--color-border, #e2e8f0)',
                    fontSize: '14px',
                  }}
                >
                  <span className="d-inline-flex gap-1 align-items-center">
                    <span style={{ animation: 'mayaDot 1.4s infinite', animationDelay: '0s' }}>.</span>
                    <span style={{ animation: 'mayaDot 1.4s infinite', animationDelay: '0.2s' }}>.</span>
                    <span style={{ animation: 'mayaDot 1.4s infinite', animationDelay: '0.4s' }}>.</span>
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div
            className="d-flex align-items-center gap-2 px-3 py-2"
            style={{ borderTop: '1px solid var(--color-border, #e2e8f0)' }}
          >
            <input
              ref={inputRef}
              type="text"
              className="form-control form-control-sm border-0"
              placeholder="Ask Maya anything..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending}
              maxLength={2000}
              style={{ backgroundColor: '#f7fafc' }}
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || sending}
              className="btn btn-sm px-2"
              style={{
                backgroundColor: 'var(--color-accent, #38a169)',
                color: '#ffffff',
                borderRadius: '8px',
                minWidth: '36px',
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

      {/* Typing animation keyframes */}
      <style>{`
        @keyframes mayaDot {
          0%, 20% { opacity: 0.2; }
          50% { opacity: 1; }
          100% { opacity: 0.2; }
        }
      `}</style>
    </>
  );
};

export default MayaChatWidget;
