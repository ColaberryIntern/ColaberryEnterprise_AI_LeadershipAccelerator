import React, { useState, useEffect, useRef, useCallback } from 'react';
import portalApi from '../../utils/portalApi';
import { useMentorContext } from '../../contexts/MentorContext';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

/* Friendly mentor face SVG — used for FAB and message avatars */
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

/* Simple markdown renderer for mentor responses */
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Headers
    if (line.startsWith('### ')) {
      elements.push(<div key={i} className="fw-bold mt-2 mb-1" style={{ fontSize: 12 }}>{line.slice(4)}</div>);
      continue;
    }
    if (line.startsWith('## ')) {
      elements.push(<div key={i} className="fw-bold mt-2 mb-1" style={{ fontSize: 13 }}>{line.slice(3)}</div>);
      continue;
    }
    if (line.startsWith('# ')) {
      elements.push(<div key={i} className="fw-bold mt-2 mb-1" style={{ fontSize: 14 }}>{line.slice(2)}</div>);
      continue;
    }

    // Numbered list
    const numMatch = line.match(/^(\d+)\.\s+(.+)/);
    if (numMatch) {
      elements.push(
        <div key={i} className="d-flex gap-2 mb-1" style={{ fontSize: 12 }}>
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
        <div key={i} className="d-flex gap-2 mb-1" style={{ fontSize: 12 }}>
          <span style={{ color: '#6366f1', marginTop: 2 }}>&bull;</span>
          <span>{renderInline(bulletMatch[1])}</span>
        </div>
      );
      continue;
    }

    // Code block start/end handled inline
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
      elements.push(<div key={i} className="mb-1" style={{ fontSize: 12 }}>{renderInline(line)}</div>);
    } else if (i > 0 && lines[i - 1].trim()) {
      elements.push(<div key={i} style={{ height: 4 }} />);
    }
  }

  return elements;
}

function renderInline(text: string): React.ReactNode {
  // Bold: **text**
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

function PortalMentorChat() {
  const {
    selectedLLM,
    setSelectedLLMById,
    llmOptions,
    lessonContext,
    isMentorOpen,
    openMentorPanel,
    closeMentorPanel,
    toggleMentorPanel,
    pendingMentorMessage,
    clearPendingMessage,
    fireMentorResponded,
    openLLMWithPrompt,
    buildPersonalizedPrompt,
  } = useMentorContext();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>([]);
  const [hasNewMessage, setHasNewMessage] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastAssistantRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const lessonId = lessonContext.lessonId || undefined;
  const isImplementationTask = lessonContext.currentSection === 'implementation_task' && !!lessonContext.implementationTaskData;

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const scrollToLastAssistant = useCallback(() => {
    if (lastAssistantRef.current) {
      lastAssistantRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  // Load history when panel opens
  useEffect(() => {
    if (!isMentorOpen) return;
    portalApi.get('/api/portal/mentor/history', {
      params: lessonId ? { lesson_id: lessonId } : {},
    }).then((res) => {
      setMessages(res.data.messages || []);
      setTimeout(scrollToBottom, 100);
    }).catch(() => {});
  }, [isMentorOpen, lessonId, scrollToBottom]);

  useEffect(() => {
    if (isMentorOpen) {
      setTimeout(scrollToLastAssistant, 100);
    }
  }, [messages, isMentorOpen, scrollToLastAssistant]);

  // Focus input when panel opens
  useEffect(() => {
    if (isMentorOpen) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isMentorOpen]);

  const sendMessage = useCallback(async (text?: string, contextType?: string) => {
    const msg = (text || input).trim();
    if (!msg || sending) return;

    const userMsg: Message = { role: 'user', content: msg, timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);
    setSuggestedPrompts([]);

    try {
      const res = await portalApi.post('/api/portal/mentor/chat', {
        message: msg,
        lesson_id: lessonId,
        context_type: contextType || undefined,
      });
      const assistantMsg: Message = {
        role: 'assistant',
        content: res.data.reply,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setSuggestedPrompts(res.data.suggested_prompts || []);
      fireMentorResponded(res.data.reply);
      if (!isMentorOpen) setHasNewMessage(true);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.', timestamp: new Date().toISOString() },
      ]);
    } finally {
      setSending(false);
    }
  }, [input, sending, lessonId, isMentorOpen]);

  // Handle pending messages from lesson components
  useEffect(() => {
    if (pendingMentorMessage && !sending) {
      sendMessage(pendingMentorMessage.message, pendingMentorMessage.contextType);
      clearPendingMessage();
    }
  }, [pendingMentorMessage, sending, sendMessage, clearPendingMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const toggleOpen = () => {
    toggleMentorPanel();
    setHasNewMessage(false);
  };


  return (
    <>
      {/* Chat Panel */}
      {isMentorOpen && (
        <div
          style={isFullscreen ? {
            position: 'fixed',
            inset: 0,
            zIndex: 1050,
            display: 'flex',
            flexDirection: 'column',
            background: '#f7f7f8',
          } : {
            position: 'fixed',
            bottom: 80,
            right: 20,
            width: 400,
            maxWidth: 'calc(100vw - 40px)',
            height: 560,
            maxHeight: 'calc(100vh - 120px)',
            zIndex: 1050,
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 16,
            overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
            border: '1px solid #e2e8f0',
            background: '#fff',
          }}
        >
          {/* Header */}
          <div
            style={{
              background: isFullscreen ? '#fff' : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              padding: isFullscreen ? '10px 20px' : '12px 16px',
              color: isFullscreen ? '#1e293b' : '#fff',
              borderBottom: isFullscreen ? '1px solid #e5e7eb' : 'none',
            }}
          >
            <div className="d-flex align-items-center justify-content-between mb-2">
              <div className="d-flex align-items-center gap-2">
                <div
                  className="d-flex align-items-center justify-content-center rounded-circle"
                  style={{ width: 32, height: 32, background: isFullscreen ? '#eef2ff' : 'rgba(255,255,255,0.25)', overflow: 'hidden' }}
                >
                  <MentorFace size={32} />
                </div>
                <div>
                  <div className="fw-semibold" style={{ fontSize: 13 }}>AI Mentor</div>
                  {!isFullscreen && (
                    <div style={{ fontSize: 10, opacity: 0.8 }}>
                      {lessonContext.lessonTitle || 'General guidance'}
                    </div>
                  )}
                </div>
              </div>
              <div className="d-flex align-items-center gap-2">
                <button
                  className={`btn btn-link p-0 ${isFullscreen ? '' : 'text-white'}`}
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                  style={isFullscreen ? { color: '#6b7280' } : {}}
                >
                  <i className={`bi ${isFullscreen ? 'bi-fullscreen-exit' : 'bi-arrows-fullscreen'}`} style={{ fontSize: 14 }}></i>
                </button>
                <button
                  className={`btn btn-link p-0 ${isFullscreen ? '' : 'text-white'}`}
                  onClick={() => closeMentorPanel()}
                  aria-label="Close mentor chat"
                  style={isFullscreen ? { color: '#6b7280' } : {}}
                >
                  <i className="bi bi-x-lg" style={{ fontSize: 16 }}></i>
                </button>
              </div>
            </div>
            {/* LLM Selector */}
            {!isFullscreen && (
              <div className="d-flex align-items-center gap-2">
                <span style={{ fontSize: 10, opacity: 0.7 }}>AI Workspace:</span>
                <select
                  className="form-select form-select-sm"
                  style={{
                    fontSize: 11,
                    padding: '2px 24px 2px 8px',
                    height: 24,
                    borderRadius: 12,
                    background: 'rgba(255,255,255,0.2)',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.3)',
                    maxWidth: 140,
                  }}
                  value={selectedLLM.id}
                  onChange={(e) => setSelectedLLMById(e.target.value)}
                >
                  {llmOptions.map(llm => (
                    <option key={llm.id} value={llm.id} style={{ color: '#1e293b' }}>{llm.name}</option>
                  ))}
                </select>
                {lessonContext.lessonId && (
                  <span
                    className="badge"
                    style={{ background: 'rgba(255,255,255,0.2)', fontSize: 9, fontWeight: 500 }}
                  >
                    <i className="bi bi-book me-1"></i>Lesson Active
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: isFullscreen ? '24px 16px' : 12,
              background: isFullscreen ? '#f7f7f8' : '#f8fafc',
            }}
          >
          <div style={isFullscreen ? { maxWidth: 768, margin: '0 auto', width: '100%' } : {}}>
            {messages.length === 0 && (
              <div className="text-center py-3">
                <div className="d-inline-block mb-2">
                  <MentorFace size={48} />
                </div>
                <p className="fw-semibold small mb-1" style={{ color: '#1e293b' }}>
                  Hi! I'm your AI Mentor.
                </p>
                <p className="small text-muted mb-3" style={{ fontSize: 12 }}>
                  Ask me anything about AI strategy, your curriculum, or how to apply concepts to your organization.
                </p>
                <div className="d-flex flex-column gap-2">
                  {[
                    'How do I get started with AI strategy?',
                    'Explain the Trust Before Intelligence framework',
                    'Help me think about AI governance',
                  ].map((prompt) => (
                    <button
                      key={prompt}
                      className="btn btn-sm text-start"
                      style={{
                        background: '#fff',
                        border: '1px solid #e2e8f0',
                        borderRadius: 8,
                        fontSize: 11,
                        color: '#475569',
                        padding: '6px 10px',
                      }}
                      onClick={() => sendMessage(prompt)}
                    >
                      <i className="bi bi-chat-quote me-1" style={{ color: '#6366f1' }}></i>
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => {
              // Attach ref to the last assistant message for scroll-to-top behavior
              const isLastAssistant = msg.role === 'assistant' && !messages.slice(i + 1).some(m => m.role === 'assistant');
              return (
              <div
                key={i}
                ref={isLastAssistant ? lastAssistantRef : undefined}
                className={`d-flex mb-3 ${msg.role === 'user' ? 'justify-content-end' : 'justify-content-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="me-2" style={{ marginTop: 2 }}>
                    <MentorAvatar size={isFullscreen ? 32 : 24} />
                  </div>
                )}
                <div
                  style={{
                    maxWidth: isFullscreen ? '100%' : '80%',
                    padding: isFullscreen ? (msg.role === 'user' ? '10px 16px' : '4px 0') : '8px 12px',
                    borderRadius: isFullscreen
                      ? (msg.role === 'user' ? 20 : 0)
                      : (msg.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px'),
                    background: msg.role === 'user' ? '#6366f1' : (isFullscreen ? 'transparent' : '#fff'),
                    color: msg.role === 'user' ? '#fff' : '#334155',
                    fontSize: isFullscreen ? 14 : 12,
                    lineHeight: 1.7,
                    boxShadow: (msg.role === 'assistant' && !isFullscreen) ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                    whiteSpace: msg.role === 'user' ? 'pre-wrap' : undefined,
                  }}
                >
                  {msg.role === 'assistant' ? renderMarkdown(msg.content) : msg.content}
                </div>
              </div>
              );
            })}

            {sending && (
              <div className="d-flex align-items-center gap-2 mb-3">
                <MentorAvatar size={24} />
                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: '12px 12px 12px 4px',
                    background: '#fff',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
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

          {/* Suggested Prompts or AI Workspace button */}
          {(suggestedPrompts.length > 0 || (isImplementationTask && messages.some(m => m.role === 'assistant'))) && (
            <div style={{ padding: isFullscreen ? '8px 16px' : '6px 12px', background: isFullscreen ? '#f7f7f8' : '#f8fafc', borderTop: '1px solid #f1f5f9' }}>
            <div style={isFullscreen ? { maxWidth: 768, margin: '0 auto' } : {}}>
              {isImplementationTask && messages.some(m => m.role === 'assistant') ? (
                <button
                  className="btn btn-sm d-flex align-items-center gap-2 w-100 justify-content-center"
                  style={{
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: '#fff',
                    borderRadius: 8,
                    fontSize: 12,
                    padding: '8px 12px',
                    fontWeight: 600,
                    border: 'none',
                  }}
                  onClick={() => {
                    const taskData = lessonContext.implementationTaskData!;
                    const lastMentorMsg = [...messages].reverse().find(m => m.role === 'assistant');
                    const prompt = `You are an AI-powered workspace coach helping a learner complete an implementation assignment for an AI Leadership course.

ASSIGNMENT: ${taskData.title}
DESCRIPTION: ${taskData.description}
DELIVERABLE: ${taskData.deliverable}

REQUIREMENTS:
${taskData.requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}

${taskData.artifacts.length > 0 ? `REQUIRED ARTIFACTS:\n${taskData.artifacts.map((a, i) => `${i + 1}. ${a.name}: ${a.description} (${a.file_types.join(', ')})\n   Criteria: ${a.validation_criteria}`).join('\n\n')}` : ''}

LESSON: ${lessonContext.lessonTitle}

MENTOR BRIEFING:
${lastMentorMsg?.content || 'No briefing available yet.'}

YOUR ROLE:
Guide the learner through completing this assignment step by step. For each artifact:
1. Explain what needs to be created
2. Help them structure the content
3. Provide templates or starting points
4. Review their work when they share it

Track progress through the requirements checklist. Be encouraging but thorough.
Start by summarizing what they need to do and ask which artifact they want to work on first.`;
                    openLLMWithPrompt(prompt);
                  }}
                  disabled={sending}
                >
                  <i className={`bi ${selectedLLM.icon}`}></i>
                  Open AI Workspace — Run in {selectedLLM.name}
                </button>
              ) : suggestedPrompts.length > 0 ? (
                <div className="d-flex flex-wrap gap-1">
                  {suggestedPrompts.map((prompt, i) => (
                    <button
                      key={i}
                      className="btn btn-sm"
                      style={{
                        background: '#eef2ff',
                        color: '#6366f1',
                        borderRadius: 12,
                        fontSize: 10,
                        padding: '3px 8px',
                        border: '1px solid #c7d2fe',
                      }}
                      onClick={() => sendMessage(prompt)}
                      disabled={sending}
                    >
                      <i className="bi bi-chat-quote me-1" style={{ fontSize: 9 }}></i>
                      {prompt}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            </div>
          )}

          {/* Input */}
          <div
            style={{
              padding: isFullscreen ? '16px 20px 24px' : '10px 12px',
              borderTop: isFullscreen ? 'none' : '1px solid #e2e8f0',
              background: isFullscreen ? '#f7f7f8' : '#fff',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: 8,
                ...(isFullscreen ? { maxWidth: 768, margin: '0 auto' } : {}),
              }}
            >
              <textarea
                ref={inputRef}
                className="form-control"
                rows={isFullscreen ? 2 : 1}
                placeholder="Ask your mentor..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={sending}
                style={{
                  borderColor: isFullscreen ? '#d1d5db' : '#e2e8f0',
                  borderRadius: isFullscreen ? 24 : 10,
                  fontSize: isFullscreen ? 14 : 12,
                  resize: 'none',
                  maxHeight: isFullscreen ? 120 : 72,
                  padding: isFullscreen ? '12px 20px' : undefined,
                  boxShadow: isFullscreen ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
                  background: isFullscreen ? '#fff' : undefined,
                }}
              />
              <button
                className="btn flex-shrink-0"
                style={{
                  width: isFullscreen ? 42 : 34,
                  height: isFullscreen ? 42 : 34,
                  borderRadius: isFullscreen ? 12 : 8,
                  background: input.trim() ? '#6366f1' : '#e2e8f0',
                  color: input.trim() ? '#fff' : '#94a3b8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: 'none',
                }}
                onClick={() => sendMessage()}
                disabled={sending || !input.trim()}
                aria-label="Send message"
              >
                <i className="bi bi-send" style={{ fontSize: isFullscreen ? 18 : 14 }}></i>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Button — Mentor face */}
      <button
        onClick={toggleOpen}
        aria-label={isMentorOpen ? 'Close mentor chat' : 'Open AI Mentor'}
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          width: 60,
          height: 60,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
          color: '#fff',
          border: '3px solid #fff',
          boxShadow: '0 4px 20px rgba(99,102,241,0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1050,
          cursor: 'pointer',
          transition: 'transform 0.2s',
          padding: 0,
          overflow: 'hidden',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.08)')}
        onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
      >
        {isMentorOpen ? (
          <i className="bi bi-x-lg" style={{ fontSize: 22 }}></i>
        ) : (
          <>
            <MentorFace size={54} />
            {hasNewMessage && (
              <span
                style={{
                  position: 'absolute',
                  top: -2,
                  right: -2,
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: '#ef4444',
                  border: '2px solid #fff',
                }}
              ></span>
            )}
          </>
        )}
      </button>
    </>
  );
}

export default PortalMentorChat;
