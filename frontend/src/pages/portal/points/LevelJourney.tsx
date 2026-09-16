import React from 'react';
import { BAND_RUNGS } from '../../../services/onboardingApi';
import { journeyIndexFor } from './levelJourneyIndex';

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

const FREE_RUNGS: Rung[] = BAND_RUNGS.map((r) => ({
  name: r.name,
  detail: r.min === 0 ? 'Starting rung' : `${r.min.toLocaleString()} pts`,
  min: r.min,
  kind: 'free' as const,
}));

// Legacy build bands: two nodes, matched by band prefix (see levelJourneyIndex).
const LEGACY_BUILD: Rung[] = [
  { name: 'AI Builder', detail: 'Ship builds in the program', min: null, kind: 'build' },
  { name: 'AI Architect', detail: 'Architect-level mastery', min: null, kind: 'build' },
];

// The milestone ladder (docs/POINTS_LADDER_DECISIONS.md): one node per rung so
// "You are here" lands on the actual rung, with the milestone count as the detail.
const MILESTONE_BUILD: Rung[] = [
  { name: 'AI Builder I', detail: '1 of 4 milestones', min: null, kind: 'build' },
  { name: 'AI Builder II', detail: '2 of 4', min: null, kind: 'build' },
  { name: 'AI Builder III', detail: '3 of 4', min: null, kind: 'build' },
  { name: 'AI Builder IV', detail: 'Program Graduate', min: null, kind: 'build' },
  { name: 'AI Architect', detail: 'Graduate + certification', min: null, kind: 'build' },
];

const CheckIcon = () => <svg viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4L19 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const LockIcon = () => <svg viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
const StarIcon = () => <svg viewBox="0 0 24 24" fill="none"><path d="M12 2l2.8 6.6 7.2.6-5.5 4.7 1.7 7L12 17.8 5.8 21.5l1.7-7L2 9.8l7.2-.6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>;

const LevelJourney: React.FC<{ points: number; currentName?: string | null; milestoneLadder?: boolean }> = ({ points, currentName, milestoneLadder = false }) => {
  const journey = milestoneLadder ? [...FREE_RUNGS, ...MILESTONE_BUILD] : [...FREE_RUNGS, ...LEGACY_BUILD];
  // Current node: the server-provided rung name places a promoted learner on
  // their build rung (exact name on the milestone ladder, band prefix on the
  // legacy one); otherwise the highest free rung the points total has reached.
  const currentIdx = journeyIndexFor(journey, points, currentName);

  return (
    <div className="pts-journey">
      <div className="pts-journey-h">
        <h3>Your level journey</h3>
        <span className="pts-mut">{milestoneLadder
          ? 'Free rungs are earned with points; the build rungs are earned by finishing the curriculum, three verified builds, and a certification.'
          : 'Free rungs are earned with points; the build bands are earned by shipping in the program.'}</span>
      </div>
      <ol className="pts-jtrack" aria-label="Level journey from AI Aware I to AI Architect">
        {journey.map((r, i) => {
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
