import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DmMessage, fetchDmMessages, sendDmMessage, myEnrollmentId } from '../../../services/dmApi';

// A compact Facebook-style chat window docked bottom-right. One per open
// conversation. Polls every 3s for new messages (async/offline-capable — the
// backend persists every message), optimistic send.
export interface DmTarget {
  roomId: string;
  name: string;
  color: string;
}

const ChatDock: React.FC<{ target: DmTarget; onClose: () => void }> = ({ target, onClose }) => {
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [minimized, setMinimized] = useState(false);
  const sinceRef = useRef<string | undefined>(undefined);
  const endRef = useRef<HTMLDivElement | null>(null);
  const meRef = useRef<string | null>(myEnrollmentId());

  const poll = useCallback(() => {
    fetchDmMessages(target.roomId, sinceRef.current)
      .then((incoming) => {
        if (incoming.length === 0) return;
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const fresh = incoming.filter((m) => !seen.has(m.id));
          if (fresh.length === 0) return prev;
          sinceRef.current = fresh[fresh.length - 1].created_at;
          return [...prev, ...fresh];
        });
      })
      .catch(() => { /* keep last */ });
  }, [target.roomId]);

  useEffect(() => {
    poll();
    const id = window.setInterval(poll, 3000);
    return () => window.clearInterval(id);
  }, [poll]);

  useEffect(() => {
    if (!minimized) endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, minimized]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    sendDmMessage(target.roomId, text)
      .then((m) => {
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        sinceRef.current = m.created_at;
      })
      .catch(() => setDraft(text)); // restore on failure
  };

  return (
    <div className={`te-dmwin${minimized ? ' min' : ''}`}>
      <div className="te-dm-head" onClick={() => setMinimized((v) => !v)}>
        <span className="te-dm-av" style={{ background: target.color }}>{target.name.slice(0, 1).toUpperCase()}</span>
        <b>{target.name}</b>
        <button type="button" className="te-dm-x" onClick={(e) => { e.stopPropagation(); onClose(); }} aria-label="Close chat">✕</button>
      </div>
      {!minimized && (
        <>
          <div className="te-dm-body">
            {messages.length === 0 && <div className="te-dm-empty">Say hi 👋</div>}
            {messages.map((m) => (
              <div key={m.id} className={`te-dm-msg${m.enrollment_id === meRef.current ? ' mine' : ''}`}>{m.content}</div>
            ))}
            <div ref={endRef} />
          </div>
          <div className="te-dm-composer">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Message…"
              maxLength={4000}
              aria-label={`Message ${target.name}`}
            />
            <button type="button" onClick={send} disabled={!draft.trim()}>Send</button>
          </div>
        </>
      )}
    </div>
  );
};

export default ChatDock;
