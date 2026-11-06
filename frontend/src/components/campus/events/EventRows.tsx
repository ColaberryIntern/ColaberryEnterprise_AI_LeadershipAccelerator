import React from 'react';
import type { OpenHouseView } from '../../../services/onboardingApi';
import { EventSignup } from './EventSignup';
import { eventFacts, eventWhen } from './eventsModel';
import { useLiveClock } from '../campusLiveState';
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

/**
 * How long until the doors open, in words (C28b).
 *
 * PURE and exported, because a countdown is the easiest thing on this board to get wrong by a
 * margin nobody notices — out by an hour, counting down to a date that has passed, or showing
 * "0 minutes" for the twelve hours before an event.
 *
 * Deliberately COARSE. This is a wall in a room, read from across it, not a launch clock: days
 * and hours until the last hour, then minutes. Seconds on a board that re-renders every second
 * would be motion in the corner of the eye for no information — the live chip is where seconds
 * belong, and it already has them.
 */
export function timeUntil(startsAtIso: string, nowMs: number): string | null {
  const target = new Date(startsAtIso).getTime();
  if (!Number.isFinite(target)) return null;
  const diff = target - nowMs;
  // Already started, or finished. The board falls back to the day and time it printed before;
  // a negative countdown is worse than no countdown.
  if (diff <= 0) return null;

  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'starting now';
  if (mins < 60) return `in ${mins} minute${mins === 1 ? '' : 's'}`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `in ${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.floor(hours / 24);
  return `in ${days} day${days === 1 ? '' : 's'}`;
}

/**
 * The ticking half, kept in its own component so the interval has exactly one home and the
 * board above it re-renders only when the words change. `useLiveClock` is the campus's own
 * ticker, reused rather than a second `setInterval` — `campusLive.test.tsx` asserts that the
 * campus modules contain none of their own.
 */
export function EventCountdown({ startsAt }: { startsAt: string }): React.ReactElement | null {
  const now = useLiveClock(true);
  const left = timeUntil(startsAt, now);
  if (!left) return null;
  return <div className="cm-ev-countdown" data-testid="cm-board-countdown">Doors open {left}</div>;
}

/**
 * C26 (v6 D4): the Events Hall's board: the next event with one-tap Sign up, and All events.
 * C118 (Ali 2026-11-06, "add more details about the next upcoming event on the wall"): the title, then When (Central, with the
 * end time when known), the countdown, Where and how many signed up when the event says so, and a short description. Every
 * line comes from the event; a field it does not carry is left off, never filled in.
 */
export function NextEventBoard({ event, onSection }: { event: OpenHouseView | null; onSection: () => void }): React.ReactElement {
  if (!event) {
    return (
      <>
        <div className="k">Events Hall</div>
        <h3 className="plain" data-testid="cm-board-title">No events on the calendar yet</h3>
        <div className="row"><button type="button" className="b red" onClick={stop(onSection)} data-testid="cm-board-primary">All events &rarr;</button></div>
      </>
    );
  }
  const f = eventFacts(event);
  return (
    <div className="cm-evb" data-testid="cm-ev-board">
      <div className="k">Next event</div>
      <h3 data-testid="cm-board-title">{event.title}</h3>
      <dl className="cm-evb-facts">
        <div><dt>When</dt><dd data-testid="cm-ev-board-when">{f.when}</dd></div>
        {f.where && <div><dt>Where</dt><dd data-testid="cm-ev-board-where">{f.where}</dd></div>}
        {f.going && <div><dt>Going</dt><dd data-testid="cm-ev-board-going">{f.going}</dd></div>}
      </dl>
      <EventCountdown startsAt={event.starts_at} />
      {f.about && <p className="cm-evb-about" data-testid="cm-ev-board-about">{f.about}</p>}
      <div className="row" onClick={(ev) => ev.stopPropagation()}>
        <EventSignup event={event} />
        <button type="button" className="b" onClick={stop(onSection)} data-testid="cm-board-section">All events</button>
      </div>
    </div>
  );
}
