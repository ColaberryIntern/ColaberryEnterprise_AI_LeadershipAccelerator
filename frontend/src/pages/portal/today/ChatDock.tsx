import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DmMessage, fetchDmMessages, sendDmMessage, myEnrollmentId } from '../../../services/dmApi';
import {
  useAgentAttachments, AttachButton, AttachmentTray, DropOverlay, SentAttachments,
  type SentAttachment,
} from '../../../components/portal/AgentAttachments';

/**
 * Placeholder key for previews belonging to a message that has been sent but
 * whose server id has not come back yet. Re-keyed onto the real id on success.
 */
const PENDING_KEY = '__pending__';

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
  // Files handed to whoever is on the other end — Reese reads them; a human
  // peer just sees them. Same hook both mentor rails use.
  const attach = useAgentAttachments();
  /**
   * Thumbnails for MY sent messages, keyed by message id. Local object URLs
   * rather than server URLs: the serve route is participant-authenticated and
   * an <img> cannot carry a bearer token. They therefore cover this session
   * only — a reload shows the message text, which is the same thing the peer
   * sees and is correct rather than broken.
   */
  const [localAttachments, setLocalAttachments] = useState<Record<string, SentAttachment[]>>({});

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
    const attachments = attach.refs();
    // A screenshot with no caption is a normal DM, so either one is enough —
    // but never send while an upload is still in flight.
    if ((!text && !attachments.length) || attach.busy) return;
    // Keep the thumbnails on screen next to the sent message; the tray itself
    // empties. Sent files are addressed by id from here on.
    const shown = attach.sentPreviews();
    setDraft('');
    attach.clear(false);
    setLocalAttachments((prev) => ({ ...prev, [PENDING_KEY]: shown }));
    sendDmMessage(target.roomId, text, attachments)
      .then((m) => {
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        sinceRef.current = m.created_at;
        // Re-key the previews from the placeholder onto the real message id
        // now that the server has assigned one.
        setLocalAttachments((prev) => {
          const { [PENDING_KEY]: pending, ...rest } = prev;
          return pending ? { ...rest, [m.id]: pending } : rest;
        });
      })
      .catch(() => {
        // Restore the draft so nothing typed is lost. The uploaded files stay
        // on the server under their ids; the student re-attaches if they want
        // them on the retry.
        setDraft(text);
        setLocalAttachments((prev) => {
          const { [PENDING_KEY]: _pending, ...rest } = prev;
          return rest;
        });
      });
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
          {/* The message list is the drop target — the obvious place to aim a
              dragged screenshot, rather than the one-line composer. */}
          <div className="te-dm-body" style={{ position: 'relative' }} {...attach.dropProps}>
            <DropOverlay active={attach.dragging} label="Drop to attach" />
            {messages.length === 0 && <div className="te-dm-empty">Say hi 👋</div>}
            {messages.map((m) => (
              <div key={m.id} className={`te-dm-msg${m.enrollment_id === meRef.current ? ' mine' : ''}`}>
                {m.content}
                {/* Server URLs win: they survive a reload and work for the
                    recipient too. The local previews are only the optimistic
                    bridge between hitting Send and the poll catching up. */}
                <SentAttachments items={
                  m.attachments?.length
                    ? m.attachments.map((a) => ({ name: a.name, preview: a.url, isPdf: /\.pdf$/i.test(a.name) }))
                    : localAttachments[m.id]
                } />
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <AttachmentTray items={attach.items} notice={attach.notice} onRemove={attach.remove} />
          <div className="te-dm-composer">
            <AttachButton onFiles={attach.addFiles} title="Attach a screenshot or PDF" />
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Message, or paste a screenshot…"
              maxLength={4000}
              aria-label={`Message ${target.name}`}
              {...attach.pasteProps}
            />
            <button type="button" onClick={send} disabled={(!draft.trim() && attach.refs().length === 0) || attach.busy}>Send</button>
          </div>
        </>
      )}
    </div>
  );
};

export default ChatDock;
