import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SectionCard, EmptyState } from '../shell';
import { listHubEvents, apiErrorMessage, type HubEvent, type HubEventScope } from '../../../services/commsHubApi';
import EventsList from './events/EventsList';
import EventEditor from './events/EventEditor';
import EventbriteEvents from './events/EventbriteEvents';
import './commsHub.css';

/**
 * Events (design 02 + training.colaberry.com/events). The list, or the editor when the URL says
 * ?new=1 or ?edit=<id>, so a refresh, the header's New event and a shared link all land in the
 * same place.
 */
const SCOPES: ReadonlyArray<{ key: HubEventScope; label: string }> = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Past' },
  { key: 'cancelled', label: 'Cancelled' },
];

type Load = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; events: HubEvent[] };

export default function EventsTab(): React.ReactElement {
  const [params, setParams] = useSearchParams();
  const editId = params.get('edit');
  const creating = params.get('new') === '1';
  const [scope, setScope] = useState<HubEventScope>('upcoming');
  const [load, setLoad] = useState<Load>({ state: 'loading' });

  const reload = useCallback(() => {
    setLoad({ state: 'loading' });
    listHubEvents(scope)
      .then((events) => setLoad({ state: 'ready', events }))
      .catch((err) => setLoad({ state: 'error', message: apiErrorMessage(err, 'The events did not load.') }));
  }, [scope]);

  useEffect(() => { if (!editId && !creating) reload(); }, [reload, editId, creating]);

  const open = (id: string): void => setParams({ edit: id });
  const close = (): void => { setParams({}); };

  if (creating || editId) {
    return <EventEditor eventId={editId} onClose={close} onSaved={(ev) => setParams({ edit: ev.id })} />;
  }

  return (
    <>
    <SectionCard
      title="Events"
      icon="calendar-event-line"
      actions={(
        <div className="btn-group" role="group" aria-label="Which events to show">
          {SCOPES.map((s) => (
            <button
              key={s.key}
              type="button"
              className={`btn btn-sm comms-hub-action ${scope === s.key ? 'btn-secondary' : 'btn-outline-secondary'}`}
              aria-pressed={scope === s.key}
              onClick={() => setScope(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    >
      {load.state === 'loading' && <p className="text-muted mb-0" role="status">Loading...</p>}
      {load.state === 'error' && (
        <div className="alert alert-warning d-flex align-items-center justify-content-between" role="alert">
          <span>{load.message}</span>
          <button type="button" className="btn btn-sm btn-outline-secondary comms-hub-action" onClick={reload}>Try again</button>
        </div>
      )}
      {load.state === 'ready' && load.events.length === 0 && (
        <EmptyState
          icon="calendar-2-line"
          title={scope === 'upcoming' ? 'No upcoming events' : scope === 'past' ? 'No past events' : 'No cancelled events'}
          description={scope === 'upcoming' ? 'Create one with New event. It appears on the member Events page and calendar.' : undefined}
          actionLabel={scope === 'upcoming' ? 'New event' : undefined}
          onAction={scope === 'upcoming' ? () => setParams({ new: '1' }) : undefined}
          tone="quiet"
        />
      )}
      {load.state === 'ready' && load.events.length > 0 && <EventsList scope={scope} events={load.events} onOpen={open} />}
    </SectionCard>
    {/* CH9.2 the events members already see on /portal/events, read-only from Eventbrite. */}
    <div className="mt-3"><EventbriteEvents /></div>
    </>
  );
}
