import React, { useState } from 'react';
import { SectionCard } from '../../shell';
import type { HubEvent } from '../../../../services/commsHubApi';
import EventFormFields from './EventFormFields';
import EventStatusChip from './EventStatusChip';
import { useEventEditor } from './useEventEditor';

/**
 * The event editor (design 02, CH3.2): the form, then Save event, Save as draft, Duplicate and Cancel
 * this event. Cancelling asks first and says what it does. Thumbnail studio (CH4), promotion plan
 * (CH6.4) and the Live panel (CH5.2) join this page in their own tickets.
 */
interface Props {
  eventId: string | null;
  onClose: () => void;
  onSaved: (ev: HubEvent) => void;
}

function ConfirmCancel({ onYes, onNo, busy }: { onYes: () => void; onNo: () => void; busy: boolean }): React.ReactElement {
  return (
    <div className="alert alert-warning mt-3" role="alertdialog" aria-labelledby="ch-cancel-q" aria-describedby="ch-cancel-what">
      <p id="ch-cancel-q" className="fw-bold mb-1">Cancel this event?</p>
      <p id="ch-cancel-what" className="mb-2">It comes off the community calendar and the member Events page. It cannot be un-cancelled; duplicate it to run it again.</p>
      <div className="d-flex gap-2">
        <button type="button" className="btn btn-danger comms-hub-action" onClick={onYes} disabled={busy}>{busy ? 'Cancelling...' : 'Yes, cancel the event'}</button>
        <button type="button" className="btn btn-outline-secondary comms-hub-action" onClick={onNo}>Keep it</button>
      </div>
    </div>
  );
}

export default function EventEditor({ eventId, onClose, onSaved }: Props): React.ReactElement {
  const ed = useEventEditor(eventId, onSaved);
  const [confirming, setConfirming] = useState(false);
  const back = <button type="button" className="btn btn-link comms-hub-action" onClick={onClose}><i className="ri-arrow-left-line me-1" aria-hidden="true" />All events</button>;

  if (ed.load === 'loading') return <SectionCard title="Event">{back}<p className="text-muted mb-0" role="status">Loading...</p></SectionCard>;
  if (ed.load === 'error') return <SectionCard title="Event">{back}<div className="alert alert-warning" role="alert">This event did not load. It may have been removed.</div></SectionCard>;

  const locked = ed.event?.status === 'cancelled' || ed.event?.status === 'ended';
  const title = ed.event ? 'Event details' : 'New event';
  return (
    <SectionCard title={title} icon="calendar-event-line" actions={ed.event ? <EventStatusChip status={ed.event.status} /> : undefined}>
      {back}
      {ed.errors.form && <div className="alert alert-danger" role="alert">{ed.errors.form}</div>}
      {ed.notice && <div className="alert alert-info" role="status">{ed.notice}</div>}
      {locked && <div className="alert alert-secondary">This event is {ed.event?.status}. Duplicate it to run it again.</div>}
      <fieldset disabled={locked || ed.busy !== null}>
        <legend className="visually-hidden">{title}</legend>
        <EventFormFields form={ed.form} errors={ed.errors} cohorts={ed.cohorts} onChange={ed.change} describe={ed.describe} />
      </fieldset>
      <div className="d-flex flex-wrap gap-2 mt-4">
        {!locked && <button type="button" className="btn btn-primary comms-hub-action" onClick={() => ed.save('scheduled')} disabled={ed.busy !== null}>{ed.busy === 'save' ? 'Saving...' : 'Save event'}</button>}
        {!locked && (!ed.event || ed.event.status === 'draft') && (
          <button type="button" className="btn btn-outline-primary comms-hub-action" onClick={() => ed.save('draft')} disabled={ed.busy !== null}>Save as draft</button>
        )}
        {ed.event && <button type="button" className="btn btn-outline-secondary comms-hub-action" onClick={() => ed.act('duplicate')} disabled={ed.busy !== null}>Duplicate</button>}
        {ed.event && !locked && ed.event.status !== 'live' && (
          <button type="button" className="btn btn-outline-danger comms-hub-action" onClick={() => setConfirming(true)} disabled={ed.busy !== null}>Cancel this event</button>
        )}
      </div>
      {confirming && <ConfirmCancel busy={ed.busy === 'cancel'} onNo={() => setConfirming(false)} onYes={() => { void ed.act('cancel').then(() => setConfirming(false)); }} />}
    </SectionCard>
  );
}
