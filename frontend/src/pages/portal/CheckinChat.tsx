import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { LiveChatMessage } from '../../services/guestCheckinApi';

/**
 * The class live chat on the follow-along page (2026-11-23).
 *
 * Ali: "setup a live chat on the page for the right hand side on a computer and a button ... from
 * phone, whichever is best UI standard." So: on a wide screen the chat is a column docked on the
 * right; on a phone (or the narrow side window) it is a Chat button with an unread count that opens
 * a full-screen panel, the usual mobile pattern. Everyone checked in sees the same chat; the class
 * assistant answers what it is sure of (backend liveChatAgent.ts) and the instructor answers the rest.
 *
 * Polls every 3 seconds, like the rest of this page. Text only, rendered as text nodes.
 * House style for new frontend files: no emoji and no dashes in the copy written here.
 */

interface Props {
  load: () => Promise<LiveChatMessage[]>;
  send: (text: string) => Promise<LiveChatMessage>;
}

const POLL_MS = 3000;
const WIDE = 1100;

function isWide(): boolean { return typeof window !== 'undefined' && window.innerWidth >= WIDE; }

function errorText(err: unknown): string {
  const e = err as { response?: { data?: { error?: string } } };
  return e?.response?.data?.error || 'Not sent. Try again.';
}

export default function CheckinChat({ load, send }: Props): React.ReactElement {
  const [messages, setMessages] = useState<LiveChatMessage[]>([]);
  const [wide, setWide] = useState(isWide);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(0);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    const onResize = () => setWide(isWide());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = () => Promise.resolve().then(load).then((m) => { if (alive && Array.isArray(m)) setMessages(m); }).catch(() => { /* next tick retries */ });
    tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => { alive = false; window.clearInterval(id); };
  }, [load]);

  const visible = wide || open;
  useEffect(() => { if (visible) setSeen(messages.length); }, [visible, messages.length]);
  useEffect(() => { if (visible) endRef.current?.scrollIntoView?.({ block: 'end' }); }, [visible, messages.length]);

  const submit = useCallback(() => {
    const t = text.trim();
    if (!t || inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    setError('');
    send(t)
      .then((m) => { setText(''); setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m])); })
      .catch((err) => setError(errorText(err)))
      .finally(() => { inFlight.current = false; setSending(false); });
  }, [send, text]);

  const unread = Math.max(0, messages.length - seen);

  const panel = (
    <div className={`cbchat-panel${wide ? ' is-docked' : ' is-sheet'}`} data-testid="chat-panel" role="region" aria-label="Class chat">
      <div className="cbchat-head">
        <b>Class chat</b>
        <span>Ask anything. The class assistant or Ali will answer.</span>
        {!wide && <button type="button" className="cbchat-close" onClick={() => setOpen(false)} data-testid="chat-close">Close</button>}
      </div>
      <div className="cbchat-list">
        {messages.length === 0 && <p className="cbchat-empty">No messages yet. Say hello.</p>}
        {messages.map((m) => (
          <div key={m.id} className={`cbchat-msg${m.kind === 'assistant' ? ' is-ai' : ''}`} data-testid={m.kind === 'assistant' ? 'chat-assistant' : 'chat-attendee'}>
            <p className="cbchat-who">{m.display_name}</p>
            <p className="cbchat-text">{m.content}</p>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {error && <p className="cbchat-error" role="alert" data-testid="chat-error">{error}</p>}
      <div className="cbchat-compose">
        <input
          type="text"
          className="cbchat-input"
          placeholder="Type a message"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          maxLength={500}
          aria-label="Chat message"
          data-testid="chat-input"
        />
        <button type="button" className="cbchat-send" onClick={submit} disabled={sending || !text.trim()} data-testid="chat-send">Send</button>
      </div>
    </div>
  );

  return (
    <>
      <style>{CBCHAT_CSS}</style>
      {wide && <style>{'.cbck-root{padding-right:380px}'}</style>}
      {visible && panel}
      {!wide && !open && (
        <button type="button" className="cbchat-fab" onClick={() => setOpen(true)} data-testid="chat-open">
          Chat{unread > 0 ? <span className="cbchat-badge">{unread}</span> : null}
        </button>
      )}
    </>
  );
}

const CBCHAT_CSS = `
.cbchat-panel{ display:flex; flex-direction:column; background:var(--surface-card); text-align:left; z-index:80; }
.cbchat-panel.is-docked{ position:fixed; top:0; right:0; bottom:0; width:360px; border-left:1px solid var(--border-subtle); box-shadow:-8px 0 24px rgba(26,32,44,.06); }
.cbchat-panel.is-sheet{ position:fixed; inset:0; }
.cbchat-head{ padding:14px 16px 10px; border-bottom:1px solid var(--border-subtle); position:relative; }
.cbchat-head b{ display:block; font-size:16px; color:var(--text-strong); }
.cbchat-head span{ display:block; font-size:12.5px; color:var(--text-muted); margin-top:2px; padding-right:70px; }
.cbchat-close{ position:absolute; top:12px; right:12px; border:1px solid var(--border-subtle); background:var(--surface-subtle); border-radius:999px; padding:6px 12px; font-weight:700; cursor:pointer; }
.cbchat-list{ flex:1; overflow-y:auto; padding:12px 14px; display:flex; flex-direction:column; gap:10px; }
.cbchat-empty{ color:var(--text-muted); font-size:14px; }
.cbchat-msg{ background:var(--surface-subtle); border:1px solid var(--border-subtle); border-radius:12px; padding:8px 11px; }
.cbchat-msg.is-ai{ background:#eef6ff; border-color:#c9defc; }
.cbchat-who{ margin:0 0 2px; font-size:12px; font-weight:800; color:var(--text-muted); }
.cbchat-msg.is-ai .cbchat-who{ color:#1d4fd8; }
.cbchat-text{ margin:0; font-size:14.5px; line-height:1.45; color:var(--text-body); white-space:pre-wrap; overflow-wrap:anywhere; }
.cbchat-error{ margin:0; padding:6px 14px; color:var(--status-danger, #C20E1E); font-size:13px; font-weight:600; }
.cbchat-compose{ display:flex; gap:8px; padding:10px 12px; border-top:1px solid var(--border-subtle); }
.cbchat-input{ flex:1; min-width:0; min-height:46px; border-radius:12px; border:1px solid var(--border-subtle); padding:0 12px; font:inherit; font-size:15px; }
.cbchat-send{ min-height:46px; padding:0 16px; border:none; border-radius:12px; background:var(--brand-accent, #E5121D); color:#fff; font-weight:800; cursor:pointer; }
.cbchat-send:disabled{ opacity:.5; cursor:default; }
.cbchat-fab{ position:fixed; right:16px; bottom:18px; z-index:79; min-height:52px; padding:0 20px; border:none; border-radius:999px; background:#1f2937; color:#fff; font-weight:800; font-size:16px; box-shadow:0 10px 24px rgba(26,32,44,.3); cursor:pointer; display:flex; align-items:center; gap:8px; }
.cbchat-badge{ min-width:22px; height:22px; border-radius:999px; background:var(--brand-accent, #E5121D); font-size:12px; display:inline-flex; align-items:center; justify-content:center; padding:0 6px; }
`;
