import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchCampusPresence, type CampusPerson } from '../campusApi';
import { WHO_CAN_JOIN, bookSession, hallwayChanged, onMeetSheet, openNewRoom, type Hallway, type MeetSheetOpen } from './hallwayApi';
import { SESSION_MINUTES, SLOTS, bookDays, centralSlotIso, centralWhen, doorSign, firstNameOf, hallwayDoors, initialsOf, type Door } from './hallwayModel';
import { roomPath, useHallway } from './Hallway';
import '../admissions/campusBook.css';
import './hallway.css';

/**
 * The Meeting Rooms sheets (C29, v7 R2; the prototype's renderMSheet), in the booking sheet's frame:
 *  - peek (tap a door): "Meeting room n", the name and line, who is inside (named only as the presence rule allows; the rest
 *    counted), and Join the room / Opens at ‹time› / Open this room;
 *  - + New room: name, who can join, invite (people on campus now, online first, and Reese), "Open the room now →" creates it
 *    through the existing rooms endpoint and takes you into it;
 *  - Book a session: the same plus a day (next seven business days) and a Central time; "Book the room →" books it through the
 *    existing bookings endpoint (idempotent per sheet) and the door shows "Booked · ‹day time›".
 * Failure: a create or book that fails says so in the sheet and changes nothing; nothing is claimed.
 */
type Vis = (typeof WHO_CAN_JOIN)[number]['label'];

function usePeopleOnCampus(enabled: boolean): CampusPerson[] {
  const [people, setPeople] = useState<CampusPerson[]>([]);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    fetchCampusPresence().then((p) => {
      const seen = new Map<string, CampusPerson>();
      for (const a of Object.values(p)) for (const x of a.people) if (!('anonymous' in x) && !seen.has(x.enrollment_id)) seen.set(x.enrollment_id, x);
      if (alive) setPeople(Array.from(seen.values()).slice(0, 8));
    }).catch(() => { /* the invite row is optional; you can invite from the room page later */ });
    return () => { alive = false; };
  }, [enabled]);
  return people;
}

function Peek({ door, onClose, onGo }: { door: Door; onClose: () => void; onGo: (route: string) => void }): React.ReactElement {
  const unnamed = door.insideCount - door.inside.length;
  return (
    <>
      <header>
        <small>MEETING ROOM {door.n}</small>
        <h2 id="cm-meet-h">{door.name}</h2>
        {door.sub && <p>{door.sub}</p>}
        <button type="button" className="cm-book-x" onClick={onClose} aria-label="Close">×</button>
      </header>
      <div className="cm-book-body" data-testid="cm-meet-peek">
        {door.insideCount > 0 ? (<>
          <div className="cm-book-legend">Inside · {door.insideCount}</div>
          <ul className="cm-meet-people">
            {door.inside.map((p) => (
              <li key={p.enrollment_id}><span className={`av${p.friend ? ' is-friend' : ''}`}>{initialsOf(p.display_name)}</span>
                <span className="tx">{p.display_name}{p.friend && <small>In your cohort</small>}</span></li>
            ))}
            {unnamed > 0 && <li><span className="tx"><small>{unnamed === 1 ? '1 more person' : `${unnamed} more people`}</small></span></li>}
          </ul>
        </>) : <p className="cm-book-muted">Nobody inside yet.</p>}
        <div className="cm-book-foot">
          <span className="cm-book-hint">{door.state === 'booked' && door.booking ? `${door.booking.hosting ? 'Booked by you' : 'You are going'} · ${centralWhen(door.booking.start_at)}` : 'Audio, video, screen share and chat'}</span>
          {door.state === 'live' && <button type="button" className="cm-book-btn pri" onClick={() => onGo(roomPath(door.roomId))} data-testid="cm-meet-join">Join the room &rarr;</button>}
          {door.state === 'booked' && door.booking && <button type="button" className="cm-book-btn" onClick={() => onGo(roomPath(door.roomId))}>Opens {doorSign(door).replace('Booked · ', '')}</button>}
          {door.state === 'idle' && <button type="button" className="cm-book-btn pri" onClick={() => onGo(roomPath(door.roomId))}>Open this room &rarr;</button>}
        </div>
      </div>
    </>
  );
}

function Compose({ book, reeseId, onClose, onGo }: { book: boolean; reeseId: string | null; onClose: () => void; onGo: (route: string) => void }): React.ReactElement {
  const [name, setName] = useState('');
  const [vis, setVis] = useState<Vis>('Cohort');
  const [inv, setInv] = useState<Set<string>>(new Set());
  const [day, setDay] = useState(0);
  const [slot, setSlot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const people = usePeopleOnCampus(true);
  const days = useMemo(() => bookDays(new Date()), []);
  const key = useRef(`campus-book-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  const toggle = (id: string) => setInv((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const privacy = WHO_CAN_JOIN.find((w) => w.label === vis)!.privacy;
  const inFlight = useRef(false); // a double tap lands before the disabled state renders
  const go = async () => {
    if (inFlight.current || (book && !slot)) return;
    inFlight.current = true;
    const title = name.trim() || (book ? 'Your session' : 'Your room');
    setBusy(true); setMessage('');
    try {
      if (book) {
        const startIso = centralSlotIso(days[day].key, slot!);
        const endIso = new Date(new Date(startIso).getTime() + SESSION_MINUTES * 60_000).toISOString();
        await bookSession({ title, privacy, startIso, endIso, invite: Array.from(inv), key: key.current });
        hallwayChanged(); onClose();
      } else {
        const roomId = await openNewRoom(title, privacy, Array.from(inv));
        hallwayChanged(); onGo(roomPath(roomId));
      }
    } catch {
      inFlight.current = false;
      setBusy(false);
      setMessage(book ? 'Could not book the room right now. Please try again.' : 'Could not open the room right now. Please try again.');
    }
  };
  return (
    <>
      <header>
        <small>MEETING ROOMS</small>
        <h2 id="cm-meet-h">{book ? 'Book a session' : 'Open a new room'}</h2>
        <p>{book ? 'Reserve a room for later. Everyone you invite can find it in the room.' : 'A live room with audio, video, screen share and chat. It opens right now.'}</p>
        <button type="button" className="cm-book-x" onClick={onClose} aria-label="Close">×</button>
      </header>
      <div className="cm-book-body" data-testid={book ? 'cm-meet-book' : 'cm-meet-new'}>
        <label className="cm-book-note"><span className="cm-book-legend">Name</span>
          <input className="cm-meet-input" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} placeholder={book ? 'e.g. Pair on STORY-001' : 'e.g. Week 1 study group'} data-testid="cm-meet-name" />
        </label>
        <fieldset><legend>Who can join</legend><div className="cm-book-chips">
          {WHO_CAN_JOIN.map((w) => <button key={w.label} type="button" className={`cm-book-chip${vis === w.label ? ' on' : ''}`} aria-pressed={vis === w.label} onClick={() => setVis(w.label)}>{w.label}</button>)}
        </div></fieldset>
        {(people.length > 0 || reeseId) && (
          <fieldset><legend>Invite</legend><div className="cm-book-chips">
            {people.map((p) => (
              <button key={p.enrollment_id} type="button" className={`cm-book-chip${inv.has(p.enrollment_id) ? ' on' : ''}`} aria-pressed={inv.has(p.enrollment_id)} onClick={() => toggle(p.enrollment_id)}>
                <span className="av">{initialsOf(p.display_name)}</span>{firstNameOf(p.display_name)}</button>
            ))}
            {reeseId && <button type="button" className={`cm-book-chip${inv.has(reeseId) ? ' on' : ''}`} aria-pressed={inv.has(reeseId)} onClick={() => toggle(reeseId)} data-testid="cm-meet-invite-reese">
              <span className="av is-staff">RE</span>Reese</button>}
          </div></fieldset>
        )}
        {book && (<>
          <fieldset><legend>Day</legend><div className="cm-book-days">
            {days.map((d, i) => <button key={d.key} type="button" className={`cm-book-day${i === day ? ' on' : ''}`} aria-pressed={i === day} onClick={() => setDay(i)}><small>{d.wd}</small><b>{d.d}</b><small>{d.mon}</small></button>)}
          </div></fieldset>
          <fieldset><legend>Time · Central</legend><div className="cm-book-slots" data-testid="cm-meet-slots">
            {SLOTS.map((t) => <button key={t} type="button" className={`cm-book-slot${slot === t ? ' on' : ''}`} aria-pressed={slot === t} onClick={() => setSlot(t)}>{t}</button>)}
          </div></fieldset>
        </>)}
        {message && <p className="cm-book-msg" role="alert">{message}</p>}
        <div className="cm-book-foot">
          <span className="cm-book-hint">{inv.size ? `${inv.size} invited` : 'You can invite people later too'}</span>
          <button type="button" className="cm-book-btn pri" disabled={busy || (book && !slot)} onClick={go} data-testid="cm-meet-go">
            {busy ? (book ? 'Booking…' : 'Opening…') : book ? 'Book the room →' : 'Open the room now →'}</button>
        </div>
      </div>
    </>
  );
}

export function MeetingSheet({ open, hallway, onClose }: { open: MeetSheetOpen; hallway: Hallway | null; onClose: () => void }): React.ReactElement | null {
  const navigate = useNavigate();
  const go = useCallback((route: string) => { onClose(); navigate(route); }, [navigate, onClose]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const door = open.mode === 'peek' && hallway ? hallwayDoors(hallway).find((d): d is Door => !d.more && d.roomId === open.roomId) ?? null : null;
  if (open.mode === 'peek' && !door) return null;
  return (
    <div className="cm-book-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cm-book" role="dialog" aria-modal="true" aria-labelledby="cm-meet-h" data-testid="cm-meet">
        {door ? <Peek door={door} onClose={onClose} onGo={go} /> : <Compose book={open.mode === 'book'} reeseId={hallway?.reese_id ?? null} onClose={onClose} onGo={go} />}
      </div>
    </div>
  );
}

/** The one host: mounted with the campus layers, it opens on openMeetSheet() from the board, a door or the arrival card. */
export default function MeetingSheetHost(): React.ReactElement | null {
  const [open, setOpen] = useState<MeetSheetOpen | null>(null);
  const { hallway } = useHallway(open !== null);
  useEffect(() => onMeetSheet(setOpen), []);
  const close = useCallback(() => setOpen(null), []);
  return open ? <MeetingSheet open={open} hallway={hallway} onClose={close} /> : null;
}
