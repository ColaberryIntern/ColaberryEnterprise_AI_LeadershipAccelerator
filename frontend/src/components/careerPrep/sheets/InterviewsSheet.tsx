import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchPlacementInterviewsApi, type PlacementInterview, type PlacementInterviews, type PlacementState } from '../interviewsApi';
import { useClock } from '../useClock';
import { icsHref, interviewIcs } from '../logic/interviewIcs';
import { centralTime, InterviewHistory, interviewName } from './InterviewHistory';
import './careerPrepSheets.css';

/**
 * Career Prep v27, CP8.3 (kit F4): the #interviews sheet. The four KPIs, the next booked interview (Join live from 10
 * minutes before, Continue prep in the room anchored on it, Add to calendar), every interview the job-search inbox
 * found with its state and how it was read, each one's history, "How interviews work here" and the link to the Hire
 * studio's interview times. Below that (children): the Hire profile bookings and the interviews the student added.
 * Every value comes from the server; a failed load is an alert, never an empty list. "Join" is always the consent-room
 * page, never the meeting provider's link (the sheet is never given one).
 */
const PILL: Record<PlacementState, string> = { booked: 'ok', done: 'info', review: 'warn', new: 'info', awaiting: 'info', cancelled: 'bad' };
const KPIS = [['upcoming', 'Upcoming'], ['waiting', 'Waiting on employer'], ['recruiter', 'With your recruiter'], ['held', 'Held']] as const;
/** CP9.2: "Held" becomes "Held and scored" once a replay is scored (the value stays the count held; the scored count beside it). */
export const heldLabel = (k: PlacementInterviews['kpis']): string => ((k.scored ?? 0) > 0 ? 'Held and scored' : 'Held');
export const AVAILABILITY_LINK = '/portal/portfolio?tab=hire&section=times';

export function joinIsOpen(i: PlacementInterview, now: number): boolean {
  return !!i.roomPage && !!i.joinOpensAt && !!i.joinClosesAt && now >= Date.parse(i.joinOpensAt) && now <= Date.parse(i.joinClosesAt);
}

export function readAsText(i: PlacementInterview): string {
  if (!i.readAs && i.confidence === null) return 'Not read yet';
  return `${i.readAs ?? 'Interview'}${i.confidence !== null ? ` ${Math.round(i.confidence * 100)}%` : ''}`;
}

function NextCard({ i, now }: { i: PlacementInterview; now: number }): React.ReactElement {
  const ics = interviewIcs(i, window.location.origin, now);
  return (
    <div className="cp-ivs-next" data-testid="cp-ivs-next">
      <small className="cp-ivs-kicker">Your next interview</small>
      <p className="cp-ivs-next-title"><b>{interviewName(i)}</b></p>
      <p className="cp-muted">{centralTime(i.startsAt as string)} Central · {i.minutes} min</p>
      <div className="cp-ivs-actions">
        {joinIsOpen(i, now)
          ? <Link className="cp-send" to={i.roomPage as string} data-testid="cp-ivs-join">Join live</Link>
          : <span className="cp-muted" data-testid="cp-ivs-join-later">Join opens {centralTime(i.joinOpensAt as string)} Central</span>}
        {i.prepId && <Link className="cp-ghost" to={`/portal/career/room?anchor=${encodeURIComponent(i.prepId)}`} data-testid="cp-ivs-prep">Continue prep</Link>}
        {ics && <a className="cp-ghost" href={icsHref(ics)} download="interview.ics" data-testid="cp-ivs-ics">Add to calendar</a>}
      </div>
    </div>
  );
}

function Table({ list, onHistory, buttons }: { list: PlacementInterview[]; onHistory: (id: string) => void; buttons: React.MutableRefObject<Record<string, HTMLButtonElement | null>> }): React.ReactElement {
  return (
    <table className="cp-inbox-table cp-ivs-table" data-testid="cp-ivs-table">
      <thead><tr><th scope="col">When (Central)</th><th scope="col">Company and role</th><th scope="col">State</th><th scope="col">Read as</th><th scope="col"><span className="visually-hidden">History</span></th></tr></thead>
      <tbody>{list.map((i) => (
        <tr key={i.id} data-testid={`cp-ivs-row-${i.id}`}>
          <td data-label="When">{i.startsAt ? centralTime(i.startsAt) : 'Not booked yet'}</td>
          <td data-label="Company">{interviewName(i)}</td>
          <td data-label="State"><span className={`cp-pill ${PILL[i.state]}`}>{i.stateLabel}</span>
            {typeof i.replay?.score === 'number' && <span className="cp-ivs-score" data-testid={`cp-ivs-score-${i.id}`}> Score {i.replay.score}</span>}</td>
          <td data-label="Read as">{readAsText(i)}</td>
          <td data-label="History"><button type="button" className="cp-ghost sm" ref={(el) => { buttons.current[i.id] = el; }} onClick={() => onHistory(i.id)}
            aria-label={`History: ${interviewName(i)}`} data-testid={`cp-ivs-history-${i.id}`}>History</button></td>
        </tr>
      ))}</tbody>
    </table>
  );
}

function HowItWorks(): React.ReactElement {
  return (
    <>
      <h3>How interviews work here</h3>
      <ol className="cp-ivs-how" data-testid="cp-ivs-how">
        <li>Use your job-search address on every application. When an employer writes to it about an interview, Cora reads it.</li>
        <li>We reply to the employer with a link to book a time from your availability. Anything unclear goes to your recruiter first.</li>
        <li>When the employer books, you get an email and the interview shows here.</li>
        <li>Join from the room page, 10 minutes before the start. Nothing is recorded unless everyone in the room agrees.</li>
      </ol>
      <p><Link className="cp-ghost" to={AVAILABILITY_LINK} data-testid="cp-ivs-availability">Set my availability</Link></p>
    </>
  );
}

export function InterviewsSheet({ now: fixed, children }: { now?: number; children?: React.ReactNode }): React.ReactElement {
  const now = useClock(fixed);
  const [data, setData] = useState<PlacementInterviews | null>(null);
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});
  useEffect(() => {
    let live = true;
    Promise.resolve().then(fetchPlacementInterviewsApi).then((d) => { if (live) setData(d); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);
  const close = () => { const id = openId; setOpenId(null); if (id) buttons.current[id]?.focus(); };
  const open = data?.interviews.find((i) => i.id === openId) ?? null;
  const next = data?.interviews.find((i) => i.state === 'booked' && i.startsAt && i.joinClosesAt && Date.parse(i.joinClosesAt) > now) ?? null;
  return (
    <div className="cp-ivs" data-testid="cp-interviews-sheet">
      {failed ? <p role="alert" className="cp-form-problem" data-testid="cp-ivs-failed">Could not load your interviews. Try again in a moment.</p>
        : !data ? <p className="cp-muted" aria-live="polite">Loading...</p> : (
          <>
            <dl className="cp-ivs-kpis" data-testid="cp-ivs-kpis">{KPIS.map(([key, label]) => (
              <div key={key}><dt>{key === 'held' ? heldLabel(data.kpis) : label}</dt><dd data-testid={`cp-ivs-kpi-${key}`}>{data.kpis[key]}</dd>
                {key === 'held' && (data.kpis.scored ?? 0) > 0 && <small className="cp-muted" data-testid="cp-ivs-kpi-scored">{data.kpis.scored} scored</small>}</div>
            ))}</dl>
            {next && <NextCard i={next} now={now} />}
            <h3>Every interview</h3>
            {data.interviews.length
              ? <Table list={data.interviews} onHistory={(id) => setOpenId((cur) => (cur === id ? null : id))} buttons={buttons} />
              : <p className="cp-muted" data-testid="cp-ivs-empty">No interview has come through your job-search inbox yet. When an employer writes to it, the interview shows here.</p>}
            {open && <InterviewHistory interview={open} onClose={close} />}
          </>
        )}
      <HowItWorks />
      {children}
    </div>
  );
}
