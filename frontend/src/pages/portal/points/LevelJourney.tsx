import React from 'react';
import { BAND_RUNGS } from '../../../services/onboardingApi';

/**
 * LevelJourney — the whole level ladder at a glance: the four free, points-reachable
 * rungs (AI Aware I → AI Enabled II) followed by the two build bands (AI Builder,
 * AI Architect) that are earned by shipping in the program, not by points. Each rung
 * shows what it is and how you reach it; the learner's current rung is highlighted
 * and everything they've passed is checked. Visual, like the Path page.
 *
 * Pure/presentational — thresholds come from BAND_RUNGS (the same source the HUD +
 * dashboard use), so the whole app tells one consistent story.
 */

interface Rung { name: string; detail: string; min: number | null; kind: 'free' | 'build'; }

const JOURNEY: Rung[] = [
  ...BAND_RUNGS.map((r) => ({
    name: r.name,
    detail: r.min === 0 ? 'Starting rung' : `${r.min.toLocaleString()} pts`,
    min: r.min,
    kind: 'free' as const,
  })),
  { name: 'AI Builder', detail: 'Ship builds in the program', min: null, kind: 'build' },
  { name: 'AI Architect', detail: 'Architect-level mastery', min: null, kind: 'build' },
];

const CheckIcon = () => <svg viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4L19 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const LockIcon = () => <svg viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
const StarIcon = () => <svg viewBox="0 0 24 24" fill="none"><path d="M12 2l2.8 6.6 7.2.6-5.5 4.7 1.7 7L12 17.8 5.8 21.5l1.7-7L2 9.8l7.2-.6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>;

const LevelJourney: React.FC<{ points: number; currentName?: string | null }> = ({ points, currentName }) => {
  // Current rung: prefer the server-provided name (accounts for build promotions);
  // otherwise fall back to the highest free rung the points total has reached.
  let currentIdx = JOURNEY.findIndex((r) => r.name === currentName);
  if (currentIdx < 0) {
    currentIdx = 0;
    JOURNEY.forEach((r, i) => { if (r.min != null && points >= r.min) currentIdx = i; });
  }

  return (
    <div className="pts-journey">
      <div className="pts-journey-h">
        <h3>Your level journey</h3>
        <span className="pts-mut">Free rungs are earned with points; the build bands are earned by shipping in the program.</span>
      </div>
      <ol className="pts-jtrack" aria-label="Level journey from AI Aware I to AI Architect">
        {JOURNEY.map((r, i) => {
          const state = i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'todo';
          return (
            <li key={r.name} className={`pts-jnode ${state} ${r.kind}`}>
              <span className="pts-jdot" aria-hidden="true">
                {state === 'done' ? <CheckIcon /> : state === 'current' ? <StarIcon /> : r.kind === 'build' ? <LockIcon /> : <span className="pts-jnum">{i + 1}</span>}
              </span>
              <span className="pts-jname">{r.name}</span>
              <span className="pts-jdetail">{r.detail}</span>
              {state === 'current' && <span className="pts-jhere">You are here</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
};

export default LevelJourney;
