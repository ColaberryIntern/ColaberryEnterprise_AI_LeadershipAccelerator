import React, { useCallback, useEffect, useState } from 'react';
import { SectionCard, EmptyState } from '../../shell';
import { listEventbriteEvents, apiErrorMessage, type EventbriteEvent, type EventbriteList, type EventbriteWindow } from '../../../../services/commsHubApi';
import { dateChip } from './eventDisplay';

/**
 * "From Eventbrite" on the Events tab (CH9.2): the events members already see on /portal/events,
 * read-only. Eventbrite stays the record, so each card links out to it for edits. The registrants
 * (CH9.3) and Manage in the hub (CH9.5) actions are added by those tickets.
 *
 * Three answers, never two: the list, "unavailable" (with a retry) and "not set up on this server".
 * A failed read is never shown as "no events".
 */
const WINDOWS: ReadonlyArray<{ key: EventbriteWindow; label: string }> = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Past 90 days' },
];
const TZ = 'America/Chicago';

export function centralWhen(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(iso));
}

function registeredLabel(n: number | null): string {
  if (n === null) return 'Registrations not known';
  return n === 1 ? '1 registered' : `${n} registered`;
}

type Load = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; list: EventbriteList };

export function EventbriteCard({ ev, actions }: { ev: EventbriteEvent; actions?: React.ReactNode }): React.ReactElement {
  const chip = dateChip(new Date(ev.starts_at));
  return (
    <article className="ch-event-card" aria-label={ev.title}>
      {/* Decorative: the title is right below. A broken image hides itself rather than showing an icon. */}
      {ev.image_url && <img className="ch-eb-image" src={ev.image_url} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
      <div className="ch-date-chip" aria-hidden="true">
        <span className="ch-date-day">{chip.day}</span>
        <span className="ch-date-month">{chip.month}</span>
      </div>
      <div className="d-flex flex-wrap align-items-center gap-2 mt-3 mb-1">
        <span className="ch-type-line">From Eventbrite</span>
      </div>
      <h3 className="ch-event-title">{ev.title}</h3>
      <p className="ch-event-when">{centralWhen(ev.starts_at)}</p>
      <p className="ch-event-blurb mb-2"><i className="ri-group-line me-1" aria-hidden="true" />{registeredLabel(ev.registered)}</p>
      <div className="mt-auto d-flex flex-wrap align-items-center gap-2">
        {actions}
        {ev.registration_url && (
          <a className="btn btn-outline-secondary comms-hub-action" href={ev.registration_url} target="_blank" rel="noopener noreferrer">
            Open in Eventbrite<span className="visually-hidden"> (opens in a new tab)</span>
          </a>
        )}
      </div>
    </article>
  );
}

export default function EventbriteEvents({ cardActions }: { cardActions?: (ev: EventbriteEvent) => React.ReactNode }): React.ReactElement {
  const [win, setWin] = useState<EventbriteWindow>('upcoming');
  const [load, setLoad] = useState<Load>({ state: 'loading' });

  const reload = useCallback(() => {
    setLoad({ state: 'loading' });
    listEventbriteEvents(win)
      .then((list) => setLoad({ state: 'ready', list }))
      .catch((err) => setLoad({ state: 'error', message: apiErrorMessage(err, 'The Eventbrite events did not load.') }));
  }, [win]);
  useEffect(() => { reload(); }, [reload]);

  const failed = load.state === 'error' || (load.state === 'ready' && load.list.status === 'unavailable');
  const notSetUp = load.state === 'ready' && load.list.status === 'not_configured';
  const events = load.state === 'ready' && load.list.status === 'ok' ? load.list.events : null;

  return (
    <SectionCard
      title="From Eventbrite"
      icon="ticket-2-line"
      actions={(
        <div className="btn-group" role="group" aria-label="Which Eventbrite events to show">
          {WINDOWS.map((w) => (
            <button key={w.key} type="button" aria-pressed={win === w.key} onClick={() => setWin(w.key)}
              className={`btn btn-sm comms-hub-action ${win === w.key ? 'btn-secondary' : 'btn-outline-secondary'}`}>
              {w.label}
            </button>
          ))}
        </div>
      )}
    >
      <p className="text-muted small">The events members see on the Events page. Edit them in Eventbrite; changes show here within a few minutes.</p>
      {load.state === 'loading' && <p className="text-muted mb-0" role="status">Loading...</p>}
      {failed && (
        <div className="alert alert-warning d-flex align-items-center justify-content-between" role="alert" data-testid="eventbrite-unavailable">
          <span>{load.state === 'error' ? load.message : 'The Eventbrite list is unavailable right now.'}</span>
          <button type="button" className="btn btn-sm btn-outline-secondary comms-hub-action" onClick={reload}>Try again</button>
        </div>
      )}
      {notSetUp && <p className="text-muted mb-0" role="status">Eventbrite is not connected on this server.</p>}
      {events && events.length === 0 && (
        <EmptyState icon="ticket-2-line" tone="quiet" title={win === 'upcoming' ? 'No upcoming Eventbrite events' : 'No Eventbrite events in the past 90 days'} />
      )}
      {events && events.length > 0 && (
        <div className="ch-grid">
          {events.map((ev) => <EventbriteCard key={ev.ccpp_event_id} ev={ev} actions={cardActions?.(ev)} />)}
        </div>
      )}
    </SectionCard>
  );
}
