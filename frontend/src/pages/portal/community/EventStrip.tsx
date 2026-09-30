import React from 'react';
import { eventWhen, countdown } from './communityUtils';
import { CommunityEvent } from '../../../services/communityApi';

const SOURCE_LABEL: Record<CommunityEvent['source'], string> = {
  live_session: 'Live session',
  open_house: 'Open house',
  community_event: 'Community',
};

// Upcoming-event strip above the feed (Design E). Shows the single soonest
// event with a live countdown and a Join action when a meeting link exists.
// Renders nothing when the cohort has no upcoming events so it never leaves an
// empty band.
const EventStrip: React.FC<{ events: CommunityEvent[] | null }> = ({ events }) => {
  if (!events || events.length === 0) return null;
  const next = events[0];

  return (
    <div className="cm-event-strip">
      <span className="cm-event-cal" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M3 9h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      </span>
      <div className="cm-event-body">
        <div className="cm-event-title">{next.title}</div>
        <div className="cm-event-meta">
          <span className="cm-event-tag">{SOURCE_LABEL[next.source]}</span>
          <span>{eventWhen(next.starts_at)}</span>
          <span className="cm-event-countdown">{countdown(next.starts_at)}</span>
        </div>
      </div>
      {next.meeting_link && (
        <a className="cm-event-join" href={next.meeting_link} target="_blank" rel="noopener noreferrer">Join</a>
      )}
    </div>
  );
};

export default EventStrip;
