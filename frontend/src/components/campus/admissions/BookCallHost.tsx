import React, { useCallback, useEffect, useState } from 'react';
import { useHomeFacts } from '../home/useHomeFacts';
import BookCallSheet from './BookCallSheet';
import {
  BOOKING_CHANGED_EVENT, BOOK_CALL_PARAM, centralParts, getUpcoming, onBookCall, onWindowEvent, openBookCall, registerBookCallHost,
  type AdmissionsBooking,
} from './admissionsCallApi';

/**
 * The one host of the booking sheet (C20): mounted on the campus home and with the campus layers on every page, it opens on
 * openBookCall() from any entry point. useAdmissionsCall() is this learner's upcoming call, refreshed whenever a booking changes.
 */
export function useAdmissionsCall(enabled: boolean): AdmissionsBooking | null {
  const [booking, setBooking] = useState<AdmissionsBooking | null>(null);
  const refresh = useCallback(() => {
    if (!enabled) { setBooking(null); return; }
    getUpcoming().then(setBooking).catch(() => { /* Coming up is optional; a calendar outage just hides it */ });
  }, [enabled]);
  useEffect(() => { refresh(); return onWindowEvent(BOOKING_CHANGED_EVENT, refresh); }, [refresh]);
  return booking;
}

/** C122: true (and the param removed from the address bar) when this page was opened from Maya's booking link. */
export function takeBookCallParam(): boolean {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get(BOOK_CALL_PARAM) !== 'call') return false;
    url.searchParams.delete(BOOK_CALL_PARAM);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    return true;
  } catch { return false; }
}

export default function BookCallHost(): React.ReactElement | null {
  const [open, setOpen] = useState<{ current: AdmissionsBooking | null } | null>(null);
  const facts = useHomeFacts(false);
  useEffect(() => {
    const off = onBookCall((current) => setOpen({ current }));
    const unregister = registerBookCallHost();
    // C122: arrived from Maya's link (?book=call): open the sheet once
    if (takeBookCallParam()) setOpen({ current: null });
    return () => { off(); unregister(); };
  }, []);
  const close = useCallback(() => setOpen(null), []);
  return open ? <BookCallSheet name={facts.fullName || facts.firstName} current={open.current} onClose={close} /> : null;
}

/** Joinable from ten minutes before the start until the end. */
export const joinable = (b: AdmissionsBooking, now: Date): boolean =>
  !!b.meetLink && now.getTime() >= new Date(b.startTime).getTime() - 10 * 60_000 && now.getTime() <= new Date(b.endTime).getTime();

/** COMING UP (round 3 §2.6 #2): the booked admissions call at the top of the side panel, with Join (live at call time) and Reschedule. */
export function ComingUpCall({ booking, now }: { booking: AdmissionsBooking | null; now: Date }): React.ReactElement | null {
  if (!booking) return null;
  const p = centralParts(booking.startTime);
  return (
    <div className="cm-coming" data-testid="cm-cc-coming">
      <small>COMING UP</small>
      <b><span aria-hidden="true">📅 </span>Admissions call</b>
      <span>{p.day} · {p.time} {p.zone} · Google Meet</span>
      <div className="cm-book-row">
        {joinable(booking, now)
          ? <a className="cm-book-btn pri" href={booking.meetLink} target="_blank" rel="noopener noreferrer">Join</a>
          : <span className="cm-coming-note">The Meet link is in your email</span>}
        <button type="button" className="cm-book-btn" onClick={() => openBookCall(booking)} data-testid="cm-cc-coming-reschedule">Reschedule</button>
      </div>
    </div>
  );
}
