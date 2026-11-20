import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { SectionCard, EmptyState } from '../shell';
import SummaryPending from './SummaryPending';
import type { CommsHubOutletContext } from './CommsHubLayout';

/** Events (design 02). CH3 replaces the empty state with the event list and editor. */
export default function EventsTab(): React.ReactElement {
  const { summary, loadError } = useOutletContext<CommsHubOutletContext>();
  return (
    <SectionCard title="Events" icon="calendar-event-line">
      {!summary ? <SummaryPending loadError={loadError} /> : (
        <EmptyState
          icon="calendar-2-line"
          title={summary.upcoming_events > 0 ? `${summary.upcoming_events} upcoming events` : 'No events yet'}
          description="Create an event with New event. It appears on the member Events page and calendar, and you can take it live from here."
          tone="quiet"
        />
      )}
    </SectionCard>
  );
}
