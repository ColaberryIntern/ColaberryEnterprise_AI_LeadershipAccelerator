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

/* Mentor face SVG — matches PortalMentorChat */
const MentorFace = ({ size = 40 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="32" r="30" fill="#eef2ff" stroke="#c7d2fe" strokeWidth="2" />
    <path d="M12 28c0-11 9-20 20-20s20 9 20 20" stroke="#6366f1" strokeWidth="3" strokeLinecap="round" fill="none" />
    <circle cx="22" cy="30" r="3.5" fill="#6366f1" />
    <circle cx="42" cy="30" r="3.5" fill="#6366f1" />
    <circle cx="23.2" cy="28.8" r="1.2" fill="#fff" />
    <circle cx="43.2" cy="28.8" r="1.2" fill="#fff" />
    <path d="M22 40c3 4 8 6 10 6s7-2 10-6" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    <rect x="7" y="24" width="6" height="10" rx="3" fill="#8b5cf6" />
    <rect x="51" y="24" width="6" height="10" rx="3" fill="#8b5cf6" />
    <path d="M10 34v6c0 3 2 5 5 5h3" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" fill="none" />
    <circle cx="19" cy="45" r="2" fill="#8b5cf6" />
  </svg>
);

const MentorAvatar = ({ size = 28 }: { size?: number }) => (
  <div
    className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0"
    style={{ width: size, height: size, background: '#eef2ff', overflow: 'hidden' }}
  >
    <MentorFace size={size} />
  </div>
);

/* Inline markdown: **bold** and `code` */
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} style={{ background: '#e2e8f0', padding: '1px 4px', borderRadius: 3, fontSize: 11, fontFamily: 'monospace' }}>{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

/* Full markdown renderer: headers, lists, code blocks, paragraphs */
function renderMarkdown(text: string, fs: boolean): React.ReactNode[] {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  const baseFontSize = fs ? 14 : 12;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Headers
    if (line.startsWith('### ')) {
      elements.push(<div key={i} className="fw-bold mt-3 mb-1" style={{ fontSize: baseFontSize }}>{renderInline(line.slice(4))}</div>);
      continue;
    }
    if (line.startsWith('## ')) {
      elements.push(<div key={i} className="fw-bold mt-3 mb-1" style={{ fontSize: baseFontSize + 1 }}>{renderInline(line.slice(3))}</div>);
      continue;
    }
    if (line.startsWith('# ')) {
      elements.push(<div key={i} className="fw-bold mt-3 mb-1" style={{ fontSize: baseFontSize + 2 }}>{renderInline(line.slice(2))}</div>);
      continue;
    }

    // Numbered list
    const numMatch = line.match(/^(\d+)\.\s+(.+)/);
    if (numMatch) {
      elements.push(
        <div key={i} className="d-flex gap-2 mb-1" style={{ fontSize: baseFontSize }}>
          <span className="flex-shrink-0" style={{ color: '#6366f1', fontWeight: 600, minWidth: 16 }}>{numMatch[1]}.</span>
          <span>{renderInline(numMatch[2])}</span>
        </div>
      );
      continue;
    }

    // Bullet list
    const bulletMatch = line.match(/^[-*]\s+(.+)/);
    if (bulletMatch) {
      elements.push(
        <div key={i} className="d-flex gap-2 mb-1" style={{ fontSize: baseFontSize }}>
          <span style={{ color: '#6366f1', marginTop: 2 }}>&bull;</span>
          <span>{renderInline(bulletMatch[1])}</span>
        </div>
      );
      continue;
    }

    // Code block
    if (line.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <pre key={i} className="p-2 rounded mb-2" style={{ background: '#1e293b', color: '#a7f3d0', fontSize: 11, lineHeight: 1.5, fontFamily: 'monospace', whiteSpace: 'pre-wrap', overflowX: 'auto' }}>
          {codeLines.join('\n')}
        </pre>
      );
      continue;
    }

    // Regular text
    if (line.trim()) {
      elements.push(<div key={i} className="mb-1" style={{ fontSize: baseFontSize, lineHeight: 1.7 }}>{renderInline(line)}</div>);
    } else if (i > 0 && lines[i - 1].trim()) {
      elements.push(<div key={i} style={{ height: 6 }} />);
    }
  }

  return elements;
}

export default function PreviewMentorChat({ token, apiUrl, lessonId, onClose }: PreviewMentorChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
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

  const fs = isFullscreen;

  return (
    <div
      className="d-flex flex-column"
      style={fs ? {
        position: 'fixed',
        inset: 0,
        zIndex: 1060,
        display: 'flex',
        flexDirection: 'column',
        background: '#f7f7f8',
      } : {
        height: '100%',
        background: '#fff',
        borderRadius: 8,
        border: '1px solid var(--color-border, #e2e8f0)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        className="d-flex align-items-center gap-2"
        style={{
          padding: fs ? '10px 20px' : '8px 12px',
          background: fs ? '#fff' : '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
          flexShrink: 0,
        }}
      >
        <div className="d-flex align-items-center gap-2 flex-grow-1">
          <div
            className="d-flex align-items-center justify-content-center rounded-circle"
            style={{ width: fs ? 32 : 28, height: fs ? 32 : 28, background: '#eef2ff', overflow: 'hidden' }}
          >
            <MentorFace size={fs ? 32 : 28} />
          </div>
          <span className="fw-semibold" style={{ fontSize: fs ? 14 : 12, color: '#1e293b' }}>AI Mentor Preview</span>
          {!fs && <span className="badge bg-secondary ms-auto" style={{ fontSize: 9 }}>Preview</span>}
        </div>
        <div className="d-flex align-items-center gap-1">
          <button
            className="btn btn-sm d-flex align-items-center justify-content-center"
            onClick={() => setIsFullscreen(!fs)}
            title={fs ? 'Exit fullscreen' : 'Fullscreen'}
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              color: '#64748b',
              border: '1px solid #e2e8f0',
              background: '#fff',
              fontSize: 13,
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            <i className={`bi ${fs ? 'bi-fullscreen-exit' : 'bi-arrows-fullscreen'}`}></i>
          </button>
          {onClose && (
            <button
              className="btn btn-sm d-flex align-items-center justify-content-center"
              onClick={() => { setIsFullscreen(false); onClose(); }}
              title="Close mentor panel"
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
            >
              <i className="bi bi-x-lg"></i>
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div
        className="flex-grow-1"
        style={{
          overflowY: 'auto',
          minHeight: 0,
          padding: fs ? '24px 16px' : '8px 12px',
          background: fs ? '#f7f7f8' : undefined,
        }}
      >
        <div style={fs ? { maxWidth: 768, margin: '0 auto', width: '100%' } : {}}>
          {messages.length === 0 && (
            <div className="text-center py-4">
              <MentorFace size={48} />
              <p className="fw-semibold small mt-2 mb-1" style={{ color: '#1e293b' }}>AI Mentor Preview</p>
              <p className="small mb-0" style={{ color: '#94a3b8' }}>
                Test how the AI Mentor responds to student questions for this lesson.
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`d-flex mb-3 ${msg.role === 'user' ? 'justify-content-end' : 'justify-content-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="me-2 flex-shrink-0" style={{ marginTop: 2 }}>
                  <MentorAvatar size={fs ? 32 : 24} />
                </div>
              )}
              <div
                style={{
                  maxWidth: fs ? '100%' : '85%',
                  padding: fs
                    ? (msg.role === 'user' ? '10px 16px' : '4px 0')
                    : '8px 12px',
                  borderRadius: fs
                    ? (msg.role === 'user' ? 20 : 0)
                    : (msg.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px'),
                  background: msg.role === 'user'
                    ? '#6366f1'
                    : (fs ? 'transparent' : '#f1f5f9'),
                  color: msg.role === 'user' ? '#fff' : '#334155',
                  fontSize: fs ? 14 : 12,
                  lineHeight: 1.7,
                  boxShadow: (msg.role === 'assistant' && !fs) ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                  whiteSpace: msg.role === 'user' ? 'pre-wrap' : undefined,
                }}
              >
                {msg.role === 'assistant' ? renderMarkdown(msg.content, fs) : msg.content}
              </div>
            </div>
          ))}

          {sending && (
            <div className="d-flex align-items-center gap-2 mb-3">
              <MentorAvatar size={fs ? 32 : 24} />
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: fs ? 0 : '12px 12px 12px 4px',
                  background: fs ? 'transparent' : '#f1f5f9',
                  boxShadow: fs ? 'none' : '0 1px 3px rgba(0,0,0,0.06)',
                }}
              >
                <div className="d-flex gap-1">
                  <span className="spinner-grow spinner-grow-sm" style={{ width: 6, height: 6, color: '#6366f1' }} role="status"><span className="visually-hidden">Loading...</span></span>
                  <span className="spinner-grow spinner-grow-sm" style={{ width: 6, height: 6, color: '#6366f1', animationDelay: '0.15s' }}></span>
                  <span className="spinner-grow spinner-grow-sm" style={{ width: 6, height: 6, color: '#6366f1', animationDelay: '0.3s' }}></span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Suggested Prompts */}
      {suggestedPrompts.length > 0 && (
        <div
          style={{
            padding: fs ? '8px 16px' : '4px 12px',
            borderTop: '1px solid #f1f5f9',
            background: fs ? '#f7f7f8' : undefined,
          }}
        >
          <div className="d-flex flex-wrap gap-1" style={fs ? { maxWidth: 768, margin: '0 auto' } : {}}>
            {suggestedPrompts.map((prompt, i) => (
              <button
                key={i}
                className="btn btn-sm"
                style={{
                  fontSize: fs ? 12 : 10,
                  padding: fs ? '4px 12px' : '2px 8px',
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
                {prompt.length > (fs ? 80 : 60) ? prompt.slice(0, fs ? 80 : 60) + '...' : prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div
        style={{
          padding: fs ? '16px 20px 24px' : '8px 12px',
          borderTop: fs ? 'none' : '1px solid #e2e8f0',
          background: fs ? '#f7f7f8' : '#fff',
          flexShrink: 0,
        }}
      >
        <div
          className="d-flex gap-2"
          style={{
            alignItems: 'flex-end',
            ...(fs ? { maxWidth: 768, margin: '0 auto' } : {}),
          }}
        >
          <textarea
            ref={inputRef}
            className={`form-control ${fs ? '' : 'form-control-sm'}`}
            rows={fs ? 2 : 1}
            placeholder="Ask the mentor a question..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending}
            style={{
              fontSize: fs ? 14 : 12,
              resize: 'none',
              borderRadius: fs ? 24 : 6,
              padding: fs ? '12px 20px' : undefined,
              borderColor: fs ? '#d1d5db' : undefined,
              boxShadow: fs ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
              background: fs ? '#fff' : undefined,
              maxHeight: fs ? 120 : 72,
            }}
          />
          <button
            className="btn flex-shrink-0 d-flex align-items-center justify-content-center"
            onClick={() => sendMessage()}
            disabled={sending || !input.trim()}
            style={{
              width: fs ? 42 : 32,
              height: fs ? 42 : 32,
              borderRadius: fs ? 12 : 6,
              background: input.trim() ? '#6366f1' : '#e2e8f0',
              color: input.trim() ? '#fff' : '#94a3b8',
              border: 'none',
            }}
          >
            <i className="bi bi-send" style={{ fontSize: fs ? 18 : 12 }}></i>
          </button>
        </div>
      </div>
    </div>
  );
}
