import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { SectionCard, EmptyState } from '../shell';
import type { CommsHubOutletContext } from './CommsHubLayout';

/** Schedule & history (design 04). CH7.4 replaces the empty state with the schedule, history and activity log. */
export default function ScheduleTab(): React.ReactElement {
  const { summary } = useOutletContext<CommsHubOutletContext>();
  const scheduled = summary?.scheduled_next_7_days ?? 0;
  return (
    <SectionCard title="Schedule & history" icon="time-line">
      <EmptyState
        icon="calendar-schedule-line"
        title={scheduled > 0 ? `${scheduled} scheduled in the next 7 days` : 'Nothing is scheduled'}
        description="Approved messages wait here until their send time, and every send, failure and change is kept in the history."
        tone="quiet"
      />
    </SectionCard>
  );
}
