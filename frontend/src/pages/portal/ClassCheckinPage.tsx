import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import portalApi from '../../utils/portalApi';
import { useParticipantAuth } from '../../contexts/ParticipantAuthContext';
import {
  joinSession, setSessionPulse, askSessionQuestion, PulseState,
  getCompanionState, submitPollResponse, CompanionState,
} from '../../services/onboardingApi';
import { emitPointsEarned } from '../../services/pointsFx';
import { LinkState, linkStateAfterFailure } from './classroomLinkState';
import { LIVE_PULSES } from '../../components/portal/livePulse';
import { CBCK_CSS } from './classCheckinStyles';

// Public live-class check-in landing (`/portal/class-checkin/:sessionId`).
//
// A student scans the room's QR (from the admin Class Kit) on their phone and
// lands here. The route is PUBLIC — they may not be signed in yet:
//   • Signed in  → we record attendance via joinSession() (idempotent), show a
//     big "you're checked in" confirmation, fire the points burst if awarded,
//     and offer "Enter the class" → the session's Colaberry Commons room (Meet + class chat).
//   • Signed out → we show the class name and send them to sign in.
// Any info-load failure fails soft with a friendly retry message (never a crash).
//
// Mobile-first: one centered card, large tap targets. Styling uses the Design
// System semantic tokens (mirrors PortalLoginPage) so light/dark and brand stay
// consistent.
//
// The sheet lives in `classCheckinStyles.ts` — it was about 250 of this file's
// lines and splitting it is what brought the component back under CLAUDE.md's
// 500-line ceiling.
//
// This comment used to claim "no hardcoded hex". It is not true and was not
// when it was written: there are fifteen hex literals, thirteen of them
// `var(--token, #fallback)` fallbacks or `#fff` on a filled button, plus the
// Prompt Drop box's terminal-dark `#0f1720`/`#26313f`/`#e7eef6`, which do NOT
// adapt to light mode. Left as-is deliberately — restyling a student-facing
// code block is a design decision — but recorded honestly, because a comment
// asserting a property the file does not have is worse than no comment.

interface CheckinInfo {
  title: string;
  session_date: string;
  start_time: string;
  cohort_name: string;
  room_id: string | null;
}

type Phase = 'loading' | 'load_error' | 'ready';
type JoinPhase = 'idle' | 'joining' | 'checked' | 'join_error';

/** Friendly date label, e.g. "Thursday, July 23". Falls back to the raw string. */
function formatDate(d: string): string {
  if (!d) return '';
  const dt = new Date(`${d}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

/** Emoji-labelled kind for the live question card. */
function kindLabel(kind: 'prediction' | 'poll' | 'trivia'): string {
  if (kind === 'trivia') return '🧠 Trivia';
  if (kind === 'prediction') return '🔮 Make your prediction';
  return '📊 Live poll';
}

interface PulseGridProps {
  pulse: PulseState | null;
  onTap: (s: PulseState) => void;
  style?: React.CSSProperties;
}

/**
 * The status grid, rendered identically wherever this page shows it.
 *
 * ONE component for both controllers, because they had drifted: Build Mode used to offer
 * three states and drop `here`, so during the one segment where an instructor most needs to
 * know who is merely following along, there was no button for it. `livePulse.ts` carries the
 * rest of the reasoning and owns the set itself.
 */
function PulseGrid({ pulse, onTap, style }: PulseGridProps): React.ReactElement {
  return (
    <div className="cbck-status-grid" style={style} data-testid="pulse-grid">
      {LIVE_PULSES.map(({ state: s, label, emoji }) => (
        <button
          key={s}
          type="button"
          className={`cbck-status cbck-status-${s}${pulse === s ? ' is-active' : ''}`}
          onClick={() => onTap(s)}
          aria-pressed={pulse === s}
          data-testid={`pulse-${s}`}
        >
          <span className="cbck-status-emoji" aria-hidden="true">{emoji}</span>
          {label}
        </button>
      ))}
    </div>
  );
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

const ClassCheckinPage: React.FC = () => {
  const { sessionId = '' } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useParticipantAuth();

  const [phase, setPhase] = useState<Phase>('loading');
  const [info, setInfo] = useState<CheckinInfo | null>(null);
  const [joinPhase, setJoinPhase] = useState<JoinPhase>('idle');
  const joinRan = useRef(false);

  // Live class controller (after check-in): status + ask-a-question.
  const [pulse, setPulse] = useState<PulseState | null>(null);
  const [question, setQuestion] = useState('');
  const [qState, setQState] = useState<'idle' | 'sending' | 'sent'>('idle');

  const tapPulse = useCallback((state: PulseState) => {
    setPulse(state);
    setSessionPulse(sessionId, state).catch(() => { /* best-effort; UI already reflects it */ });
  }, [sessionId]);

  /**
   * The send gate, and a REF rather than `qState` on purpose. The button's `disabled` is not
   * the gate — Enter is also bound to this, and React batches, so two quick presses both read
   * `qState === 'idle'` out of the same closure and both post. Nothing downstream deduplicates
   * a question, so the instructor's deck would show it twice.
   */
  const askInFlight = useRef(false);

  const sendQuestion = useCallback(() => {
    const text = question.trim();
    if (!text || askInFlight.current) return;
    askInFlight.current = true;
    setQState('sending');
    askSessionQuestion(sessionId, text)
      .then(() => {
        askInFlight.current = false;
        setQuestion('');
        setQState('sent');
        setTimeout(() => setQState('idle'), 1800);
      })
      // The text stays in the box on failure, so a question is never silently eaten.
      .catch(() => { askInFlight.current = false; setQState('idle'); });
  }, [sessionId, question]);

  // Mirror the instructor deck: once checked in, poll the companion state so the
  // phone switches to whatever is on screen (status / a live question / broadcast).
  const [companion, setCompanion] = useState<CompanionState | null>(null);
  /**
   * Whether the phone is still hearing from the class.
   *
   * This poll used to swallow every error and keep rendering its last view
   * forever, which meant a student whose session had gone simply watched a
   * status screen while the room answered questions — no message, no retry,
   * nothing to tell them or their instructor that anything was wrong. It looks
   * identical to "the instructor is not on a question slide", so it is
   * invisible from both ends. Reported live in class on 2026-08-20.
   */
  const [link, setLink] = useState<LinkState>('live');
  const failures = useRef(0);
  useEffect(() => {
    if (joinPhase !== 'checked') return;
    let alive = true;
    const tick = () => getCompanionState(sessionId)
      .then((s) => {
        if (!alive) return;
        failures.current = 0;
        setLink('live');
        setCompanion(s);
      })
      .catch((err: { response?: { status?: number } }) => {
        if (!alive) return;
        failures.current += 1;
        setLink(linkStateAfterFailure(err?.response?.status, failures.current));
      });
    tick();
    const id = window.setInterval(tick, 2500);
    // Polling continues even while disconnected, so recovery is automatic and
    // the student does not have to know to reload.
    return () => { alive = false; window.clearInterval(id); };
  }, [joinPhase, sessionId]);

  const answerPoll = useCallback((key: string, choice: number) => {
    setCompanion((c) => (c && c.question ? { ...c, question: { ...c.question, my_choice: choice } } : c));
    submitPollResponse(sessionId, key, choice).catch(() => { /* best-effort; a locked vote simply won't be counted server-side */ });
  }, [sessionId]);

  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');
  const copyPrompt = useCallback((text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 1600);
    }).catch(() => { /* clipboard may be unavailable; the prompt is still readable on screen */ });
  }, []);

  // 1) Load the public class info (title/date/cohort) for either path.
  const loadInfo = useCallback(() => {
    if (!sessionId) { setPhase('load_error'); return; }
    setPhase('loading');
    portalApi
      .get<CheckinInfo>(`/api/portal/sessions/${sessionId}/checkin-info`)
      .then((res) => { setInfo(res.data); setPhase('ready'); })
      .catch(() => setPhase('load_error'));
  }, [sessionId]);

  useEffect(() => { loadInfo(); }, [loadInfo]);

  // 2) Once info is loaded AND the student is signed in, record attendance.
  //    joinSession is idempotent, so a re-scan just re-confirms (awards 0). The
  //    ref guard stops React StrictMode's dev double-invoke from double-firing.
  const doJoin = useCallback(() => {
    setJoinPhase('joining');
    joinSession(sessionId, 'classroom')
      .then((r) => {
        setJoinPhase('checked');
        if (r.awarded) emitPointsEarned(r.points);
      })
      .catch(() => setJoinPhase('join_error'));
  }, [sessionId]);

  useEffect(() => {
    if (phase !== 'ready' || !isAuthenticated) return;
    if (joinRan.current) return;
    joinRan.current = true;
    doJoin();
  }, [phase, isAuthenticated, doJoin]);

  // The session's Colaberry Commons room (Meet + class chat). Falls back to
  // Today (never the retired /portal/sessions/:id page, removed in Phase 4
  // of the waiting-room plan) for the rare session with no room yet — the
  // student is already checked in either way, so Today's own Next-live-class
  // card picks up from there.
  const enterClass = () => navigate(info?.room_id ? `/portal/rooms/${info.room_id}` : '/portal/today');

  // Carry the student's intent through sign-in. Without this the magic-link
  // round trip lands them on /portal/today and their attendance is never
  // recorded — the QR looks like it "did nothing". The value is re-validated
  // server-side before it goes into the email, and again before we navigate.
  const loginHref = `/portal/login?next=${encodeURIComponent(`/portal/class-checkin/${sessionId}`)}`;

  return (
    <div className="cbck-root">
      <style>{CBCK_CSS}</style>

      <main className="cbck-card">
        <div className="cbck-brand">
          <img src="/colaberry-icon.png" alt="" width={34} height={34} />
          <span className="cbck-wordmark" aria-hidden="true">
            <span className="cbck-wordmark-c">C</span>olaberry
          </span>
        </div>

        {phase === 'loading' && (
          <div className="cbck-state" aria-live="polite">
            <span className="cbck-spin" aria-hidden="true" />
            <p className="cbck-text">Loading your class…</p>
          </div>
        )}

        {phase === 'load_error' && (
          <div className="cbck-state">
            <div className="cbck-icon cbck-icon-warn" aria-hidden="true">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                <path d="M12 8v4.5M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <h1 className="cbck-title">Couldn&rsquo;t load this class</h1>
            <p className="cbck-text">The check-in link may be incomplete. Scan the code again, or ask your instructor for a fresh link.</p>
            <button type="button" className="cbck-btn" onClick={loadInfo} data-testid="checkin-retry-load">Try again</button>
          </div>
        )}

        {phase === 'ready' && info && (
          <>
            {/* ── Signed out: name the class, send them to sign in ── */}
            {!isAuthenticated && (
              <div className="cbck-state">
                <p className="cbck-eyebrow">{info.cohort_name}</p>
                <h1 className="cbck-title">{info.title}</h1>
                <p className="cbck-meta">{formatDate(info.session_date)}{info.start_time ? ` · ${formatTime(info.start_time)}` : ''}</p>
                <p className="cbck-text cbck-text-lead">Log in to check in for this class.</p>
                <a className="cbck-btn" href={loginHref} data-testid="checkin-login">Log in to check in</a>
                <p className="cbck-text cbck-text-sub">You&rsquo;ll sign in with your enrolled email, then come straight back here — your check-in finishes automatically.</p>
              </div>
            )}

            {/* ── Signed in: checking in / checked / retry ── */}
            {isAuthenticated && (joinPhase === 'joining' || joinPhase === 'idle') && (
              <div className="cbck-state" aria-live="polite">
                <span className="cbck-spin" aria-hidden="true" />
                <p className="cbck-text">Checking you in…</p>
              </div>
            )}

            {isAuthenticated && joinPhase === 'checked' && (
              <div className="cbck-state">
                <div className="cbck-icon cbck-icon-ok" aria-hidden="true">
                  <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
                    <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <p className="cbck-eyebrow">You&rsquo;re checked in</p>
                <h1 className="cbck-title">{info.title}</h1>
                <p className="cbck-meta">{info.cohort_name}{info.start_time ? ` · ${formatTime(info.start_time)}` : ''}</p>

                {/* ── CONNECTION — only ever shown when something is actually wrong ── */}
                {link !== 'live' && (
                  <div className={`cbck-link-warn${link === 'signed_out' ? ' is-hard' : ''}`} role="status" aria-live="polite" data-testid="checkin-link-warn">
                    {link === 'signed_out' ? (
                      <>
                        <p className="cbck-link-title">You have been signed out</p>
                        <p className="cbck-link-body">
                          Questions will not reach this phone until you sign in again. Nothing you have already
                          answered is lost.
                        </p>
                        <button type="button" className="cbck-link-btn" onClick={() => navigate(loginHref)}>
                          Sign in again
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="cbck-link-title">Reconnecting&hellip;</p>
                        <p className="cbck-link-body">
                          This phone has lost the class for a moment. It keeps trying on its own, so give it a few
                          seconds before doing anything.
                        </p>
                      </>
                    )}
                  </div>
                )}

                {/* ── LIVE QUESTION — appears automatically when the instructor is on a question slide ── */}
                {companion?.phase === 'question' && companion.question ? (
                  <div className="cbck-controller">
                    {companion.question.theater && (
                      <p className={`cbck-theater-badge${companion.question.theater.state !== 'voting' ? ' is-locked' : ''}`}>
                        {companion.question.theater.state === 'locked' ? '🔒 Voting locked' : companion.question.theater.state === 'revealed' ? '✅ Results are in' : '🗳️ Live vote — everyone is watching'}
                      </p>
                    )}
                    <p className="cbck-ctl-label">{kindLabel(companion.question.kind)}</p>
                    <p className="cbck-q-text">{companion.question.q}</p>
                    <div className="cbck-q-opts">
                      {(companion.question.options || []).map((opt, idx) => {
                        const q = companion.question!;
                        const mine = q.my_choice === idx;
                        const correct = q.revealed && q.answer === idx;
                        const locked = !!q.theater && q.theater.state !== 'voting';
                        return (
                          <button
                            key={idx}
                            type="button"
                            className={`cbck-q-opt${mine ? ' is-mine' : ''}${correct ? ' is-correct' : ''}`}
                            data-testid={`checkin-opt-${idx}`}
                            onClick={() => answerPoll(q.key, idx)}
                            disabled={q.revealed || locked}
                          >
                            <span className="cbck-q-letter">{String.fromCharCode(65 + idx)}</span>
                            <span className="cbck-q-opt-text">{opt}</span>
                            {correct && <span className="cbck-q-check" aria-hidden="true">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                    <p className="cbck-text cbck-text-sub">
                      {companion.question.revealed
                        ? 'Answer revealed ✓'
                        : companion.question.theater && companion.question.theater.state === 'locked'
                          ? 'Vote locked — waiting for the reveal'
                          : companion.question.my_choice != null ? 'Locked in ✓ — you can change it' : 'Tap your answer'}
                    </p>
                  </div>
                ) : companion?.phase === 'prompt' && companion.prompt ? (
                  /* ── BUILD MODE PROMPT — copy-ready, no need to read it off the screen ── */
                  <div className="cbck-controller">
                    <p className="cbck-ctl-label">⌨️ {companion.prompt.label}</p>
                    <div className="cbck-prompt-box">
                      <pre>{companion.prompt.prompt}</pre>
                    </div>
                    <button type="button" className="cbck-btn cbck-copy-btn" onClick={() => copyPrompt(companion.prompt!.prompt)}>
                      {copyState === 'copied' ? 'Copied ✓' : `📋 Copy · paste into ${companion.prompt.pasteWhere || 'Claude Code'}`}
                    </button>
                    {companion.prompt.expectedResult && (
                      <p className="cbck-prompt-meta"><b>👀 You should see:</b> {companion.prompt.expectedResult}</p>
                    )}
                    {companion.prompt.stopCondition && (
                      <p className="cbck-prompt-meta"><b>🛑 Stop when:</b> {companion.prompt.stopCondition}</p>
                    )}
                    <PulseGrid pulse={pulse} onTap={tapPulse} style={{ marginTop: 16 }} />
                  </div>
                ) : companion?.phase === 'broadcast' ? (
                  /* ── BUILDER BROADCAST — appears when the instructor reaches that segment ── */
                  <div className="cbck-controller">
                    <p className="cbck-ctl-label">🎬 Builder Broadcast — record 30 seconds</p>
                    <ul className="cbck-broadcast-list">
                      {(companion.broadcast_prompts || []).map((p, idx) => <li key={idx}>{p}</li>)}
                    </ul>
                    <p className="cbck-text cbck-text-sub">Record it on your phone and post your Build Proof.</p>
                  </div>
                ) : (
                  /* ── DEFAULT — status controller + ask a question ── */
                  <div className="cbck-controller">
                    <p className="cbck-ctl-label">Tap your status any time</p>
                    <PulseGrid pulse={pulse} onTap={tapPulse} />
                    <div className="cbck-ask">
                      <input
                        type="text"
                        className="cbck-ask-input"
                        placeholder="Ask a question…"
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') sendQuestion(); }}
                        maxLength={280}
                        aria-label="Ask a question"
                        data-testid="checkin-ask-input"
                      />
                      <button type="button" className="cbck-ask-send" onClick={sendQuestion} disabled={!question.trim() || qState === 'sending'} data-testid="checkin-ask-send">
                        {qState === 'sent' ? 'Sent ✓' : qState === 'sending' ? '…' : 'Send'}
                      </button>
                    </div>
                    <p className="cbck-text cbck-text-sub">Your instructor sees this on screen — no need to interrupt.</p>
                  </div>
                )}

                <button type="button" className="cbck-btn cbck-btn-ghost" onClick={enterClass} data-testid="checkin-enter">Open the live room</button>
              </div>
            )}

            {isAuthenticated && joinPhase === 'join_error' && (
              <div className="cbck-state">
                <div className="cbck-icon cbck-icon-warn" aria-hidden="true">
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                    <path d="M12 8v4.5M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </div>
                <h1 className="cbck-title">We couldn&rsquo;t check you in</h1>
                <p className="cbck-text">Something went wrong recording your attendance. Try again, or head straight into the class and your instructor can mark you present.</p>
                <button type="button" className="cbck-btn" onClick={doJoin} data-testid="checkin-retry-join">Try again</button>
                <button type="button" className="cbck-btn cbck-btn-ghost" onClick={enterClass} data-testid="checkin-enter-anyway">Enter the class anyway</button>
              </div>
            )}
          </>
        )}

        <p className="cbck-foot">Colaberry Enterprise AI Leadership Accelerator</p>
      </main>
    </div>
  );
};



export default ClassCheckinPage;
