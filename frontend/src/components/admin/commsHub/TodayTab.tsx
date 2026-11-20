import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { StatCard, SectionCard, EmptyState } from '../shell';
import SummaryPending from './SummaryPending';
import type { CommsHubOutletContext } from './CommsHubLayout';

/** Today (design 01): the four tiles, then the approval queue. Counts come from the hub summary. */
export default function TodayTab(): React.ReactElement {
  const { summary, loadError } = useOutletContext<CommsHubOutletContext>();
  if (!summary) return <SummaryPending loadError={loadError} />;
  const waiting = summary.awaiting_approval;
  return (
    <div>
      <div className="row g-3 mb-3">
        <div className="col-12 col-sm-6 col-xl-3">
          <StatCard label="Waiting for your approval" value={waiting} icon="checkbox-circle-line" hint="Nothing sends until you approve" />
        </div>
        <div className="col-12 col-sm-6 col-xl-3">
          <StatCard label="Scheduled, next 7 days" value={summary.scheduled_next_7_days} icon="time-line" tone="info" />
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
          <StatCard label="Needs attention" value={summary.needs_attention} icon="error-warning-line" tone="warning" />
        </div>
      </div>
      <SectionCard title="Needs your approval" icon="checkbox-circle-line">
        <EmptyState
          icon="inbox-line"
          title={waiting > 0 ? `${waiting} waiting for your approval` : 'Nothing is waiting for your approval'}
          description="Drafts for your events and messages appear here. Nothing goes out until you approve it."
          tone="quiet"
        />
      </SectionCard>
    </div>
  );
}
