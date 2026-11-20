import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { SectionCard, EmptyState } from '../shell';
import SummaryPending from './SummaryPending';
import type { CommsHubOutletContext } from './CommsHubLayout';

/** Schedule & history (design 04). CH7.4 replaces the empty state with the schedule, history and activity log. */
export default function ScheduleTab(): React.ReactElement {
  const { summary, loadError } = useOutletContext<CommsHubOutletContext>();
  return (
    <SectionCard title="Schedule & history" icon="time-line">
      {!summary ? <SummaryPending loadError={loadError} /> : (
        <EmptyState
          icon="calendar-schedule-line"
          title={summary.scheduled_next_7_days > 0 ? `${summary.scheduled_next_7_days} scheduled in the next 7 days` : 'Nothing is scheduled'}
          description="Approved messages wait here until their send time, and every send, failure and change is kept in the history."
          tone="quiet"
        />
      )}
    </SectionCard>
  );
}
