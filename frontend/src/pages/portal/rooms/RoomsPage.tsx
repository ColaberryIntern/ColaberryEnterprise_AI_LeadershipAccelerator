import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PortalShell from '../today/PortalShell';
import '../today/TodayShell.css';
import '../feed/feed.css';
import '../community/community.css';
import './rooms.css';
import { fmtCentralDateTime } from '../today/shellUtils';
import { pingPresence, fetchMyProfile } from '../../../services/communityApi';
import {
  fetchRoomsHome, fetchRooms, fetchPeople, joinBooking, joinVideoRoom, createBooking, createRoom,
  RoomsHome, RoomListItem, Room, RoomPerson, BookingCard, CreateBookingInput,
  ROOM_CATEGORIES, BOOKING_VARIANTS, BookingVariant, RoomPrivacy,
} from '../../../services/roomsApi';

function initials(name: string): string {
  const parts = (name || '').trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

const CAT_EMOJI: Record<string, string> = {
  start_here: '👋', your_cohort: '🎓', build_together: '🛠️', career_cert: '💼',
  demos_events: '🎤', social: '🎉', live_now: '🔴', private_rooms: '🔒',
};
function roomEmoji(room: Room): string {
  return room.metadata?.emoji || CAT_EMOJI[room.category] || '💬';
}

const SessionRow: React.FC<{ booking: BookingCard; live?: boolean; onJoin: (id: string) => void }> = ({ booking, live, onJoin }) => (
  <div className="rm-sess">
    <div className="rm-sess-main">
      <div className="rm-sess-title">{booking.title}</div>
      <div className="rm-sess-meta">
        <span className="rm-variant">{booking.variant.replace(/_/g, ' ')}</span>
        <span>·</span>
        <span>{booking.start_at ? fmtCentralDateTime(booking.start_at) : 'Now'}</span>
      </div>
    </div>
    <button type="button" className={`te-btn ${live ? 'cherry' : 'berry'} sm`} onClick={() => onJoin(booking.id)}>
      {live ? 'Join now' : 'RSVP & join'}
    </button>
  </div>
);

const RoomCard: React.FC<{ room: Room; onJoinVideo: (id: string) => void }> = ({ room, onJoinVideo }) => (
  <Link to={`/portal/rooms/${room.id}`} className={`te-card rm-roomcard cat-${room.category}`}>
    <div className="rm-emoji">{roomEmoji(room)}</div>
    <div className="rm-roomcard-main">
      <div className="rm-roomcard-top">
        <span className="rm-roomname">{room.name}</span>
        {room.is_video && <span className="rm-vbadge">▶ Video</span>}
        {room.privacy !== 'public' && <span className={`rm-privacy ${room.privacy}`}>{room.privacy.replace('_', ' ')}</span>}
      </div>
      <div className="rm-roomcard-tag">{room.metadata?.tagline || room.description || room.topic || 'Community room'}</div>
    </div>
    {room.is_video && (
      <button
        type="button"
        className="te-btn cherry sm rm-joinvid"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onJoinVideo(room.id); }}
      >
        Join
      </button>
    )}
  </Link>
);

const ShellCard: React.FC<{ room: Room }> = ({ room }) => (
  <div className="te-card rm-roomcard locked cat-private_rooms">
    <div className="rm-emoji">🔒</div>
    <div className="rm-roomcard-main">
      <div className="rm-roomcard-top">
        <span className="rm-roomname">Private room</span>
        <span className={`rm-privacy ${room.privacy}`}>{room.privacy.replace('_', ' ')}</span>
      </div>
      <div className="rm-roomcard-tag">Members only</div>
    </div>
  </div>
);

const NewRoomModal: React.FC<{ onClose: () => void; onCreated: () => void }> = ({ onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('build_together');
  const [privacy, setPrivacy] = useState<RoomPrivacy>('public');
  const [isVideo, setIsVideo] = useState(true);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try { await createRoom({ name: name.trim(), category, privacy, is_video: isVideo }); onCreated(); onClose(); }
    catch { setBusy(false); }
  };
  return (
    <div className="rm-overlay" onClick={onClose}>
      <div className="rm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rm-modal-h"><h2>New room</h2><button type="button" className="rm-x" onClick={onClose} aria-label="Close">×</button></div>
        <div className="rm-modal-body">
          <div className="rm-field"><label>Room name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. MCP Builders" maxLength={200} /></div>
          <div className="rm-row2">
            <div className="rm-field"><label>Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {ROOM_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>
            <div className="rm-field"><label>Who can join?</label>
              <select value={privacy} onChange={(e) => setPrivacy(e.target.value as RoomPrivacy)}>
                <option value="public">Public</option>
                <option value="cohort">My cohort</option>
                <option value="private">Private</option>
              </select>
            </div>
          </div>
          <label className={`rm-toggle${isVideo ? ' on' : ''}`}>
            <input type="checkbox" checked={isVideo} onChange={(e) => setIsVideo(e.target.checked)} />
            <span className="rm-toggle-txt"><b>📹 Video room</b><span>A Google Meet everyone can jump into, anytime.</span></span>
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
  const [outcome, setOutcome] = useState('');
  const [start, setStart] = useState('');
  const [duration, setDuration] = useState(60);
  const [privacy, setPrivacy] = useState<RoomPrivacy>('public');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async () => {
    if (!title.trim() || busy) return;
    setBusy(true); setErr('');
    try {
      const input: CreateBookingInput = { title: title.trim(), variant, privacy };
      if (outcome.trim()) input.outcome = outcome.trim();
      if (start) {
        const ms = new Date(start).getTime();
        if (!isNaN(ms)) {
          input.start_at = new Date(ms).toISOString();
          input.end_at = new Date(ms + duration * 60_000).toISOString();
          input.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        }
      }
      await createBooking(input); onCreated(); onClose();
    } catch { setErr('Could not create the session. Please try again.'); } finally { setBusy(false); }
  };
  return (
    <div className="rm-overlay" onClick={onClose}>
      <div className="rm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rm-modal-h"><h2>Book a session</h2><button type="button" className="rm-x" onClick={onClose} aria-label="Close">×</button></div>
        <div className="rm-modal-body">
          <div className="rm-field"><label>What are you hosting?</label>
            <select value={variant} onChange={(e) => setVariant(e.target.value as BookingVariant)}>
              {BOOKING_VARIANTS.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
            </select>
          </div>
          <div className="rm-field"><label>Title</label><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Claude Code office hours" maxLength={200} /></div>
          <div className="rm-field"><label>By the end, participants will…</label><textarea value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="The outcome of this session (optional)" maxLength={2000} /></div>
          <div className="rm-row2">
            <div className="rm-field"><label>When</label><input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div className="rm-field"><label>Duration</label>
              <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                <option value={30}>30 min</option><option value={45}>45 min</option><option value={60}>1 hour</option><option value={90}>90 min</option>
              </select>
            </div>
          </div>
          <div className="rm-field"><label>Who can join?</label>
            <select value={privacy} onChange={(e) => setPrivacy(e.target.value as RoomPrivacy)}>
              <option value="public">Public — anyone in the community</option>
              <option value="cohort">My cohort only</option>
              <option value="private">Private — invite only</option>
            </select>
          </div>
          {err && <div style={{ color: 'var(--cherry-text)', fontSize: 13 }}>{err}</div>}
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
  const [home, setHome] = useState<RoomsHome | null>(null);
  const [rooms, setRooms] = useState<RoomListItem[] | null>(null);
  const [people, setPeople] = useState<RoomPerson[] | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [category, setCategory] = useState<string>('');
  const [modal, setModal] = useState<'none' | 'book' | 'new'>('none');

  const loadHome = useCallback(async () => { setHome(await fetchRoomsHome()); }, []);
  const loadRooms = useCallback(async (cat: string) => { setRooms(await fetchRooms(cat || undefined)); }, []);

  useEffect(() => { loadHome().catch(() => setHome({ happening_now: [], up_next: [], my_rooms: [] })); }, [loadHome]);
  useEffect(() => { loadRooms(category).catch(() => setRooms([])); }, [category, loadRooms]);
  useEffect(() => { fetchMyProfile().then((p) => setMyId(p.id)).catch(() => {}); }, []);

  // Presence: ping first so the viewer registers online, then fetch People.
  // Repeat every 30s. This is why the panel is no longer empty.
  useEffect(() => {
    const cycle = () => {
      pingPresence().catch(() => {}).finally(() => { fetchPeople().then(setPeople).catch(() => setPeople([])); });
    };
    cycle();
    const id = window.setInterval(cycle, 30_000);
    return () => window.clearInterval(id);
  }, []);

  const online = (people || []).filter((p) => p.presence !== 'offline');
  const liveCount = home?.happening_now.length || 0;

  const joinVideo = async (roomId: string) => {
    try {
      const { join_url } = await joinVideoRoom(roomId);
      if (join_url) window.open(join_url, '_blank', 'noopener');
      else window.alert('Spinning up the video room… try again in a second.');
    } catch { window.alert('Could not join the video room.'); }
  };
  const joinSession = async (bookingId: string) => {
    try {
      const { join_url } = await joinBooking(bookingId);
      if (join_url) window.open(join_url, '_blank', 'noopener');
      else window.alert("You're in — the host hasn't posted the link yet.");
    } catch { window.alert('You are not eligible to join this session.'); }
  };
  const refresh = () => { loadHome().catch(() => {}); loadRooms(category).catch(() => {}); };

  return (
    <PortalShell>
      <div className="page-h">
        <div className="crumbs0">Belong</div>
        <h1>Rooms</h1>
        <div className="sub">Study together, demo your build, or jump into a live video room — anytime.</div>
      </div>

      <div className="rm-hero">
        <div className="rm-hero-stats">
          <span className="rm-stat"><b>{rooms?.length ?? 0}</b> rooms</span>
          <span className="rm-stat online"><b>{online.length}</b> online</span>
          {liveCount > 0 && <span className="rm-stat live"><span className="rm-dotlive" /><b>{liveCount}</b> live now</span>}
        </div>
        <div className="rm-hero-actions">
          <button type="button" className="te-btn ghost sm" onClick={() => setModal('new')}>+ New room</button>
          <button type="button" className="te-btn cherry sm" onClick={() => setModal('book')}>+ Book a session</button>
        </div>
      </div>

      <div className="te-grid">
        <div>
          <div className="te-feed-filter" style={{ marginBottom: 16 }}>
            <span className={`fchip${category === '' ? ' active' : ''}`} onClick={() => setCategory('')}>All</span>
            {ROOM_CATEGORIES.map((c) => (
              <span key={c.key} className={`fchip${category === c.key ? ' active' : ''}`} onClick={() => setCategory(c.key)}>{c.label}</span>
            ))}
          </div>

          {home && home.happening_now.length > 0 && (
            <div className="te-card" style={{ padding: 16, marginBottom: 16 }}>
              <p className="rm-strip-title"><span className="rm-live">Live</span> Happening now</p>
              {home.happening_now.map((b) => <SessionRow key={b.id} booking={b} live onJoin={joinSession} />)}
            </div>
          )}
          {home && home.up_next.length > 0 && (
            <div className="te-card" style={{ padding: 16, marginBottom: 16 }}>
              <p className="rm-strip-title">Up next</p>
              {home.up_next.map((b) => <SessionRow key={b.id} booking={b} onJoin={joinSession} />)}
            </div>
          )}

          {rooms === null && <div className="fc-empty">Loading rooms…</div>}
          {rooms !== null && rooms.length === 0 && (
            <div className="fc-empty">No rooms in this category yet — make one with “New room”.</div>
          )}
          {rooms !== null && rooms.length > 0 && (
            <div className="rm-grid">
              {rooms.map(({ visibility, room }) => (
                visibility === 'shell'
                  ? <ShellCard key={room.id} room={room} />
                  : <RoomCard key={room.id} room={room} onJoinVideo={joinVideo} />
              ))}
            </div>
          )}
        </div>

        <aside className="te-side">
          <div className="te-card te-scard">
            <h3>👋 People online</h3>
            {people === null && <div className="rm-empty">Loading…</div>}
            {people !== null && online.length === 0 && <div className="rm-empty">Be the first — you’ll show up here.</div>}
            {online.slice(0, 12).map((p) => (
              <div key={p.id} className="rm-person">
                <span className="rm-ava-ring">
                  <span className="cm-avatar sm">{initials(p.display_name)}</span>
                  <span className={`cm-dot ${p.presence}`} title={p.presence} />
                </span>
                <span className="rm-person-name">{p.display_name}</span>
                {p.id === myId && <span className="rm-you-tag">You</span>}
              </div>
            ))}
          </div>

          {home && home.my_rooms.length > 0 && (
            <div className="te-card te-scard">
              <h3>📌 Your rooms</h3>
              {home.my_rooms.map((r) => (
                <div key={r.id} className="rm-person">
                  <Link to={`/portal/rooms/${r.id}`} className="rm-person-name" style={{ textDecoration: 'none', color: 'var(--strong)' }}>{r.name}</Link>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>

      {modal === 'book' && <BookRoomModal onClose={() => setModal('none')} onCreated={refresh} />}
      {modal === 'new' && <NewRoomModal onClose={() => setModal('none')} onCreated={refresh} />}
    </PortalShell>
  );
};

export default RoomsPage;
