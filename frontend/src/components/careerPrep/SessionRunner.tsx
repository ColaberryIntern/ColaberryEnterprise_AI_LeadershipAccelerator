import React from 'react';
import type { InterviewType, PrepRecap, PrepSegment } from './careerPrepApi';
import type { SessionApi } from './useSession';
import { clock, secondsLeft } from './logic/sessionMachine';
import { FOLLOW_UPS, LEARN_TEXT, questionFor, WARM_UP_LINE } from './logic/sessionCopy';
import { TryRecorder } from './TryRecorder';
import { stillScoring } from './logic/recapCopy';

/**
 * Career Prep v27 (CP4.4, CP4.5): the Session tab (shots L3-4, L3-5, L3-6). A ring timer with "m:ss left in
 * this part", Pause / Resume, the part list (done, current, upcoming; markers drawn by CSS), and the stage: "Part i of n",
 * the part's body, End session and Next (Finish on the last). Bodies: Warm up (a line to say), Learn (the
 * skill in plain words), Try (one question, recorded and scored), Pressure round (the question plus a
 * follow-up, which the browser can read aloud), Full rehearsal (three questions answered in one recording),
 * Cool down. Each part gets its own recorder, so a score never carries over to the next question. When the
 * session is over, the recap from the server: readiness and the skills this session moved, before and after.
 */
/** The ring fills as the SESSION goes (shot L3-5: part 4 of 6 shows most of the ring done); the clock is this part's. */
function Ring({ left, done, total }: { left: number; done: number; total: number }): React.ReactElement {
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <div className="cp-ringwrap">
      <svg viewBox="0 0 100 100" className="cp-ring" role="img" aria-label={`${clock(left)} left in this part`}>
        <circle cx="50" cy="50" r={r} className="cp-ring-bg" fill="none" />
        {done > 0 && <circle cx="50" cy="50" r={r} className="cp-ring-fg" fill="none" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, total ? done / total : 0))} />}
      </svg>
      <span className="cp-ring-label" aria-hidden="true"><b>{clock(left)}</b><small>left in this part</small></span>
    </div>
  );
}

const speech = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

function promptFor(seg: PrepSegment, index: number, type: InterviewType, questions?: string[]): string {
  if (seg.kind === 'pressure') return `${questionFor(index, type, questions)} Then: ${FOLLOW_UPS[index % FOLLOW_UPS.length]}`;
  if (seg.kind === 'rehearsal') return [0, 1, 2].map((k) => `(${k + 1}) ${questionFor(index + k, type, questions)}`).join(' ');
  return questionFor(index, type, questions);
}

function Body({ seg, index, sessionId, type, questions, initials }: { seg: PrepSegment; index: number; sessionId: string; type: InterviewType; questions?: string[]; initials?: string }): React.ReactElement {
  if (seg.kind === 'warmup') return <div className="cp-callout"><b>Out loud, no camera.</b><p data-testid="cp-body-warmup">{WARM_UP_LINE}</p></div>;
  if (seg.kind === 'learn') return <div className="cp-callout"><b>In plain words</b><p data-testid="cp-body-learn">{(seg.targetSkill && LEARN_TEXT[seg.targetSkill]) || 'Pick one answer you will give and say it out loud twice, slower the second time.'}</p></div>;
  if (seg.kind === 'cooldown') return <div className="cp-callout"><b>The one sentence</b><p data-testid="cp-body-cooldown">Say the one sentence you want them to remember about you. Your scores from this session appear on Your progress.</p></div>;
  const prompt = promptFor(seg, index, type, questions);
  return (
    <>
      {seg.kind === 'pressure' && speech() && <p><button type="button" className="cp-chip" data-testid="cp-hear" onClick={() => window.speechSynthesis.speak(new SpeechSynthesisUtterance(prompt))}><i className="ri-volume-up-line" aria-hidden="true" />Hear Cora ask</button></p>}
      <TryRecorder key={`${sessionId}:${index}`} sessionId={sessionId} segmentIndex={index} prompt={prompt} initials={initials} />
    </>
  );
}

function Delta({ before, after }: { before?: number; after: number }): React.ReactElement | null {
  if (before === undefined) return <span className="cp-muted cp-small"> first score</span>;
  const d = Math.round((after - before) * 10) / 10;
  if (d === 0) return <span className="cp-muted cp-small"> no change from {before}</span>;
  return (
    <span className={`cp-delta ${d > 0 ? 'up' : 'down'}`}> <i className={d > 0 ? 'ri-arrow-up-s-fill' : 'ri-arrow-down-s-fill'} aria-hidden="true" />{Math.abs(d)}
      <span className="visually-hidden"> {d > 0 ? 'up' : 'down'} from {before}</span></span>
  );
}

/** What changed today (shot L3-6): each moved skill before and after; skills still short of a first score, how far along. */
function Changed({ r }: { r: PrepRecap }): React.ReactElement {
  const building = r.building ?? [];
  return (
    <section className="cp-dash-card" aria-labelledby="cp-recap-h">
      <h4 id="cp-recap-h">What changed today</h4>
      <p className="cp-subline">Before and after, from this session</p>
      {r.pending > 0 && <p className="cp-muted" data-testid="cp-recap-pending">{stillScoring(r.pending)}</p>}
      {r.skills.map((s) => (
        <div className="cp-ba" key={s.key}><span>{s.label}</span>
          <span className="cp-bar" aria-hidden="true"><span className="cp-bar-fill" style={{ width: `${s.after}%` }} /></span>
          <span className="cp-ba-v">{s.before !== undefined ? `${s.before} → ` : 'first score: '}<b>{s.after}</b></span></div>
      ))}
      {building.map((b) => (
        <div className="cp-ba" key={b.key} data-testid={`cp-recap-building-${b.key}`}><span>{b.label}</span>
          <span className="cp-bar is-empty" aria-hidden="true"><span className="cp-bar-fill is-building" style={{ width: `${Math.min(100, (b.count / b.needed) * 100)}%` }} /></span>
          <span className="cp-ba-v is-building">{b.count} of {b.needed} practice results to a first score</span></div>
      ))}
      {r.skills.length === 0 && building.length === 0 && r.pending === 0 && <p className="cp-muted">No answer was scored this time, so your numbers did not change.</p>}
    </section>
  );
}

export function RecapView({ r, onDashboard, onPlan }: { r: PrepRecap; onDashboard: () => void; onPlan: () => void }): React.ReactElement {
  return (
    <div className="cp-recap" data-testid="cp-recap">
      <span className="cp-pill ok cp-recap-badge">{r.status === 'finished' ? 'Session done' : 'Session ended'}</span>
      <h3>Nice work{r.firstName ? `, ${r.firstName}` : ''}.</h3>
      <div className="cp-recap-stats">
        {r.readiness && <div data-testid="cp-recap-readiness"><span className="k">Readiness</span><span className="cp-recap-big">{r.readiness.after}</span>{r.readiness.before !== undefined && <Delta before={r.readiness.before} after={r.readiness.after} />}</div>}
        <div><span className="k">Answers scored</span><span className="cp-recap-big">{r.attempts}</span></div>
        <div><span className="k">Streak</span><span className="cp-recap-big">{r.streak}</span> <span className="cp-muted">{r.streak === 1 ? 'day' : 'days'}</span></div>
        <div><span className="k">Practice</span><span className="cp-recap-big">{r.minutes}</span> <span className="cp-muted">min</span></div>
      </div>
      <Changed r={r} />
      <div className="cp-form-actions">
        <button type="button" className="cp-send" onClick={onDashboard} data-testid="cp-recap-dashboard">See my dashboard</button>
        <button type="button" className="cp-ghost" onClick={onPlan}>Back to my plan</button>
      </div>
    </div>
  );
}

function Over({ s, onTab }: { s: SessionApi; onTab: (t: 'progress' | 'plan') => void }): React.ReactElement {
  if (s.recap) return <RecapView r={s.recap} onDashboard={() => onTab('progress')} onPlan={() => onTab('plan')} />;
  return <p data-testid="cp-session-over">{s.state.status === 'finished' ? 'Session finished. Well done.' : 'Session ended. Your practice so far is saved.'}</p>;
}

export function SessionRunner({ s, type, questions, hasPlan, onTab = () => undefined, initials }: { s: SessionApi; type: InterviewType; questions?: string[]; hasPlan: boolean; onTab?: (t: 'progress' | 'plan') => void; initials?: string }): React.ReactElement {
  if (!hasPlan) return <p className="cp-pending">Pick a plan with Cora first, then start today&apos;s session here.</p>;
  if (!s.session || s.state.status === 'idle') return <button type="button" className="cp-send" onClick={() => void s.start()} data-testid="cp-session-start">Start today&apos;s session</button>;
  if (s.state.status === 'finished' || s.state.status === 'ended') return <Over s={s} onTab={onTab} />;
  const segs = s.session.segments;
  const i = s.state.index;
  const seg = segs[i];
  const left = secondsLeft(s.state, s.now);
  const total = segs.reduce((a, x) => a + x.minutes * 60, 0);
  const before = segs.slice(0, i).reduce((a, x) => a + x.minutes * 60, 0);
  return (
    <div className="cp-session" data-testid="cp-session">
      <div className="cp-session-side">
        <Ring left={left} done={before + Math.max(0, seg.minutes * 60 - left)} total={total} />
        {s.state.status === 'running'
          ? <button type="button" className="cp-ghost sm cp-pause" onClick={s.pause}><i className="ri-pause-fill" aria-hidden="true" />Pause</button>
          : <button type="button" className="cp-ghost sm cp-pause" onClick={s.resume}><i className="ri-play-fill" aria-hidden="true" />Resume</button>}
        <ol className="cp-seglist">{segs.map((x, j) => {
          const done = s.state.done.includes(j);
          return (
            <li key={`${x.kind}${j}`} className={done ? 'is-done' : undefined} aria-current={j === i ? 'step' : undefined}>
              <span className={`cp-segmark${done ? ' is-done' : j === i ? ' is-now' : ''}`} aria-hidden="true" />{done ? <span className="visually-hidden">Done: </span> : null}
              <span>{x.title}</span><span className="cp-segmin"><span aria-hidden="true">{x.minutes}m</span><span className="visually-hidden">, {x.minutes} min</span></span>
            </li>
          );
        })}</ol>
      </div>
      <section className="cp-stage" aria-label={`Part ${i + 1}`}>
        <p className="cp-lab">Part {i + 1} of {segs.length} · {seg.minutes} {seg.minutes === 1 ? 'minute' : 'minutes'}</p>
        <h4>{seg.title}</h4>
        <Body seg={seg} index={i} sessionId={s.session.id} type={type} questions={questions} initials={initials} />
        <div className="cp-navrow">
          <button type="button" className="cp-ghost" onClick={s.end} data-testid="cp-session-end">End session</button>
          <button type="button" className="cp-send" onClick={s.next} data-testid="cp-session-next">{i === segs.length - 1 ? 'Finish' : `Next: ${segs[i + 1].title} ›`}</button>
        </div>
        {s.error && <p role="alert" className="cp-form-problem">{s.error}</p>}
      </section>
    </div>
  );
}
