import React from 'react';
import type { HubEvent } from '../../../../services/commsHubApi';
import EventStatusChip from './EventStatusChip';
import { TYPE_LABEL, attentionNotes, audienceLabel, dateChip, focusInstant, whenLabel } from './eventDisplay';

/**
 * The two card shapes of training.colaberry.com/events (CH3.1): a featured card for the next event
 * (picture left, dark panel right) and the grid card with a red date chip. Each opens the editor.
 * The picture slot shows the event's first letter until CH4 gives it a thumbnail, the same fallback
 * the member Events page uses.
 */
interface CardProps {
  ev: HubEvent;
  onOpen: (id: string) => void;
}

function Notes({ ev }: { ev: HubEvent }): React.ReactElement | null {
  const notes = attentionNotes(ev);
  if (!notes.length) return null;
  return <span className="ch-notes">{notes.join(' · ')}</span>;
}

function Picture({ ev, className }: { ev: HubEvent; className: string }): React.ReactElement {
  return (
    <div className={className} aria-hidden="true">
      <span className="ch-letter">{ev.title.trim().charAt(0).toUpperCase() || 'E'}</span>
    </div>
  );
}

export function FeaturedEventCard({ ev, onOpen }: CardProps): React.ReactElement {
  return (
    <article className="ch-featured" aria-label={`Next event: ${ev.title}`}>
      <Picture ev={ev} className="ch-featured-pic" />
      <div className="ch-featured-body">
        <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
          <span className="ch-type-chip">{TYPE_LABEL[ev.event_type]}</span>
          <EventStatusChip status={ev.status} />
        </div>
        <h2 className="ch-featured-title">{ev.title}</h2>
        <p className="ch-featured-meta">
          <i className="ri-calendar-line me-1" aria-hidden="true" />{whenLabel(ev)}
          <span className="ms-3"><i className="ri-group-line me-1" aria-hidden="true" />{audienceLabel(ev)}</span>
        </p>
        {ev.description && <p className="ch-featured-blurb">{ev.description}</p>}
        <div className="d-flex flex-wrap align-items-center gap-2">
          <button type="button" className="btn btn-light comms-hub-action" onClick={() => onOpen(ev.id)}>Open event</button>
          {ev.registration_url && (
            <a className="btn btn-outline-light comms-hub-action" href={ev.registration_url} target="_blank" rel="noopener noreferrer">
              Registration page<span className="visually-hidden"> (opens in a new tab)</span>
            </a>
          )}
          <Notes ev={ev} />
        </div>
      </div>
    </article>
  );
}

export function EventGridCard({ ev, onOpen }: CardProps): React.ReactElement {
  const chip = dateChip(focusInstant(ev));
  return (
    <article className="ch-event-card">
      <div className="ch-date-chip" aria-hidden="true">
        <span className="ch-date-day">{chip.day}</span>
        <span className="ch-date-month">{chip.month}</span>
      </div>
      <div className="d-flex flex-wrap align-items-center gap-2 mt-3 mb-1">
        <span className="ch-type-line">{TYPE_LABEL[ev.event_type]}</span>
        <EventStatusChip status={ev.status} />
      </div>
      <h3 className="ch-event-title">{ev.title}</h3>
      <p className="ch-event-when">{whenLabel(ev)}</p>
      {ev.description && <p className="ch-event-blurb">{ev.description}</p>}
      <div className="mt-auto d-flex flex-wrap align-items-center gap-2">
        <button type="button" className="btn btn-outline-secondary comms-hub-action" onClick={() => onOpen(ev.id)}>
          Open<span className="visually-hidden"> {ev.title}</span>
        </button>
        <Notes ev={ev} />
      </div>
    </article>
  );
}
