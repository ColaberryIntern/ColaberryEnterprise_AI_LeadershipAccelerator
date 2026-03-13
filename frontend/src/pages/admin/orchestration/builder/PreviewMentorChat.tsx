import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useMentorContext } from '../../../../contexts/MentorContext';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface PreviewMentorChatProps {
  token: string;
  apiUrl: string;
  lessonId?: string;
  onClose?: () => void;
}

/** Render markdown-lite: bold, code, lists */
function renderContent(text: string) {
  return text.split('\n').map((line, i) => {
    // Bold
    let processed = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Inline code
    processed = processed.replace(/`(.+?)`/g, '<code style="background:#f1f5f9;padding:1px 4px;border-radius:3px;font-size:12px">$1</code>');
    // Bullet
    if (/^[-•]\s/.test(processed)) {
      processed = processed.replace(/^[-•]\s/, '');
      return <li key={i} className="small" style={{ color: '#334155', lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: processed }} />;
    }
    if (!processed.trim()) return <br key={i} />;
    return <p key={i} className="small mb-1" style={{ color: '#334155', lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: processed }} />;
  });
}

export default function PreviewMentorChat({ token, apiUrl, lessonId, onClose }: PreviewMentorChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { pendingMentorMessage, clearPendingMessage, onMentorResponded } = useMentorContext();

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    setTimeout(scrollToBottom, 100);
  }, [messages, scrollToBottom]);

  const sendMessage = useCallback(async (text?: string, displayText?: string) => {
    const msg = (text || input).trim();
    if (!msg || sending) return;

    setMessages(prev => [...prev, { role: 'user', content: displayText || msg }]);
    setInput('');
    setSending(true);
    setSuggestedPrompts([]);

    try {
      const res = await axios.post(`${apiUrl}/api/admin/orchestration/mentor-preview`, {
        message: msg,
        lesson_id: lessonId,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMessages(prev => [...prev, { role: 'assistant', content: res.data.reply }]);
      setSuggestedPrompts(res.data.suggested_prompts || []);
      onMentorResponded.current?.(res.data.reply);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Unable to get response. Check that OpenAI API key is configured.' }]);
    } finally {
      setSending(false);
    }
  }, [input, sending, token, apiUrl, lessonId, onMentorResponded]);

  // Auto-send pending messages from ImplementationTask "Ask AI Mentor" button
  useEffect(() => {
    if (pendingMentorMessage && !sending) {
      sendMessage(pendingMentorMessage.message, pendingMentorMessage.displayText);
      clearPendingMessage();
    }
  }, [pendingMentorMessage, sending, sendMessage, clearPendingMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div
      className="d-flex flex-column"
      style={{
        height: '100%',
        background: '#fff',
        borderRadius: 8,
        border: '1px solid var(--color-border, #e2e8f0)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div className="d-flex align-items-center gap-2 px-3 py-2" style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <i className="bi bi-robot" style={{ color: '#fff', fontSize: 13 }}></i>
        </div>
        <span className="fw-semibold" style={{ fontSize: 12, color: '#1e293b' }}>AI Mentor Preview</span>
        <span className="badge bg-secondary ms-auto" style={{ fontSize: 9 }}>Preview</span>
        {onClose && (
          <button
            className="btn btn-sm d-flex align-items-center justify-content-center ms-1"
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              color: '#64748b',
              border: '1px solid #e2e8f0',
              background: '#fff',
              fontSize: 14,
              lineHeight: 1,
              flexShrink: 0,
            }}
            title="Collapse mentor panel"
          >
            <i className="bi bi-chevron-right"></i>
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-grow-1 px-3 py-2" style={{ overflowY: 'auto', minHeight: 0 }}>
        {messages.length === 0 && (
          <div className="text-center py-4">
            <i className="bi bi-chat-dots" style={{ fontSize: 24, color: '#94a3b8' }}></i>
            <p className="small mt-2 mb-0" style={{ color: '#94a3b8' }}>
              Test how the AI Mentor responds to student questions for this lesson.
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`d-flex mb-2 ${msg.role === 'user' ? 'justify-content-end' : 'justify-content-start'}`}
          >
            <div
              className="px-3 py-2 rounded"
              style={{
                maxWidth: '85%',
                background: msg.role === 'user' ? '#6366f1' : '#f1f5f9',
                color: msg.role === 'user' ? '#fff' : '#1e293b',
                fontSize: 12,
                lineHeight: 1.5,
              }}
            >
              {msg.role === 'user' ? (
                <span className="small">{msg.content}</span>
              ) : (
                <div>{renderContent(msg.content)}</div>
              )}
            </div>
          </div>
        ))}

        {sending && (
          <div className="d-flex mb-2 justify-content-start">
            <div className="px-3 py-2 rounded" style={{ background: '#f1f5f9' }}>
              <span className="spinner-border spinner-border-sm" role="status" style={{ width: 14, height: 14, color: '#6366f1' }}>
                <span className="visually-hidden">Loading...</span>
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Prompts */}
      {suggestedPrompts.length > 0 && (
        <div className="px-3 py-1 d-flex flex-wrap gap-1" style={{ borderTop: '1px solid #f1f5f9' }}>
          {suggestedPrompts.map((prompt, i) => (
            <button
              key={i}
              className="btn btn-sm"
              style={{
                fontSize: 10,
                padding: '2px 8px',
                background: '#eef2ff',
                color: '#6366f1',
                border: '1px solid #c7d2fe',
                borderRadius: 12,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '100%',
              }}
              onClick={() => sendMessage(prompt)}
              title={prompt}
            >
              {prompt.length > 60 ? prompt.slice(0, 60) + '...' : prompt}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="d-flex gap-2 px-3 py-2" style={{ borderTop: '1px solid #e2e8f0', flexShrink: 0 }}>
        <textarea
          ref={inputRef}
          className="form-control form-control-sm"
          rows={1}
          placeholder="Ask the mentor a question..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={sending}
          style={{ fontSize: 12, resize: 'none', borderRadius: 6 }}
        />
        <button
          className="btn btn-sm btn-primary d-flex align-items-center justify-content-center"
          onClick={() => sendMessage()}
          disabled={sending || !input.trim()}
          style={{ width: 32, height: 32, borderRadius: 6, flexShrink: 0 }}
        >
          <i className="bi bi-send" style={{ fontSize: 12 }}></i>
        </button>
      </div>
    </div>
  );
}
