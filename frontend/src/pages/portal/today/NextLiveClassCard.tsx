import React from 'react';
import { Link } from 'react-router-dom';
import { useCountdown } from '../../../hooks/useCountdown';
import { parseSessionTimeToHHMM, tzAbbrev, formatSessionTimeRange } from '../../../utils/sessionTime';
import { NextLiveSession, joinSession } from '../../../services/onboardingApi';
import { emitPointsEarned } from '../../../services/pointsFx';

// The "Next live class" side-card on Today — cherry-accent, backed by the
// live_sessions-driven /api/portal/next-session payload. TodayShell gates on a
// non-null session, so this component assumes `session` is present.
//   scheduled → Days/Hrs/Min/Sec countdown + "Open the classroom"
//   live      → pulsing dot + "Join Class" (opens the meeting in a new tab)
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

  // Open the meeting synchronously (popup-blocker safe), then record attendance
  // best-effort. The credit call must never block or break joining the class.
  const handleJoin = () => {
    const link = session.meeting_link;
    if (!link) return;
    window.open(link, '_blank', 'noopener,noreferrer');
    joinSession(session.id)
      .then((r) => { if (r.awarded) emitPointsEarned(r.points); })
      .catch(() => { /* attendance credit is best-effort */ });
  };

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
        {session.session_date} · {formatSessionTimeRange(session.start_time, session.end_time)}
        {tzAbbrev(session.timezone, session.session_date) && ` ${tzAbbrev(session.timezone, session.session_date)}`}
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
            onClick={handleJoin}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
              <path d="M15 10l4.5-2.5v9L15 14M4 7h9a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            </svg>
            Join Class
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
          {/* The session's Colaberry Commons room (chat + join-meeting).
              ensureRoomForSession provisions one for every real session, but
              a session predating that rollout could legitimately have none —
              hide the button rather than link to the retired session-detail
              page (removed in Phase 4 of the waiting-room plan). */}
          {session.room_id && (
            <Link
              className="te-btn cherry"
              style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
              to={`/portal/rooms/${session.room_id}`}
            >
              Open the classroom
            </Link>
          )}
        </>
      )}
    </div>
  );
};

export default NextLiveClassCard;
