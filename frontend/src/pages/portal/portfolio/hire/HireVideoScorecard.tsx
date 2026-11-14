import React, { useState } from 'react';
import type { VideoCoaching } from '../../../../services/hireStudioApi';
import { LEVEL_TEXT, marks, scoreTone } from './hireCoachModel';
import { recClock } from './hireVideoModel';
import './HireVideoCoach.css';

/**
 * The coaching summary under the player. Delivery scores appear only where a published target
 * exists, and each names it; what you said is judged against the three prompts, with a quote from
 * your own words; voice is information, compared with your own voice, not a score. The moments
 * list is the keyboard and touch way to jump to each filler, hedge and long pause.
 */
interface Props { coaching: VideoCoaching; onSeek: (t: number) => void }

const MOMENTS_SHOWN = 10;

const HireVideoScorecard: React.FC<Props> = ({ coaching, onSeek }) => {
  const [allMoments, setAllMoments] = useState(false);
  const moments = marks(coaching);
  const shown = allMoments ? moments : moments.slice(0, MOMENTS_SHOWN);
  const content = coaching.content;
  const pv = coaching.voice?.pitchVariation ?? null;

  return (
    <div className="hs-coach hs-card2" data-testid="hs-coaching">
      <div className="hs-coach-h">Coaching <span className="cp-muted">· just for you, never on Hire</span></div>

      {content?.topTip && <p className="hs-toptip" data-testid="hs-toptip"><b>The one change to make:</b> {content.topTip}</p>}

      {coaching.scores && coaching.scores.length > 0 && (
        <ul className="hs-scores" aria-label="Delivery">
          {coaching.scores.map((s) => (
            <li key={s.key} className={`hs-score ${scoreTone(s.score)}`} data-testid={`hs-score-${s.key}`}>
              <span className="hs-score-n" aria-hidden="true">{s.score}</span>
              <span className="hs-score-b">
                <b>{s.label}</b>
                <span>{s.value} · target {s.target}</span>
                <span className="hs-score-src">{s.source}</span>
              </span>
              <span className="visually-hidden">{`${s.label}: ${s.score} out of 100`}</span>
            </li>
          ))}
        </ul>
      )}

      {content && content.points.length > 0 && (
        <>
          <div className="hs-coach-sub">What you said</div>
          <ul className="hs-points">
            {content.points.map((p) => (
              <li key={p.key} data-testid={`hs-point-${p.key}`}>
                <span className={`hs-level ${p.level}`}>{LEVEL_TEXT[p.level]}</span>
                <b>{p.label}</b>
                <p>{p.note}</p>
                {p.quote && <q>{p.quote}</q>}
              </li>
            ))}
          </ul>
        </>
      )}

      {pv !== null && (
        <p className="hs-voice-note" data-testid="hs-voice-note">
          <b>Voice:</b> your pitch moved about {pv} semitones around your usual tone. Research links more movement with sounding
          engaged; this is compared with your own voice, so it is not a score.
        </p>
      )}

      {moments.length > 0 && (
        <>
          <div className="hs-coach-sub">Moments to watch</div>
          <ul className="hs-moments">
            {shown.map((m) => (
              <li key={`${m.kind}${m.t}`}>
                <button type="button" className={`hs-moment ${m.kind}`} onClick={() => onSeek(m.t)}>
                  <span>{recClock(Math.floor(m.t))}</span>
                  {m.kind === 'filler' ? `“${m.label}”` : m.kind === 'hedge' ? `“${m.label}”` : `${m.dur ?? ''}s pause`}
                </button>
              </li>
            ))}
          </ul>
          {moments.length > MOMENTS_SHOWN && (
            <button type="button" className="cp-btn hs-more" onClick={() => setAllMoments(!allMoments)}>
              {allMoments ? 'Show fewer' : `Show all ${moments.length}`}
            </button>
          )}
        </>
      )}

      {coaching.notes.length > 0 && <ul className="hs-notes">{coaching.notes.map((n) => <li key={n}>{n}</li>)}</ul>}

      <p className="cp-muted hs-coach-foot">
        Counts come from an automatic transcript, which can miss or mishear words, especially with accents. Treat them as a guide.
      </p>
    </div>
  );
};

export default HireVideoScorecard;
