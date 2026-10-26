import React, { useEffect, useState } from 'react';
import { fetchMySessions, type MySession } from '../../../services/onboardingApi';
import { openSessionRecording } from '../../../services/roomsApi';
import { checkInRoute, classWhen, liveRoute, nextClass, replaysOf } from './classSessionsModel';
import './classSessions.css';

/**
 * "Live classes" and "Your classes · replays" (C32, v7 R5): the class-session part of /portal/rooms moved into the Classroom, shown
 * in its arrival card and on the Classroom page. The next class has Check in (the existing check-in flow); live, it has Join (the
 * live page, which records attendance). When that class is being broadcast, the line says it is live in the Events Hall (C28).
 * Replays: completed sessions, ▶ Replay only when a recording exists (the same authenticated opener as /portal/sessions).
 */
export function useMySessions(enabled: boolean): MySession[] | null | 'error' {
  const [list, setList] = useState<MySession[] | null | 'error'>(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    fetchMySessions().then((s) => { if (alive) setList(s); }).catch(() => { if (alive) setList('error'); });
    return () => { alive = false; };
  }, [enabled]);
  return list;
}

export interface ClassSessionsProps {
  sessions: MySession[] | null | 'error';
  onOpen: (route: string) => void;
  /** The class's broadcast is on air: its row says so and walks to the Events Hall's live room. */
  broadcastRoute?: string | null;
  now?: Date;
  maxReplays?: number;
}

export default function ClassSessions({ sessions, onOpen, broadcastRoute = null, now = new Date(), maxReplays = 3 }: ClassSessionsProps): React.ReactElement | null {
  if (sessions === null) return null;
  if (sessions === 'error') return <div className="cm-cls" data-testid="cm-cls"><div className="cm-sec">Live classes</div><p className="cm-cls-muted">We can&rsquo;t load your classes right now.</p></div>;
  const next = nextClass(sessions, now);
  const replays = replaysOf(sessions).slice(0, maxReplays);
  return (
    <div className="cm-cls" data-testid="cm-cls">
      <div className="cm-sec">Live classes</div>
      {next ? (
        <div className={`cm-cls-next${next.status === 'live' ? ' is-live' : ''}`} data-testid="cm-cls-next">
          <span className="tx">
            <b>{next.status === 'live' && <span className="cm-cls-dot" aria-label="live" />}Week {next.session_number} · {next.title}</b>
            <small>{next.status === 'live' ? (broadcastRoute ? 'Your class is live in the Events Hall' : 'Live now') : classWhen(next, now)}</small>
          </span>
          {next.status === 'live'
            ? <button type="button" className="cm-btn-line pri" onClick={() => onOpen(broadcastRoute ?? liveRoute(next))} data-testid="cm-cls-join">{broadcastRoute ? 'Walk in' : 'Join'}</button>
            : <button type="button" className="cm-btn-line" onClick={() => onOpen(checkInRoute(next))} data-testid="cm-cls-checkin">Check in</button>}
        </div>
      ) : <p className="cm-cls-muted">No class is scheduled yet.</p>}
      {replays.length > 0 && (<>
        <div className="cm-sec">Your classes · replays</div>
        <ul className="cm-cls-replays" data-testid="cm-cls-replays">
          {replays.map((s) => (
            <li key={s.id}>
              <span className="n">✓ #{s.session_number}</span>
              <span className="tx"><b>{s.title}</b><small>{s.recording_url ? 'Done · replay available' : 'Done'}</small></span>
              {s.recording_url && <button type="button" className="cm-btn-line" onClick={() => { openSessionRecording(s.recording_url as string, s.title).catch(() => undefined); }}>▶ Replay</button>}
            </li>
          ))}
        </ul>
      </>)}
    </div>
  );
}
