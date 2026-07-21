import React from 'react';
import { Link } from 'react-router-dom';
import { useCountdown } from '../../../hooks/useCountdown';
import { parseSessionTimeToHHMM, tzAbbrev } from '../../../utils/sessionTime';
import { NextLiveSession } from '../../../services/onboardingApi';

// The "Next live class" side-card on Today — cherry-accent, backed by the
// live_sessions-driven /api/portal/next-session payload. TodayShell gates on a
// non-null session, so this component assumes `session` is present.
//   scheduled → Days/Hrs/Min/Sec countdown + "Open the classroom"
//   live      → pulsing dot + "Join Google Meet" (opens the meeting in a new tab)
const NextLiveClassCard: React.FC<{ session: NextLiveSession }> = ({ session }) => {
  const isLive = session.status === 'live';

  // Same target construction as PortalSessionDetailPage: a 24h "HH:MM" from the
  // (possibly 12-hour) start_time, joined to the session date. No countdown once
  // the session is live.
  const target = (() => {
    if (isLive || !session.session_date) return null;
    const hhmm = parseSessionTimeToHHMM(session.start_time || '09:00');
    return hhmm ? `${session.session_date}T${hhmm}:00` : null;
  })();
  const cd = useCountdown(target);

  return (
    <div className="te-card te-scard accent-cherry">
      <h3>
        <svg viewBox="0 0 24 24" fill="none" style={{ color: 'var(--cherry-text)' }}>
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
          <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Next live class
      </h3>
      <div className="te-muted">
        <b style={{ color: 'var(--strong)' }}>Session {session.session_number}</b> · {session.title}
      </div>
      <div className="te-muted" style={{ marginTop: 2 }}>
        {session.session_date} · {session.start_time} - {session.end_time}
        {tzAbbrev(session.timezone) && ` ${tzAbbrev(session.timezone)}`}
      </div>

      {isLive ? (
        <>
          <div className="te-live-row">
            <span className="te-livedot" aria-hidden="true" />
            Session is live now
          </div>
          <button
            type="button"
            className="te-btn cherry"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => { if (session.meeting_link) window.open(session.meeting_link, '_blank', 'noopener,noreferrer'); }}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
              <path d="M15 10l4.5-2.5v9L15 14M4 7h9a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            </svg>
            Join Google Meet
          </button>
        </>
      ) : (
        <>
          {cd && (
            <div className="te-count">
              <div className="seg"><b>{cd.days}</b><span>days</span></div>
              <div className="seg"><b>{cd.hours}</b><span>hrs</span></div>
              <div className="seg"><b>{cd.minutes}</b><span>min</span></div>
              <div className="seg"><b>{cd.seconds}</b><span>sec</span></div>
            </div>
          )}
          <Link
            className="te-btn cherry"
            style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
            to={`/portal/sessions/${session.id}`}
          >
            Open the classroom
          </Link>
        </>
      )}
    </div>
  );
};

export default NextLiveClassCard;
