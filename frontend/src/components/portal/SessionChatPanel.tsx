import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  askSessionQuestion, getSessionChat, MAX_CHAT_LENGTH,
  type SessionChatLine, type SessionChatResult,
} from '../../services/onboardingApi';

/**
 * The class chat on the desktop live workspace — DOC 04's "Chat/Builder Room".
 *
 * THIS IS THE FIRST THING THAT HAS EVER READ THIS THREAD. `POST .../chat` has been live for
 * months behind "Ask a question" on the check-in page; `GET .../chat` shipped beside it and
 * no surface in `frontend/src` has ever called it. Students have been writing into a channel
 * only the instructor's deck could see. That is the third instance of the
 * declared-but-unreachable pattern this subsystem keeps producing (the spec's §8 finding 2),
 * and it is the one a viewer notices, because asking a question and watching nothing happen
 * reads as the feature being broken.
 *
 * WHY THE SESSION CHAT AND NOT A COMMUNITY ROOM. `community_rooms` is the richer chat and it
 * even carries `linked_live_session_id`, but the instructor's live deck reads
 * `session_chat_messages`. A question posted anywhere else would be invisible to the person
 * it is addressed to, which is worse than no chat at all.
 *
 * WHAT IS NEWLY VISIBLE, AND WHY THAT IS CONTAINED. Giving the thread a reader means
 * classmates can now see each other's messages. This panel renders only when a broadcast
 * occurrence for the session is airing — a capability no session has used yet — so there is
 * no back catalogue of questions written in the belief that only an instructor would read
 * them. Going forward the composer says plainly who can see what, which is the part that was
 * actually missing. Whether a class chat should be visible to the class at all is Ali's call,
 * and it is reversible: this component is the only reader.
 *
 * A DROPPED READ DOES NOT BLANK THE THREAD. Mid-class, an empty chat reads as "the class
 * ended". A 404 is different: it means this viewer's cohort does not own the session and the
 * answer will never change, so the panel disappears instead of retrying forever.
 */

export interface SessionChatPanelProps {
  sessionId: string;
  /** Injected in tests. Production reads the real session chat. */
  loadThread?: (sessionId: string) => Promise<SessionChatResult>;
  sendMessage?: (sessionId: string, text: string) => Promise<void>;
}

/**
 * Slower than the companion deck's 2.5s. The deck is polling a single small object; this
 * pulls up to a hundred messages, and a class chat does not need sub-second latency to feel
 * live. 5s matches the producer strip for the same reason.
 */
const POLL_MS = 5000;

/** Start warning about the limit before the Send button goes away under someone's hand. */
const COUNTER_FROM = MAX_CHAT_LENGTH - 80;

/** The viewer's own clock: a class chat timestamp is read where it is read. */
function clock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function SessionChatPanel({
  sessionId, loadThread, sendMessage,
}: SessionChatPanelProps): React.ReactElement | null {
  const read = loadThread ?? getSessionChat;
  const send = sendMessage ?? askSessionQuestion;

  const [messages, setMessages] = useState<SessionChatLine[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  const [readFailed, setReadFailed] = useState(false);
  /** One successful read is what entitles this panel to exist. See ProducerStrip. */
  const [everRead, setEverRead] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  const listRef = useRef<HTMLDivElement | null>(null);
  /**
   * Follow the bottom only while the viewer is already there. Scrolling someone back down
   * while they are reading up the thread is the single most annoying thing a chat can do.
   */
  const pinned = useRef(true);
  /**
   * The send gate, and it is a REF rather than the `sending` state on purpose. React batches,
   * so two clicks in the same tick both read `sending === false` out of the same closure and
   * both post — a double-click on Send posts the message twice, and nothing downstream
   * deduplicates it. A ref is written synchronously, so the second click sees it. `sending`
   * still drives the label and the disabled attribute; this is what actually stops the write.
   */
  const inFlight = useRef(false);

  const refresh = useCallback(async (): Promise<void> => {
    const next = await read(sessionId);
    if (next.outcome === 'forbidden') { setForbidden(true); return; }
    if (next.outcome === 'failed') { setReadFailed(true); return; }
    setMessages(next.messages);
    setActiveCount(next.active_count);
    setReadFailed(false);
    setEverRead(true);
  }, [read, sessionId]);

  useEffect(() => {
    if (!sessionId || forbidden) return undefined;
    let alive = true;
    const tick = () => { if (alive) void refresh(); };
    tick();
    const timer = window.setInterval(tick, POLL_MS);
    return () => { alive = false; window.clearInterval(timer); };
  }, [sessionId, refresh, forbidden]);

  useEffect(() => {
    const el = listRef.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const onScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }, []);

  const submit = useCallback(() => {
    const text = draft.trim();
    if (!text || text.length > MAX_CHAT_LENGTH || inFlight.current) return;

    inFlight.current = true;
    setSending(true);
    setSendFailed(false);
    // Cleared optimistically so the box is ready for the next line, and RESTORED on failure:
    // silently eating what somebody typed during a class is unforgivable.
    setDraft('');
    send(sessionId, text).then(
      () => { inFlight.current = false; setSending(false); void refresh(); },
      () => {
        inFlight.current = false;
        setSending(false);
        setSendFailed(true);
        setDraft(text);
      },
    );
  }, [draft, send, sessionId, refresh]);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends, Shift+Enter breaks the line — the convention every chat the audience
    // already uses follows.
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  }, [submit]);

  if (forbidden || !everRead) return null;

  const remaining = MAX_CHAT_LENGTH - draft.length;
  const tooLong = remaining < 0;

  return (
    <section className="schat" data-testid="session-chat">
      <style>{SCHAT_CSS}</style>

      <header className="schat-head">
        <h2 className="schat-title">Class chat</h2>
        {activeCount > 0 && (
          <span className="schat-active" data-testid="session-chat-active">
            {activeCount} talking
          </span>
        )}
      </header>

      <div
        className="schat-list"
        ref={listRef}
        onScroll={onScroll}
        role="log"
        aria-label="Class chat messages"
        data-testid="session-chat-list"
      >
        {messages.length === 0 ? (
          <p className="schat-empty" data-testid="session-chat-empty">
            No questions yet. Ask the first one.
          </p>
        ) : (
          messages.map((m) => (
            <article className="schat-msg" key={m.id}>
              <p className="schat-who">
                <span className="schat-name">{m.sender_name}</span>
                <span className="schat-time">{clock(m.created_at)}</span>
              </p>
              <p className="schat-body">{m.content}</p>
            </article>
          ))
        )}
      </div>

      {readFailed && (
        <p className="schat-note" data-testid="session-chat-stale">
          Reconnecting&hellip; showing the last messages we have.
        </p>
      )}

      <div className="schat-compose">
        <label className="schat-sr" htmlFor="schat-input">Ask the class a question</label>
        <textarea
          id="schat-input"
          className="schat-input"
          value={draft}
          onChange={(e) => { setDraft(e.target.value); }}
          onKeyDown={onKeyDown}
          placeholder="Ask a question&hellip;"
          rows={2}
          data-testid="session-chat-input"
        />
        <div className="schat-actions">
          <p className="schat-privacy">
            Everyone in this class sees your name and message.
          </p>
          {draft.length >= COUNTER_FROM && (
            <span
              className={`schat-count${tooLong ? ' is-over' : ''}`}
              data-testid="session-chat-count"
            >
              {remaining}
            </span>
          )}
          <button
            type="button"
            className="schat-send"
            onClick={submit}
            disabled={sending || tooLong || draft.trim().length === 0}
            data-testid="session-chat-send"
          >
            {sending ? 'Sending' : 'Send'}
          </button>
        </div>
        {sendFailed && (
          <p className="schat-note schat-note-warn" data-testid="session-chat-send-failed">
            That did not send. Your message is still here &mdash; try again.
          </p>
        )}
      </div>
    </section>
  );
}

const SCHAT_CSS = `
.schat{
  display:flex; flex-direction:column; min-height:0;
  background:var(--surface-card);
  border:1px solid var(--border-subtle);
  border-radius:var(--radius-lg);
  text-align:left;
}

.schat-head{
  display:flex; align-items:center; justify-content:space-between; gap:10px;
  padding:12px 14px; border-bottom:1px solid var(--border-subtle);
}
.schat-title{
  font-family:var(--font-display); font-size:14px; font-weight:700;
  letter-spacing:.02em; color:var(--text-strong); margin:0;
}
.schat-active{
  font-size:11.5px; font-weight:700; letter-spacing:.04em; text-transform:uppercase;
  color:var(--text-subtle);
}

.schat-list{
  flex:1 1 auto; min-height:180px; max-height:46vh; overflow-y:auto;
  padding:12px 14px; display:flex; flex-direction:column; gap:12px;
}
.schat-empty{ font-size:13px; color:var(--text-subtle); margin:0; }

.schat-msg{ display:flex; flex-direction:column; gap:3px; }
.schat-who{ display:flex; align-items:baseline; gap:8px; margin:0; }
.schat-name{ font-size:12.5px; font-weight:700; color:var(--text-strong); }
.schat-time{ font-size:11px; color:var(--text-subtle); }
.schat-body{
  font-size:14px; line-height:1.5; color:var(--text-body); margin:0;
  white-space:pre-wrap; word-break:break-word;
}

.schat-note{ font-size:12px; color:var(--text-subtle); margin:0; padding:0 14px 10px; }
.schat-note-warn{ color:var(--status-danger); padding:8px 0 0; }

.schat-compose{ padding:12px 14px 14px; border-top:1px solid var(--border-subtle); }
.schat-input{
  width:100%; resize:vertical; min-height:56px; padding:10px 12px;
  font-family:var(--font-body); font-size:14px; line-height:1.5;
  color:var(--text-body); background:var(--surface-subtle);
  border:1px solid var(--border-subtle); border-radius:var(--radius-md);
}
.schat-input:focus-visible{ outline:none; box-shadow:var(--focus-ring); }

.schat-actions{ display:flex; align-items:center; gap:10px; margin-top:8px; }
.schat-privacy{ flex:1; font-size:11.5px; line-height:1.4; color:var(--text-subtle); margin:0; }
.schat-count{ font-size:12px; font-weight:600; color:var(--text-subtle); }
.schat-count.is-over{ color:var(--status-danger); }

.schat-send{
  flex:none; min-height:40px; padding:0 18px;
  font-family:var(--font-body); font-size:14px; font-weight:600;
  color:var(--action-fg); background:var(--action-bg);
  border:none; border-radius:var(--radius-pill); cursor:pointer;
}
.schat-send:disabled{ opacity:.5; cursor:default; }
.schat-send:focus-visible{ outline:none; box-shadow:var(--focus-ring); }

.schat-sr{
  position:absolute; width:1px; height:1px; margin:-1px; padding:0;
  overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; border:0;
}
`;
