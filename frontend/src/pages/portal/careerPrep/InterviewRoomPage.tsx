import React from 'react';
import { Link, useParams } from 'react-router-dom';
import '../../../components/careerPrep/careerPrepRoom.css';
import '../../../components/careerPrep/interviewRoom/interviewRoom.css';
import { useCareerPrepFlag } from '../../../components/careerPrep/careerPrepFlag';
import { centralTime } from '../../../components/careerPrep/sheets/InterviewHistory';
import { useInterviewRoom, type InterviewRoomState } from '../../../components/careerPrep/interviewRoom/useInterviewRoom';
import { ConsentChoice, JoinPanel } from '../../../components/careerPrep/interviewRoom/RoomConsent';
import { CandidatePrepPanel } from '../../../components/careerPrep/interviewRoom/CandidatePrepPanel';
import type { RoomData } from '../../../components/careerPrep/interviewRoom/interviewRoomApi';

/**
 * /portal/career/interview/<id> (Career Prep v27, CP9.1, kit F5): the candidate's interview room, the page every
 * booking email and .ics links to (backend roomLink.candidateRoomUrl). Career Prep off for this student (or unknown)
 * = the page does not exist for them; another learner's interview is "not found" (the server answers 404).
 *
 * The header reads "RECORDING n OF n CONSENTED". First the consent screen (RoomConsent: recording and AI scoring of
 * the voice and words named, decline with the same weight); only after the student's own decision does the server
 * give the meeting link, and "Open the meeting" appears only when join.status is 'ready'. Beside it, the student's
 * prep at a glance (only they see it; it can be hidden). The meeting itself opens in Zoom (execution contract E1).
 */
const BACK = '/portal/career/room#interviews';

/** The same answer as every Career Prep page for a student it is not open for (not imported: the floor page pulls the tower's CSS). */
const NotOpen = (): React.ReactElement => <div className="p-4" data-testid="cp-not-found"><h1 className="h4">Page not found</h1><p>This page does not exist or is not open for your account.</p></div>;

function Header({ room }: { room: RoomData | null }): React.ReactElement {
  return (
    <header className="cp-room-top cp-iroom-top">
      <span className="cp-iroom-brand">Refactored<span className="cp-faint">.ai</span></span>
      <span className="cp-iroom-prod">Interview room</span>
      {room && <b className="cp-iroom-title" data-testid="cp-iroom-title">{[room.company ?? 'An employer', room.role].filter(Boolean).join(' · ')}</b>}
      {room && (
        <span className={`cp-iroom-rec${room.recording.status === 'on' ? ' is-on' : ''}`} data-testid="cp-iroom-rec">
          {room.recording.status === 'on' && <i aria-hidden="true" />}{room.consent.label}
        </span>
      )}
    </header>
  );
}

function Notice({ title, children, alert }: { title: string; children: React.ReactNode; alert?: boolean }): React.ReactElement {
  return (
    <section className="cp-iroom-card" data-testid="cp-iroom-notice" {...(alert ? { role: 'alert' } : {})}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Main({ s }: { s: InterviewRoomState }): React.ReactElement {
  const a = s.answer;
  if (!a) return <p className="cp-muted" aria-live="polite">Opening the interview room...</p>;
  switch (a.kind) {
    case 'ok':
      return a.room.yourDecision === null || a.room.join.status === 'decide_first'
        ? <><p className="cp-muted" data-testid="cp-iroom-when">{centralTime(a.room.startsAt)} Central</p><ConsentChoice onDecide={s.decide} busy={s.busy} /></>
        : <JoinPanel room={a.room} stalled={s.stalled} onRetry={s.retry} />;
    case 'not_open':
      return <Notice title="The room is not open yet"><p data-testid="cp-iroom-opens">It opens {centralTime(a.opensAt)} Central, 10 minutes before the start. Keep this page open and it opens by itself.</p></Notice>;
    case 'gone':
      return <Notice title={a.reason === 'ended' ? 'This interview has ended' : 'This room is closed'}><p>{a.message}</p><Link className="cp-ghost" to={BACK}>See my interviews</Link></Notice>;
    case 'not_found':
      return <Notice title="Interview not found"><p>This interview is not in your account.</p><Link className="cp-ghost" to={BACK}>See my interviews</Link></Notice>;
    default:
      return <Notice title="The room could not load" alert><p>{a.message}</p><button type="button" className="cp-ghost" onClick={s.retry} data-testid="cp-iroom-retry">Try again</button></Notice>;
  }
}

function Room({ id }: { id: string }): React.ReactElement {
  const s = useInterviewRoom(id);
  const room = s.answer?.kind === 'ok' ? s.answer.room : null;
  const known = s.answer?.kind === 'ok' || s.answer?.kind === 'not_open';
  return (
    <main className="cp-room cp-iroom" data-testid="cp-iroom">
      <Header room={room} />
      <div className="cp-iroom-stage">
        <div className="cp-iroom-main"><Main s={s} /></div>
        {known && <CandidatePrepPanel interviewId={id} />}
      </div>
      <footer className="cp-iroom-foot"><Link className="cp-ghost" to={BACK} data-testid="cp-iroom-back">Back to my interviews</Link></footer>
    </main>
  );
}

const InterviewRoomPage: React.FC = () => {
  const { interviewId } = useParams<{ interviewId: string }>();
  const on = useCareerPrepFlag();
  if (on === null) return <p className="text-muted p-3" aria-live="polite">Loading Career Prep...</p>;
  if (!on || !interviewId) return <NotOpen />;
  return <Room id={interviewId} />;
};

export default InterviewRoomPage;
