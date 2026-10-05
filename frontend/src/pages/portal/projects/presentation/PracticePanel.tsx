import React, { useCallback, useEffect, useState } from 'react';
import GetReadyPanel from './GetReadyPanel';
import {
  fetchPracticeSession,
  startPractice,
  SlotUnavailableError,
  type PracticeSession,
} from './presentationApi';

/**
 * The Practice stage: reserve a room to rehearse in.
 *
 * ONE ZOOM HOST, SO ONE REHEARSAL AT A TIME. The server refuses an overlapping slot
 * with a Postgres exclusion constraint rather than a check-then-write, and the
 * refusal carries the next time that is genuinely free. That next time is shown as a
 * button, because telling a student "taken" and making them guess again is the worst
 * version of this screen.
 *
 * NO JOIN BUTTON YET, DELIBERATELY. Launching into the room needs the get-ready
 * screen — the audience and recording acknowledgement a student must see BEFORE they
 * are in a recorded call — and that is the next task. A join button here would either
 * skip that consent or do nothing, and both are worse than saying where it is.
 */

const CENTRAL = 'America/Chicago';
const DEFAULT_MINUTES = 30;

/** Every time this programme runs on is Central, so every time here is shown in it. */
function centralLabel(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: CENTRAL, weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(d);
}

/**
 * A `datetime-local` value is a wall clock with no zone. Parsing it with `new Date`
 * reads it in the BROWSER's zone, which is what the student meant, and
 * `toISOString()` then makes it a real instant. Sending the naive string instead is
 * the bug that put Zoom bookings five hours out.
 */
function localToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export interface PracticePanelProps {
  projectId: string;
  storyId: string;
  demo?: boolean;
}

type Load = 'loading' | 'ready' | 'error';

/**
 * What the attempt's recording state actually means, in words a student can act on.
 *
 * "processing" is NEVER rendered as a finished recording. A webhook receipt proves
 * an event arrived; it does not prove a playable file exists, and telling someone
 * their rehearsal is ready when it is still being assembled sends them to an empty
 * page and makes them distrust the next honest message.
 *
 * 'review' is deliberately not dressed up as an error. It means a human has to
 * decide which attempt the recording belongs to — usually because a cohort session
 * had overlapping slots — and nothing is lost while that happens.
 */
function recordingLine(state: string): { label: string; tone: 'ok' | 'wait' | 'idle'; detail: string } {
  switch (state) {
    case 'ready':
      return { label: 'Ready', tone: 'ok', detail: 'Your recording is available to watch back.' };
    case 'processing':
      return { label: 'Processing', tone: 'wait', detail: 'Zoom is still assembling the file. It is not watchable yet.' };
    case 'review':
      return { label: 'Being checked', tone: 'wait', detail: 'Someone is confirming which take this recording belongs to. Nothing is lost.' };
    case 'missing':
      return { label: 'Not found', tone: 'idle', detail: 'No recording arrived for this take. You can rehearse again, or ask staff to look.' };
    case 'failed':
      return { label: 'Failed', tone: 'idle', detail: 'The recording could not be collected. Staff can retry it for you.' };
    case 'superseded':
      return { label: 'Replaced', tone: 'idle', detail: 'A later take replaced this one.' };
    case 'expected':
    default:
      return { label: 'Expected', tone: 'idle', detail: 'Nothing has arrived yet. Recordings appear after the room closes.' };
  }
}

/** The reserved slot, once there is one. */
function BookedSlot(
  { session, projectId, storyId, demo }:
  { session: PracticeSession; projectId: string; storyId: string; demo?: boolean },
) {
  return (
    <>
    <div className="ps-card" data-testid="ps-practice-booked">
      <h3>Your practice room</h3>
      <dl className="ps-facts">
        <dt>Take</dt>
        <dd>#{session.attemptNo}</dd>
        <dt>When</dt>
        <dd>{centralLabel(session.startAt)}</dd>
        <dt>Room</dt>
        <dd>
          {session.meetingReady ? (
            <span className="ps-chip ps-chip--ok" data-testid="ps-practice-ready">Room ready</span>
          ) : (
            <span className="ps-chip ps-chip--wait" data-testid="ps-practice-pending">
              Still being created
            </span>
          )}
        </dd>
        <dt>Recording</dt>
        <dd>
          <span
            className={`ps-chip ps-chip--${recordingLine(session.recordingState).tone}`}
            data-testid="ps-practice-recording-state"
          >
            {recordingLine(session.recordingState).label}
          </span>
          <div className="ps-note ps-note--soft" data-testid="ps-practice-recording-detail">
            {recordingLine(session.recordingState).detail}
          </div>
        </dd>
      </dl>
      {!session.meetingReady && (
        <p className="ps-note ps-note--soft">
          The room is being created. This usually takes a few seconds — reload the page to check.
        </p>
      )}
    </div>
    {/* The get-ready step only appears once there is actually a room to go into.
        Offering it earlier would be a consent screen for a door that is not there. */}
    {session.meetingReady && (
      <GetReadyPanel
        projectId={projectId}
        storyId={storyId}
        attemptId={session.attemptId}
        mode={session.mode}
        recordingPolicy={session.recordingPolicy}
        demo={demo}
      />
    )}
    </>
  );
}

export default function PracticePanel({ projectId, storyId, demo }: PracticePanelProps) {
  const [load, setLoad] = useState<Load>(demo ? 'ready' : 'loading');
  const [session, setSession] = useState<PracticeSession | null>(null);
  const [when, setWhen] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [nextFree, setNextFree] = useState<string | null>(null);

  useEffect(() => {
    if (demo) { setLoad('ready'); return; }
    let live = true;
    setLoad('loading');
    fetchPracticeSession(projectId, storyId)
      .then((s) => { if (live) { setSession(s); setLoad('ready'); } })
      .catch(() => { if (live) setLoad('error'); });
    return () => { live = false; };
  }, [projectId, storyId, demo]);

  const reserve = useCallback(async (isoStart: string) => {
    setBusy(true);
    setProblem(null);
    setNextFree(null);
    try {
      const end = new Date(new Date(isoStart).getTime() + DEFAULT_MINUTES * 60000).toISOString();
      setSession(await startPractice(projectId, storyId, { start_at: isoStart, end_at: end }));
    } catch (err: any) {
      if (err instanceof SlotUnavailableError) {
        setProblem(err.message);
        setNextFree(err.nextAvailable);
      } else {
        setProblem(err?.response?.data?.error || 'Could not reserve that time. Try again.');
      }
    } finally {
      setBusy(false);
    }
  }, [projectId, storyId]);

  const submit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const iso = localToIso(when);
    if (!iso) { setProblem('Pick a date and time first.'); return; }
    void reserve(iso);
  }, [when, reserve]);

  const takeNextFree = useCallback(() => {
    if (!nextFree) return;
    setWhen(isoToLocalInput(nextFree));
    void reserve(nextFree);
  }, [nextFree, reserve]);

  if (demo) {
    return (
      <div className="ps-pending" data-testid="ps-practice-demo">
        <strong>Practice rooms are part of the live programme.</strong>
        In the course you reserve a room here and rehearse against the clock.
      </div>
    );
  }

  if (load === 'loading') return <p className="ps-note ps-note--soft">Loading your practice room…</p>;
  if (load === 'error') {
    return <p className="ps-note" data-testid="ps-practice-error">Could not load your practice room. Reload to try again.</p>;
  }

  if (session && session.bookingId) {
    return <BookedSlot session={session} projectId={projectId} storyId={storyId} demo={demo} />;
  }

  return (
    <form className="ps-card" onSubmit={submit} data-testid="ps-practice-form">
      <h3>Reserve a practice room</h3>
      <label className="ps-label" htmlFor="ps-practice-when">
        When do you want to rehearse? ({DEFAULT_MINUTES} minutes, shown back to you in Central)
      </label>
      <input
        id="ps-practice-when"
        className="ps-input"
        type="datetime-local"
        value={when}
        onChange={(e) => setWhen(e.target.value)}
        data-testid="ps-practice-when"
      />
      {when && (
        <p className="ps-note ps-note--soft" data-testid="ps-practice-echo">
          That is {centralLabel(localToIso(when))}.
        </p>
      )}

      {problem && (
        <p className="ps-note" data-testid="ps-practice-problem" role="status">{problem}</p>
      )}

      <div className="ps-acts">
        <button className="ps-btn" type="submit" disabled={busy} data-testid="ps-practice-submit">
          {busy ? 'Reserving…' : 'Reserve this time'}
        </button>
        {/* Offered only when the server actually told us a free time. Inventing one
            would send the student straight back into the same refusal. */}
        {nextFree && (
          <button
            className="ps-btn ps-btn--soft"
            type="button"
            onClick={takeNextFree}
            disabled={busy}
            data-testid="ps-practice-next-free"
          >
            Take {centralLabel(nextFree)} instead
          </button>
        )}
      </div>
    </form>
  );
}
