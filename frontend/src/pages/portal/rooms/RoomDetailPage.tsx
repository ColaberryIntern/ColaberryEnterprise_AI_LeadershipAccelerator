import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import PortalShell from '../today/PortalShell';
import '../today/TodayShell.css';
import '../feed/feed.css';
import '../community/community.css';
import './rooms.css';
import {
  fetchRoom, fetchRoomMessages, postRoomMessage, joinRoom, requestRoomAccess,
  RoomView, RoomMessage,
} from '../../../services/roomsApi';

function initials(name: string): string {
  const parts = (name || '').trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}
function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

const RoomDetailPage: React.FC = () => {
  const { roomId = '' } = useParams();
  const [view, setView] = useState<RoomView | null | 'error'>(null);
  const [messages, setMessages] = useState<RoomMessage[] | null>(null);
  const [activeCount, setActiveCount] = useState(0);
  const [draft, setDraft] = useState('');
  const sinceRef = useRef<string | undefined>(undefined);
  const endRef = useRef<HTMLDivElement | null>(null);

  const loadRoom = useCallback(async () => {
    try { setView(await fetchRoom(roomId)); } catch { setView('error'); }
  }, [roomId]);

  useEffect(() => { loadRoom(); }, [loadRoom]);

  const canChat = view !== null && view !== 'error' && view.visibility === 'full';

  const pollMessages = useCallback(async () => {
    const res = await fetchRoomMessages(roomId, sinceRef.current);
    setActiveCount(res.active_count);
    if (res.messages.length) {
      sinceRef.current = res.messages[res.messages.length - 1].created_at;
      setMessages((prev) => (prev ? [...prev, ...res.messages] : res.messages));
    } else {
      setMessages((prev) => prev ?? []);
    }
  }, [roomId]);

  useEffect(() => {
    if (!canChat) return;
    const run = () => { pollMessages().catch(() => {}); };
    run();
    const id = window.setInterval(run, 3000);
    return () => window.clearInterval(id);
  }, [canChat, pollMessages]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages]);

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    try {
      const msg = await postRoomMessage(roomId, text);
      sinceRef.current = msg.created_at;
      setMessages((prev) => [...(prev || []), msg]);
    } catch { setDraft(text); }
  };

  const doJoin = async () => {
    try { await joinRoom(roomId); await loadRoom(); } catch { /* not eligible */ }
  };
  const doRequest = async () => {
    try { await requestRoomAccess(roomId); window.alert('Access requested — a host will review it.'); } catch { /* no-op */ }
  };

  if (view === null) {
    return <PortalShell><div className="fc-empty">Loading room…</div></PortalShell>;
  }
  if (view === 'error') {
    return (
      <PortalShell>
        <Link to="/portal/rooms" className="rm-back">← Rooms</Link>
        <div className="fc-empty">This room isn’t available.</div>
      </PortalShell>
    );
  }

  const { room, membership, visibility } = view;
  const isMember = membership?.access_state === 'active';

  // Private/invite-only room the viewer can't enter → safe locked shell.
  if (visibility === 'shell') {
    return (
      <PortalShell>
        <Link to="/portal/rooms" className="rm-back">← Rooms</Link>
        <div className="te-card" style={{ padding: 28, textAlign: 'center', maxWidth: 480, margin: '0 auto' }}>
          <svg viewBox="0 0 24 24" fill="none" style={{ width: 40, height: 40, color: 'var(--muted)', margin: '0 auto 12px', display: 'block' }}><rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" /></svg>
          <h2 style={{ margin: '0 0 6px', fontSize: 18 }}>This room is private</h2>
          <div style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 16 }}>You can see it exists, but its conversation and details are members‑only.</div>
          <button type="button" className="te-btn berry sm" onClick={doRequest}>Request access</button>
        </div>
      </PortalShell>
    );
  }

  return (
    <PortalShell>
      <Link to="/portal/rooms" className="rm-back">← Rooms</Link>
      <div className="rm-detail-h">
        <h1>{room.name}</h1>
        {room.privacy !== 'public' && <span className={`rm-privacy ${room.privacy}`}>{room.privacy.replace('_', ' ')}</span>}
        {activeCount > 0 && <span className="rm-presence">{activeCount} active now</span>}
        <span style={{ flex: 1 }} />
        {!isMember && <button type="button" className="te-btn berry sm" onClick={doJoin}>Join room</button>}
      </div>

      <div className="te-grid">
        <div className="te-card" style={{ padding: 16 }}>
          <div className="rm-chat">
            <div className="rm-msgs">
              {messages === null && <div className="rm-empty">Loading conversation…</div>}
              {messages !== null && messages.length === 0 && <div className="rm-empty">No messages yet — say hello 👋</div>}
              {messages?.map((m) => (
                <div key={m.id} className="rm-msg">
                  <span className="cm-avatar sm">{initials(m.sender_name)}</span>
                  <div className="rm-msg-body">
                    <div className="rm-msg-top">
                      <span className="rm-msg-name">{m.sender_name}</span>
                      <span className="rm-msg-time">{timeAgo(m.created_at)}</span>
                    </div>
                    <div className="rm-msg-text">{m.content}</div>
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>
            <div className="rm-chatbar">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
                placeholder="Message the room…"
                maxLength={4000}
              />
              <button type="button" className="te-btn cherry sm" onClick={send} disabled={!draft.trim()}>Send</button>
            </div>
          </div>
        </div>

        <aside className="te-side">
          <div className="te-card te-scard">
            <h3>About this room</h3>
            {room.description && <p style={{ fontSize: 13.5, color: 'var(--body)', margin: '0 0 10px', lineHeight: 1.5 }}>{room.description}</p>}
            <div className="cm-contact-row"><span className="cm-contact-name" style={{ color: 'var(--muted)' }}>Category</span><span className="rm-cat">{room.category.replace(/_/g, ' ')}</span></div>
            <div className="cm-contact-row"><span className="cm-contact-name" style={{ color: 'var(--muted)' }}>Privacy</span><span className={`rm-privacy ${room.privacy}`}>{room.privacy.replace('_', ' ')}</span></div>
          </div>
        </aside>
      </div>
    </PortalShell>
  );
};

export default RoomDetailPage;
