import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchPublicEvents, OpenHouseView } from '../../../services/onboardingApi';
import { formatEventWhen } from '../events/EventsPage';
import './UpcomingEventsStrip.css';

/**
 * Upcoming events on Today — the next few public events, above the timeline
 * feed, linking through to /portal/events.
 *
 * Deliberately a self-contained strip rather than cards injected into the
 * CAPE-governed paginated feed: that engine owns curriculum ordering, dedupe
 * and Feed Control governance, and events are neither curriculum nor ambient
 * content. This keeps the blast radius to one component.
 *
 * Renders NOTHING when there are no events or the fetch fails — Today already
 * has plenty of surfaces, and an empty or apologetic box on the main page is
 * worse than its absence.
 */

const SHOW = 3;
const WINDOW_DAYS = 30;

const UpcomingEventsStrip: React.FC = () => {
  const [events, setEvents] = useState<OpenHouseView[]>([]);

  useEffect(() => {
    let alive = true;
    fetchPublicEvents(WINDOW_DAYS)
      .then((rows) => { if (alive) setEvents(rows.slice(0, SHOW)); })
      .catch(() => { /* fail soft — the strip simply does not render */ });
    return () => { alive = false; };
  }, []);

  if (events.length === 0) return null;

  return (
    <section className="te-events-strip" aria-labelledby="te-events-strip-h">
      <div className="te-events-head">
        <span className="h" id="te-events-strip-h">
          <svg viewBox="0 0 24 24" fill="none" width={16} height={16} aria-hidden="true">
            <rect x="3" y="5" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="2" />
            <path d="M3 9h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Upcoming events
        </span>
        <Link className="te-events-all" to="/portal/events">See all →</Link>
      </div>

      <ul className="te-events-list">
        {events.map((ev) => (
          <li key={ev.id} className={ev.is_registered ? 'is-registered' : undefined}>
            <Link className="te-events-item" to="/portal/events">
              <span className="ev-when">{formatEventWhen(ev.starts_at, ev.ends_at)}</span>
              <span className="ev-title">{ev.title}</span>
              {ev.is_registered && <span className="ev-tag">Registered</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default UpcomingEventsStrip;
