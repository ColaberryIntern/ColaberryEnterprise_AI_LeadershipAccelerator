import React from 'react';
import type { InterviewType, PrepSegment } from './careerPrepApi';
import type { SessionApi } from './useSession';
import { clock, secondsLeft } from './logic/sessionMachine';
import { FOLLOW_UPS, LEARN_TEXT, questionFor, WARM_UP_LINE } from './logic/sessionCopy';
import { TryRecorder } from './TryRecorder';

/**
 * Career Prep v27 (CP4.4): the Session tab (shots L3-4, L3-5). A ring timer with "m:ss left in this part",
 * Pause / Resume, the segment list (done ✓, current ▶, upcoming ·), and the stage: "Part i of n", the
 * segment's body, End session and Next (Finish on the last). Bodies: Warm up (a line to say), Learn (the
 * skill in plain words), Try and the Pressure round (record on camera, scored), the Full rehearsal (several
 * questions), Cool down. Cora reads Pressure round follow-ups aloud in the browser when speech is available.
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

function Body({ seg, index, s, type, questions }: { seg: PrepSegment; index: number; s: SessionApi; type: InterviewType; questions?: string[] }): React.ReactElement {
  if (seg.kind === 'warmup') return <p>{WARM_UP_LINE}</p>;
  if (seg.kind === 'learn') return <p>{(seg.targetSkill && LEARN_TEXT[seg.targetSkill]) || 'Pick one answer you will give and say it out loud twice, slower the second time.'}</p>;
  if (seg.kind === 'cooldown') return <p>Say the one sentence you want them to remember about you. Your scores from this session appear on Your progress.</p>;
  const prompt = seg.kind === 'pressure' ? `${questionFor(index, type, questions)} Then: ${FOLLOW_UPS[index % FOLLOW_UPS.length]}` : questionFor(index, type, questions);
  if (seg.kind === 'pressure' && typeof window !== 'undefined' && 'speechSynthesis' in window) {
    return (<><button type="button" className="cp-chip" onClick={() => window.speechSynthesis.speak(new SpeechSynthesisUtterance(prompt))}>Hear Cora ask</button>
      <TryRecorder sessionId={s.session!.id} segmentIndex={index} prompt={prompt} /></>);
  }
  return <TryRecorder sessionId={s.session!.id} segmentIndex={index} prompt={prompt} />;
}

export function SessionRunner({ s, type, questions, hasPlan }: { s: SessionApi; type: InterviewType; questions?: string[]; hasPlan: boolean }): React.ReactElement {
  if (!hasPlan) return <p className="cp-pending">Pick a plan with Cora first, then start today&apos;s session here.</p>;
  if (!s.session || s.state.status === 'idle') return <button type="button" className="cp-send" onClick={() => void s.start()} data-testid="cp-session-start">▶ Start today&apos;s session</button>;
  const segs = s.session.segments;
  if (s.state.status === 'finished' || s.state.status === 'ended') {
    return <p data-testid="cp-session-over">{s.state.status === 'finished' ? 'Session finished. Well done.' : 'Session ended. Your practice so far is saved.'}</p>;
  }
  const i = s.state.index;
  const seg = segs[i];
  const left = secondsLeft(s.state, s.now);
  return (
    <div className="cp-session" data-testid="cp-session">
      <div className="cp-session-side">
        <Ring left={left} total={seg.minutes * 60} />
        <p className="cp-muted">{clock(left)} left in this part</p>
        {s.state.status === 'running' ? <button type="button" className="cp-chip" onClick={s.pause}>Pause</button> : <button type="button" className="cp-chip" onClick={s.resume}>Resume</button>}
        <ol className="cp-seglist">{segs.map((x, j) => <li key={`${x.kind}${j}`} aria-current={j === i ? 'step' : undefined}>{s.state.done.includes(j) ? '✓' : j === i ? '▶' : '·'} {x.title} · {x.minutes} min</li>)}</ol>
      </div>
      <div className="cp-stage">
        <p className="cp-muted">Part {i + 1} of {segs.length} · {seg.minutes} minutes</p>
        <h4>{seg.title}</h4>
        <Body seg={seg} index={i} s={s} type={type} questions={questions} />
        <div className="cp-form-actions">
          <button type="button" className="cp-chip" onClick={s.end} data-testid="cp-session-end">End session</button>
          <button type="button" className="cp-send" onClick={s.next} data-testid="cp-session-next">{i === segs.length - 1 ? 'Finish ✓' : `Next: ${segs[i + 1].title} ›`}</button>
        </div>
        {s.error && <p role="alert" className="cp-form-problem">{s.error}</p>}
      </div>
    </div>
  );
}
