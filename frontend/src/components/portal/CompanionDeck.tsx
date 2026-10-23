import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  getCompanionState, setSessionPulse, submitPollResponse,
  type CompanionState, type PulseState,
} from '../../services/onboardingApi';

/**
 * The phone deck for a live class (L4.7) — what a viewer can do with one thumb.
 *
 * WHAT IS REUSED AND WHAT IS NOT. The video is the portal's persistent mini-player, mounted
 * beside <Outlet/> in the layout route; nothing here renders a second one. The server contract
 * is the existing companion API — `getCompanionState`, `setSessionPulse`, `submitPollResponse`
 * — which has been live behind the class check-in QR for months. What is new is the surface.
 *
 * WHY THIS IS NOT EXTRACTED FROM ClassCheckinPage, which has a similar controller. That file is
 * 615 lines with NO TEST COVERAGE AT ALL, and it is the landing every student reaches by
 * scanning the room QR. Pulling 130 lines of coupled state out of it blind, to save duplicating
 * presentational markup, risks breaking the one surface a class cannot start without. The
 * server contract — the part that actually matters — is shared already. If a THIRD companion
 * surface appears, that is the moment to extract, and by then this one will have tests to
 * extract against.
 *
 * IT ALSO DIFFERS ON PURPOSE. The check-in controller offers three states; this offers four.
 * "Following" (`here` on the wire) is the one a viewer who is just watching can press, and
 * without it the only honest options are all claims about building something.
 *
 * ONE THUMB MEANS ONE TAP. Every control is a full-width or half-width target, nothing is
 * nested behind a menu, and no action needs a confirm — the destructive ones are not here.
 * Pulse is optimistic: the button moves the instant it is pressed and the request follows,
 * because a status tap that waits on a round trip feels broken on a train.
 */

export interface CompanionDeckProps {
  sessionId: string;
  /** Injected in tests. Production uses the real companion endpoints. */
  loadState?: (sessionId: string) => Promise<CompanionState>;
  sendPulse?: (sessionId: string, state: PulseState) => Promise<void>;
  sendPoll?: (sessionId: string, pollKey: string, choice: number) => Promise<void>;
}

/** Matches the check-in controller's cadence; the instructor's deck moves on the same beat. */
const POLL_MS = 2500;

/**
 * The four states, in the order a class moves through them.
 *
 * `here` is the wire value for "Following". The label differs because "here" answers a
 * register and "Following" answers what the instructor actually wants to know.
 */
const PULSES: ReadonlyArray<{ state: PulseState; label: string; emoji: string }> = [
  { state: 'here', label: 'Following', emoji: '👀' },
  { state: 'building', label: 'Building', emoji: '🛠️' },
  { state: 'stuck', label: 'Stuck', emoji: '✋' },
  { state: 'finished', label: 'Finished', emoji: '✅' },
];

const KIND_LABEL: Record<'prediction' | 'poll' | 'trivia', string> = {
  prediction: '🔮 Make your prediction',
  poll: '📊 Live poll',
  trivia: '🧠 Trivia',
};

export default function CompanionDeck({
  sessionId, loadState, sendPulse, sendPoll,
}: CompanionDeckProps): React.ReactElement {
  const [state, setState] = useState<CompanionState | null>(null);
  const [pulse, setPulse] = useState<PulseState | null>(null);
  const [choice, setChoice] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  /** Set once the viewer has touched something, so a poll refresh cannot undo their tap. */
  const touched = useRef(false);

  const load = loadState ?? getCompanionState;
  const pushPulse = sendPulse ?? setSessionPulse;
  const pushPoll = sendPoll ?? submitPollResponse;

  useEffect(() => {
    if (!sessionId) return undefined;
    let alive = true;

    const tick = () => {
      load(sessionId)
        .then((next) => {
          if (!alive) return;
          setState(next);
          // The server is the authority on both, but only before the viewer has acted this
          // session: a tap must not be visibly undone 2.5 seconds later by a slower write.
          if (!touched.current) {
            setPulse(next.my_pulse);
            setChoice(next.question ? next.question.my_choice : null);
          }
        })
        // A failed refresh keeps the last known deck on screen. Blanking it would look like
        // the class ended.
        .catch(() => undefined);
    };

    tick();
    const timer = window.setInterval(tick, POLL_MS);
    return () => { alive = false; window.clearInterval(timer); };
  }, [sessionId, load]);

  const tapPulse = useCallback((next: PulseState) => {
    touched.current = true;
    setPulse(next);
    pushPulse(sessionId, next).catch(() => undefined);
  }, [sessionId, pushPulse]);

  const question = state ? state.question : null;
  // Locked or revealed means the instructor has moved on; a tap now would be a lie about
  // when the viewer answered.
  const votingOpen = !!question && (!question.theater || question.theater.state === 'voting');

  const tapChoice = useCallback((index: number) => {
    if (!question || !votingOpen || choice !== null) return;
    touched.current = true;
    setChoice(index);
    pushPoll(sessionId, question.key, index).catch(() => undefined);
  }, [question, votingOpen, choice, sessionId, pushPoll]);

  const copyPrompt = useCallback((text: string) => {
    const done = () => { setCopied(true); window.setTimeout(() => setCopied(false), 1600); };
    // Clipboard is unavailable on an insecure origin and in some in-app browsers, which is
    // most of a phone audience. Failing silently would leave the button looking broken.
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, () => undefined);
  }, []);

  const prompt = state ? state.prompt : null;

  return (
    <section className="cdeck" data-testid="companion-deck">
      <style>{CDECK_CSS}</style>

      {question && (
        <div className="cdeck-card" data-testid="companion-poll">
          <p className="cdeck-label">{KIND_LABEL[question.kind]}</p>
          <p className="cdeck-q">{question.q}</p>
          <div className="cdeck-opts">
            {question.options.map((opt, index) => {
              const mine = choice === index;
              const correct = question.revealed && question.answer === index;
              return (
                <button
                  key={opt}
                  type="button"
                  className={`cdeck-opt${mine ? ' is-mine' : ''}${correct ? ' is-correct' : ''}`}
                  onClick={() => tapChoice(index)}
                  disabled={!votingOpen || choice !== null}
                  aria-pressed={mine}
                  data-testid={`companion-opt-${index}`}
                >
                  <span className="cdeck-letter" aria-hidden="true">{String.fromCharCode(65 + index)}</span>
                  <span className="cdeck-opt-text">{opt}</span>
                  {correct && <span className="cdeck-tick" aria-hidden="true">✓</span>}
                </button>
              );
            })}
          </div>
          {!votingOpen && choice === null && (
            <p className="cdeck-note" data-testid="companion-poll-closed">
              Voting is closed for this one.
            </p>
          )}
        </div>
      )}

      {prompt && (
        <div className="cdeck-card" data-testid="companion-prompt">
          <p className="cdeck-label">⌨️ {prompt.label}</p>
          <pre className="cdeck-prompt">{prompt.prompt}</pre>
          <button type="button" className="cdeck-copy" onClick={() => copyPrompt(prompt.prompt)}>
            {copied ? 'Copied' : 'Copy prompt'}
          </button>
          {prompt.expectedResult && (
            <p className="cdeck-note"><b>👀 You should see:</b> {prompt.expectedResult}</p>
          )}
          {prompt.stopCondition && (
            <p className="cdeck-note"><b>🛑 Stop when:</b> {prompt.stopCondition}</p>
          )}
        </div>
      )}

      <div className="cdeck-card">
        <p className="cdeck-label">Tap your status any time</p>
        <div className="cdeck-pulses">
          {PULSES.map(({ state: s, label, emoji }) => (
            <button
              key={s}
              type="button"
              className={`cdeck-pulse${pulse === s ? ' is-active' : ''}`}
              onClick={() => tapPulse(s)}
              aria-pressed={pulse === s}
              data-testid={`companion-pulse-${s}`}
            >
              <span className="cdeck-pulse-emoji" aria-hidden="true">{emoji}</span>
              {label}
            </button>
          ))}
        </div>
        <p className="cdeck-note">
          Your instructor sees the room&rsquo;s status, not who pressed what.
        </p>
      </div>
    </section>
  );
}

const CDECK_CSS = `
.cdeck{ display:flex; flex-direction:column; gap:12px; width:100%; }

.cdeck-card{
  background:var(--surface-card);
  border:1px solid var(--border-subtle);
  border-radius:var(--radius-lg);
  padding:14px 14px 12px;
  text-align:left;
}
.cdeck-label{
  font-size:12px; font-weight:700; letter-spacing:.04em; text-transform:uppercase;
  color:var(--text-subtle); margin:0 0 8px;
}
.cdeck-q{ font-size:16px; font-weight:600; line-height:1.35; color:var(--text-strong); margin:0 0 12px; }
.cdeck-note{ font-size:12.5px; line-height:1.5; color:var(--text-muted); margin:10px 0 0; }

.cdeck-opts{ display:flex; flex-direction:column; gap:8px; }
.cdeck-opt{
  display:flex; align-items:center; gap:10px;
  width:100%; min-height:56px; padding:10px 12px;
  font-family:var(--font-body); font-size:15px; text-align:left;
  color:var(--text-body); background:var(--surface-subtle);
  border:1px solid var(--border-subtle); border-radius:var(--radius-md);
  cursor:pointer;
}
.cdeck-opt:disabled{ cursor:default; }
.cdeck-opt.is-mine{ border-color:var(--brand-accent); background:var(--surface-card); font-weight:600; }
.cdeck-opt.is-correct{ border-color:var(--status-success); color:var(--status-success); font-weight:600; }
.cdeck-opt:focus-visible{ outline:none; box-shadow:var(--focus-ring); }
.cdeck-letter{
  flex:none; width:26px; height:26px; display:inline-flex; align-items:center; justify-content:center;
  font-size:12.5px; font-weight:700; color:var(--text-subtle);
  background:var(--surface-card); border:1px solid var(--border-subtle);
  border-radius:var(--radius-circle);
}
.cdeck-opt-text{ flex:1; }
.cdeck-tick{ flex:none; font-weight:700; }

.cdeck-prompt{
  font-family:Consolas, "SF Mono", monospace; font-size:12.5px; line-height:1.5;
  white-space:pre-wrap; word-break:break-word; margin:0;
  padding:10px; color:var(--text-body);
  background:var(--surface-subtle); border:1px solid var(--border-subtle);
  border-radius:var(--radius-md);
}
.cdeck-copy{
  width:100%; min-height:48px; margin-top:10px;
  font-family:var(--font-body); font-size:15px; font-weight:600;
  color:var(--action-fg); background:var(--action-bg);
  border:none; border-radius:var(--radius-pill); cursor:pointer;
}
.cdeck-copy:focus-visible{ outline:none; box-shadow:var(--focus-ring); }

/* Two across on a phone: four full-width rows would push the video off the screen, and the
   whole point of the deck is that it sits under a sticky player. */
.cdeck-pulses{ display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.cdeck-pulse{
  display:flex; align-items:center; justify-content:center; gap:7px;
  min-height:56px; padding:8px 10px;
  font-family:var(--font-body); font-size:14.5px; font-weight:600;
  color:var(--text-body); background:var(--surface-subtle);
  border:1px solid var(--border-subtle); border-radius:var(--radius-md);
  cursor:pointer;
}
.cdeck-pulse.is-active{
  color:var(--action-fg); background:var(--action-bg); border-color:transparent;
}
.cdeck-pulse:focus-visible{ outline:none; box-shadow:var(--focus-ring); }
.cdeck-pulse-emoji{ font-size:17px; line-height:1; }
`;
