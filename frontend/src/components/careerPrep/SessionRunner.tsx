import React from 'react';
import type { InterviewType, PrepRecap, PrepSegment } from './careerPrepApi';
import type { SessionApi } from './useSession';
import { clock, secondsLeft } from './logic/sessionMachine';
import { FOLLOW_UPS, LEARN_TEXT, questionFor, WARM_UP_LINE } from './logic/sessionCopy';
import { TryRecorder } from './TryRecorder';
import { stillScoring } from './logic/recapCopy';

/**
 * Career Prep v27 (CP4.4, CP4.5): the Session tab (shots L3-4, L3-5, L3-6). A ring timer with "m:ss left in
 * this part", Pause / Resume, the part list (done ✓, current ▶, upcoming ·), and the stage: "Part i of n",
 * the part's body, End session and Next (Finish on the last). Bodies: Warm up (a line to say), Learn (the
 * skill in plain words), Try (one question, recorded and scored), Pressure round (the question plus a
 * follow-up, which the browser can read aloud), Full rehearsal (three questions answered in one recording),
 * Cool down. Each part gets its own recorder, so a score never carries over to the next question. When the
 * session is over, the recap from the server: readiness and the skills this session moved, before and after.
 */
function Ring({ left, total }: { left: number; total: number }): React.ReactElement {
  const r = 44;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 100 100" className="cp-ring" role="img" aria-label={`${clock(left)} left in this part`}>
      <circle cx="50" cy="50" r={r} className="cp-ring-bg" fill="none" />
      <circle cx="50" cy="50" r={r} className="cp-ring-fg" fill="none" strokeDasharray={c} strokeDashoffset={c * (1 - (total ? left / total : 0))} />
      <text x="50" y="55" textAnchor="middle" className="cp-ring-t">{clock(left)}</text>
    </svg>
  );
}

const speech = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

function promptFor(seg: PrepSegment, index: number, type: InterviewType, questions?: string[]): string {
  if (seg.kind === 'pressure') return `${questionFor(index, type, questions)} Then: ${FOLLOW_UPS[index % FOLLOW_UPS.length]}`;
  if (seg.kind === 'rehearsal') return [0, 1, 2].map((k) => `(${k + 1}) ${questionFor(index + k, type, questions)}`).join(' ');
  return questionFor(index, type, questions);
}

function Body({ seg, index, sessionId, type, questions }: { seg: PrepSegment; index: number; sessionId: string; type: InterviewType; questions?: string[] }): React.ReactElement {
  if (seg.kind === 'warmup') return <p data-testid="cp-body-warmup">{WARM_UP_LINE}</p>;
  if (seg.kind === 'learn') return <p data-testid="cp-body-learn">{(seg.targetSkill && LEARN_TEXT[seg.targetSkill]) || 'Pick one answer you will give and say it out loud twice, slower the second time.'}</p>;
  if (seg.kind === 'cooldown') return <p data-testid="cp-body-cooldown">Say the one sentence you want them to remember about you. Your scores from this session appear on Your progress.</p>;
  const prompt = promptFor(seg, index, type, questions);
  return (
    <>
      {seg.kind === 'pressure' && speech() && <button type="button" className="cp-chip" data-testid="cp-hear" onClick={() => window.speechSynthesis.speak(new SpeechSynthesisUtterance(prompt))}>Hear Cora ask</button>}
      <TryRecorder key={`${sessionId}:${index}`} sessionId={sessionId} segmentIndex={index} prompt={prompt} />
    </>
  );
}

export function RecapView({ r, onDashboard, onPlan }: { r: PrepRecap; onDashboard: () => void; onPlan: () => void }): React.ReactElement {
  return (
    <div className="cp-recap" data-testid="cp-recap">
      <span className="cp-recap-badge">{r.status === 'finished' ? 'Session done' : 'Session ended'}</span>
      <h3>Nice work{r.firstName ? `, ${r.firstName}` : ''}.</h3>
      <div className="cp-recap-stats">
        {r.readiness && <p>Readiness <b>{r.readiness.after}</b>{r.readiness.before !== undefined && <small> from {r.readiness.before}</small>}</p>}
        <p>Streak <b>{r.streak}</b> <small>{r.streak === 1 ? 'day' : 'days'}</small></p>
        <p>Practice <b>{r.minutes}</b> <small>min</small></p>
      </div>
      <section className="cp-dash-card" aria-labelledby="cp-recap-h">
        <h4 id="cp-recap-h">What changed today</h4>
        {r.pending > 0 && <p className="cp-muted" data-testid="cp-recap-pending">{stillScoring(r.pending)}</p>}
        {r.skills.length === 0 ? (r.pending > 0 ? null : <p className="cp-muted">No answer was scored this time, so your numbers did not change.</p>) : (
          <ul className="cp-list">{r.skills.map((s) => (
            <li key={s.key}><span className="cp-skill-name">{s.label}</span>
              <span className="cp-bar" aria-hidden="true"><span className="cp-bar-fill" style={{ width: `${s.after}%` }} /></span>
              <span>{s.before !== undefined ? `${s.before} → ` : 'first score: '}<b>{s.after}</b></span></li>
          ))}</ul>
        )}
      </section>
      <div className="cp-form-actions">
        <button type="button" className="cp-send" onClick={onDashboard} data-testid="cp-recap-dashboard">See my dashboard</button>
        <button type="button" className="cp-chip" onClick={onPlan}>Back to my plan</button>
      </div>
    </div>
  );
}

function Over({ s, onTab }: { s: SessionApi; onTab: (t: 'progress' | 'plan') => void }): React.ReactElement {
  if (s.recap) return <RecapView r={s.recap} onDashboard={() => onTab('progress')} onPlan={() => onTab('plan')} />;
  return <p data-testid="cp-session-over">{s.state.status === 'finished' ? 'Session finished. Well done.' : 'Session ended. Your practice so far is saved.'}</p>;
}

export function SessionRunner({ s, type, questions, hasPlan, onTab = () => undefined }: { s: SessionApi; type: InterviewType; questions?: string[]; hasPlan: boolean; onTab?: (t: 'progress' | 'plan') => void }): React.ReactElement {
  if (!hasPlan) return <p className="cp-pending">Pick a plan with Cora first, then start today&apos;s session here.</p>;
  if (!s.session || s.state.status === 'idle') return <button type="button" className="cp-send" onClick={() => void s.start()} data-testid="cp-session-start">Start today&apos;s session</button>;
  if (s.state.status === 'finished' || s.state.status === 'ended') return <Over s={s} onTab={onTab} />;
  const segs = s.session.segments;
  const i = s.state.index;
  const seg = segs[i];
  const left = secondsLeft(s.state, s.now);
  return (
    <div className="cp-session" data-testid="cp-session">
      <div className="cp-session-side">
        <Ring left={left} total={seg.minutes * 60} />
        <p className="cp-muted">{clock(left)} left in this part</p>
        {s.state.status === 'running' ? <button type="button" className="cp-chip" onClick={s.pause}>Pause</button> : <button type="button" className="cp-chip" onClick={s.resume}>Resume</button>}
        <ol className="cp-seglist">{segs.map((x, j) => <li key={`${x.kind}${j}`} aria-current={j === i ? 'step' : undefined}><span className={`cp-segmark${s.state.done.includes(j) ? ' is-done' : j === i ? ' is-now' : ''}`} aria-hidden="true" />{s.state.done.includes(j) ? <span className="visually-hidden">Done: </span> : null}{x.title} · {x.minutes} min</li>)}</ol>
      </div>
      <div className="cp-stage">
        <p className="cp-muted">Part {i + 1} of {segs.length} · {seg.minutes} minutes</p>
        <h4>{seg.title}</h4>
        <Body seg={seg} index={i} sessionId={s.session.id} type={type} questions={questions} />
        <div className="cp-form-actions">
          <button type="button" className="cp-chip" onClick={s.end} data-testid="cp-session-end">End session</button>
          <button type="button" className="cp-send" onClick={s.next} data-testid="cp-session-next">{i === segs.length - 1 ? 'Finish ✓' : `Next: ${segs[i + 1].title} ›`}</button>
        </div>
        {s.error && <p role="alert" className="cp-form-problem">{s.error}</p>}
      </div>
    </div>
  );
}
