import React, { useEffect, useMemo, useState } from 'react';
import PortalShell from '../today/PortalShell';
import CondensedHeaderCard from '../today/CondensedHeaderCard';
import { fetchPublicEvents, OpenHouseView } from '../../../services/onboardingApi';
import './EventsPage.css';

/**
 * Events — the public event list, ported from the legacy training site
 * (app.colaberry.com/app/training/events) minus its month calendar.
 *
 * Source is `/api/portal/events`, the same CCPP `EventBrite_Events` feed the
 * Schedule page and the topbar "Next event" chip read, filtered to the CCPP
 * `Registration` label. The promo artwork is Eventbrite's own `Logo_url`, so a
 * card looks like its Eventbrite listing without us re-hosting anything.
 *
 * Per the repo date-helper rule no `new Date()` runs at module top level; every
 * "now" is computed inside the component.
 */

// The endpoint caps `days` at 90. Ask for the full window — the legacy page was
// a long scrolling list, not a 30-day slice.
const WINDOW_DAYS = 90;
// Legacy cards showed roughly two lines of copy before "... more". CCPP
// descriptions run 80-130 chars, so most render whole.
const BLURB_MAX = 118;

const DATE_FMT: Intl.DateTimeFormatOptions = {
  weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago',
};
const TIME_FMT: Intl.DateTimeFormatOptions = {
  hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago',
};

/** 'Tue, Sep 1, 2026 10:00 AM - 12:00 PM CDT' — the legacy card's date line. */
export function formatEventWhen(startsAt: string, endsAt: string | null): string {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return '';
  const date = start.toLocaleDateString('en-US', DATE_FMT);
  const from = start.toLocaleTimeString('en-US', TIME_FMT);
  const end = endsAt ? new Date(endsAt) : null;
  // Only render a range when the end is real AND after the start — CCPP has rows
  // where EndDate equals or precedes StartDate, and "10:00 AM - 10:00 AM" reads
  // like a bug to a student.
  const to = end && !Number.isNaN(end.getTime()) && end.getTime() > start.getTime()
    ? end.toLocaleTimeString('en-US', TIME_FMT)
    : null;
  return `${date} ${from}${to ? ` - ${to}` : ''}`;
}

/** Trim to a word boundary under `max`, appending an ellipsis when cut. */
export function truncateBlurb(text: string | null, max = BLURB_MAX): { text: string; cut: boolean } {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return { text: clean, cut: false };
  const slice = clean.slice(0, max);
  const lastSpace = slice.lastIndexOf(' ');
  return { text: slice.slice(0, lastSpace > 40 ? lastSpace : max).trimEnd(), cut: true };
}

/** Group events by calendar month so a long list stays scannable. */
export function groupByMonth(events: OpenHouseView[]): Array<{ key: string; label: string; items: OpenHouseView[] }> {
  const out: Array<{ key: string; label: string; items: OpenHouseView[] }> = [];
  for (const ev of events) {
    const d = new Date(ev.starts_at);
    if (Number.isNaN(d.getTime())) continue;
    const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'America/Chicago' });
    const last = out[out.length - 1];
    if (last && last.key === label) last.items.push(ev);
    else out.push({ key: label, label, items: [ev] });
  }
  return out;
}

const EventCard: React.FC<{ ev: OpenHouseView }> = ({ ev }) => {
  // An Eventbrite CDN URL can 404 or be blocked; fall back to the lettered tile
  // rather than leaving a broken-image frame in the grid.
  const [imgBroken, setImgBroken] = useState(false);
  const blurb = truncateBlurb(ev.description);
  const showImage = Boolean(ev.image_url) && !imgBroken;

  return (
    <article className="evt-card">
      <div className="evt-thumb">
        {showImage ? (
          <img
            src={ev.image_url as string}
            alt=""
            loading="lazy"
            onError={() => setImgBroken(true)}
          />
        ) : (
          // Decorative stand-in; the title right below carries the meaning, so
          // this is aria-hidden rather than duplicating it to a screen reader.
          <div className="evt-thumb-fallback" aria-hidden="true">
            <span>{(ev.title || '?').trim().charAt(0).toUpperCase()}</span>
          </div>
        )}
      </div>

      <div className="evt-body">
        <p className="evt-when">{formatEventWhen(ev.starts_at, ev.ends_at)}</p>
        <h3 className="evt-title">{ev.title}</h3>
        {blurb.text && (
          <p className="evt-blurb">
            {blurb.text}
            {blurb.cut && <span className="evt-ellipsis"> ...</span>}
          </p>
        )}
      </div>

      {ev.registration_url && (
        <div className="evt-foot">
          <a
            className="evt-btn"
            href={ev.registration_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Register
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 12h13M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>
      )}
    </article>
  );
};

const EventsPage: React.FC = () => {
  const [events, setEvents] = useState<OpenHouseView[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rows = await fetchPublicEvents(WINDOW_DAYS);
        if (!alive) return;
        setEvents(rows);
      } catch {
        // The feed already degrades server-side (CCPP -> Postgres -> empty), so
        // reaching here means the request itself failed. Say so instead of
        // rendering an empty list that reads as "no events scheduled".
        if (alive) setFailed(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const months = useMemo(() => groupByMonth(events), [events]);
  const next = events[0];

  return (
    <PortalShell
      condensedSlot={next ? (
        <CondensedHeaderCard
          icon={<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="2" /><path d="M3 9h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>}
          tone="berry"
          label="Next event"
          title={next.title}
          sub={formatEventWhen(next.starts_at, next.ends_at)}
          action={next.registration_url
            ? <a className="te-btn ghost sm" href={next.registration_url} target="_blank" rel="noopener noreferrer">Register →</a>
            : undefined}
        />
      ) : undefined}
    >
      <div className="evt-root">
        <header className="evt-head">
          <h1 className="evt-h1">Events</h1>
          <p className="evt-sub">
            Workshops, showcases and sessions open to the Colaberry community. Registration
            opens in Eventbrite.
          </p>
        </header>

        {loading && (
          <div className="evt-state" role="status">
            <div className="evt-spinner" aria-hidden="true" />
            <p>Loading events…</p>
          </div>
        )}

        {!loading && failed && (
          <div className="evt-state">
            <p className="evt-state-title">We could not load the event list.</p>
            <p>Refresh the page to try again.</p>
          </div>
        )}

        {!loading && !failed && events.length === 0 && (
          <div className="evt-state">
            <p className="evt-state-title">No events scheduled right now.</p>
            <p>Check back soon — new sessions are added most weeks.</p>
          </div>
        )}

        {!loading && !failed && months.map((m) => (
          <section className="evt-month" key={m.key}>
            <h2 className="evt-month-label">{m.label}</h2>
            <div className="evt-grid">
              {m.items.map((ev) => <EventCard ev={ev} key={ev.id} />)}
            </div>
          </section>
        ))}
      </div>
    </PortalShell>
  );
};

export default EventsPage;
