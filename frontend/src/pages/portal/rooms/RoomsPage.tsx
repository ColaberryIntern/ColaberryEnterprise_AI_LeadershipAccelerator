import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PortalShell from '../today/PortalShell';
import '../today/TodayShell.css';
import '../feed/feed.css';
import '../community/community.css';
import './rooms.css';
import RoomPane from './RoomPane';
import ImpactPanel from './ImpactPanel';
import { fmtCentralDateTime } from '../today/shellUtils';
import {
  fetchRoomsHome, fetchRooms, joinBooking, createBooking, createRoom,
  RoomsHome, RoomListItem, BookingCard, CreateBookingInput,
  ROOM_CATEGORIES, BOOKING_VARIANTS, BookingVariant, RoomPrivacy,
} from '../../../services/roomsApi';
import { fetchMySessions, MySession } from '../../../services/onboardingApi';

const EMOJI_CHOICES = ['🎉', '🚀', '🛠️', '🧠', '💡', '🔥', '🌱', '🎯', '🧩', '☕', '🌈', '🦄', '🐙', '🎨', '📚', '🎮', '⚡', '🌟', '💬', '🎧'];
const CAT_EMOJI: Record<string, string> = {
  start_here: '👋', your_cohort: '🎓', build_together: '🛠️', career_cert: '💼',
  demos_events: '🎤', social: '🎉', live_now: '🔴', private_rooms: '🔒',
};

// Time-until-start label (a lightweight countdown; re-renders on the page's 15s
// room refresh so it stays current without its own ticker).
function untilLabel(iso: string | null, live?: boolean): string {
  if (live) return 'live now';
  if (!iso) return '';
  const ms = new Date(iso).getTime() - Date.now();
  if (isNaN(ms)) return '';
  if (ms <= 0) return 'starting now';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `in ${hrs}h ${mins % 60}m`;
  return `in ${Math.round(hrs / 24)}d`;
}

// One-click "add to calendar" via a Google Calendar template URL (opens prefilled;
// works for anyone on Google Workspace/Gmail — the platform's common case).
function gcalHref(b: BookingCard): string | null {
  if (!b.start_at) return null;
  const start = new Date(b.start_at);
  const end = b.end_at ? new Date(b.end_at) : new Date(start.getTime() + 60 * 60000);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: b.title,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: `Colaberry Commons — ${b.variant.replace(/_/g, ' ')} session. Join from your Rooms.`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

const SessionRow: React.FC<{ booking: BookingCard; live?: boolean; onJoin: (id: string) => void }> = ({ booking, live, onJoin }) => {
  const cal = gcalHref(booking);
  return (
    <div className="rm-sess">
      <span className="rm-sess-emoji">{booking.emoji || '📅'}</span>
      <div className="rm-sess-main">
        <div className="rm-sess-title">{booking.title}</div>
        <div className="rm-sess-meta">
          <span className={`rm-sess-until${live ? ' live' : ''}`}>{untilLabel(booking.start_at, live)}</span>
          {booking.start_at && <><span>·</span><span>{fmtCentralDateTime(booking.start_at)}</span></>}
          {cal && <a className="rm-sess-cal" href={cal} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>📅 Add to calendar</a>}
        </div>
      </div>
      <button type="button" className={`te-btn ${live ? 'cherry' : 'berry'} sm`} onClick={() => onJoin(booking.id)}>{live ? 'Join now' : 'RSVP'}</button>
    </div>
  );
};

const RailRow: React.FC<{ item: RoomListItem; active: boolean; onOpen: (id: string) => void }> = ({ item, active, onOpen }) => {
  const { room } = item;
  const shell = item.visibility === 'shell';
  const em = shell ? '' : (room.metadata?.emoji || CAT_EMOJI[room.category] || '');
  const label = shell ? 'Private room' : (em ? `${em} ` : '') + room.name;
  return (
    <button type="button" className={`rm-railrow${active ? ' active' : ''}`} onClick={() => onOpen(room.id)}>
      <span className="rm-railicon">{shell ? '🔒' : room.is_video ? '📹' : '#'}</span>
      <span className="rm-railname">{label}</span>
      {(item.here_count ?? 0) > 0 && <span className="rm-railcount"><span className="rm-raildot" />{item.here_count}</span>}
    </button>
  );
};

const RailGroup: React.FC<{ title: string; items: RoomListItem[]; activeId?: string; onOpen: (id: string) => void }> = ({ title, items, activeId, onOpen }) => {
  if (items.length === 0) return null;
  return (
    <div className="rm-railgroup">
      <div className="rm-railhdr">{title}</div>
      {items.map((it) => <RailRow key={it.room.id} item={it} active={it.room.id === activeId} onOpen={onOpen} />)}
    </div>
  );
};

// Status pill per class session, reusing the same pill tokens already used
// elsewhere on this page/component tree (rm-live for live, rm-qchip/.done
// for the verified-help question/answer chip) rather than inventing new
// color language for the same three-state (upcoming/live/done) concept.
const CLASS_STATUS_PILL: Record<string, { cls: string; label: string }> = {
  scheduled: { cls: 'rm-qchip', label: 'Upcoming' },
  live: { cls: 'rm-live', label: 'Live' },
  completed: { cls: 'rm-qchip done', label: 'Done' },
  cancelled: { cls: 'rm-qchip', label: 'Cancelled' },
};

// A session with no linked room yet (predates the Community Rooms rollout)
// renders as plain, non-clickable text with its status pill — never a link
// into a room that doesn't exist.
const ClassRailRow: React.FC<{ session: MySession; active: boolean; onOpen: (id: string) => void }> = ({ session, active, onOpen }) => {
  const pill = CLASS_STATUS_PILL[session.status] || CLASS_STATUS_PILL.scheduled;
  const label = `#${session.session_number} ${session.title}`;
  if (!session.room_id) {
    return (
      <div className="rm-railrow" style={{ cursor: 'default', opacity: 0.6 }}>
        <span className="rm-railicon">🎓</span>
        <span className="rm-railname">{label}</span>
        <span className={pill.cls}>{pill.label}</span>
      </div>
    );
  }
  return (
    <button type="button" className={`rm-railrow${active ? ' active' : ''}`} onClick={() => onOpen(session.room_id!)}>
      <span className="rm-railicon">🎓</span>
      <span className="rm-railname">{label}</span>
      <span className={pill.cls}>{pill.label}</span>
    </button>
  );
};

const ClassRailGroup: React.FC<{ title: string; sessions: MySession[]; activeId?: string; onOpen: (id: string) => void }> = ({ title, sessions, activeId, onOpen }) => {
  if (sessions.length === 0) return null;
  return (
    <div className="rm-railgroup">
      <div className="rm-railhdr">{title}</div>
      {sessions.map((s) => <ClassRailRow key={s.id} session={s} active={!!s.room_id && s.room_id === activeId} onOpen={onOpen} />)}
    </div>
  );
};

const NewRoomModal: React.FC<{ onClose: () => void; onCreated: (id: string) => void }> = ({ onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('build_together');
  const [privacy, setPrivacy] = useState<RoomPrivacy>('private');
  const [isVideo, setIsVideo] = useState(true);
  const [emoji, setEmoji] = useState('🎉');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try { const r = await createRoom({ name: name.trim(), category, privacy, is_video: isVideo, emoji }); onCreated(r.id); onClose(); }
    catch { setBusy(false); }
  };
  return (
    <div className="rm-overlay" onClick={onClose}>
      <div className="rm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rm-modal-h"><h2>New room</h2><button type="button" className="rm-x" onClick={onClose} aria-label="Close">×</button></div>
        <div className="rm-modal-body">
          <div className="rm-field"><label>Room name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. MCP Builders" maxLength={200} /></div>
          <div className="rm-field">
            <label>Pick an emoji</label>
            <div className="rm-emojipick">
              {EMOJI_CHOICES.map((e) => (
                <button type="button" key={e} className={`rm-emojiopt${emoji === e ? ' on' : ''}`} onClick={() => setEmoji(e)}>{e}</button>
              ))}
            </div>
          </div>
          <div className="rm-row2">
            <div className="rm-field"><label>Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>{ROOM_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
            </div>
            <div className="rm-field"><label>Who can join?</label>
              <select value={privacy} onChange={(e) => setPrivacy(e.target.value as RoomPrivacy)}>
                <option value="private">Private — invite only</option>
                <option value="cohort">My cohort</option>
              </select>
            </div>
          </div>
          <label className={`rm-toggle${isVideo ? ' on' : ''}`}>
            <input type="checkbox" checked={isVideo} onChange={(e) => setIsVideo(e.target.checked)} />
            <span className="rm-toggle-txt"><b>📹 Video room</b><span>A video call everyone can jump into.</span></span>
          </label>
        </div>
        <div className="rm-modal-foot">
          <button type="button" className="te-btn ghost sm" onClick={onClose}>Cancel</button>
          <button type="button" className="te-btn cherry sm" onClick={submit} disabled={busy || !name.trim()}>{busy ? 'Creating…' : 'Create room'}</button>
        </div>
      </div>
    </div>
  );
};

const BookRoomModal: React.FC<{ onClose: () => void; onCreated: () => void }> = ({ onClose, onCreated }) => {
  const [variant, setVariant] = useState<BookingVariant>('study');
  const [title, setTitle] = useState('');
  const [start, setStart] = useState('');
  const [duration, setDuration] = useState(60);
  const [privacy, setPrivacy] = useState<RoomPrivacy>('public');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const input: CreateBookingInput = { title: title.trim(), variant, privacy };
      if (start) {
        const ms = new Date(start).getTime();
        if (!isNaN(ms)) { input.start_at = new Date(ms).toISOString(); input.end_at = new Date(ms + duration * 60_000).toISOString(); input.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone; }
      }
      await createBooking(input); onCreated(); onClose();
    } catch { setBusy(false); }
  };
  return (
    <div className="rm-overlay" onClick={onClose}>
      <div className="rm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rm-modal-h"><h2>Book a session</h2><button type="button" className="rm-x" onClick={onClose} aria-label="Close">×</button></div>
        <div className="rm-modal-body">
          <div className="rm-field"><label>What are you hosting?</label><select value={variant} onChange={(e) => setVariant(e.target.value as BookingVariant)}>{BOOKING_VARIANTS.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}</select></div>
          <div className="rm-field"><label>Title</label><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Office hours" maxLength={200} /></div>
          <div className="rm-row2">
            <div className="rm-field"><label>When</label><input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div className="rm-field"><label>Duration</label><select value={duration} onChange={(e) => setDuration(Number(e.target.value))}><option value={30}>30 min</option><option value={60}>1 hour</option><option value={90}>90 min</option></select></div>
          </div>
          <div className="rm-field"><label>Who can join?</label><select value={privacy} onChange={(e) => setPrivacy(e.target.value as RoomPrivacy)}><option value="public">Public</option><option value="cohort">My cohort</option><option value="private">Private</option></select></div>
        </div>
        <div className="rm-modal-foot">
          <button type="button" className="te-btn ghost sm" onClick={onClose}>Cancel</button>
          <button type="button" className="te-btn cherry sm" onClick={submit} disabled={busy || !title.trim()}>{busy ? 'Creating…' : 'Create session'}</button>
        </div>
      </div>
    </div>
  );
};

const RoomsPage: React.FC = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<RoomListItem[] | null>(null);
  const [home, setHome] = useState<RoomsHome | null>(null);
  const [mySessions, setMySessions] = useState<MySession[] | null>(null);
  const [modal, setModal] = useState<'none' | 'book' | 'new'>('none');

  const loadRooms = useCallback(async () => { setRooms(await fetchRooms()); }, []);
  const loadHome = useCallback(async () => { setHome(await fetchRoomsHome()); }, []);

  useEffect(() => {
    const cycle = () => { loadRooms().catch(() => setRooms([])); };
    cycle();
    const id = window.setInterval(cycle, 15000); // refresh live "here" counts
    return () => window.clearInterval(id);
  }, [loadRooms]);
  useEffect(() => { loadHome().catch(() => setHome({ happening_now: [], up_next: [], my_rooms: [] })); }, [loadHome]);
  // One-time fetch — a session's status/room_id doesn't change often enough
  // to warrant the room list's 15s "here now" polling cadence.
  useEffect(() => { fetchMySessions().then(setMySessions).catch(() => setMySessions([])); }, []);

  const open = (id: string) => navigate(`/portal/rooms/${id}`);
  const joinSession = async (bookingId: string) => {
    try { const { join_url } = await joinBooking(bookingId); if (join_url) window.open(join_url, '_blank', 'noopener'); else window.alert("You're in — the host hasn't posted the link yet."); }
    catch { window.alert('You are not eligible to join this session.'); }
  };

  const items = rooms || [];
  const pub = items.filter((i) => i.visibility === 'full' && i.room.privacy === 'public');
  const priv = items.filter((i) => i.room.privacy !== 'public');
  const privFull = priv.filter((i) => i.visibility === 'full');
  const totalHere = items.reduce((n, i) => n + (i.here_count ?? 0), 0);

  return (
    <PortalShell>
      <div className="page-h" style={{ marginBottom: 12 }}>
        <div className="crumbs0">Belong</div>
        <div className="rm-titlerow">
          <h1 style={{ margin: 0 }}>Rooms</h1>
          <span className="rm-stat online"><b>{totalHere}</b> here now</span>
          <span style={{ flex: 1 }} />
          <button type="button" className="te-btn ghost sm" onClick={() => setModal('new')}>+ New room</button>
          <button type="button" className="te-btn cherry sm" onClick={() => setModal('book')}>+ Book a session</button>
        </div>
      </div>

      <div className="rm-shell">
        <div className="rm-rail">
          {rooms === null && <div className="rm-empty">Loading…</div>}
          <ClassRailGroup title="Your Classes" sessions={mySessions || []} activeId={roomId} onOpen={open} />
          <RailGroup title="Public" items={pub.filter((i) => !i.room.is_video)} activeId={roomId} onOpen={open} />
          <RailGroup title="Public · Video" items={pub.filter((i) => i.room.is_video)} activeId={roomId} onOpen={open} />
          <RailGroup title="Private" items={privFull.filter((i) => !i.room.is_video)} activeId={roomId} onOpen={open} />
          <RailGroup title="Private · Video" items={privFull.filter((i) => i.room.is_video)} activeId={roomId} onOpen={open} />
          <RailGroup title="Locked" items={priv.filter((i) => i.visibility === 'shell')} activeId={roomId} onOpen={open} />
        </div>

        <div className="rm-panewrap">
          {roomId ? (
            <RoomPane roomId={roomId} onDeleted={() => navigate('/portal/rooms')} onChanged={() => { loadRooms().catch(() => {}); loadHome().catch(() => {}); }} />
          ) : (
            <div className="rm-welcome">
              <div className="rm-welcome-hero">
                <div style={{ fontSize: 34 }}>💬</div>
                <h2>Pick a room to jump in</h2>
                <p>Drop into a public room, hop on a video call, or start your own — everyone in your cohort is here.</p>
              </div>
              {home && home.happening_now.length > 0 && (
                <div className="te-card" style={{ padding: 16, marginTop: 16 }}>
                  <p className="rm-strip-title"><span className="rm-live">Live</span> Happening now</p>
                  {home.happening_now.map((b) => <SessionRow key={b.id} booking={b} live onJoin={joinSession} />)}
                </div>
              )}
              {home && home.up_next.length > 0 && (
                <div className="te-card" style={{ padding: 16, marginTop: 16 }}>
                  <p className="rm-strip-title">Up next</p>
                  {home.up_next.map((b) => <SessionRow key={b.id} booking={b} onJoin={joinSession} />)}
                </div>
              )}
              <ImpactPanel />
            </div>
          )}
        </div>
      </div>

      {modal === 'book' && <BookRoomModal onClose={() => setModal('none')} onCreated={() => { loadRooms().catch(() => {}); loadHome().catch(() => {}); }} />}
      {modal === 'new' && <NewRoomModal onClose={() => setModal('none')} onCreated={(id) => { loadRooms().catch(() => {}); navigate(`/portal/rooms/${id}`); }} />}
    </PortalShell>
  );
};

export default RoomsPage;
