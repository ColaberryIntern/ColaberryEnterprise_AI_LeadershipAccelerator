import React from 'react';
import { Link } from 'react-router-dom';
import CondensedHeaderCard from './CondensedHeaderCard';
import OpenOnPhone from './OpenOnPhone';
import { sumCardPoints } from '../classroomNextStep';
import { SETUP_STEP_CTA_LABEL, type TodayNextStep } from './useTodayNextStep';

const SPARKLE = (
  <svg viewBox="0 0 24 24" fill="none"><path d="M12 2l2.8 6.6 7.2.6-5.5 4.7 1.7 7L12 17.8 5.8 21.5l1.7-7L2 9.8l7.2-.6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
);

type Props = {
  nextStep: TodayNextStep;
  onScrollTo: (id: string) => () => void;
};

/**
 * Today's condensed header slot — matches the Projects/Classroom condensed
 * pattern (lean on what's next, not on stats already shown elsewhere in the
 * header). Points/level/"Next tier" are dropped here on purpose: the points
 * HUD to the right already shows exactly that, so repeating it here was
 * pure redundancy. "Open on your phone" stays, but icon-only (compact) so
 * it fits next to the next-step action without crowding the slot.
 */
const TodayNextStepCondensed: React.FC<Props> = ({ nextStep, onScrollTo }) => {
  const phone = <OpenOnPhone compact />;

  if (nextStep.kind === 'classroom') {
    const pts = sumCardPoints(nextStep.card.points);
    return (
      <CondensedHeaderCard
        icon={SPARKLE}
        tone="berry"
        label={`Your next step · ${nextStep.card.student_label}`}
        title={nextStep.card.title}
        sub={pts > 0 ? `+${pts} pts` : undefined}
        action={(
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link className="te-btn ghost sm" to={`/portal/classroom?open=${encodeURIComponent(nextStep.card.id)}`}>Open →</Link>
            {phone}
          </div>
        )}
      />
    );
  }

  if (nextStep.kind === 'classroom-done') {
    return <CondensedHeaderCard icon={SPARKLE} tone="leaf" label="Classroom" title="All caught up 🎉" action={phone} />;
  }

  if (nextStep.kind === 'setup') {
    return (
      <CondensedHeaderCard
        icon={SPARKLE}
        tone="cherry"
        label="Next step"
        title={nextStep.title}
        action={(
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {nextStep.action && (
              <button className="te-btn ghost sm" type="button" onClick={nextStep.action}>
                {SETUP_STEP_CTA_LABEL[nextStep.key] ?? 'Continue'} →
              </button>
            )}
            {phone}
          </div>
        )}
      />
    );
  }

  if (nextStep.kind === 'plan') {
    return (
      <CondensedHeaderCard
        icon={SPARKLE}
        tone="amber"
        label="Next step"
        title="Today's Plan"
        action={(
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="te-btn ghost sm" type="button" onClick={onScrollTo('te-today-plan-anchor')}>Open →</button>
            {phone}
          </div>
        )}
      />
    );
  }

  // nextStep.kind === 'timeline'
  return (
    <CondensedHeaderCard
      icon={SPARKLE}
      tone="berry"
      label="Next step"
      title="Your timeline"
      action={(
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="te-btn ghost sm" type="button" onClick={onScrollTo('te-timeline-anchor')}>Open →</button>
          {phone}
        </div>
      )}
    />
  );
};

export default TodayNextStepCondensed;
