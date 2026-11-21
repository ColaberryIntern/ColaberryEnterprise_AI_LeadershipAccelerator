import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { apiErrorMessage, listHubEvents, type HubEvent } from '../../../services/commsHubApi';
import { StatCard } from '../shell';
import SummaryPending from './SummaryPending';
import type { CommsHubOutletContext } from './CommsHubLayout';
import { useBoard } from './board/useBoard';
import { whenOf } from './board/boardDisplay';
import ApprovalQueue from './today/ApprovalQueue';
import { ChannelStatus, GoingOutNext, UpcomingEvents } from './today/TodaySide';

/** "What do you want to tell people?" (design 01): opens Compose with the words carried over (CH6.5). */
export function TellPeople(): React.ReactElement {
  const [text, setText] = useState('');
  const navigate = useNavigate();
  const go = (e: React.FormEvent): void => { e.preventDefault(); navigate(`/admin/comms-hub/compose?text=${encodeURIComponent(text.trim())}`); };
  return (
    <form className="ch-tell mb-3" onSubmit={go}>
      <label className="form-label fw-bold" htmlFor="ch-tell">What do you want to tell people?</label>
      <div className="d-flex gap-2">
        <input id="ch-tell" className="form-control" value={text} maxLength={300} placeholder="For example: tonight's session now starts at 7 PM" onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="btn ch-btn-berry comms-hub-action" disabled={!text.trim()}>Start a message</button>
      </div>
    </form>
  );
}

/**
 * Today (design 01, CH7.4): the ask box, the four tiles, the approval queue, then Going out next,
 * Upcoming events and Channels. Counts come from the hub summary; the lists load on their own, so a
 * list that fails shows its own retry without hiding the rest of the page.
 */
export default function TodayTab(): React.ReactElement {
  const { summary, loadError, reload } = useOutletContext<CommsHubOutletContext>();
  const approval = useBoard('approval', { limit: 20 });
  const next = useBoard('schedule', { status: ['approved', 'scheduled', 'sending'], limit: 4 });
  const [events, setEvents] = useState<HubEvent[] | null>(null);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const loadEvents = useCallback(() => {
    setEventsError(null);
    listHubEvents('upcoming').then((e) => setEvents(e.slice(0, 3))).catch((err) => setEventsError(apiErrorMessage(err, 'The events did not load.')));
  }, []);
  useEffect(() => { loadEvents(); }, [loadEvents]);

  if (!summary) return <SummaryPending loadError={loadError} />;
  const firstOut = next.rows?.[0];
  const changed = (): void => { approval.reload(); next.reload(); reload(); };
  return (
    <div>
      <TellPeople />
      <div className="row g-3 mb-3">
        <div className="col-12 col-sm-6 col-xl-3">
          <StatCard label="Waiting for your approval" value={summary.awaiting_approval} icon="checkbox-circle-line" hint="Nothing sends until you approve" />
        </div>
        <div className="col-12 col-sm-6 col-xl-3">
          <StatCard label="Scheduled, next 7 days" value={summary.scheduled_next_7_days} icon="time-line" tone="info" hint={firstOut ? `Next: ${whenOf(firstOut.send_at)}` : undefined} />
        </div>
        <div className="col-12 col-sm-6 col-xl-3">
          <StatCard
            label="Upcoming events"
            value={summary.upcoming_events}
            icon="calendar-event-line"
            tone="success"
            hint={summary.events_missing_thumbnail > 0 ? `${summary.events_missing_thumbnail} still need a thumbnail` : undefined}
          />
        </div>
        <div className="col-12 col-sm-6 col-xl-3">
          <StatCard label="Needs attention" value={summary.needs_attention} icon="error-warning-line" tone="warning" hint={summary.needs_attention > 0 ? 'Did not fully go out: see Schedule & history' : undefined} />
        </div>
      </div>
      <div className="row g-3">
        <div className="col-12 col-xl-7">
          <ApprovalQueue list={approval} onChanged={changed} />
        </div>
        <div className="col-12 col-xl-5 d-flex flex-column gap-3">
          <GoingOutNext list={next} />
          <UpcomingEvents events={events} error={eventsError} onRetry={loadEvents} />
          <ChannelStatus />
        </div>
      </div>
    </div>
  );
}
