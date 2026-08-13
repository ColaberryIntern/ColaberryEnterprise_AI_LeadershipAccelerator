import React from 'react';
import { Link } from 'react-router-dom';
import { sumCardPoints } from '../classroomNextStep';
import { SETUP_STEP_CTA_LABEL, type TodayNextStep } from './useTodayNextStep';

type Props = {
  nextStep: TodayNextStep;
  total: number;
  onScrollTo: (id: string) => () => void;
};

/**
 * The Command Center's primary "what do I do right now" message + CTA —
 * extracted out of TodayShell.tsx (which was already at the 500-line
 * Modular Composition Rule ceiling) so the branch-per-nextStep.kind JSX
 * doesn't grow that file further. Pure presentation; all the "what state is
 * the student in" logic lives in useTodayNextStep.ts.
 */
const TodayNextStepBanner: React.FC<Props> = ({ nextStep, total, onScrollTo }) => {
  if (nextStep.kind === 'classroom') {
    const pts = sumCardPoints(nextStep.card.points);
    return (
      <>
        <p className="statline"><b>{total.toLocaleString()} points</b> · you're in training — your next step is waiting in Classroom.</p>
        <div className="ctas">
          <Link className="te-btn cherry" to={`/portal/classroom?open=${encodeURIComponent(nextStep.card.id)}`}>
            {nextStep.card.title}
            {pts > 0 && <> · +{pts} pts</>}
            {' →'}
          </Link>
        </div>
      </>
    );
  }

  if (nextStep.kind === 'classroom-done') {
    return (
      <p className="statline"><b>{total.toLocaleString()} points</b> — you're all caught up in Classroom! 🎉 Check back once your next class opens up new items.</p>
    );
  }

  if (nextStep.kind === 'setup') {
    return (
      <>
        <p className="statline">
          {total > 0
            ? <>You've earned <b>{total.toLocaleString()} points</b>. Next up — {nextStep.title}.</>
            : <>You're one step from your first points — <b>{nextStep.title}</b>.</>}
        </p>
        <div className="ctas">
          {nextStep.action && (
            <button className="te-btn cherry" type="button" onClick={nextStep.action}>
              {SETUP_STEP_CTA_LABEL[nextStep.key] ?? 'Continue'}
            </button>
          )}
          <Link className="te-btn ghost" to="/portal/path">See your path</Link>
        </div>
      </>
    );
  }

  if (nextStep.kind === 'plan') {
    return (
      <>
        <p className="statline">
          <b>{total.toLocaleString()} points</b> and set up. Next up — work through <b>Today's Plan</b>: a short, focused set of picks curated just for you, usually just a few minutes.
        </p>
        <div className="ctas">
          <button className="te-btn cherry" type="button" onClick={onScrollTo('te-today-plan-anchor')}>Jump to Today's Plan ↓</button>
        </div>
      </>
    );
  }

  // nextStep.kind === 'timeline'
  return (
    <>
      <p className="statline"><b>{total.toLocaleString()} points</b> and set up. Next up — explore <b>your timeline</b>, everything in one place.</p>
      <div className="ctas">
        <button className="te-btn cherry" type="button" onClick={onScrollTo('te-timeline-anchor')}>See your timeline ↓</button>
        <Link className="te-btn ghost" to="/portal/path">See your path</Link>
      </div>
    </>
  );
};

export default TodayNextStepBanner;
