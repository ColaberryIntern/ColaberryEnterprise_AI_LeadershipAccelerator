import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ADMISSIONS_TOPICS, TOPIC_LABEL, NOTE_MAX, bookCall, cancelCall, centralParts, dayTile, getSlots, bookingChanged,
  type AdmissionsBooking, type AdmissionsTopic, type SlotDay,
} from './admissionsCallApi';
import './campusBook.css';

/**
 * "Book a call with admissions" (round 3 §2.7, the prototype's #book; Basecamp C20). A real person, 30 minutes on Google Meet:
 * what it's about, a day from the next seven business days, a time in Central (taken times are simply not offered), an optional
 * note, and you (your name; your account email is used). Book the call, then the confirmation with Done and Reschedule.
 * Reschedule cancels the booked call first, then lets you pick again. Every outcome is drawn: a taken time asks for another, an
 * existing booking offers Reschedule, an unavailable calendar says so (nothing is claimed).
 */
const initialsOf = (n: string) => n.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || 'Y';
type Phase ={ at: 'pick' } | { at: 'booking' } | { at: 'done'; booking: AdmissionsBooking } | { at: 'already'; booking: AdmissionsBooking | null };

export interface BookCallSheetProps {
  name: string;
  /** Open on an existing booking (Coming up's Reschedule) instead of the picker. */
  current?: AdmissionsBooking | null;
  onClose: () => void;
}

function When({ b }: { b: AdmissionsBooking }): React.ReactElement {
  const p = centralParts(b.startTime);
  return <p className="cm-book-when" data-testid="cm-book-when"><b>{p.day}</b> · {p.time} {p.zone} · 30 minutes on Google Meet</p>;
}

export default function BookCallSheet({ name, current = null, onClose }: BookCallSheetProps): React.ReactElement {
  const [phase, setPhase] = useState<Phase>(current ? { at: 'already', booking: current } : { at: 'pick' });
  const [days, setDays] = useState<SlotDay[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [topic, setTopic] = useState<AdmissionsTopic | null>(null);
  const [day, setDay] = useState(0);
  const [slot, setSlot] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const first = useRef<HTMLButtonElement | null>(null);

  const load = useCallback(() => {
    setDays(null); setLoadError(false); setSlot(null);
    getSlots().then((s) => setDays(s.dates)).catch(() => setLoadError(true));
  }, []);
  // Load once when the picker first shows; a reload after a taken time or a reschedule goes through load() directly.
  const loaded = useRef(false);
  useEffect(() => { if (phase.at === 'pick' && !loaded.current) { loaded.current = true; load(); } }, [phase.at, load]);
  useEffect(() => { first.current?.focus(); }, [phase.at]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const today = days?.[day] ?? null;
  const zone = useMemo(() => (days?.[0]?.slots[0] ? centralParts(days[0].slots[0].start).zone : 'CT'), [days]);

  const submit = async () => {
    if (!topic || !slot) return;
    setPhase({ at: 'booking' }); setMessage('');
    const r = await bookCall({ slotStart: slot, topic, ...(note.trim() ? { note: note.trim() } : {}) });
    if (r.kind === 'booked') { bookingChanged(); setPhase({ at: 'done', booking: r.booking }); return; }
    if (r.kind === 'already') { setPhase({ at: 'already', booking: r.booking }); return; }
    setPhase({ at: 'pick' });
    if (r.kind === 'taken') { setMessage('That time was just taken. Please pick another.'); load(); }
    else setMessage('Booking is not available right now. Please try again shortly.');
  };

  const reschedule = async (b: AdmissionsBooking | null) => {
    if (b) {
      try { await cancelCall(b.eventId); } catch { setMessage('Could not cancel that call right now. Please try again shortly.'); return; }
      bookingChanged();
    }
    loaded.current = true;
    setPhase({ at: 'pick' }); setTopic(b?.topic ?? topic); load();
  };

  return (
    <div className="cm-book-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cm-book" role="dialog" aria-modal="true" aria-labelledby="cm-book-h" data-testid="cm-book">
        <header>
          <small>TALK TO A PERSON</small>
          <h2 id="cm-book-h">Book a call with admissions</h2>
          <p>A real person from the admissions team, not an AI. 30 minutes on Google Meet.</p>
          <button type="button" className="cm-book-x" onClick={onClose} aria-label="Close">×</button>
        </header>

        {phase.at === 'done' && (
          <section className="cm-book-ok" data-testid="cm-book-confirmed">
            <h3>✓ You&rsquo;re booked</h3>
            <When b={phase.booking} />
            <p>The invite and Meet link are in your email.</p>
            <div className="cm-book-row">
              <button ref={first} type="button" className="cm-book-btn pri" onClick={onClose}>Done</button>
              <button type="button" className="cm-book-btn" onClick={() => reschedule(phase.booking)} data-testid="cm-book-reschedule">Reschedule</button>
            </div>
          </section>
        )}

        {phase.at === 'already' && (
          <section className="cm-book-ok" data-testid="cm-book-already">
            <h3>You already have a call booked</h3>
            {phase.booking && <When b={phase.booking} />}
            {message && <p className="cm-book-msg" role="alert">{message}</p>}
            <div className="cm-book-row">
              <button ref={first} type="button" className="cm-book-btn pri" onClick={onClose}>Keep it</button>
              <button type="button" className="cm-book-btn" onClick={() => reschedule(phase.booking)} data-testid="cm-book-reschedule">Reschedule</button>
            </div>
          </section>
        )}

        {(phase.at === 'pick' || phase.at === 'booking') && (
          <div className="cm-book-body">
            <fieldset>
              <legend>What&rsquo;s it about?</legend>
              <div className="cm-book-chips">
                {ADMISSIONS_TOPICS.map((t, i) => (
                  <button key={t} ref={i === 0 ? first : undefined} type="button" className={`cm-book-chip${topic === t ? ' on' : ''}`} aria-pressed={topic === t} onClick={() => setTopic(t)} data-testid={`cm-book-topic-${t}`}>{TOPIC_LABEL[t]}</button>
                ))}
              </div>
            </fieldset>
            {loadError && <p className="cm-book-msg" role="alert">Booking is not available right now. <button type="button" className="cm-book-link" onClick={load}>Try again</button></p>}
            {!loadError && days === null && <p className="cm-book-muted" role="status">Finding open times…</p>}
            {days && days.length === 0 && <p className="cm-book-msg" role="status">No open times in the next seven business days. Please check back tomorrow.</p>}
            {days && days.length > 0 && (<>
              <fieldset>
                <legend>Pick a day</legend>
                <div className="cm-book-days">
                  {days.map((d, i) => {
                    const t = dayTile(d.slots[0].start);
                    return (
                      <button key={d.date} type="button" className={`cm-book-day${i === day ? ' on' : ''}`} aria-pressed={i === day} aria-label={centralParts(d.slots[0].start).day}
                        onClick={() => { setDay(i); setSlot(null); }}><small>{t.wd}</small><b>{t.d}</b><small>{t.m}</small></button>
                    );
                  })}
                </div>
              </fieldset>
              <fieldset>
                <legend>Pick a time · Central ({zone})</legend>
                <div className="cm-book-slots" data-testid="cm-book-slots">
                  {today?.slots.map((s) => (
                    <button key={s.start} type="button" className={`cm-book-slot${slot === s.start ? ' on' : ''}`} aria-pressed={slot === s.start} onClick={() => setSlot(s.start)}>{centralParts(s.start).time}</button>
                  ))}
                </div>
              </fieldset>
            </>)}
            <label className="cm-book-note"><span className="cm-book-legend">Anything they should know? (optional)</span>
              <textarea value={note} maxLength={NOTE_MAX} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="e.g. my employer may sponsor the next cohort" />
            </label>
            <div className="cm-book-legend">You</div>
            <div className="cm-book-you" data-testid="cm-book-you">
              <span className="av" aria-hidden="true">{initialsOf(name)}</span>
              <span><b>{name || 'You'}</b><small>Uses your account email</small></span>
            </div>
            {message && <p className="cm-book-msg" role="alert">{message}</p>}
            <div className="cm-book-foot">
              <span className="cm-book-hint">{!topic ? 'Pick what it’s about' : !slot ? 'Pick a time to continue' : `${centralParts(slot).day} · ${centralParts(slot).time}`}</span>
              <button type="button" className="cm-book-btn pri" disabled={!topic || !slot || phase.at === 'booking'} onClick={submit} data-testid="cm-book-submit">
                {phase.at === 'booking' ? 'Booking…' : 'Book the call →'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
