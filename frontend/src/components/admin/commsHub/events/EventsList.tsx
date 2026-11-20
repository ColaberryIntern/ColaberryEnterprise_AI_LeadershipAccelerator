import React from 'react';
import type { HubEvent, HubEventScope } from '../../../../services/commsHubApi';
import { FeaturedEventCard, EventGridCard } from './EventCards';

interface Props {
  scope: HubEventScope;
  events: HubEvent[];
  onOpen: (id: string) => void;
}

/**
 * The event list (CH3.1). Upcoming mirrors training.colaberry.com/events: the next event featured,
 * then "More upcoming events" as a grid. Past and cancelled are plain grids, newest first.
 */
export default function EventsList({ scope, events, onOpen }: Props): React.ReactElement {
  if (scope !== 'upcoming') {
    return (
      <div className="ch-grid" data-testid="ch-events-grid">
        {events.map((ev) => <EventGridCard key={ev.id} ev={ev} onOpen={onOpen} />)}
      </div>
    );
  }
  const [next, ...rest] = events;
  return (
    <div>
      {next && <FeaturedEventCard ev={next} onOpen={onOpen} />}
      {rest.length > 0 && (
        <section aria-labelledby="ch-more-upcoming">
          <h2 id="ch-more-upcoming" className="h4 fw-bold mb-3">More upcoming events</h2>
          <div className="ch-grid" data-testid="ch-events-grid">
            {rest.map((ev) => <EventGridCard key={ev.id} ev={ev} onOpen={onOpen} />)}
          </div>
        </section>
      )}
    </div>
  );
}
