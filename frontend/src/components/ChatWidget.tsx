import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../utils/api';

interface ChatMessageData {
  id?: string;
  role: 'visitor' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

const ChatWidget: React.FC = () => {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [showButton, setShowButton] = useState(false);
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Don't show on admin pages
  const isAdminPage = location.pathname.startsWith('/admin');

  // Respect doNotTrack
  const doNotTrack = navigator.doNotTrack === '1';

  // Check if chat is enabled
  const visitorId = typeof window !== 'undefined' ? localStorage.getItem('cb_visitor_fp') : null;

  // Delayed appearance (3 seconds after page load)
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
      // Load existing messages
      api.get(`/api/chat/history/${savedId}`)
        .then(res => {
          if (Array.isArray(res.data)) {
            setMessages(res.data.map((m: any) => ({
              role: m.role,
              content: m.content,
              timestamp: m.timestamp,
            })));
            setInitialized(true);
          }
        })
        .catch(() => {
          // Conversation may have been closed
          sessionStorage.removeItem('cb_chat_conversation_id');
        });
    }
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Check for proactive chat
  useEffect(() => {
    if (!visitorId || isAdminPage || doNotTrack || conversationId) return;

    const timer = setTimeout(() => {
      api.get(`/api/chat/proactive-check?visitor_id=${visitorId}`)
        .then(res => {
          if (res.data?.show_proactive) {
            // Auto-open with proactive greeting
            handleOpen('proactive_behavioral', res.data.trigger_context);
          }
        })
        .catch(() => {}); // Non-critical
    }, 5000);

    return () => clearTimeout(timer);
  }, [visitorId, isAdminPage, doNotTrack, conversationId]);

  const handleOpen = useCallback(async (triggerType = 'visitor_initiated', triggerContext?: any) => {
    setIsOpen(true);

    if (conversationId && initialized) return; // Already started

    if (!visitorId) {
      setMessages([{
        role: 'assistant',
        content: 'Hi there! How can I help you today? Feel free to ask me anything about Colaberry\'s AI Leadership Accelerator program.',
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
        setMessages([{
          role: 'assistant',
          content: res.data.greeting,
        }]);
      }
    } catch (err) {
      setMessages([{
        role: 'assistant',
        content: 'Hi there! How can I help you learn about the AI Leadership Accelerator program?',
      }]);
    }

    setInitialized(true);
  }, [conversationId, initialized, visitorId, location.pathname]);

  const handleClose = useCallback(async () => {
    setIsOpen(false);

    if (conversationId && messages.length > 1) {
      try {
        await api.post('/api/chat/close', { conversation_id: conversationId });
      } catch (err) {
        // Non-critical
      }
      setConversationId(null);
      sessionStorage.removeItem('cb_chat_conversation_id');
      setMessages([]);
      setInitialized(false);
    }
  }, [conversationId, messages.length]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || sending) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'visitor', content: userMessage }]);
    setSending(true);

    try {
      if (conversationId) {
        const res = await api.post('/api/chat/message', {
          conversation_id: conversationId,
          content: userMessage,
        });
        if (res.data?.message) {
          setMessages(prev => [...prev, { role: 'assistant', content: res.data.message }]);
        }
      } else {
        // No backend conversation — show fallback
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

  if (isAdminPage || doNotTrack || !showButton) return null;

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
            backgroundColor: 'var(--color-primary, #1a365d)',
            color: '#ffffff',
            zIndex: 9998,
            cursor: 'pointer',
            transition: 'transform 0.2s ease',
          }}
          aria-label="Open chat"
          onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.1)')}
          onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
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
          aria-label="Chat with Colaberry AI Assistant"
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
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: '#38a169',
                }}
              />
              <span className="fw-semibold" style={{ fontSize: '14px' }}>Colaberry AI Assistant</span>
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
                    border: msg.role === 'visitor' ? 'none' : '1px solid var(--color-border, #e2e8f0)',
                    fontSize: '14px',
                    lineHeight: '1.5',
                    color: 'var(--color-text, #2d3748)',
                    wordBreak: 'break-word',
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ))}

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
                    <span style={{ animation: 'chatDot 1.4s infinite', animationDelay: '0s' }}>.</span>
                    <span style={{ animation: 'chatDot 1.4s infinite', animationDelay: '0.2s' }}>.</span>
                    <span style={{ animation: 'chatDot 1.4s infinite', animationDelay: '0.4s' }}>.</span>
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
              placeholder="Type a message..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending}
              maxLength={2000}
              style={{ backgroundColor: '#f7fafc' }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="btn btn-sm px-2"
              style={{
                backgroundColor: 'var(--color-primary, #1a365d)',
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
        @keyframes chatDot {
          0%, 20% { opacity: 0.2; }
          50% { opacity: 1; }
          100% { opacity: 0.2; }
        }
      `}</style>
    </>
  );
};

export default ChatWidget;
