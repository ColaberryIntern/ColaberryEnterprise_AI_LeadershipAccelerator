import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchHireInterviews, type HireInterview } from '../../services/hireStudioApi';
import type { PrepInterview } from './careerPrepApi';
import type { Sheet } from './logic/askRouter';
import { interviewWhen } from './logic/careerPrepCopy';
import { InboxSheet } from './sheets/InboxSheet';
import { InterviewsSheet } from './sheets/InterviewsSheet';
import { useClock } from './useClock';

/**
 * Career Prep v27 (CP4.6): what each sheet shows, from data that exists today. Your interviews: from CP8.3 the
 * sheets/InterviewsSheet.tsx page (the interviews the job-search inbox found), then the ones employers booked through
 * the Hire profile (with "Join the room" from 10 minutes before the start) and the ones the student added or Cora made. Digital resume: the portfolio page employers see. The job-search inbox is real from
 * CP6.1 (sheets/InboxSheet.tsx). Offers and applications are not tracked by the platform yet, so those sheets say so
 * plainly instead of showing anything made up.
 */
const STATUS: Record<HireInterview['status'], string> = { requested: 'Waiting on you', confirmed: 'Confirmed', declined: 'Declined', rescheduled: 'New time proposed', cancelled: 'Cancelled', completed: 'Held' };
const JOIN_EARLY_MS = 10 * 60_000;

export function joinOpen(i: HireInterview, now: number): boolean {
  const start = Date.parse(i.startsAt);
  return i.status === 'confirmed' && !!i.roomUrl && now >= start - JOIN_EARLY_MS && now <= start + i.minutes * 60_000;
}

function Booked({ list, now }: { list: HireInterview[]; now: number }): React.ReactElement {
  if (!list.length) return <p className="cp-muted">Nothing booked through your Hire profile yet.</p>;
  return (
    <ul className="cp-list" data-testid="cp-booked">{list.map((i) => (
      <li key={i.id}><b>{i.employer.company}</b> · {i.employer.role} · {interviewWhen(i.startsAt)} Central · {i.minutes} min · <span className="cp-pill">{STATUS[i.status]}</span>
        {joinOpen(i, now) && <> <a className="cp-send" href={i.roomUrl as string} target="_blank" rel="noreferrer">Join the room</a></>}</li>
    ))}</ul>
  );
}

/** The Hire profile bookings and the student's own interviews, below the inbox interviews on the #interviews sheet. */
export function BookedAndAdded({ prep, now: fixed }: { prep: PrepInterview[]; now?: number }): React.ReactElement {
  const now = useClock(fixed);
  const [booked, setBooked] = useState<HireInterview[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { let live = true; Promise.resolve().then(fetchHireInterviews).then((l) => { if (live) setBooked(l); }).catch(() => { if (live) setFailed(true); }); return () => { live = false; }; }, []);
  const own = prep.filter((i) => i.source !== 'real');
  return (
    <div data-testid="cp-booked-added">
      <h3>Booked through your Hire profile</h3>
      {failed ? <p role="alert" className="cp-form-problem">Could not load your booked interviews. Try again in a moment.</p>
        : booked === null ? <p className="cp-muted" aria-live="polite">Loading...</p> : <Booked list={booked} now={now} />}
      <h3>Added by you or made by Cora</h3>
      {own.length ? <ul className="cp-list">{own.map((i) => <li key={i.id}><b>{i.company}</b> · {i.role}{i.startsAt ? ` · ${interviewWhen(i.startsAt)} Central` : ''} · {i.source === 'practice' ? 'Practice' : 'Added by you'}</li>)}</ul>
        : <p className="cp-muted">None yet. Ask Cora to add one.</p>}
    </div>
  );
}

const NOT_YET: Record<'offers' | 'applications', string> = {
  offers: 'Offers are not tracked in the app yet. When an employer sends you one, it will show here with the date to reply by.',
  applications: 'Applications are not tracked in the app yet. Add the interviews they lead to from Cora, and she will prepare you.',
};

export function SheetBody({ sheet, prep }: { sheet: Sheet; prep: PrepInterview[] }): React.ReactElement {
  if (sheet === 'interviews') return <InterviewsSheet><BookedAndAdded prep={prep} /></InterviewsSheet>;
  if (sheet === 'inbox') return <InboxSheet />;
  if (sheet === 'resume') {
    return <p data-testid="cp-resume-sheet">Your digital resume is your portfolio page. <Link className="cp-send" to="/portal/portfolio">Open your portfolio page</Link></p>;
  }
  return <p data-testid={`cp-notyet-${sheet}`}>{NOT_YET[sheet]}</p>;
}
