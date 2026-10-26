import React from 'react';
import type { OpenHouseView } from '../../../services/onboardingApi';
import { EventSignup } from './EventSignup';
import { eventWhen } from './eventsModel';
import './campusEvents.css';

/**
 * C27 (v6 D5) event surfaces: the Schedule room's board ("YOUR WEEK · UPCOMING EVENTS": a 7-day strip, today in ink, event days
 * dotted, then the events with Sign up / ✓ You're going) and the arrival card's "Upcoming events · one tap to sign up" rows (the
 * Schedule and the Events Hall). Real events only: none upcoming says so.
 */
export function EventRow({ e, testId }: { e: OpenHouseView; testId?: string }): React.ReactElement {
  const w = eventWhen(e.starts_at);
  return (
    <li className="cm-ev-row" data-testid={testId ?? `cm-ev-row-${e.id}`}>
      <span className="when"><b>{w.day}</b><small>{w.time}</small></span>
      <span className="what">{e.title}</span>
      <EventSignup event={e} compact />
    </li>
  );
}

// C33 (v7 R6): Coming up and the Schedule board are one list now (Agenda.tsx: classes, events and booked sessions).

export function UpcomingEvents({ events, heading = 'Upcoming events · one tap to sign up' }: { events: OpenHouseView[] | null; heading?: string }): React.ReactElement | null {
  if (events === null) return null;
  return (
    <div className="cm-ev" data-testid="cm-ev-upcoming">
      <div className="cm-sec">{heading}</div>
      {events.length ? <ul className="cm-ev-rows">{events.map((e) => <EventRow key={e.id} e={e} />)}</ul>
        : <p className="cm-ev-none">No events on the calendar in the next 30 days.</p>}
    </div>
  );
}

const stop = (fn: () => void) => (ev: React.MouseEvent) => { ev.stopPropagation(); fn(); };

/** C26 (v6 D4): the Events Hall's board: the next event with one-tap Sign up, and All events. */
export function NextEventBoard({ event, onSection }: { event: OpenHouseView | null; onSection: () => void }): React.ReactElement {
  if (!event) {
    return (
      <>
        <h3 className="plain" data-testid="cm-board-title">No events on the calendar yet</h3>
        <div className="row"><button type="button" className="b red" onClick={stop(onSection)} data-testid="cm-board-primary">All events &rarr;</button></div>
      </>
    );
  }
  const w = eventWhen(event.starts_at);
  return (
    <>
      <div className="k">Next event · {w.day} · {w.time}</div>
      <h3 data-testid="cm-board-title">{event.title}</h3>
      <div className="row" onClick={(ev) => ev.stopPropagation()}>
        <EventSignup event={event} />
        <button type="button" className="b" onClick={stop(onSection)} data-testid="cm-board-section">All events</button>
      </div>
    </>
  );
}
