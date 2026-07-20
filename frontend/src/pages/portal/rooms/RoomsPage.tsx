import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PortalShell from '../today/PortalShell';
import '../today/TodayShell.css';
import '../feed/feed.css';
import '../community/community.css';
import './rooms.css';
import { fmtCentralDateTime } from '../today/shellUtils';
import {
  fetchRoomsHome, fetchRooms, fetchPeople, joinBooking, createBooking,
  RoomsHome, RoomListItem, RoomPerson, BookingCard, CreateBookingInput,
  ROOM_CATEGORIES, BOOKING_VARIANTS, BookingVariant, RoomPrivacy,
} from '../../../services/roomsApi';

function initials(name: string): string {
  const parts = (name || '').trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

const SessionRow: React.FC<{ booking: BookingCard; live?: boolean; onJoin: (id: string) => void }> = ({ booking, live, onJoin }) => (
  <div className="rm-sess">
    <div className="rm-sess-main">
      <div className="rm-sess-title">{booking.title}</div>
      <div className="rm-sess-meta">
        <span className="rm-variant">{booking.variant.replace(/_/g, ' ')}</span>
        <span>·</span>
        <span>{booking.start_at ? fmtCentralDateTime(booking.start_at) : 'Now'}</span>
        {live && <span className="rm-live">Live</span>}
      </div>
    </div>
    <button type="button" className={`te-btn ${live ? 'cherry' : 'berry'} sm`} onClick={() => onJoin(booking.id)}>
      {live ? 'Join now' : 'RSVP & join'}
    </button>
  </div>
);

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
        const startMs = new Date(start).getTime();
        if (!isNaN(startMs)) {
          input.start_at = new Date(startMs).toISOString();
          input.end_at = new Date(startMs + duration * 60_000).toISOString();
          input.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        }
      }
      await createBooking(input);
      onCreated();
      onClose();
    } catch {
      setErr('Could not create the session. Please try again.');
    } finally { setBusy(false); }
  };

  return (
    <div className="rm-overlay" onClick={onClose}>
      <div className="rm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rm-modal-h"><h2>Book a session</h2><button type="button" className="rm-x" onClick={onClose} aria-label="Close">×</button></div>
        <div className="rm-modal-body">
          <div className="rm-field">
            <label>What are you hosting?</label>
            <select value={variant} onChange={(e) => setVariant(e.target.value as BookingVariant)}>
              {BOOKING_VARIANTS.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
            </select>
          </div>
          <div className="rm-field">
            <label>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Claude Code office hours" maxLength={200} />
          </div>
          <div className="rm-field">
            <label>By the end, participants will… <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optional)</span></label>
            <textarea value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="The outcome of this session" maxLength={2000} />
          </div>
          <div className="rm-row2">
            <div className="rm-field">
              <label>When</label>
              <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="rm-field">
              <label>Duration</label>
              <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                <option value={30}>30 min</option>
                <option value={45}>45 min</option>
                <option value={60}>1 hour</option>
                <option value={90}>90 min</option>
              </select>
            </div>
          </div>
          <div className="rm-field">
            <label>Who can join?</label>
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
          <button type="button" className="te-btn cherry sm" onClick={submit} disabled={busy || !title.trim()}>
            {busy ? 'Creating…' : 'Create session'}
          </button>
        </div>
      </div>
    </div>
  );
};

const RoomsPage: React.FC = () => {
  const [home, setHome] = useState<RoomsHome | null>(null);
  const [rooms, setRooms] = useState<RoomListItem[] | null>(null);
  const [people, setPeople] = useState<RoomPerson[] | null>(null);
  const [category, setCategory] = useState<string>('');
  const [showBook, setShowBook] = useState(false);

  const loadHome = useCallback(async () => {
    setHome(await fetchRoomsHome());
  }, []);

  const loadRooms = useCallback(async (cat: string) => {
    setRooms(await fetchRooms(cat || undefined));
  }, []);

  useEffect(() => { loadHome().catch(() => setHome({ happening_now: [], up_next: [], my_rooms: [] })); }, [loadHome]);
  useEffect(() => { loadRooms(category).catch(() => setRooms([])); }, [category, loadRooms]);
  useEffect(() => { fetchPeople().then(setPeople).catch(() => setPeople([])); }, []);

  const onlinePeople = (people || []).filter((p) => p.presence !== 'offline');

  const handleJoin = async (bookingId: string) => {
    try {
      const { join_url } = await joinBooking(bookingId);
      if (join_url) window.open(join_url, '_blank', 'noopener');
      else window.alert("You're in — the host hasn't posted the meeting link yet. Check back when it's live.");
    } catch {
      window.alert('You are not eligible to join this session.');
    }
  };

  return (
    <PortalShell>
      <div className="page-h">
        <div className="crumbs0">Belong</div>
        <h1>Rooms</h1>
        <div className="sub">Study together, demo your build, or drop into office hours — live with your cohort.</div>
      </div>

      <div className="te-grid">
        <div>
          <div className="rm-actions-row">
            <div className="te-feed-filter" style={{ margin: 0 }}>
              <span className={`fchip${category === '' ? ' active' : ''}`} onClick={() => setCategory('')}>All</span>
              {ROOM_CATEGORIES.map((c) => (
                <span key={c.key} className={`fchip${category === c.key ? ' active' : ''}`} onClick={() => setCategory(c.key)}>{c.label}</span>
              ))}
            </div>
            <span className="spacer" />
            <button type="button" className="te-btn cherry sm" onClick={() => setShowBook(true)}>+ Book a session</button>
          </div>

          {home && home.happening_now.length > 0 && (
            <div className="te-card" style={{ padding: 16, marginBottom: 16 }}>
              <p className="rm-strip-title">Happening now</p>
              {home.happening_now.map((b) => <SessionRow key={b.id} booking={b} live onJoin={handleJoin} />)}
            </div>
          )}

          {home && home.up_next.length > 0 && (
            <div className="te-card" style={{ padding: 16, marginBottom: 16 }}>
              <p className="rm-strip-title">Up next</p>
              {home.up_next.map((b) => <SessionRow key={b.id} booking={b} onJoin={handleJoin} />)}
            </div>
          )}

          {rooms === null && <div className="fc-empty">Loading rooms…</div>}
          {rooms !== null && rooms.length === 0 && (
            <div className="fc-empty">No rooms here yet — start one with “Book a session”.</div>
          )}
          {rooms !== null && rooms.length > 0 && (
            <div className="rm-grid">
              {rooms.map(({ visibility, room }) => (
                visibility === 'shell' ? (
                  <div key={room.id} className="te-card rm-card locked">
                    <div className="rm-head">
                      <svg className="rm-lock" viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" /></svg>
                      <span className="rm-title">Private room</span>
                      <span className={`rm-privacy ${room.privacy}`}>{room.privacy.replace('_', ' ')}</span>
                    </div>
                    <div className="rm-foot"><span className="rm-cat">{room.category.replace(/_/g, ' ')}</span></div>
                  </div>
                ) : (
                  <Link key={room.id} to={`/portal/rooms/${room.id}`} className="te-card rm-card">
                    <div className="rm-head">
                      <span className="rm-title">{room.name}</span>
                      {room.privacy !== 'public' && <span className={`rm-privacy ${room.privacy}`}>{room.privacy.replace('_', ' ')}</span>}
                    </div>
                    {(room.description || room.topic) && <div className="rm-desc">{room.description || room.topic}</div>}
                    <div className="rm-foot"><span className="rm-cat">{room.category.replace(/_/g, ' ')}</span></div>
                  </Link>
                )
              ))}
            </div>
          )}
        </div>

        <aside className="te-side">
          <div className="te-card te-scard">
            <h3><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="2" /><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg> People online</h3>
            {people === null && <div className="cm-empty">Loading…</div>}
            {people !== null && onlinePeople.length === 0 && <div className="cm-empty">No one online right now</div>}
            {onlinePeople.slice(0, 12).map((p) => (
              <div key={p.id} className="cm-contact-row">
                <span className="cm-avatar sm">{initials(p.display_name)}</span>
                <span className="cm-contact-name">{p.display_name}</span>
                <span className={`cm-dot ${p.presence}`} title={p.presence} />
              </div>
            ))}
          </div>

          {home && home.my_rooms.length > 0 && (
            <div className="te-card te-scard">
              <h3><svg viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M17 9l4-2v10l-4-2" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg> Your rooms</h3>
              {home.my_rooms.map((r) => (
                <div key={r.id} className="cm-contact-row">
                  <Link to={`/portal/rooms/${r.id}`} className="cm-contact-name" style={{ textDecoration: 'none', color: 'var(--strong)' }}>{r.name}</Link>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>

      {showBook && <BookRoomModal onClose={() => setShowBook(false)} onCreated={() => { loadHome().catch(() => {}); loadRooms(category).catch(() => {}); }} />}
    </PortalShell>
  );
};

export default RoomsPage;
