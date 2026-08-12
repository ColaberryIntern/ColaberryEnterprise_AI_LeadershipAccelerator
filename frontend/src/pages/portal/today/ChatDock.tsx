import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DmMessage, fetchDmMessages, sendDmMessage, sendTyping, myEnrollmentId } from '../../../services/dmApi';

// A compact Facebook-style chat window docked bottom-right. One per open
// conversation. Polls every 3s for new messages (async/offline-capable — the
// backend persists every message), optimistic send with delivery ticks, a
// typing indicator, and a client-side retry queue for failed sends.
export interface DmTarget {
  roomId: string;
  name: string;
  color: string;
}

interface QueuedMessage {
  clientId: string;
  content: string;
  status: 'sending' | 'failed';
}

const TYPING_THROTTLE_MS = 2500;

function newClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // RFC4122-ish v4 fallback for older runtimes without crypto.randomUUID —
  // still needs to pass the backend's z.string().uuid() check.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const ChatDock: React.FC<{ target: DmTarget; onClose: () => void }> = ({ target, onClose }) => {
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [queue, setQueue] = useState<QueuedMessage[]>([]);
  const [peerTyping, setPeerTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const [minimized, setMinimized] = useState(false);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const sinceRef = useRef<string | undefined>(undefined);
  const endRef = useRef<HTMLDivElement | null>(null);
  const meRef = useRef<string | null>(myEnrollmentId());
  const queueRef = useRef<QueuedMessage[]>([]);
  const lastTypingSentRef = useRef(0);

  useEffect(() => { queueRef.current = queue; }, [queue]);

  const attemptSend = useCallback((clientId: string, content: string) => {
    setQueue((prev) => prev.map((q) => (q.clientId === clientId ? { ...q, status: 'sending' } : q)));
    sendDmMessage(target.roomId, content, clientId)
      .then((m) => {
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        sinceRef.current = m.created_at;
        setQueue((prev) => prev.filter((q) => q.clientId !== clientId));
      })
      .catch(() => {
        setQueue((prev) => prev.map((q) => (q.clientId === clientId ? { ...q, status: 'failed' } : q)));
      });
  }, [target.roomId]);

  const poll = useCallback(() => {
    fetchDmMessages(target.roomId, sinceRef.current)
      .then(({ messages: incoming, peerTyping: pt }) => {
        setPeerTyping(pt);
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

  // Reconnect handling: reflect real connectivity, and auto-retry anything
  // that failed while we were offline the moment we're back.
  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      queueRef.current.filter((q) => q.status === 'failed').forEach((q) => attemptSend(q.clientId, q.content));
    };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [attemptSend]);

  useEffect(() => {
    if (!minimized) endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, queue, minimized]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    const clientId = newClientId();
    setQueue((prev) => [...prev, { clientId, content: text, status: 'sending' }]);
    attemptSend(clientId, text);
  };

  const onDraftChange = (v: string) => {
    setDraft(v);
    const now = Date.now();
    if (v.trim() && now - lastTypingSentRef.current > TYPING_THROTTLE_MS) {
      lastTypingSentRef.current = now;
      sendTyping(target.roomId).catch(() => { /* best-effort UX nicety, never fatal */ });
    }
  };

  const mine = meRef.current;

  return (
    <div className={`te-dmwin${minimized ? ' min' : ''}`}>
      <div className="te-dm-head" onClick={() => setMinimized((v) => !v)}>
        <span className="te-dm-av" style={{ background: target.color }}>{target.name.slice(0, 1).toUpperCase()}</span>
        <b>{target.name}</b>
        <button type="button" className="te-dm-x" onClick={(e) => { e.stopPropagation(); onClose(); }} aria-label="Close chat">✕</button>
      </div>
      {!minimized && (
        <>
          {!online && (
            <div className="te-dm-offline-banner">Reconnecting — messages are queued and will send automatically.</div>
          )}
          <div className="te-dm-body">
            {messages.length === 0 && queue.length === 0 && <div className="te-dm-empty">Say hi 👋</div>}
            {messages.map((m) => (
              <div key={m.id} className={`te-dm-msg${m.enrollment_id === mine ? ' mine' : ''}`}>
                {m.content}
                {m.enrollment_id === mine && m.delivery_state && (
                  <span className={`te-dm-tick${m.delivery_state === 'delivered' ? ' delivered' : ''}`} aria-hidden="true">
                    {m.delivery_state === 'delivered' ? '✓✓' : '✓'}
                  </span>
                )}
              </div>
            ))}
            {queue.map((q) => (
              <div key={q.clientId} className="te-dm-msg mine queued">
                {q.content}
                {q.status === 'sending' && <span className="te-dm-tick sending" aria-hidden="true">⏳</span>}
                {q.status === 'failed' && (
                  <button type="button" className="te-dm-retry" onClick={() => attemptSend(q.clientId, q.content)}>
                    Couldn't send · Retry
                  </button>
                )}
              </div>
            ))}
            {peerTyping && (
              <div className="te-dm-typing" aria-live="polite">
                <span className="te-dm-typing-dots"><i /><i /><i /></span>
                {target.name} is typing…
              </div>
            )}
            <div ref={endRef} />
          </div>
          <div className="te-dm-composer">
            <input
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Message…"
              maxLength={4000}
              aria-label={`Message ${target.name}`}
              disabled={!online}
            />
            <button type="button" onClick={send} disabled={!draft.trim() || !online}>Send</button>
          </div>
        </>
      )}
    </div>
  );
};

export default ChatDock;
