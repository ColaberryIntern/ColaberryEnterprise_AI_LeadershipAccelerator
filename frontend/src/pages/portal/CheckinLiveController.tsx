import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { CompanionState, PulseState } from '../../services/onboardingApi';
import { LinkState, linkStateAfterFailure } from './classroomLinkState';
import { LIVE_PULSES } from '../../components/portal/livePulse';
import { FollowCard, GetClaudeHelp, PopOutButton, claudePromptUrl, CBFA_CSS } from './CheckinFollowAlong';
import CheckinRunHere, { CBRUN_CSS, CBRUN_LAST_CSS, LastResult, type RunFn, type RunTurn, type SavedRun } from './CheckinRunHere';

/**
 * The checked-in view of the class check-in page: the phone that mirrors the instructor's deck
 * (status grid, live question, Build Mode prompt, Builder Broadcast) plus ask-a-question.
 *
 * Lifted out of `ClassCheckinPage` when the page gained a second way in (2026-11-19): a visitor
 * who is not a signed-in member of the class checks in with name + email and gets the SAME
 * live loop on a guest pass. The view does not know which it is — the page hands it a
 * `LiveClient` (the signed-in companion endpoints, or the guest-pass ones) — so the two can
 * never drift into two different classrooms.
 */
export interface LiveClient {
  getState: () => Promise<CompanionState>;
  pulse: (state: PulseState) => Promise<void>;
  ask: (text: string) => Promise<void>;
  vote: (pollKey: string, choice: number) => Promise<void>;
  /** Runs the slide's prompt on this page (guest pass only). Absent: Copy / Open in Claude only. */
  run?: RunFn;
}

/** A phone-sized screen, where Open in Claude would take the attendee off the class page. */
function isNarrow(): boolean {
  return typeof window !== 'undefined' && window.innerWidth < 900;
}

interface Props {
  title: string;
  meta: string;
  eyebrow: string;
  client: LiveClient;
  /** What "you have been signed out" offers: sign in again, or re-enter name + email. */
  signedOut: { body: string; action: string; onAction: () => void };
  /** The session's Commons room — signed-in students only; a guest pass opens nothing there. */
  onEnter?: () => void;
  /** localStorage key for this class's Run it here conversations (shared with the side window). */
  historyKey?: string;
}

type RunHistory = Record<string, SavedRun>;

function loadHistory(key?: string): RunHistory {
  if (!key) return {};
  try {
    const v = JSON.parse(localStorage.getItem(key) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch { return {}; }
}

/**
 * The kind label for the live question card. Plain words: the house-style lint
 * (frontendTypographyLint) holds new files to no emoji and no em dashes in product copy,
 * and this file is new — the copy it inherited from ClassCheckinPage was cleaned on the move.
 */
function kindLabel(kind: 'prediction' | 'poll' | 'trivia'): string {
  if (kind === 'trivia') return 'Trivia';
  if (kind === 'prediction') return 'Make your prediction';
  return 'Live poll';
}

interface PulseGridProps {
  pulse: PulseState | null;
  onTap: (s: PulseState) => void;
  style?: React.CSSProperties;
}

/**
 * The status grid, rendered identically wherever this view shows it.
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

const CheckinLiveController: React.FC<Props> = ({ title, meta, eyebrow, client, signedOut, onEnter, historyKey }) => {
  const [pulse, setPulse] = useState<PulseState | null>(null);

  // Run it here conversations, per prompt, kept for the whole class on this device so a vote
  // slide can show the result the attendee just made, and a prompt slide resumes where it was.
  const [runs, setRuns] = useState<RunHistory>(() => loadHistory(historyKey));
  const saveRun = useCallback((promptText: string, label: string, turns: RunTurn[]) => {
    setRuns((prev) => {
      const next = { ...prev };
      if (turns.length) next[promptText] = { label, turns, at: Date.now() };
      else delete next[promptText];
      if (historyKey) { try { localStorage.setItem(historyKey, JSON.stringify(next)); } catch { /* convenience only */ } }
      return next;
    });
  }, [historyKey]);
  const lastRun = Object.values(runs).filter((r) => r.turns.some((t) => t.role === 'assistant')).sort((a, b) => b.at - a.at)[0] || null;
  const [question, setQuestion] = useState('');
  const [qState, setQState] = useState<'idle' | 'sending' | 'sent'>('idle');

  const tapPulse = useCallback((state: PulseState) => {
    setPulse(state);
    client.pulse(state).catch(() => { /* best-effort; UI already reflects it */ });
  }, [client]);

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
    client.ask(text)
      .then(() => {
        askInFlight.current = false;
        setQuestion('');
        setQState('sent');
        setTimeout(() => setQState('idle'), 1800);
      })
      // The text stays in the box on failure, so a question is never silently eaten.
      .catch(() => { askInFlight.current = false; setQState('idle'); });
  }, [client, question]);

  // Mirror the instructor deck: poll the companion state so the phone switches to whatever is
  // on screen (status / a live question / broadcast / prompt).
  const [companion, setCompanion] = useState<CompanionState | null>(null);
  /**
   * Whether the phone is still hearing from the class.
   *
   * This poll used to swallow every error and keep rendering its last view forever, which
   * meant a student whose session had gone simply watched a status screen while the room
   * answered questions — no message, no retry. It looks identical to "the instructor is not on
   * a question slide", so it is invisible from both ends. Reported live in class on 2026-08-20.
   */
  const [link, setLink] = useState<LinkState>('live');
  const failures = useRef(0);
  useEffect(() => {
    let alive = true;
    const tick = () => client.getState()
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
    // Polling continues even while disconnected, so recovery is automatic and the student
    // does not have to know to reload.
    return () => { alive = false; window.clearInterval(id); };
  }, [client]);

  const answerPoll = useCallback((key: string, choice: number) => {
    setCompanion((c) => (c && c.question ? { ...c, question: { ...c.question, my_choice: choice } } : c));
    client.vote(key, choice).catch(() => { /* best-effort; a locked vote simply won't be counted server-side */ });
  }, [client]);

  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');
  const copyPrompt = useCallback((text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 1600);
    }).catch(() => { /* clipboard may be unavailable; the prompt is still readable on screen */ });
  }, []);

  return (
    <div className="cbck-state">
      <div className="cbck-icon cbck-icon-ok" aria-hidden="true">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
          <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <p className="cbck-eyebrow">{eyebrow}</p>
      <h1 className="cbck-title">{title}</h1>
      <p className="cbck-meta">{meta}</p>
      <style>{CBFA_CSS + CBRUN_CSS + CBRUN_LAST_CSS}</style>

      {/* FOLLOW ALONG: the deck's plain-words card for the slide on screen right now */}
      {companion?.follow && <FollowCard follow={companion.follow} />}
      <GetClaudeHelp openByDefault={!!companion?.follow?.install} />

      {/* ── CONNECTION — only ever shown when something is actually wrong ── */}
      {link !== 'live' && (
        <div className={`cbck-link-warn${link === 'signed_out' ? ' is-hard' : ''}`} role="status" aria-live="polite" data-testid="checkin-link-warn">
          {link === 'signed_out' ? (
            <>
              <p className="cbck-link-title">You have been signed out</p>
              <p className="cbck-link-body">{signedOut.body}</p>
              <button type="button" className="cbck-link-btn" onClick={signedOut.onAction}>{signedOut.action}</button>
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
              {companion.question.theater.state === 'locked' ? 'Voting locked' : companion.question.theater.state === 'revealed' ? 'Results are in' : 'Live vote: everyone is watching'}
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
                ? 'Vote locked. Waiting for the reveal'
                : companion.question.my_choice != null ? 'Locked in ✓. You can change it' : 'Tap your answer'}
          </p>
          {/* A vote is often about the result they just made: keep it one glance away. */}
          {lastRun && <LastResult run={lastRun} openByDefault />}
        </div>
      ) : companion?.phase === 'prompt' && companion.prompt ? (
        /* ── BUILD MODE PROMPT — copy-ready, no need to read it off the screen ── */
        <div className="cbck-controller">
          <p className="cbck-ctl-label">{companion.prompt.label}</p>
          <div className="cbck-prompt-box">
            <pre>{companion.prompt.prompt}</pre>
          </div>
          {/* Run on this page first: the answer appears right here, nobody leaves the class. */}
          {client.run && (
            <CheckinRunHere
              key={companion.prompt.prompt}
              prompt={companion.prompt.prompt}
              run={client.run}
              initial={runs[companion.prompt.prompt]?.turns}
              onChange={(t) => saveRun(companion.prompt!.prompt, companion.prompt!.label, t)}
            />
          )}
          <button type="button" className={`cbck-btn cbck-copy-btn${client.run ? ' cbck-btn-ghost' : ''}`} onClick={() => copyPrompt(companion.prompt!.prompt)}>
            {copyState === 'copied' ? 'Copied ✓' : `Copy · paste into ${companion.prompt.pasteWhere || 'Claude Code'}`}
          </button>
          {/* Opens Claude on the web with the prompt typed in. Not on a phone when Run it here exists:
              there it would take the attendee off the class page (Ali, 2026-11-23). */}
          {!(client.run && isNarrow()) && (
            <a
              className="cbfa-open"
              href={claudePromptUrl(companion.prompt.prompt)}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="open-in-claude"
            >
              Open in Claude
            </a>
          )}
          {companion.prompt.expectedResult && (
            <p className="cbck-prompt-meta"><b>You should see:</b> {companion.prompt.expectedResult}</p>
          )}
          {companion.prompt.stopCondition && (
            <p className="cbck-prompt-meta"><b>Stop when:</b> {companion.prompt.stopCondition}</p>
          )}
          <PulseGrid pulse={pulse} onTap={tapPulse} style={{ marginTop: 16 }} />
        </div>
      ) : companion?.phase === 'broadcast' ? (
        /* ── BUILDER BROADCAST — appears when the instructor reaches that segment ── */
        <div className="cbck-controller">
          <p className="cbck-ctl-label">Builder Broadcast: record 30 seconds</p>
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
          <p className="cbck-text cbck-text-sub">Your instructor sees this on screen, so no need to interrupt.</p>
          {lastRun && <LastResult run={lastRun} openByDefault={false} />}
        </div>
      )}

      <PopOutButton />

      {onEnter && (
        <button type="button" className="cbck-btn cbck-btn-ghost" onClick={onEnter} data-testid="checkin-enter">Open the live room</button>
      )}
    </div>
  );
};

export default CheckinLiveController;
