import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import portalApi from '../../utils/portalApi';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ChatMsg {
  id: string;
  sender_name: string;
  content: string;
  created_at: string;
  enrollment_id: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const AVATAR_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#14b8a6'];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function avatarColor(name: string): string {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

/* ------------------------------------------------------------------ */
/*  useCountdown hook                                                  */
/* ------------------------------------------------------------------ */

function useCountdown(targetDate: string | null): { days: number; hours: number; minutes: number; seconds: number; totalMs: number } | null {
  const [timeLeft, setTimeLeft] = useState<{ days: number; hours: number; minutes: number; seconds: number; totalMs: number } | null>(null);

  useEffect(() => {
    if (!targetDate) return;
    const update = () => {
      const diff = new Date(targetDate).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft(null); return; }
      setTimeLeft({
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((diff / (1000 * 60)) % 60),
        seconds: Math.floor((diff / 1000) % 60),
        totalMs: diff,
      });
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  return timeLeft;
}

/* ------------------------------------------------------------------ */
/*  Collapsible Section                                                */
/* ------------------------------------------------------------------ */

function CollapsibleSection({ title, icon, children, defaultOpen = false }: {
  title: string;
  icon: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card border-0 shadow-sm mb-3">
      <div
        className="card-header bg-white border-bottom d-flex align-items-center justify-content-between"
        style={{ padding: '12px 16px', cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setOpen(!open)}
        role="button"
        aria-expanded={open}
      >
        <span className="fw-semibold small" style={{ color: '#1e293b' }}>
          <i className={`bi ${icon} me-2`}></i>{title}
        </span>
        <i className={`bi bi-chevron-${open ? 'up' : 'down'} small`} style={{ color: '#94a3b8' }}></i>
      </div>
      {open && <div className="card-body">{children}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Chat Panel                                                         */
/* ------------------------------------------------------------------ */

function SessionChatPanel({ sessionId }: { sessionId: string }) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [activeCount, setActiveCount] = useState(0);
  const sinceRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Poll for new messages
  useEffect(() => {
    let mounted = true;

    const poll = async () => {
      try {
        const params: Record<string, string> = {};
        if (sinceRef.current) params.since = sinceRef.current;
        const res = await portalApi.get(`/api/portal/sessions/${sessionId}/chat`, { params });
        if (!mounted) return;
        const newMsgs: ChatMsg[] = res.data.messages || [];
        if (res.data.active_count != null) setActiveCount(res.data.active_count);
        if (newMsgs.length > 0) {
          setMessages(prev => {
            const existingIds = new Set(prev.map(m => m.id));
            const unique = newMsgs.filter(m => !existingIds.has(m.id));
            return unique.length > 0 ? [...prev, ...unique] : prev;
          });
          sinceRef.current = newMsgs[newMsgs.length - 1].created_at;
          setTimeout(scrollToBottom, 50);
        }
      } catch {
        // silent — chat is best-effort
      }
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => { mounted = false; clearInterval(interval); };
  }, [sessionId, scrollToBottom]);

  const handleSend = async () => {
    const content = input.trim();
    if (!content || sending) return;

    const optimistic: ChatMsg = {
      id: `opt-${Date.now()}`,
      sender_name: 'You',
      content,
      created_at: new Date().toISOString(),
      enrollment_id: '',
    };
    setMessages(prev => [...prev, optimistic]);
    setInput('');
    setTimeout(scrollToBottom, 50);

    setSending(true);
    try {
      const res = await portalApi.post(`/api/portal/sessions/${sessionId}/chat`, { content });
      const saved = res.data.message;
      if (saved) {
        setMessages(prev => prev.map(m =>
          m.id === optimistic.id ? { ...saved, id: saved.id || optimistic.id } : m
        ));
        if (saved.created_at) sinceRef.current = saved.created_at;
      }
    } catch {
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
      setInput(content);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      className="card border-0 shadow-sm d-flex flex-column"
      style={{ height: '100%', minHeight: 400 }}
    >
      {/* Header */}
      <div
        className="card-header bg-white border-bottom d-flex align-items-center justify-content-between"
        style={{ padding: '12px 16px', flexShrink: 0 }}
      >
        <span className="fw-semibold small" style={{ color: '#1e293b' }}>
          <i className="bi bi-chat-dots me-2" style={{ color: '#6366f1' }}></i>Session Chat
        </span>
        {activeCount > 0 && (
          <span className="badge" style={{ background: '#ecfdf5', color: '#10b981', fontSize: 11 }}>
            <span style={{
              display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
              background: '#10b981', marginRight: 4, verticalAlign: 'middle',
            }}></span>
            {activeCount} online
          </span>
        )}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', background: '#f8fafc' }}>
        {messages.length === 0 && (
          <div className="text-center py-5">
            <i className="bi bi-chat-text" style={{ fontSize: 32, color: '#cbd5e1' }}></i>
            <p className="small mt-2" style={{ color: '#94a3b8' }}>No messages yet. Start the conversation!</p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className="d-flex gap-2 mb-3">
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: avatarColor(msg.sender_name),
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 600, flexShrink: 0,
            }}>
              {initials(msg.sender_name)}
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="d-flex align-items-baseline gap-2">
                <span className="small fw-semibold" style={{ color: '#1e293b' }}>{msg.sender_name}</span>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>{relativeTime(msg.created_at)}</span>
              </div>
              <div className="small" style={{ color: '#334155', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {msg.content}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        className="border-top d-flex align-items-end gap-2"
        style={{ padding: '10px 12px', flexShrink: 0, background: '#fff' }}
      >
        <textarea
          ref={textareaRef}
          className="form-control form-control-sm"
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value.slice(0, 500))}
          onKeyDown={handleKeyDown}
          rows={1}
          maxLength={500}
          style={{ resize: 'none', borderRadius: 8, fontSize: 13, border: '1px solid #e2e8f0' }}
        />
        <button
          className="btn btn-sm"
          onClick={handleSend}
          disabled={!input.trim() || sending}
          style={{
            background: input.trim() ? '#6366f1' : '#e2e8f0',
            color: input.trim() ? '#fff' : '#94a3b8',
            borderRadius: 8, border: 'none', padding: '6px 14px',
            fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap',
          }}
        >
          {sending ? (
            <span className="spinner-border spinner-border-sm" role="status">
              <span className="visually-hidden">Sending...</span>
            </span>
          ) : 'Send'}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Pulse animation styles (injected once into DOM)                    */
/* ------------------------------------------------------------------ */

const PULSE_STYLE_ID = 'session-pulse-keyframes';
function ensurePulseStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(PULSE_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = PULSE_STYLE_ID;
  style.textContent = `
    @keyframes session-pulse-border {
      0%, 100% { border-color: #ef4444; }
      50% { border-color: transparent; }
    }
    @keyframes session-live-dot {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
  `;
  document.head.appendChild(style);
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

function PortalSessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<any>(null);
  const [readiness, setReadiness] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { ensurePulseStyles(); }, []);

  useEffect(() => {
    Promise.all([
      portalApi.get(`/api/portal/sessions/${id}`),
      portalApi.get(`/api/portal/curriculum/session-readiness/${id}`).catch(() => ({ data: null })),
    ])
      .then(([sesRes, rdyRes]) => {
        setSession(sesRes.data);
        setReadiness(rdyRes.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border" style={{ color: '#6366f1' }} role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (!session) {
    return <div className="alert alert-danger">Session not found.</div>;
  }

  const { session: s, attendance_status, submissions } = session;
  const materials = s.materials_json || [];
  const curriculum = s.curriculum_json || [];
  const isUpcoming = s.status === 'scheduled';
  const isLive = s.status === 'live';
  const isCompleted = s.status === 'completed';
  const countdownTarget = isUpcoming ? `${s.session_date}T${s.start_time || '09:00'}:00` : null;
  const countdown = useCountdown(countdownTarget);
  const isUnder5Min = countdown ? countdown.totalMs < 5 * 60 * 1000 : false;

  return (
    <>
      {/* Mobile-only responsive override for chat wrapper */}
      <style>{`
        @media (max-width: 991.98px) {
          .session-chat-sticky-wrapper {
            position: static !important;
            height: auto !important;
            max-height: 400px !important;
          }
        }
      `}</style>

      {/* Back button */}
      <Link
        to="/portal/sessions"
        className="btn btn-sm mb-3"
        style={{ background: '#f1f5f9', color: '#475569', borderRadius: 6, fontSize: 13 }}
      >
        <i className="bi bi-arrow-left me-1"></i>Back to Sessions
      </Link>

      <div className="row g-4">
        {/* ============ LEFT COLUMN ============ */}
        <div className="col-lg-7">

          {/* Session Header Card */}
          <div
            className="card border-0 shadow-sm mb-4"
            style={{ background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)' }}
          >
            <div className="card-body py-4 text-white">
              <div className="d-flex align-items-center gap-2 mb-2 flex-wrap">
                <span className="badge" style={{ background: 'rgba(255,255,255,0.2)', fontSize: 11 }}>
                  #{s.session_number}
                </span>
                <span
                  className={`badge ${isCompleted ? 'bg-success' : isLive ? 'bg-danger' : ''}`}
                  style={isUpcoming ? { background: 'rgba(255,255,255,0.2)' } : {}}
                >
                  {s.status}
                </span>
                {s.session_type === 'lab' && (
                  <span className="badge bg-warning text-dark">Lab</span>
                )}
              </div>
              <h4 className="fw-bold mb-1">{s.title}</h4>
              <p className="small mb-0" style={{ opacity: 0.8 }}>
                {s.session_date} &middot; {s.start_time} - {s.end_time} ET
              </p>
            </div>
          </div>

          {/* Countdown Timer */}
          {countdown && (
            <div
              className="card border-0 shadow-sm mb-4"
              style={isUnder5Min ? {
                border: '2px solid #ef4444',
                animation: 'session-pulse-border 1.5s ease-in-out infinite',
              } : {}}
            >
              <div className="card-body text-center py-3">
                <div className="small text-muted mb-2">Session starts in</div>
                <div className="d-flex justify-content-center gap-2">
                  {[
                    { value: countdown.days, label: 'Days' },
                    { value: countdown.hours, label: 'Hrs' },
                    { value: countdown.minutes, label: 'Min' },
                    { value: countdown.seconds, label: 'Sec' },
                  ].map((unit) => (
                    <div
                      key={unit.label}
                      className="text-center"
                      style={{
                        background: '#f8fafc', borderRadius: 8,
                        padding: '10px 16px', minWidth: 60,
                        border: `1px solid ${isUnder5Min ? '#fecaca' : '#e2e8f0'}`,
                      }}
                    >
                      <div className="fw-bold" style={{ fontSize: 24, color: isUnder5Min ? '#ef4444' : '#6366f1' }}>
                        {String(unit.value).padStart(2, '0')}
                      </div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>{unit.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Google Meet Card */}
          {s.meeting_link && (
            <div className="card border-0 shadow-sm mb-4">
              <div className="card-body" style={{ padding: '20px 24px' }}>

                {/* Scheduled — Waiting Room */}
                {isUpcoming && (
                  <div className="text-center">
                    <i className="bi bi-camera-video" style={{ fontSize: 36, color: '#94a3b8' }}></i>
                    <h6 className="fw-semibold mt-2 mb-1" style={{ color: '#475569' }}>Waiting Room</h6>
                    <p className="small mb-3" style={{ color: '#94a3b8' }}>
                      {countdown
                        ? `Starts in ${countdown.days > 0 ? countdown.days + 'd ' : ''}${countdown.hours}h ${countdown.minutes}m`
                        : 'Starting soon...'}
                    </p>
                    <button
                      className="btn btn-sm px-4"
                      disabled
                      style={{
                        background: '#e2e8f0', color: '#94a3b8',
                        borderRadius: 8, border: 'none', fontWeight: 600,
                      }}
                    >
                      Join when session starts
                    </button>
                  </div>
                )}

                {/* Live — Join Now */}
                {isLive && (
                  <div className="text-center">
                    <div className="d-flex align-items-center justify-content-center gap-2 mb-3">
                      <span style={{
                        display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                        background: '#10b981',
                        animation: 'session-live-dot 1.5s ease-in-out infinite',
                      }}></span>
                      <span className="fw-semibold" style={{ color: '#10b981', fontSize: 14 }}>
                        Session is Live
                      </span>
                    </div>
                    <button
                      className="btn btn-sm px-5 py-2"
                      onClick={() => window.open(s.meeting_link, '_blank', 'noopener,noreferrer')}
                      style={{
                        background: '#ef4444', color: '#fff',
                        borderRadius: 10, border: 'none',
                        fontWeight: 700, fontSize: 15,
                      }}
                    >
                      <i className="bi bi-camera-video-fill me-2"></i>Join Google Meet
                    </button>
                    <p className="small mt-2 mb-0" style={{ color: '#94a3b8', fontSize: 11 }}>
                      Opens in a new window
                    </p>
                  </div>
                )}

                {/* Completed */}
                {isCompleted && (
                  <div className="text-center">
                    <i className="bi bi-check-circle" style={{ fontSize: 36, color: '#10b981' }}></i>
                    <h6 className="fw-semibold mt-2 mb-1" style={{ color: '#475569' }}>Session Complete</h6>
                    {s.recording_url && (
                      <a
                        href={s.recording_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-sm px-4 mt-2"
                        style={{
                          background: '#f1f5f9', color: '#475569',
                          borderRadius: 8, border: 'none', fontWeight: 600, fontSize: 13,
                        }}
                      >
                        <i className="bi bi-play-circle me-1"></i>Watch Recording
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Readiness Checklist */}
          {readiness && readiness.checklist && readiness.checklist.length > 0 && (
            <div
              className="card border-0 shadow-sm mb-4"
              style={{ borderLeft: `4px solid ${readiness.ready ? '#10b981' : '#f59e0b'}` }}
            >
              <div
                className="card-header bg-white border-bottom d-flex align-items-center justify-content-between"
                style={{ padding: '12px 16px' }}
              >
                <span className="fw-semibold small" style={{ color: '#1e293b' }}>
                  <i className="bi bi-list-check me-2"></i>Session Requirements
                </span>
                {readiness.ready ? (
                  <span className="badge" style={{ background: '#ecfdf5', color: '#10b981', fontSize: 11 }}>
                    <i className="bi bi-check-circle me-1"></i>All met
                  </span>
                ) : (
                  <span className="badge" style={{ background: '#fffbeb', color: '#f59e0b', fontSize: 11 }}>
                    <i className="bi bi-exclamation-triangle me-1"></i>Incomplete
                  </span>
                )}
              </div>
              <div className="card-body">
                {readiness.checklist.map((item: any, i: number) => (
                  <div key={i} className="d-flex align-items-center gap-2 mb-2">
                    <i
                      className={`bi ${item.met ? 'bi-check-circle-fill' : 'bi-circle'}`}
                      style={{ color: item.met ? '#10b981' : '#94a3b8', fontSize: 16 }}
                    ></i>
                    <span className="small" style={{ color: item.met ? '#334155' : '#64748b' }}>
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Collapsible: Description */}
          {s.description && (
            <CollapsibleSection title="Description" icon="bi-text-paragraph" defaultOpen>
              <p className="mb-0" style={{ color: '#334155', fontSize: 14 }}>{s.description}</p>
            </CollapsibleSection>
          )}

          {/* Collapsible: Topics */}
          {curriculum.length > 0 && (
            <CollapsibleSection title="Topics" icon="bi-book" defaultOpen>
              <ul className="mb-0">
                {curriculum.map((item: any, i: number) => (
                  <li key={i} className="small mb-1">
                    {typeof item === 'string' ? item : item.title || item.topic || JSON.stringify(item)}
                  </li>
                ))}
              </ul>
            </CollapsibleSection>
          )}

          {/* Collapsible: Materials */}
          {materials.length > 0 && (
            <CollapsibleSection title="Materials" icon="bi-file-earmark">
              <ul className="mb-0">
                {materials.map((m: any, i: number) => (
                  <li key={i} className="small mb-1">
                    {m.url ? (
                      <a href={m.url} target="_blank" rel="noopener noreferrer">{m.title || m.url}</a>
                    ) : (
                      m.title || JSON.stringify(m)
                    )}
                  </li>
                ))}
              </ul>
            </CollapsibleSection>
          )}

          {/* Collapsible: Attendance */}
          {attendance_status && (
            <CollapsibleSection title="Your Attendance" icon="bi-person-check">
              <span
                className={`badge bg-${
                  attendance_status === 'present' ? 'success'
                    : attendance_status === 'late' ? 'warning'
                    : attendance_status === 'excused' ? 'info'
                    : 'danger'
                }`}
              >
                {attendance_status}
              </span>
            </CollapsibleSection>
          )}

          {/* Collapsible: Submissions */}
          {submissions && submissions.length > 0 && (
            <CollapsibleSection title="Your Submissions" icon="bi-file-earmark-text">
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead className="table-light">
                    <tr>
                      <th className="small">Title</th>
                      <th className="small">Type</th>
                      <th className="small">Status</th>
                      <th className="small">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {submissions.map((sub: any) => (
                      <tr key={sub.id}>
                        <td className="small">{sub.title}</td>
                        <td className="small">
                          <span className="badge bg-info">{sub.assignment_type.replace('_', ' ')}</span>
                        </td>
                        <td className="small">
                          <span className={`badge bg-${sub.status === 'reviewed' ? 'success' : sub.status === 'submitted' ? 'primary' : 'secondary'}`}>
                            {sub.status}
                          </span>
                        </td>
                        <td className="small">{sub.score != null ? `${sub.score}%` : '--'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CollapsibleSection>
          )}
        </div>

        {/* ============ RIGHT COLUMN — Chat ============ */}
        <div className="col-lg-5">
          <div
            className="session-chat-sticky-wrapper"
            style={{ position: 'sticky', top: 20, height: 'calc(100vh - 120px)' }}
          >
            <SessionChatPanel sessionId={id!} />
          </div>
        </div>
      </div>
    </>
  );
}

export default PortalSessionDetailPage;
