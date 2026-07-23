import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchRoom, fetchRoomMessages, postRoomMessage, requestRoomAccess, joinVideoRoom,
  touchRoomPresence, deleteRoom, inviteToRoom, fetchPeople, verifyAnswer, myEnrollmentId,
  fetchRoomBookings, RoomView, RoomMessage, RoomPerson, BookingCard,
} from '../../../services/roomsApi';
import RoomFilesPanel from './RoomFilesPanel';

const CAT_EMOJI: Record<string, string> = {
  start_here: '👋', your_cohort: '🎓', build_together: '🛠️', career_cert: '💼',
  demos_events: '🎤', social: '🎉', live_now: '🔴', private_rooms: '🔒',
};
function initials(name: string): string {
  const p = (name || '').trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?';
}
function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

const InviteModal: React.FC<{ roomId: string; onClose: () => void; onDone: () => void }> = ({ roomId, onClose, onDone }) => {
  const [people, setPeople] = useState<RoomPerson[] | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetchPeople().then(setPeople).catch(() => setPeople([])); }, []);
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const submit = async () => {
    if (sel.size === 0 || busy) return;
    setBusy(true);
    try { await inviteToRoom(roomId, Array.from(sel)); onDone(); onClose(); }
    catch { setBusy(false); }
  };
  return (
    <div className="rm-overlay" onClick={onClose}>
      <div className="rm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rm-modal-h"><h2>Invite people</h2><button type="button" className="rm-x" onClick={onClose} aria-label="Close">×</button></div>
        <div className="rm-modal-body">
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>They’ll get access to see and join this room.</div>
          {people === null && <div className="rm-empty">Loading…</div>}
          {(people || []).map((p) => (
            <label key={p.id} className={`rm-invrow${sel.has(p.id) ? ' on' : ''}`}>
              <input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} />
              <span className="cm-avatar sm">{initials(p.display_name)}</span>
              <span className="rm-person-name">{p.display_name}</span>
              <span className={`cm-dot ${p.presence}`} />
            </label>
          ))}
        </div>
        <div className="rm-modal-foot">
          <button type="button" className="te-btn ghost sm" onClick={onClose}>Cancel</button>
          <button type="button" className="te-btn cherry sm" onClick={submit} disabled={busy || sel.size === 0}>{busy ? 'Inviting…' : `Invite ${sel.size || ''}`}</button>
        </div>
      </div>
    </div>
  );
};

type RoomTab = 'chat' | 'files';

const RoomPane: React.FC<{ roomId: string; onDeleted: () => void; onChanged: () => void }> = ({ roomId, onDeleted, onChanged }) => {
  const [view, setView] = useState<RoomView | null | 'error'>(null);
  const [messages, setMessages] = useState<RoomMessage[] | null>(null);
  const [activeCount, setActiveCount] = useState(0);
  const [draft, setDraft] = useState('');
  const [asking, setAsking] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [paneTab, setPaneTab] = useState<RoomTab>('chat');
  const [bookings, setBookings] = useState<BookingCard[] | undefined>(undefined);
  const sinceRef = useRef<string | undefined>(undefined);
  const endRef = useRef<HTMLDivElement | null>(null);

  const loadRoom = useCallback(async () => {
    setMessages(null); sinceRef.current = undefined;
    setPaneTab('chat'); setBookings(undefined);
    try { setView(await fetchRoom(roomId)); } catch { setView('error'); }
  }, [roomId]);
  useEffect(() => { loadRoom(); }, [loadRoom]);

  const canChat = view !== null && view !== 'error' && view.visibility === 'full';

  // Lazily load this room's bookings the first time the Files tab opens, so the
  // "by class" picker has data without adding a request to the default chat view.
  useEffect(() => {
    if (paneTab !== 'files' || bookings !== undefined || !canChat) return;
    fetchRoomBookings(roomId).then(setBookings).catch(() => setBookings([]));
  }, [paneTab, bookings, canChat, roomId]);

  const pollMessages = useCallback(async () => {
    const res = await fetchRoomMessages(roomId, sinceRef.current);
    setActiveCount(res.active_count);
    if (res.messages.length) {
      sinceRef.current = res.messages[res.messages.length - 1].created_at;
      setMessages((prev) => (prev ? [...prev, ...res.messages] : res.messages));
    } else setMessages((prev) => prev ?? []);
  }, [roomId]);

  useEffect(() => {
    if (!canChat) return;
    const run = () => { pollMessages().catch(() => {}); };
    run();
    const id = window.setInterval(run, 3000);
    return () => window.clearInterval(id);
  }, [canChat, pollMessages]);

  // Heartbeat so this viewer counts toward the room's live "here" count.
  useEffect(() => {
    if (!canChat) return;
    const ping = () => { touchRoomPresence(roomId).catch(() => {}); };
    ping();
    const id = window.setInterval(ping, 30000);
    return () => window.clearInterval(id);
  }, [canChat, roomId]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages]);

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    const wasAsking = asking;
    setDraft(''); setAsking(false);
    try {
      const msg = await postRoomMessage(roomId, text, wasAsking ? 'question' : undefined);
      sinceRef.current = msg.created_at;
      setMessages((prev) => [...(prev || []), msg]);
    } catch { setDraft(text); setAsking(wasAsking); }
  };

  // Full refetch (not the incremental poll) — used after verifying an answer so
  // the question's new status + the answer badge show immediately.
  const reloadMessages = useCallback(async () => {
    sinceRef.current = undefined;
    const res = await fetchRoomMessages(roomId);
    setActiveCount(res.active_count);
    sinceRef.current = res.messages.length ? res.messages[res.messages.length - 1].created_at : undefined;
    setMessages(res.messages);
  }, [roomId]);

  const doVerify = async (answerMessageId: string) => {
    const mine = myEnrollmentId();
    // Resolve to the caller's most-recent still-open question in this room.
    const q = [...(messages || [])].reverse().find(
      (m) => m.kind === 'question' && m.question_status === 'open' && m.enrollment_id === mine,
    );
    if (!q) return;
    try { await verifyAnswer(roomId, q.id, answerMessageId); await reloadMessages(); onChanged(); }
    catch { window.alert('Could not mark that as the answer.'); }
  };
  const doRequest = async () => { try { await requestRoomAccess(roomId); window.alert('Access requested — a host will review it.'); } catch { /* no-op */ } };
  const doJoinVideo = async () => {
    try {
      const { join_url } = await joinVideoRoom(roomId);
      if (join_url) window.open(join_url, '_blank', 'noopener');
      else window.alert('Spinning up the video room… try again in a second.');
    } catch { window.alert('Could not join the video room.'); }
  };
  const doDelete = async () => {
    if (!window.confirm('Delete this room? This cannot be undone.')) return;
    try { await deleteRoom(roomId); onChanged(); onDeleted(); }
    catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } }).response?.data?.error;
      window.alert(msg || 'Could not delete this room (it may have upcoming sessions).');
    }
  };

  if (view === null) return <div className="rm-pane"><div className="rm-empty">Loading room…</div></div>;
  if (view === 'error') return <div className="rm-pane"><div className="rm-empty">This room isn’t available.</div></div>;

  const { room, membership, visibility } = view;
  const myId = myEnrollmentId();
  const isOwner = !!room.owner_enrollment_id && room.owner_enrollment_id === myId;
  const canManage = isOwner || ['owner', 'host', 'cohost', 'moderator'].includes(membership?.role || '');
  const emoji = room.metadata?.emoji || CAT_EMOJI[room.category] || '💬';

  // Verified-help view model: which messages are verified answers, and whether
  // the viewer has an open question they could resolve by verifying a reply.
  const msgs = messages || [];
  const verifiedAnswerIds = new Set(
    msgs.filter((m) => m.kind === 'question' && m.metadata?.verified_answer_id).map((m) => m.metadata!.verified_answer_id as string),
  );
  const iHaveOpenQuestion = msgs.some((m) => m.kind === 'question' && m.question_status === 'open' && m.enrollment_id === myId);

  if (visibility === 'shell') {
    return (
      <div className="rm-pane">
        <div className="te-card" style={{ padding: 28, textAlign: 'center', maxWidth: 460, margin: '40px auto' }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🔒</div>
          <h2 style={{ margin: '0 0 6px', fontSize: 18 }}>This room is private</h2>
          <div style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 16 }}>You can see it exists, but its conversation is members-only.</div>
          <button type="button" className="te-btn berry sm" onClick={doRequest}>Request access</button>
        </div>
      </div>
    );
  }

  return (
    <div className="rm-pane">
      <div className={`rm-pane-head cat-${room.category}`}>
        <div className="rm-detail-emoji">{emoji}</div>
        <div className="rm-pane-title">{room.is_video ? '' : '# '}{room.name}</div>
        {room.is_video && <span className="rm-vbadge">▶ Video</span>}
        {room.privacy !== 'public' && <span className={`rm-privacy ${room.privacy}`}>{room.privacy.replace('_', ' ')}</span>}
        {activeCount > 0 && <span className="rm-presence">{activeCount} here</span>}
        <span style={{ flex: 1 }} />
        {room.is_video && <button type="button" className="te-btn cherry sm" onClick={doJoinVideo}>📹 Join call</button>}
        {canManage && <button type="button" className="te-btn ghost sm" onClick={() => setShowInvite(true)}>Invite</button>}
        {isOwner && !room.is_system && <button type="button" className="te-btn ghost sm rm-danger" onClick={doDelete}>Delete</button>}
      </div>

      <div className="rm-tabs" role="tablist" aria-label="Room sections">
        <button type="button" role="tab" aria-selected={paneTab === 'chat'} className={`rm-tab${paneTab === 'chat' ? ' active' : ''}`} onClick={() => setPaneTab('chat')}>Chat</button>
        <button type="button" role="tab" aria-selected={paneTab === 'files'} className={`rm-tab${paneTab === 'files' ? ' active' : ''}`} onClick={() => setPaneTab('files')}>Docs &amp; Files</button>
      </div>

      {paneTab === 'chat' && (
        <div className="rm-chat">
          <div className="rm-msgs">
            {messages === null && <div className="rm-empty">Loading conversation…</div>}
            {messages !== null && messages.length === 0 && <div className="rm-empty">No messages yet — say hello 👋</div>}
            {messages?.map((m) => {
              if (m.kind === 'system') {
                return <div key={m.id} className="rm-sysmsg">{m.content}</div>;
              }
              const isQuestion = m.kind === 'question';
              const isVerifiedAnswer = verifiedAnswerIds.has(m.id);
              const canMarkAnswer = iHaveOpenQuestion && !!m.enrollment_id && m.enrollment_id !== myId && !isQuestion && !isVerifiedAnswer;
              return (
                <div key={m.id} className={`rm-msg${isQuestion ? ' is-q' : ''}${isVerifiedAnswer ? ' is-ans' : ''}`}>
                  <span className="cm-avatar sm">{initials(m.sender_name)}</span>
                  <div className="rm-msg-body">
                    <div className="rm-msg-top">
                      <span className="rm-msg-name">{m.sender_name}</span>
                      {isQuestion && <span className={`rm-qchip${m.question_status === 'verified' ? ' done' : ''}`}>{m.question_status === 'verified' ? '✓ Answered' : '❓ Question'}</span>}
                      {isVerifiedAnswer && <span className="rm-ansbadge">✓ Verified answer</span>}
                      <span className="rm-msg-time">{timeAgo(m.created_at)}</span>
                      {canMarkAnswer && <button type="button" className="rm-markans" onClick={() => doVerify(m.id)}>✓ Mark as answer</button>}
                    </div>
                    <div className="rm-msg-text">{m.content}</div>
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
          <div className="rm-chatbar">
            <button type="button" className={`rm-askbtn${asking ? ' on' : ''}`} onClick={() => setAsking((v) => !v)} title="Ask as a question so people can mark the answer" aria-pressed={asking}>❓</button>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send(); }} placeholder={asking ? 'Ask a question…' : `Message ${room.name}…`} maxLength={4000} />
            <button type="button" className="te-btn cherry sm" onClick={send} disabled={!draft.trim()}>{asking ? 'Ask' : 'Send'}</button>
          </div>
        </div>
      )}

      {paneTab === 'files' && <RoomFilesPanel roomId={roomId} canUpload={view.can_upload_resource} bookings={bookings} />}

      {showInvite && <InviteModal roomId={roomId} onClose={() => setShowInvite(false)} onDone={() => { loadRoom(); onChanged(); }} />}
    </div>
  );
};

export default RoomPane;
