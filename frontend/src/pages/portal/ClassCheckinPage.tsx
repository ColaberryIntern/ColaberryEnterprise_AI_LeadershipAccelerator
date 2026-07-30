import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import portalApi from '../../utils/portalApi';
import { useParticipantAuth } from '../../contexts/ParticipantAuthContext';
import {
  joinSession, setSessionPulse, askSessionQuestion, PulseState,
  getCompanionState, submitPollResponse, CompanionState,
} from '../../services/onboardingApi';
import { emitPointsEarned } from '../../services/pointsFx';

// Public live-class check-in landing (`/portal/class-checkin/:sessionId`).
//
// A student scans the room's QR (from the admin Class Kit) on their phone and
// lands here. The route is PUBLIC — they may not be signed in yet:
//   • Signed in  → we record attendance via joinSession() (idempotent), show a
//     big "you're checked in" confirmation, fire the points burst if awarded,
//     and offer "Enter the class" → the session detail page (Meet + class chat).
//   • Signed out → we show the class name and send them to sign in.
// Any info-load failure fails soft with a friendly retry message (never a crash).
//
// Mobile-first: one centered card, large tap targets. Styling uses the Design
// System semantic tokens (mirrors PortalLoginPage) so light/dark and brand stay
// consistent — no hardcoded hex.

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

  const sendQuestion = useCallback(() => {
    const text = question.trim();
    if (!text) return;
    setQState('sending');
    askSessionQuestion(sessionId, text)
      .then(() => { setQuestion(''); setQState('sent'); setTimeout(() => setQState('idle'), 1800); })
      .catch(() => setQState('idle'));
  }, [sessionId, question]);

  // Mirror the instructor deck: once checked in, poll the companion state so the
  // phone switches to whatever is on screen (status / a live question / broadcast).
  const [companion, setCompanion] = useState<CompanionState | null>(null);
  useEffect(() => {
    if (joinPhase !== 'checked') return;
    let alive = true;
    const tick = () => getCompanionState(sessionId).then((s) => { if (alive) setCompanion(s); }).catch(() => { /* keep last view */ });
    tick();
    const id = window.setInterval(tick, 2500);
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

  const enterClass = () => navigate(`/portal/sessions/${sessionId}`);

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
            <button type="button" className="cbck-btn" onClick={loadInfo}>Try again</button>
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
                <a className="cbck-btn" href={loginHref}>Log in to check in</a>
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
                    <div className="cbck-status-grid" style={{ marginTop: 16 }}>
                      {([
                        { s: 'building', label: 'Building', emoji: '🛠️' },
                        { s: 'stuck', label: "I'm stuck", emoji: '✋' },
                        { s: 'finished', label: 'Finished', emoji: '✅' },
                      ] as { s: PulseState; label: string; emoji: string }[]).map(({ s, label, emoji }) => (
                        <button
                          key={s}
                          type="button"
                          className={`cbck-status cbck-status-${s}${pulse === s ? ' is-active' : ''}`}
                          onClick={() => tapPulse(s)}
                          aria-pressed={pulse === s}
                        >
                          <span className="cbck-status-emoji" aria-hidden="true">{emoji}</span>
                          {label}
                        </button>
                      ))}
                    </div>
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
                    <div className="cbck-status-grid">
                      {([
                        { s: 'here', label: "I'm here", emoji: '👋' },
                        { s: 'building', label: 'Building', emoji: '🛠️' },
                        { s: 'stuck', label: "I'm stuck", emoji: '✋' },
                        { s: 'finished', label: 'Finished', emoji: '✅' },
                      ] as { s: PulseState; label: string; emoji: string }[]).map(({ s, label, emoji }) => (
                        <button
                          key={s}
                          type="button"
                          className={`cbck-status cbck-status-${s}${pulse === s ? ' is-active' : ''}`}
                          onClick={() => tapPulse(s)}
                          aria-pressed={pulse === s}
                        >
                          <span className="cbck-status-emoji" aria-hidden="true">{emoji}</span>
                          {label}
                        </button>
                      ))}
                    </div>
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
                      />
                      <button type="button" className="cbck-ask-send" onClick={sendQuestion} disabled={!question.trim() || qState === 'sending'}>
                        {qState === 'sent' ? 'Sent ✓' : qState === 'sending' ? '…' : 'Send'}
                      </button>
                    </div>
                    <p className="cbck-text cbck-text-sub">Your instructor sees this on screen — no need to interrupt.</p>
                  </div>
                )}

                <button type="button" className="cbck-btn cbck-btn-ghost" onClick={enterClass}>Open the live room</button>
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
                <button type="button" className="cbck-btn" onClick={doJoin}>Try again</button>
                <button type="button" className="cbck-btn cbck-btn-ghost" onClick={enterClass}>Enter the class anyway</button>
              </div>
            )}
          </>
        )}

        <p className="cbck-foot">Colaberry Enterprise AI Leadership Accelerator</p>
      </main>
    </div>
  );
};

const CBCK_CSS = `
.cbck-root{
  min-height:100vh; min-height:100dvh;
  display:flex; align-items:center; justify-content:center;
  padding:20px;
  font-family:var(--font-body); color:var(--text-body);
  background:
    radial-gradient(1100px 460px at 50% -10%, color-mix(in srgb, var(--red-500) 9%, transparent), transparent 70%),
    radial-gradient(900px 420px at 100% 110%, color-mix(in srgb, var(--blue-500) 8%, transparent), transparent 72%),
    var(--surface-subtle);
}
.cbck-card{
  width:100%; max-width:440px;
  background:var(--surface-card);
  border:1px solid var(--border-subtle);
  border-radius:var(--radius-xl);
  box-shadow:var(--shadow-xl);
  padding:34px 30px 24px;
  text-align:center;
}
@media (max-width:520px){ .cbck-card{ padding:28px 20px 22px; } }

.cbck-brand{ display:flex; align-items:center; justify-content:center; gap:9px; margin-bottom:22px; }
.cbck-wordmark{ font-family:var(--font-logo); font-weight:700; font-size:23px; letter-spacing:-.01em; color:var(--text-strong); line-height:1; }
.cbck-wordmark-c{ color:var(--brand-accent); }

.cbck-state{ display:flex; flex-direction:column; align-items:center; }

.cbck-eyebrow{
  font-size:12.5px; font-weight:700; letter-spacing:.05em; text-transform:uppercase;
  color:var(--brand-accent); margin:0 0 8px;
}
.cbck-title{
  font-family:var(--font-display); font-weight:700; font-size:24px; line-height:1.2;
  letter-spacing:-.01em; color:var(--text-strong); margin:0 0 8px;
}
.cbck-meta{ font-size:14.5px; font-weight:600; color:var(--text-body); margin:0 0 18px; }
.cbck-text{ font-size:14.5px; line-height:1.55; color:var(--text-muted); margin:0; }
.cbck-text-lead{ margin:2px 0 20px; font-size:15.5px; color:var(--text-body); font-weight:500; }
.cbck-text-sub{ margin-top:14px; font-size:13px; color:var(--text-subtle); }

.cbck-icon{
  width:66px; height:66px; margin:2px auto 16px;
  display:flex; align-items:center; justify-content:center;
  border-radius:var(--radius-circle);
}
.cbck-icon-ok{ background:var(--status-success-bg); color:var(--status-success); }
.cbck-icon-warn{ background:var(--status-danger-bg); color:var(--status-danger); }

/* Big tap targets — students act one-handed on a phone. */
.cbck-btn{
  width:100%; min-height:54px; margin-top:18px; padding:0 18px;
  display:inline-flex; align-items:center; justify-content:center; gap:9px;
  font-family:var(--font-body); font-size:16px; font-weight:600; text-decoration:none;
  color:var(--action-fg); background:var(--action-bg);
  border:none; border-radius:var(--radius-pill); cursor:pointer;
  box-shadow:var(--shadow-brand);
  transition:background var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
}
.cbck-btn:hover{ background:var(--action-bg-hover); transform:translateY(-1px); }
.cbck-btn:active{ background:var(--action-bg-press); transform:translateY(0); }
.cbck-btn:focus-visible{ outline:none; box-shadow:var(--focus-ring); }
.cbck-btn-ghost{
  color:var(--text-link); background:transparent; box-shadow:none;
  border:1px solid var(--border-default); margin-top:14px;
}
.cbck-btn-ghost:hover{ background:var(--surface-subtle); }

/* Live class controller */
.cbck-controller{ width:100%; margin-top:22px; padding-top:20px; border-top:1px solid var(--border-subtle); }
.cbck-ctl-label{ font-size:12px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; color:var(--text-muted); margin:0 0 12px; }
.cbck-status-grid{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.cbck-status{
  display:flex; flex-direction:column; align-items:center; gap:6px;
  min-height:76px; padding:12px 8px; cursor:pointer;
  font-size:15px; font-weight:600; color:var(--text-body);
  background:var(--surface-card); border:2px solid var(--border-default); border-radius:var(--radius-lg);
  transition:border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
}
.cbck-status:active{ transform:scale(.97); }
.cbck-status-emoji{ font-size:24px; line-height:1; }
.cbck-status.is-active{ color:#fff; border-color:transparent; }
.cbck-status-here.is-active{ background:var(--blue-500, #367895); }
.cbck-status-building.is-active{ background:var(--amber-500, #E8920C); }
.cbck-status-stuck.is-active{ background:var(--red-500, #FB2832); }
.cbck-status-finished.is-active{ background:var(--green-600, #3C7A26); }

.cbck-ask{ display:flex; gap:8px; margin-top:14px; }
.cbck-ask-input{
  flex:1; min-width:0; height:48px; padding:0 14px;
  font-size:15px; color:var(--text-body);
  background:var(--surface-card); border:1.5px solid var(--border-default); border-radius:var(--radius-pill);
}
.cbck-ask-input:focus-visible{ outline:none; border-color:var(--brand-accent); box-shadow:var(--focus-ring); }
.cbck-ask-send{
  flex:none; height:48px; padding:0 18px; cursor:pointer;
  font-size:15px; font-weight:700; color:var(--action-fg); background:var(--action-bg);
  border:none; border-radius:var(--radius-pill);
}
.cbck-ask-send:disabled{ opacity:.5; cursor:default; }

/* Live question (mirrors the instructor's screen) */
.cbck-q-text{ font-size:19px; font-weight:700; line-height:1.35; color:var(--text-strong); margin:2px 0 16px; }
.cbck-q-opts{ display:flex; flex-direction:column; gap:10px; }
.cbck-q-opt{
  display:flex; align-items:center; gap:12px; width:100%; min-height:56px; padding:10px 14px; cursor:pointer; text-align:left;
  font-size:16px; font-weight:600; color:var(--text-body);
  background:var(--surface-card); border:2px solid var(--border-default); border-radius:var(--radius-lg);
  transition:border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out);
}
.cbck-q-opt:active{ transform:scale(.99); }
.cbck-q-opt:disabled{ cursor:default; }
.cbck-q-letter{
  flex:none; width:30px; height:30px; border-radius:8px; display:flex; align-items:center; justify-content:center;
  font-weight:800; font-size:14px; color:var(--text-muted); background:var(--surface-subtle); border:1.5px solid var(--border-default);
}
.cbck-q-opt-text{ flex:1; min-width:0; }
.cbck-q-opt.is-mine{ border-color:var(--brand-accent); background:color-mix(in srgb, var(--brand-accent) 8%, transparent); }
.cbck-q-opt.is-mine .cbck-q-letter{ background:var(--brand-accent); color:#fff; border-color:var(--brand-accent); }
.cbck-q-opt.is-correct{ border-color:var(--green-600, #3C7A26); background:color-mix(in srgb, var(--green-600, #3C7A26) 12%, transparent); }
.cbck-q-opt.is-correct .cbck-q-letter{ background:var(--green-600, #3C7A26); color:#fff; border-color:var(--green-600, #3C7A26); }
.cbck-q-check{ margin-left:auto; color:var(--green-600, #3C7A26); font-weight:800; }
.cbck-broadcast-list{ list-style:none; margin:6px 0 0; padding:0; display:flex; flex-direction:column; gap:8px; text-align:left; }
.cbck-broadcast-list li{
  padding:11px 14px; font-size:15px; font-weight:600; color:var(--text-body);
  background:var(--surface-subtle); border:1.5px solid var(--border-default); border-left:5px solid var(--amber-500, #E8920C); border-radius:var(--radius-lg);
}

/* Live Decision Theater badge on the phone */
.cbck-theater-badge{
  display:inline-block; margin:0 0 12px; padding:6px 14px; border-radius:999px;
  font-size:12.5px; font-weight:700; letter-spacing:.02em;
  background:color-mix(in srgb, var(--brand-accent) 12%, transparent); color:var(--brand-accent);
}
.cbck-theater-badge.is-locked{ background:var(--status-danger-bg); color:var(--status-danger); }

/* Build Mode prompt (copy-ready) */
.cbck-prompt-box{
  margin-top:2px; background:#0f1720; border:1px solid #26313f; border-radius:var(--radius-lg);
  padding:14px; text-align:left; overflow-x:auto;
}
.cbck-prompt-box pre{ margin:0; font-family:ui-monospace,"Cascadia Mono",Consolas,monospace; font-size:13.5px; line-height:1.5; color:#e7eef6; white-space:pre-wrap; word-break:break-word; }
.cbck-copy-btn{ margin-top:12px; }
.cbck-prompt-meta{ margin:10px 0 0; text-align:left; font-size:13.5px; line-height:1.5; color:var(--text-body); }
.cbck-prompt-meta b{ color:var(--text-strong); }

.cbck-spin{
  width:34px; height:34px; margin:8px auto 16px; border-radius:50%;
  border:3px solid var(--border-subtle); border-top-color:var(--brand-accent);
  animation:cbck-spin .7s linear infinite;
}
@keyframes cbck-spin{ to{ transform:rotate(360deg); } }

.cbck-foot{
  margin:24px 0 0; padding-top:16px;
  border-top:1px solid var(--border-subtle);
  text-align:center; font-size:11.5px; letter-spacing:.01em; color:var(--text-subtle);
}

@media (prefers-reduced-motion: reduce){
  .cbck-btn{ transition:none; }
  .cbck-btn:hover{ transform:none; }
  .cbck-spin{ animation-duration:1.5s; }
}
`;

export default ClassCheckinPage;
