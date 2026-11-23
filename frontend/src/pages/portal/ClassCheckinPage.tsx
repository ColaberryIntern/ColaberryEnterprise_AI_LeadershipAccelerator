import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  ClassWindow, SavedGuest, CheckinInfo, getCheckinInfo, guestCheckin, getGuestCompanionState, guestVote, guestPulse, guestAsk, guestRun,
  loadSavedGuest, saveGuest, forgetGuest,
} from '../../services/guestCheckinApi';
import { CBCK_CSS } from './classCheckinStyles';
import ColaberryLockup from '../../components/brand/ColaberryLockup';
import CheckinLiveController, { LiveClient } from './CheckinLiveController';
import CheckinGuestForm from './CheckinGuestForm';

// Public live-class check-in (`/portal/class-checkin/:sessionId`): NAME AND EMAIL, NOTHING ELSE.
//
// Ali, 2026-11-23: "It should not be a login at all. They just put their name and email (could be
// accessing from live stream and not have an account). ... When they login it should not send an
// email. It should check them in and immediately start showing them how they look when they are
// checked in to the class." And: Colaberry Training branding.
//
// So this page never touches a portal session. Until 2026-11-23 a visitor signed in (or holding an
// EXPIRED sign-in) went down an account path, and the expired one was bounced to the login page by
// portalApi's 401 handler: on Ali's phone that was the Enterprise login, in another browser the
// Training one. Now:
//   - the class info is read with a plain request (guestCheckinApi), never portalApi;
//   - everyone checks in with name + email (the guest pass). An enrolled student's email is matched
//     to their enrollment server-side, which records their attendance (sessionGuestService.ts);
//   - there is no "log in" link anywhere, and nothing here sends anyone a message;
//   - the live view appears the moment they check in, before class too. A check-in made before the
//     class window re-confirms in the background each minute, so it becomes attendance once class
//     opens without the attendee doing anything.
//
// Mobile-first: one centered card, large tap targets. The sheet is `classCheckinStyles.ts`.

type Phase = 'loading' | 'load_error' | 'ready';
type GuestPhase = 'form' | 'resuming' | 'in';

/** Friendly date label, e.g. "Thursday, July 23". Falls back to the raw string. */
function formatDate(d: string): string {
  if (!d) return '';
  const dt = new Date(`${d}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

/** Accepts "13:00", "13:00:00" (to "1:00 PM") or an already-formatted "1:00 PM". */
function formatTime(t: string): string {
  if (!t) return '';
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(t.trim());
  if (!m) return t;
  const h = Number(m[1]);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${m[2]} ${period}`;
}

const WarnIcon: React.FC = () => (
  <div className="cbck-icon cbck-icon-warn" aria-hidden="true">
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 8v4.5M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  </div>
);

/** The tab title: Colaberry Training, whichever site sent them here. */
export const CHECKIN_TAB_TITLE = 'Class check-in | Colaberry Training';

const ClassCheckinPage: React.FC = () => {
  const { sessionId = '' } = useParams<{ sessionId: string }>();

  const [phase, setPhase] = useState<Phase>('loading');
  const [info, setInfo] = useState<CheckinInfo | null>(null);
  const [guestPhase, setGuestPhase] = useState<GuestPhase>('form');
  const [guest, setGuest] = useState<SavedGuest | null>(null);
  /** The window the server last reported for this check-in: 'before' keeps re-confirming. */
  const [joinedWindow, setJoinedWindow] = useState<ClassWindow | null>(null);

  useEffect(() => {
    const prev = document.title;
    document.title = CHECKIN_TAB_TITLE;
    return () => { document.title = prev; };
  }, []);

  const loadInfo = useCallback(() => {
    if (!sessionId) { setPhase('load_error'); return; }
    setPhase('loading');
    getCheckinInfo(sessionId)
      .then((i) => { setInfo(i); setPhase('ready'); })
      .catch(() => setPhase('load_error'));
  }, [sessionId]);

  useEffect(() => { loadInfo(); }, [loadInfo]);

  const classWindow: ClassWindow = info?.class_window || 'open';
  const acceptsGuests = info?.accepts_guests !== false;

  // Name + email to a guest pass. Idempotent server-side on (session, email): a re-scan is the same
  // person, never a second one.
  const submitGuest = useCallback(async (name: string, email: string) => {
    const r = await guestCheckin(sessionId, name, email);
    const g = { pass: r.pass, name: r.name, email };
    saveGuest(sessionId, g);
    setGuest(g);
    setJoinedWindow(r.class_window || 'open');
    setGuestPhase('in');
  }, [sessionId]);

  // A phone or browser that checked in before resumes straight into the live view.
  const resumeRan = useRef(false);
  useEffect(() => {
    if (phase !== 'ready' || classWindow === 'ended' || !acceptsGuests) return;
    if (resumeRan.current) return;
    resumeRan.current = true;
    const saved = loadSavedGuest(sessionId);
    if (!saved) return;
    setGuest(saved);
    setGuestPhase('resuming');
    submitGuest(saved.name, saved.email).catch(() => setGuestPhase('form'));
  }, [phase, classWindow, acceptsGuests, sessionId, submitGuest]);

  // Checked in before class: keep re-confirming once a minute until the server says the class is
  // open, which is what turns the check-in into attendance. The live view is already showing.
  useEffect(() => {
    if (guestPhase !== 'in' || !guest || joinedWindow !== 'before') return;
    const id = window.setInterval(() => {
      submitGuest(guest.name, guest.email).catch(() => { /* the next tick retries */ });
    }, 60 * 1000);
    return () => window.clearInterval(id);
  }, [guestPhase, guest, joinedWindow, submitGuest]);

  const checkInAgain = useCallback(() => {
    forgetGuest(sessionId);
    setGuestPhase('form');
  }, [sessionId]);

  const guestPass = guest?.pass || '';
  const client = useMemo<LiveClient>(() => ({
    getState: () => getGuestCompanionState(sessionId, guestPass),
    pulse: (s) => guestPulse(sessionId, guestPass, s),
    ask: (t) => guestAsk(sessionId, guestPass, t),
    run: (m) => guestRun(sessionId, guestPass, m),
    vote: (k, c) => guestVote(sessionId, guestPass, k, c),
  }), [sessionId, guestPass]);

  const startsAt = info ? (info.start_label || formatTime(info.start_time)) : '';
  const when = info ? `${formatDate(info.session_date)}${startsAt ? ` · ${startsAt}` : ''}` : '';
  const classHeader = info && (
    <>
      <p className="cbck-eyebrow">{info.cohort_name}</p>
      <h1 className="cbck-title">{info.title}</h1>
      <p className="cbck-meta">{when}</p>
    </>
  );

  const renderReady = (i: CheckinInfo): React.ReactNode => {
    if (classWindow === 'ended') {
      return (
        <div className="cbck-state" data-testid="checkin-ended">
          {classHeader}
          <p className="cbck-text cbck-text-lead">This class has ended, so check-in is closed.</p>
        </div>
      );
    }
    if (!acceptsGuests) {
      return (
        <div className="cbck-state" data-testid="checkin-closed">
          {classHeader}
          <p className="cbck-text cbck-text-lead">Check-in is not open for this class.</p>
        </div>
      );
    }
    if (guestPhase === 'in' && guest) {
      const first = guest.name.split(' ')[0];
      return (
        <CheckinLiveController
          title={i.title}
          meta={joinedWindow === 'before' ? `${when}. Class starts soon: keep this page open.` : `${i.cohort_name}${startsAt ? ` · ${startsAt}` : ''}`}
          eyebrow={`You’re checked in, ${first}`}
          client={client}
          signedOut={{
            body: 'Your check-in on this device has expired. Enter your name and email again to keep going.',
            action: 'Check in again',
            onAction: checkInAgain,
          }}
        />
      );
    }
    if (guestPhase === 'resuming') {
      return (
        <div className="cbck-state" aria-live="polite">
          <span className="cbck-spin" aria-hidden="true" />
          <p className="cbck-text">Checking you in…</p>
        </div>
      );
    }
    return (
      <div className="cbck-state">
        {classHeader}
        <CheckinGuestForm
          lead={classWindow === 'before'
            ? `Enter your name and email to check in. No account or password needed. Class starts ${startsAt}.`
            : 'Enter your name and email to check in. No account or password needed.'}
          initialName={guest?.name}
          initialEmail={guest?.email}
          submitLabel="Check in"
          onSubmit={submitGuest}
        />
      </div>
    );
  };

  return (
    <div className="cbck-root">
      <style>{CBCK_CSS}</style>

      <main className="cbck-card">
        <div className="cbck-brand">
          <ColaberryLockup height={32} alt="Colaberry" />
        </div>

        {phase === 'ready' && info?.meeting_link && (
          <a
            href={info.meeting_link}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="checkin-join-meeting"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              margin: '4px 0 18px', padding: '16px 20px', borderRadius: 999,
              background: '#2D8CFF', color: '#fff', fontWeight: 800, fontSize: 18,
              textDecoration: 'none', boxShadow: '0 10px 26px rgba(45,140,255,.35)',
            }}
          >
            Join the class on Zoom
          </a>
        )}

        {phase === 'loading' && (
          <div className="cbck-state" aria-live="polite">
            <span className="cbck-spin" aria-hidden="true" />
            <p className="cbck-text">Loading your class…</p>
          </div>
        )}

        {phase === 'load_error' && (
          <div className="cbck-state">
            <WarnIcon />
            <h1 className="cbck-title">Couldn&rsquo;t load this class</h1>
            <p className="cbck-text">The check-in link may be incomplete. Scan the code again, or ask your instructor for a fresh link.</p>
            <button type="button" className="cbck-btn" onClick={loadInfo} data-testid="checkin-retry-load">Try again</button>
          </div>
        )}

        {phase === 'ready' && info && renderReady(info)}

        {/* Colaberry Training, whichever site the link came from; the program name comes from
            the backend's canonical course (canonicalCourse.ts). */}
        <p className="cbck-foot" data-testid="checkin-foot">{info?.program_name ? `Colaberry Training · ${info.program_name}` : 'Colaberry Training'}</p>
      </main>
    </div>
  );
};

export default ClassCheckinPage;
