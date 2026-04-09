import React, { useState, useRef, useEffect } from 'react';
import portalApi from '../../utils/portalApi';

interface Message {
  role: 'user' | 'system';
  text: string;
  options?: { label: string; value: string }[];
  examples?: string;
  summary?: any;
  prompt?: any;
  action_required?: string | null;
  created_bp?: { id: string; name: string; requirements_count: number } | null;
}

export default function ArchitectChat() {
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copying, setCopying] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const startSession = async () => {
    try {
      const res = await portalApi.post('/api/portal/project/architect/start');
      setSessionId(res.data.session_id);
      setMessages([{ role: 'system', text: res.data.message, action_required: 'input' }]);
    } catch { setMessages([{ role: 'system', text: 'Could not start session. Please try again.' }]); }
  };

  const handleOpen = () => {
    setOpen(true);
    if (!sessionId) startSession();
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || !sessionId) return;
    setMessages(prev => [...prev, { role: 'user', text }]);
    setInput('');
    setLoading(true);
    try {
      const res = await portalApi.post('/api/portal/project/architect/turn', { session_id: sessionId, input: text });
      const d = res.data;
      setMessages(prev => [...prev, {
        role: 'system',
        text: d.message,
        options: d.options,
        examples: d.examples,
        summary: d.summary,
        prompt: d.prompt,
        action_required: d.action_required,
        created_bp: d.created_bp,
      }]);
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'system', text: `Error: ${err.response?.data?.error || err.message}` }]);
    } finally { setLoading(false); }
  };

  const copyPrompt = async (prompt: any) => {
    const text = prompt?.prompt_text || '';
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    }
    setCopying(true);
    setTimeout(() => setCopying(false), 2000);
  };

  const resetSession = () => {
    setSessionId(null);
    setMessages([]);
    startSession();
  };

  if (!open) {
    return (
      <button
        onClick={handleOpen}
        className="btn btn-primary shadow-lg"
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 1050,
          width: 56, height: 56, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24, border: 'none',
        }}
        title="AI Architect"
      >
        <i className="bi bi-robot"></i>
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 1050,
      width: 420, height: 540, display: 'flex', flexDirection: 'column',
      background: 'var(--color-bg, #fff)', borderRadius: 16,
      boxShadow: '0 12px 40px rgba(0,0,0,0.15)', border: '1px solid var(--color-border, #e2e8f0)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px', background: 'var(--color-primary, #1a365d)', color: '#fff',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div className="d-flex align-items-center gap-2">
          <i className="bi bi-robot" style={{ fontSize: 18 }}></i>
          <div>
            <div className="fw-semibold" style={{ fontSize: 14 }}>AI Architect</div>
            <div style={{ fontSize: 10, opacity: 0.8 }}>Build & improve with guidance</div>
          </div>
        </div>
        <div className="d-flex gap-1">
          <button className="btn btn-sm" style={{ color: '#fff', opacity: 0.7 }} onClick={resetSession} title="New session">
            <i className="bi bi-arrow-counterclockwise"></i>
          </button>
          <button className="btn btn-sm" style={{ color: '#fff', opacity: 0.7 }} onClick={() => setOpen(false)} title="Minimize">
            <i className="bi bi-dash-lg"></i>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            {/* Message bubble */}
            <div style={{
              padding: '10px 14px', borderRadius: 12, fontSize: 13, lineHeight: 1.5,
              background: msg.role === 'user' ? 'var(--color-primary, #1a365d)' : 'var(--color-bg-alt, #f7fafc)',
              color: msg.role === 'user' ? '#fff' : 'var(--color-text, #2d3748)',
              marginLeft: msg.role === 'user' ? 40 : 0,
              marginRight: msg.role === 'system' ? 40 : 0,
              whiteSpace: 'pre-wrap',
            }}>
              {msg.text}
            </div>

            {/* Option buttons */}
            {msg.options && (
              <div className="d-flex flex-wrap gap-1 mt-2" style={{ marginLeft: 4 }}>
                {msg.options.map((opt, j) => (
                  <button key={j}
                    className="btn btn-sm btn-outline-primary"
                    style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20 }}
                    onClick={() => sendMessage(opt.value)}
                    disabled={loading}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}

            {/* Examples hint */}
            {msg.examples && (
              <div className="text-muted mt-1" style={{ fontSize: 10, marginLeft: 4 }}>
                {msg.examples}
              </div>
            )}

            {/* Summary card */}
            {msg.summary && (
              <div className="mt-2 p-2" style={{ background: 'var(--color-info, #3b82f6)08', border: '1px solid var(--color-info, #3b82f6)20', borderRadius: 8, fontSize: 12 }}>
                <div className="fw-semibold mb-1" style={{ color: 'var(--color-info, #3b82f6)' }}>
                  <i className="bi bi-clipboard-check me-1"></i>Plan Summary
                </div>
                {Object.entries(msg.summary).map(([k, v]) => (
                  <div key={k} className="d-flex gap-2">
                    <span className="text-muted" style={{ minWidth: 80 }}>{k}:</span>
                    <span>{Array.isArray(v) ? (v as string[]).join(', ') : String(v)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Confirm buttons */}
            {msg.action_required === 'confirm' && (
              <div className="d-flex gap-2 mt-2" style={{ marginLeft: 4 }}>
                <button className="btn btn-sm btn-primary" onClick={() => sendMessage('confirm')} disabled={loading} style={{ fontSize: 12 }}>
                  <i className="bi bi-check-lg me-1"></i>Confirm
                </button>
                <button className="btn btn-sm btn-outline-secondary" onClick={() => sendMessage('cancel')} disabled={loading} style={{ fontSize: 12 }}>
                  Cancel
                </button>
              </div>
            )}

            {/* Prompt output */}
            {msg.prompt && !msg.prompt.error && (
              <div className="mt-2">
                <div className="p-2" style={{ background: '#1a1a2e', borderRadius: 8, maxHeight: 150, overflowY: 'auto' }}>
                  <pre style={{ color: '#a0aec0', fontSize: 10, margin: 0, whiteSpace: 'pre-wrap' }}>
                    {(msg.prompt.prompt_text || '').substring(0, 500)}...
                  </pre>
                </div>
                <button
                  className={`btn btn-sm mt-1 ${copying ? 'btn-success' : 'btn-primary'}`}
                  onClick={() => copyPrompt(msg.prompt)}
                  style={{ fontSize: 11 }}
                >
                  <i className={`bi ${copying ? 'bi-check-lg' : 'bi-clipboard'} me-1`}></i>
                  {copying ? 'Copied!' : `Copy Prompt (${(msg.prompt.prompt_text || '').length} chars)`}
                </button>
              </div>
            )}

            {/* Created BP notification */}
            {msg.created_bp && (
              <div className="mt-2 p-2" style={{ background: 'var(--color-success, #10b981)08', border: '1px solid var(--color-success, #10b981)20', borderRadius: 8, fontSize: 12 }}>
                <i className="bi bi-check-circle me-1" style={{ color: 'var(--color-success)' }}></i>
                Created "{msg.created_bp.name}" with {msg.created_bp.requirements_count} requirements
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div style={{ padding: '10px 14px', fontSize: 13, color: 'var(--color-text-light)' }}>
            <span className="spinner-border spinner-border-sm me-2" style={{ width: 12, height: 12 }}></span>
            Thinking...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--color-border, #e2e8f0)' }}>
        <div className="d-flex gap-2">
          <input
            type="text"
            className="form-control form-control-sm"
            placeholder="Describe what you want to build..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !loading && sendMessage(input)}
            disabled={loading}
            style={{ fontSize: 12, borderRadius: 20 }}
          />
          <button
            className="btn btn-sm btn-primary"
            onClick={() => sendMessage(input)}
            disabled={loading || !input.trim()}
            style={{ borderRadius: 20, padding: '4px 14px' }}
          >
            <i className="bi bi-send"></i>
          </button>
        </div>
      </div>
    </div>
  );
}
