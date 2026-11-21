import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import type { HubEvent } from '../../../../services/commsHubApi';
import { SectionCard, EmptyState } from '../../shell';
import MessageStatus from '../board/MessageStatus';
import ListState from '../board/ListState';
import { CHANNEL_LABEL, whenOf } from '../board/boardDisplay';
import type { BoardList } from '../board/useBoard';
import { whenLabel } from '../events/eventDisplay';

/**
 * The right-hand cards of Today (design 01, CH7.4): Going out next (the first rows of the schedule),
 * Upcoming events with their thumbnails, and Channels. WhatsApp is not built yet, so its row says
 * "Coming next" instead of a connection it does not have.
 */
export function GoingOutNext({ list }: { list: BoardList }): React.ReactElement {
  return (
    <SectionCard title="Going out next" icon="send-plane-line" actions={<Link className="small comms-hub-action d-inline-flex align-items-center" to="/admin/comms-hub/schedule">See full schedule</Link>}>
      <ListState list={list} what="schedule" />
      {list.rows && list.rows.length === 0 && <EmptyState icon="calendar-schedule-line" title="Nothing is going out" description="Approved messages appear here until they send." tone="quiet" />}
      {list.rows && list.rows.length > 0 && (
        <ul className="list-unstyled mb-0 ch-next">
          {list.rows.map((r) => (
            <li key={r.id} className="ch-next-row">
              <span className="ch-next-when">{whenOf(r.send_at)}</span>
              <span className="ch-next-title">{r.title}</span>
              <span className="ch-next-where">{Array.from(new Set(r.destinations.map((d) => CHANNEL_LABEL[d.channel]))).join(', ') || 'No recipients yet'}</span>
              <MessageStatus status={r.status} />
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

const thumbSrc = (ev: HubEvent): string => `/api/comms-hub/thumbnails/${ev.id}/16x9.png?v=${ev.thumbnail_id}`;

/**
 * The event's chosen thumbnail. It comes from the public route, which only serves events placed on
 * the Events page and scheduled, live or ended; for any other event (or a failed load) the slot says
 * "Preview unavailable" instead of showing a broken image.
 */
function Thumb({ ev }: { ev: HubEvent }): React.ReactElement {
  const [broken, setBroken] = useState(false);
  if (!ev.thumbnail_id) return <span className="ch-up-thumb ch-up-none">No thumbnail</span>;
  if (broken) return <span className="ch-up-thumb ch-up-none">Preview unavailable</span>;
  return <img className="ch-up-thumb" src={thumbSrc(ev)} alt={`${ev.title} thumbnail`} width={96} height={54} loading="lazy" onError={() => setBroken(true)} />;
}

export function UpcomingEvents({ events, error, onRetry }: { events: HubEvent[] | null; error: string | null; onRetry: () => void }): React.ReactElement {
  return (
    <SectionCard title="Upcoming events" icon="calendar-event-line" actions={<Link className="small comms-hub-action d-inline-flex align-items-center" to="/admin/comms-hub/events">All events</Link>}>
      {error && (
        <div className="alert alert-warning d-flex flex-wrap align-items-center justify-content-between gap-2 mb-0" role="alert">
          <span>{error}</span>
          <button type="button" className="btn btn-sm btn-outline-secondary comms-hub-action" onClick={onRetry}>Try again</button>
        </div>
      )}
      {!error && !events && <p className="text-muted mb-0" role="status">Loading...</p>}
      {events && events.length === 0 && <EmptyState icon="calendar-event-line" title="No upcoming events" description="Events you create appear here." tone="quiet" />}
      {events && events.length > 0 && (
        <ul className="list-unstyled mb-0 ch-up">
          {events.map((ev) => (
            <li key={ev.id} className="ch-up-row">
              <Thumb ev={ev} />
              <span className="ch-up-text">
                <span className="ch-up-title">{ev.title}</span>
                <span className="ch-up-when">{whenLabel(ev)}</span>
                {!ev.thumbnail_id && <Link className="small comms-hub-action d-inline-flex align-items-center" to={`/admin/comms-hub/events?edit=${ev.id}`}>Create thumbnail<span className="visually-hidden"> for {ev.title}</span></Link>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

const CHANNELS: Array<{ name: string; what: string; state: 'ready' | 'next' }> = [
  { name: 'Community feed', what: 'Posts on the cohort feeds', state: 'ready' },
  { name: 'In-app notifications', what: 'The bell and the campus banner', state: 'ready' },
  { name: 'WhatsApp', what: 'Groups and audiences', state: 'next' },
];

export function ChannelStatus(): React.ReactElement {
  return (
    <SectionCard title="Channels" icon="broadcast-line">
      <ul className="list-unstyled mb-2 ch-channels">
        {CHANNELS.map((c) => (
          <li key={c.name} className="ch-channel-row">
            <span><span className="fw-bold d-block">{c.name}</span><span className="small text-muted">{c.what}</span></span>
            {c.state === 'ready'
              ? <span className="ch-status ch-status-success"><i className="ri-checkbox-circle-line" aria-hidden="true" />Ready</span>
              : <span className="ch-status ch-status-neutral"><i className="ri-time-line" aria-hidden="true" />Coming next</span>}
          </li>
        ))}
      </ul>
      <p className="small text-muted mb-0">
        AI writes the draft and suggests who should get it. You review the exact message, recipients and time. Nothing goes out
        until you approve, and scheduled messages send even if this page is closed.
      </p>
    </SectionCard>
  );
}
