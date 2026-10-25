import React from 'react';
import type { OpenHouseView } from '../../../services/onboardingApi';
import { EventSignup } from './EventSignup';
import { eventWhen, weekStrip } from './eventsModel';
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

/** COMING UP, events (v6 D5): the events you are going to, at the top of the side panel ("on your calendar" per Eventbrite). */
export function ComingUpEvents({ events }: { events: OpenHouseView[] }): React.ReactElement | null {
  if (!events.length) return null;
  return (
    <div className="cm-coming" data-testid="cm-cc-coming-events">
      <small>COMING UP</small>
      {events.map((e) => {
        const w = eventWhen(e.starts_at);
        return <div key={e.id} className="cm-coming-ev"><b><span aria-hidden="true">🎪 </span>{e.title}</b><span>{w.day} · {w.time} · you&rsquo;re registered</span></div>;
      })}
    </div>
  );
}

export function UpcomingEvents({ events }: { events: OpenHouseView[] | null }): React.ReactElement | null {
  if (events === null) return null;
  return (
    <div className="cm-ev" data-testid="cm-ev-upcoming">
      <div className="cm-sec">Upcoming events · one tap to sign up</div>
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

export function ScheduleBoard({ events, all, now, onSection }: { events: OpenHouseView[]; all: OpenHouseView[]; now: Date; onSection: () => void }): React.ReactElement {
  return (
    <>
      <div className="k">Your week · upcoming events</div>
      <div className="cm-ev-strip" data-testid="cm-board-strip">
        {weekStrip(all, now).map((d) => (
          <span key={d.ymd} className={`d${d.today ? ' is-today' : ''}`} data-has-event={d.hasEvent || undefined}>
            <small>{d.wd}</small><b>{d.d}</b>{d.hasEvent && <i aria-label="an event that day" />}
          </span>
        ))}
      </div>
      <h3 className="cm-ev-board-h" data-testid="cm-board-title">{events.length ? 'Coming up' : 'Nothing on the calendar this week'}</h3>
      <ul className="cm-ev-board-rows" onClick={(ev) => ev.stopPropagation()}>
        {events.map((e) => <EventRow key={e.id} e={e} testId={`cm-board-ev-${e.id}`} />)}
      </ul>
      <div className="row"><button type="button" className="b red" onClick={stop(onSection)} data-testid="cm-board-primary">Open my schedule &rarr;</button></div>
    </>
  );
}
