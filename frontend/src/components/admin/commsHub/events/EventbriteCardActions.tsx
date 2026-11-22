import React, { useState } from 'react';
import { adoptEventbriteEvent, apiErrorMessage, type EventbriteEvent } from '../../../../services/commsHubApi';

/**
 * The buttons on an Eventbrite card (CH9.3, CH9.5): View registrants, and Manage in the hub, which
 * links the Eventbrite event to a hub event and opens it, so the thumbnail, promotion plan and Go
 * live work on it. Once linked, the card says "Managed in the hub" and the button opens that event.
 * Adopting twice is safe on the server (one hub event per Eventbrite event).
 */
interface Props {
  ev: EventbriteEvent;
  onOpen: (hubEventId: string) => void;
  onRegistrants: (ev: EventbriteEvent) => void;
}

export default function EventbriteCardActions({ ev, onOpen, onRegistrants }: Props): React.ReactElement {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ended = new Date(ev.ends_at ?? new Date(new Date(ev.starts_at).getTime() + 4 * 3_600_000).toISOString()).getTime() <= Date.now();

  const manage = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      onOpen((await adoptEventbriteEvent(ev.ccpp_event_id)).id);
    } catch (err) {
      setError(apiErrorMessage(err, 'The event was not added to the hub. Try again.'));
      setBusy(false);
    }
  };

  return (
    <>
      {ev.adopted_event_id && <span className="ch-managed-chip w-100" data-testid="ch-managed"><i className="ri-check-line me-1" aria-hidden="true" />Managed in the hub</span>}
      <button type="button" className="btn btn-outline-primary comms-hub-action" onClick={() => onRegistrants(ev)}>
        View registrants<span className="visually-hidden"> for {ev.title}</span>
      </button>
      {ev.adopted_event_id && (
        <button type="button" className="btn btn-primary comms-hub-action" onClick={() => onOpen(ev.adopted_event_id!)}>
          Open in the hub<span className="visually-hidden">: {ev.title}</span>
        </button>
      )}
      {!ev.adopted_event_id && !ended && (
        <button type="button" className="btn btn-primary comms-hub-action" onClick={() => { void manage(); }} disabled={busy}>
          {busy ? 'Adding...' : 'Manage in the hub'}<span className="visually-hidden">: {ev.title}</span>
        </button>
      )}
      {error && <div className="text-danger small w-100" role="alert">{error}</div>}
    </>
  );
}
