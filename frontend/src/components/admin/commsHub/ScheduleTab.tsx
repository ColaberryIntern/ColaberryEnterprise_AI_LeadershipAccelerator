import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { listHubEvents, type Channel, type HubEvent, type HubMessageStatus } from '../../../services/commsHubApi';
import { SectionCard } from '../shell';
import SummaryPending from './SummaryPending';
import type { CommsHubOutletContext } from './CommsHubLayout';
import { useBoard } from './board/useBoard';
import { CHANNEL_LABEL, MESSAGE_STATUS, STATUS_ORDER } from './board/boardDisplay';
import { HistoryTable, NextSevenDays } from './schedule/ScheduleLists';
import SafetyControls from './schedule/SafetyControls';
import ActivityLog from './schedule/ActivityLog';
import WhatsAppCard from './schedule/WhatsAppCard';

/**
 * Schedule & history (design 04, CH7.4): filters, everything going out in the next 7 days, the
 * history with failure detail and Retry, the safety controls, the WhatsApp card (CH10.1) and the
 * activity log.
 */
interface Filter { status: HubMessageStatus | ''; channel: Channel | ''; event: string }

function Filters({ value, events, onChange }: { value: Filter; events: HubEvent[]; onChange: (f: Filter) => void }): React.ReactElement {
  return (
    <form className="ch-filters d-flex flex-wrap gap-2 mb-3" aria-label="Filter the schedule and history" onSubmit={(e) => e.preventDefault()}>
      <div>
        <label className="visually-hidden" htmlFor="ch-f-status">Status</label>
        <select id="ch-f-status" className="form-select" value={value.status} onChange={(e) => onChange({ ...value, status: e.target.value as Filter['status'] })}>
          <option value="">Any status</option>
          {STATUS_ORDER.map((s) => <option key={s} value={s}>{MESSAGE_STATUS[s].label}</option>)}
        </select>
      </div>
      <div>
        <label className="visually-hidden" htmlFor="ch-f-channel">Channel</label>
        <select id="ch-f-channel" className="form-select" value={value.channel} onChange={(e) => onChange({ ...value, channel: e.target.value as Filter['channel'] })}>
          <option value="">Any channel</option>
          {(Object.keys(CHANNEL_LABEL) as Channel[]).map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
        </select>
      </div>
      <div>
        <label className="visually-hidden" htmlFor="ch-f-event">Event</label>
        <select id="ch-f-event" className="form-select" value={value.event} onChange={(e) => onChange({ ...value, event: e.target.value })}>
          <option value="">Any event</option>
          {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
        </select>
      </div>
    </form>
  );
}

export default function ScheduleTab(): React.ReactElement {
  const { summary, loadError, reload, setPaused, pauseBusy } = useOutletContext<CommsHubOutletContext>();
  const [filter, setFilter] = useState<Filter>({ status: '', channel: '', event: '' });
  const [events, setEvents] = useState<HubEvent[]>([]);
  const [changes, setChanges] = useState(0);
  const [eventsMissing, setEventsMissing] = useState(false);
  const query = { status: filter.status ? [filter.status] : undefined, channel: filter.channel || null, event_id: filter.event || null };
  const schedule = useBoard('schedule', query);
  const history = useBoard('history', query);
  // The event filter's choices. If they do not load, the filter still offers "Any event" and says why.
  useEffect(() => { listHubEvents('all').then(setEvents).catch(() => { setEvents([]); setEventsMissing(true); }); }, []);

  if (!summary) return <SummaryPending loadError={loadError} />;
  const changed = (): void => { schedule.reload(); history.reload(); reload(); setChanges((n) => n + 1); };
  const pause = async (p: boolean): Promise<void> => { await setPaused(p); setChanges((n) => n + 1); };
  return (
    <div>
      <Filters value={filter} events={events} onChange={setFilter} />
      {eventsMissing && <p className="small text-muted mt-n2 mb-3" role="status">The event list did not load, so the event filter only offers Any event.</p>}
      <div className="row g-3">
        <div className="col-12 col-xl-8 d-flex flex-column gap-3">
          <NextSevenDays list={schedule} onChanged={changed} />
          <HistoryTable list={history} onChanged={changed} />
        </div>
        <div className="col-12 col-xl-4 d-flex flex-column gap-3">
          <SafetyControls paused={summary.sending_paused} pauseBusy={pauseBusy} setPaused={pause} />
          <WhatsAppCard />
          <ActivityLog refreshKey={changes} />
        </div>
      </div>
    </div>
  );
}
