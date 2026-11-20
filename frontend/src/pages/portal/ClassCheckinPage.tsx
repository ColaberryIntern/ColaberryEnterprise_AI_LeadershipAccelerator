import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import portalApi from '../../utils/portalApi';
import { useParticipantAuth } from '../../contexts/ParticipantAuthContext';
import {
  joinSession, setSessionPulse, askSessionQuestion, getCompanionState, submitPollResponse,
} from '../../services/onboardingApi';
import {
  ClassWindow, SavedGuest, guestCheckin, getGuestCompanionState, guestVote, guestPulse, guestAsk,
  loadSavedGuest, saveGuest, forgetGuest,
} from '../../services/guestCheckinApi';
import { emitPointsEarned } from '../../services/pointsFx';
import { CBCK_CSS } from './classCheckinStyles';
import ColaberryLockup from '../../components/brand/ColaberryLockup';
import CheckinLiveController, { LiveClient } from './CheckinLiveController';
import CheckinGuestForm from './CheckinGuestForm';

// Public live-class check-in landing (`/portal/class-checkin/:sessionId`).
//
// An attendee scans the room's QR (from the Class Kit / deck) on their phone and lands here.
// The route is PUBLIC. Two ways through, one live view (CheckinLiveController):
//   • Signed in AND a member of this class → one tap: attendance via joinSession()
//     (idempotent, awards points once), then the live controller and "Open the live room".
//   • Anyone else — signed out, or signed in under an account that is not on this class
//     (2026-11-19: Ali, signed in as a July-cohort account, scanned Session 3 of the November
//     cohort and got "We couldn't check you in", because POST /join answers 404 for another
//     cohort) → name + email, recorded for attendance tracking, then the SAME live controller
//     on a session-scoped guest pass (polls, status, questions). No password, no emailed link.
// Before the class window the page captures name + email and says when the class starts;
// after it, it says the class has ended. Nothing on this page sends anyone a message.
//
// Mobile-first: one centered card, large tap targets. The sheet is `classCheckinStyles.ts`
// (Design System semantic tokens, with the hex fallbacks recorded in that file's test).

interface CheckinInfo {
  title: string;
  session_date: string;
  start_time: string;
  cohort_name: string;
  room_id: string | null;
  /** Canonical program name from the backend (canonicalCourse.ts) — the footer's one source. */
  program_name?: string;
  /** Absent from an older backend: treated as 'open', which is how this page always behaved. */
  class_window?: ClassWindow;
  start_label?: string;
  accepts_guests?: boolean;
  /** Open House sessions only: the Zoom link, shown as a "Join the class on Zoom" button. */
  meeting_link?: string | null;
}

type Phase = 'loading' | 'load_error' | 'ready';
type JoinPhase = 'idle' | 'joining' | 'checked' | 'join_error';
/** Guest path: the form, signed up before class ('waiting'), or in the live view. */
type GuestPhase = 'form' | 'resuming' | 'waiting' | 'in';

/** Friendly date label, e.g. "Thursday, July 23". Falls back to the raw string. */
function formatDate(d: string): string {
  if (!d) return '';
  const dt = new Date(`${d}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

/** Accepts "13:00", "13:00:00" (→ "1:00 PM") or an already-formatted "1:00 PM". */
function formatTime(t: string): string {
  if (!t) return '';
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(t.trim());
  if (!m) return t; // already human-readable (e.g. "10:00 AM")
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

const ClassCheckinPage: React.FC = () => {
  const { sessionId = '' } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useParticipantAuth();

  const [phase, setPhase] = useState<Phase>('loading');
  const [info, setInfo] = useState<CheckinInfo | null>(null);
  const [joinPhase, setJoinPhase] = useState<JoinPhase>('idle');
  const joinRan = useRef(false);

  /** True once this visitor is on the name + email path (signed out, or not on this class). */
  const [asGuest, setAsGuest] = useState(false);
  const [guestReason, setGuestReason] = useState<'signed_out' | 'not_in_class'>('signed_out');
  const [guestPhase, setGuestPhase] = useState<GuestPhase>('form');
  const [guest, setGuest] = useState<SavedGuest | null>(null);

  // 1) Load the public class info (title/date/cohort/window) for either path.
  const loadInfo = useCallback(() => {
    if (!sessionId) { setPhase('load_error'); return; }
    setPhase('loading');
    portalApi
      .get<CheckinInfo>(`/api/portal/sessions/${sessionId}/checkin-info`)
      .then((res) => { setInfo(res.data); setPhase('ready'); })
      .catch(() => setPhase('load_error'));
  }, [sessionId]);

  useEffect(() => { loadInfo(); }, [loadInfo]);

  const classWindow: ClassWindow = info?.class_window || 'open';
  const acceptsGuests = info?.accepts_guests !== false;

  // 2) Signed in → record attendance, once, inside the class window. joinSession is
  //    idempotent, so a re-scan just re-confirms (awards 0). The ref guard stops React
  //    StrictMode's dev double-invoke from double-firing. A 403/404 means "not on this
  //    class" — that visitor gets the name + email path instead of an error.
  const doJoin = useCallback(() => {
    setJoinPhase('joining');
    joinSession(sessionId, 'classroom')
      .then((r) => {
        setJoinPhase('checked');
        if (r.awarded) emitPointsEarned(r.points);
      })
      .catch((err: { response?: { status?: number } }) => {
        const status = err?.response?.status;
        if ((status === 403 || status === 404) && acceptsGuests) {
          setGuestReason('not_in_class');
          setAsGuest(true);
          setJoinPhase('idle');
          return;
        }
        setJoinPhase('join_error');
      });
  }, [sessionId, acceptsGuests]);

  useEffect(() => {
    if (phase !== 'ready' || !isAuthenticated || classWindow !== 'open') return;
    if (joinRan.current) return;
    joinRan.current = true;
    doJoin();
  }, [phase, isAuthenticated, classWindow, doJoin]);

  // 3) Guest path. A phone that checked in before keeps its pass and who they said they
  //    were; a re-scan re-confirms silently (idempotent server-side), which is also what turns
  //    a pre-class sign-up into attendance once the class window opens.
  const submitGuest = useCallback(async (name: string, email: string) => {
    const r = await guestCheckin(sessionId, name, email);
    const g = { pass: r.pass, name: r.name, email };
    saveGuest(sessionId, g);
    setGuest(g);
    setGuestPhase(r.class_window === 'before' ? 'waiting' : 'in');
  }, [sessionId]);

  const guestResumeRan = useRef(false);
  useEffect(() => {
    if (phase !== 'ready' || isAuthenticated || classWindow === 'ended') return;
    if (guestResumeRan.current) return;
    guestResumeRan.current = true;
    setAsGuest(true);
    const saved = loadSavedGuest(sessionId);
    if (!saved || !acceptsGuests) return;
    setGuest(saved);
    setGuestPhase('resuming');
    submitGuest(saved.name, saved.email).catch(() => setGuestPhase('form'));
  }, [phase, isAuthenticated, classWindow, acceptsGuests, sessionId, submitGuest]);

  // Waiting for class: re-confirm once a minute so the page flips into the live view on its
  // own when the window opens (and the check-in becomes attendance) — no re-scan needed.
  useEffect(() => {
    if (guestPhase !== 'waiting' || !guest) return;
    const id = window.setInterval(() => {
      submitGuest(guest.name, guest.email).catch(() => { /* keep waiting; the next tick retries */ });
    }, 60 * 1000);
    return () => window.clearInterval(id);
  }, [guestPhase, guest, submitGuest]);

  const guestSignedOut = useCallback(() => {
    forgetGuest(sessionId);
    setGuestPhase('form');
  }, [sessionId]);

  // The two live clients the one controller view runs on.
  const studentClient = useMemo<LiveClient>(() => ({
    getState: () => getCompanionState(sessionId),
    pulse: (s) => setSessionPulse(sessionId, s),
    ask: (t) => askSessionQuestion(sessionId, t),
    vote: (k, c) => submitPollResponse(sessionId, k, c),
  }), [sessionId]);
  const guestPass = guest?.pass || '';
  const guestClient = useMemo<LiveClient>(() => ({
    getState: () => getGuestCompanionState(sessionId, guestPass),
    pulse: (s) => guestPulse(sessionId, guestPass, s),
    ask: (t) => guestAsk(sessionId, guestPass, t),
    vote: (k, c) => guestVote(sessionId, guestPass, k, c),
  }), [sessionId, guestPass]);

  // The session's Colaberry Commons room (Meet + class chat), signed-in members only. Falls
  // back to Today (never the retired /portal/sessions/:id page) for a session with no room.
  const enterClass = () => navigate(info?.room_id ? `/portal/rooms/${info.room_id}` : '/portal/today');

  // Carry the student's intent through sign-in. Without this the magic-link round trip lands
  // them on /portal/today and their attendance is never recorded. The value is re-validated
  // server-side before it goes into the email, and again before we navigate.
  const loginHref = `/portal/login?next=${encodeURIComponent(`/portal/class-checkin/${sessionId}`)}`;

  const startsAt = info ? (info.start_label || formatTime(info.start_time)) : '';
  const meta = info ? `${info.cohort_name}${startsAt ? ` · ${startsAt}` : ''}` : '';
  const classHeader = info && (
    <>
      <p className="cbck-eyebrow">{info.cohort_name}</p>
      <h1 className="cbck-title">{info.title}</h1>
      <p className="cbck-meta">{formatDate(info.session_date)}{startsAt ? ` · ${startsAt}` : ''}</p>
    </>
  );

  const renderReady = (i: CheckinInfo): React.ReactNode => {
    if (classWindow === 'ended' && !(isAuthenticated && joinPhase === 'checked')) {
      return (
        <div className="cbck-state" data-testid="checkin-ended">
          {classHeader}
          <p className="cbck-text cbck-text-lead">This class has ended, so check-in is closed.</p>
        </div>
      );
    }

    // ── Signed in, before the class window: nothing to record yet, and nothing wrong ──
    if (isAuthenticated && !asGuest && classWindow === 'before') {
      return (
        <div className="cbck-state" data-testid="checkin-before">
          {classHeader}
          <p className="cbck-text cbck-text-lead">This class starts {formatDate(i.session_date)} at {startsAt}. Scan this code again when class begins and you&rsquo;ll be checked in.</p>
          {acceptsGuests && (
            <button type="button" className="cbck-btn cbck-btn-ghost" onClick={() => { setGuestReason('not_in_class'); setAsGuest(true); }} data-testid="checkin-use-name-email">
              Not enrolled in this class? Check in with name and email
            </button>
          )}
        </div>
      );
    }

    // ── Name + email path ──
    if (asGuest || !isAuthenticated) {
      if (!acceptsGuests) {
        return (
          <div className="cbck-state">
            {classHeader}
            <p className="cbck-text cbck-text-lead">Log in to check in for this class.</p>
            <a className="cbck-btn" href={loginHref} data-testid="checkin-login">Log in to check in</a>
          </div>
        );
      }
      if (guestPhase === 'in' && guest) {
        return (
          <CheckinLiveController
            title={i.title}
            meta={meta}
            eyebrow={`You’re checked in, ${guest.name.split(' ')[0]}`}
            client={guestClient}
            signedOut={{
              body: 'Your check-in on this phone has expired. Enter your name and email again to keep answering.',
              action: 'Check in again',
              onAction: guestSignedOut,
            }}
          />
        );
      }
      if (guestPhase === 'waiting' && guest) {
        return (
          <div className="cbck-state" data-testid="checkin-waiting">
            {classHeader}
            <p className="cbck-text cbck-text-lead">
              You&rsquo;re on the list, {guest.name.split(' ')[0]}. This class starts {formatDate(i.session_date)} at {startsAt}.
            </p>
            <p className="cbck-text">Keep this page open, or scan the code again when class begins. The live polls appear here as soon as it starts.</p>
          </div>
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
            lead={guestReason === 'not_in_class'
              ? 'The account you’re signed in with isn’t on this class. Check in with your name and email instead.'
              : classWindow === 'before'
                ? `Add your name and email for this class. It starts ${formatDate(i.session_date)} at ${startsAt}.`
                : 'Enter your name and email to check in and join the live polls.'}
            initialName={guest?.name}
            initialEmail={guest?.email}
            submitLabel={classWindow === 'before' ? 'Save my spot' : 'Check in'}
            onSubmit={submitGuest}
            loginHref={isAuthenticated ? undefined : loginHref}
          />
        </div>
      );
    }

    // ── Signed in and on this class: checking in / checked / retry ──
    if (joinPhase === 'checked') {
      return (
        <CheckinLiveController
          title={i.title}
          meta={meta}
          eyebrow={'You’re checked in'}
          client={studentClient}
          signedOut={{
            body: 'Questions will not reach this phone until you sign in again. Nothing you have already answered is lost.',
            action: 'Sign in again',
            onAction: () => navigate(loginHref),
          }}
          onEnter={enterClass}
        />
      );
    }
    if (joinPhase === 'join_error') {
      return (
        <div className="cbck-state">
          <WarnIcon />
          <h1 className="cbck-title">We couldn&rsquo;t check you in</h1>
          <p className="cbck-text">Something went wrong recording your attendance. Try again, or check in with your name and email instead.</p>
          <button type="button" className="cbck-btn" onClick={doJoin} data-testid="checkin-retry-join">Try again</button>
          {acceptsGuests && (
            <button type="button" className="cbck-btn cbck-btn-ghost" onClick={() => { setGuestReason('not_in_class'); setAsGuest(true); }} data-testid="checkin-use-name-email">
              Check in with name and email
            </button>
          )}
          <button type="button" className="cbck-btn cbck-btn-ghost" onClick={enterClass} data-testid="checkin-enter-anyway">Enter the class anyway</button>
        </div>
      );
    }
    return (
      <div className="cbck-state" aria-live="polite">
        <span className="cbck-spin" aria-hidden="true" />
        <p className="cbck-text">Checking you in…</p>
      </div>
    );
  };

  return (
    <div className="cbck-root">
      <style>{CBCK_CSS}</style>

      <main className="cbck-card">
        <div className="cbck-brand">
          {/* D14: artwork, not a third hand-set copy of the logotype. As on the live page,
              this is the only thing identifying whose page this is, so it carries an alt. */}
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
            ▶ Join the class on Zoom
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

        {/* The program's name comes from the backend's canonical course (canonicalCourse.ts),
            so a rename reaches this footer without anyone remembering it is here. */}
        <p className="cbck-foot" data-testid="checkin-foot">{info?.program_name ? `Colaberry ${info.program_name}` : 'Colaberry'}</p>
      </main>
    </div>
  );
};

export default ClassCheckinPage;
