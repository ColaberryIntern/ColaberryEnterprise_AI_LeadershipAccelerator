import React from 'react';
import CondensedHeaderCard from '../../pages/portal/today/CondensedHeaderCard';
import { TimelineFeedCard, visualFor } from './TimelineCard';
import { nextIncompleteCard, sumCardPoints } from '../../pages/portal/classroomNextStep';

type Props = {
  weekCards: TimelineFeedCard[];
  variant: 'full' | 'condensed';
  onOpen: (card: TimelineFeedCard) => void;
  week: number | null;
  canPrevWeek: boolean;
  canNextWeek: boolean;
  onPrevWeek: () => void;
  onNextWeek: () => void;
};

const SPARKLE = (
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8 5.8 21.3l2.4-7.4L2 9.4h7.6z" /></svg>
);
const CHEVRON_LEFT = (
  <svg viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const CHEVRON_RIGHT = (
  <svg viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

/**
 * Classroom's "your next step" + week-progress — ONE merged card, not two
 * cards sitting next to each other (see timeline.css's .tl-nextweek comment
 * for why). Both halves are driven by the same `weekCards` prop, so
 * changing weeks updates the whole card in lockstep; both variants open the
 * SAME CardDetailDrawer pipeline the rest of the feed already uses.
 */
const ClassroomNextStepHero: React.FC<Props> = ({
  weekCards, variant, onOpen, week, canPrevWeek, canNextWeek, onPrevWeek, onNextWeek,
}) => {
  if (weekCards.length === 0) return null; // the existing .tl-empty state already covers this

  const nextCard = nextIncompleteCard(weekCards);
  const pts = nextCard ? sumCardPoints(nextCard.points) : 0;
  const done = weekCards.filter((c) => c.status === 'completed').length;
  const pct = weekCards.length ? Math.round((done / weekCards.length) * 100) : 0;

  // Reused by both variants so the two prev/next buttons are never wired
  // differently by accident.
  const weekNav = (arrowClass: string) => (
    <>
      <button type="button" className={arrowClass} onClick={onPrevWeek} disabled={!canPrevWeek} aria-label="Previous week">{CHEVRON_LEFT}</button>
      <button type="button" className={arrowClass} onClick={onNextWeek} disabled={!canNextWeek} aria-label="Next week">{CHEVRON_RIGHT}</button>
    </>
  );

  if (variant === 'condensed') {
    const condensedNav = <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>{weekNav('te-weekarrow')}</div>;
    if (!nextCard) {
      return <CondensedHeaderCard icon={SPARKLE} tone="leaf" label="This week" title="All caught up 🎉" action={condensedNav} />;
    }
    return (
      <CondensedHeaderCard
        icon={SPARKLE}
        tone="berry"
        label={`Your next step · ${nextCard.student_label}`}
        title={nextCard.title}
        sub={pts > 0 ? `+${pts} pts` : undefined}
        action={(
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {condensedNav}
            <button className="te-btn ghost sm" type="button" onClick={() => onOpen(nextCard)}>Open →</button>
          </div>
        )}
      />
    );
  }

  // variant === 'full' — one merged card: week-context rail + next-step CTA
  const visual = nextCard ? visualFor(nextCard.render_band) : null;
  return (
    <div
      className={`tl-card tl-nextweek${!nextCard ? ' tl-nextweek-done' : ''}`}
      style={{ borderTopColor: nextCard ? visual!.color : 'var(--leaf)' }}
    >
      <div className="tl-nextweek-week">
        <div className="tl-nextweek-nav">
          {weekNav('tl-arrow sm')}
        </div>
        <h3 style={{ textAlign: 'center' }}>{week != null ? `Week ${week}` : 'Your timeline'}</h3>
        <div className="tl-small" style={{ textAlign: 'center' }}>{weekCards.length} item{weekCards.length === 1 ? '' : 's'} this week</div>
        <div className="tl-prog"><i style={{ width: `${pct}%` }} /></div>
        <div className="tl-small" style={{ textAlign: 'center' }}><b>{done}</b> of <b>{weekCards.length}</b> complete</div>
      </div>
      <div className="tl-nextweek-step">
        {nextCard ? (
          <>
            <div className="eyebrow">
              Your next step · {nextCard.student_label}
              {/* Make finishing it enticing — the points on offer, not just the task name. */}
              {pts > 0 && <span className="tl-ptbadge">+{pts} pts</span>}
            </div>
            <h2>{nextCard.title}</h2>
            {nextCard.subtitle && <p>{nextCard.subtitle}</p>}
            <div><button type="button" className="tl-btn primary" onClick={() => onOpen(nextCard)}>Open</button></div>
          </>
        ) : (
          <>
            <div className="eyebrow">This week</div>
            <h2>You're all caught up 🎉</h2>
            <p>Every item this week is complete.</p>
          </>
        )}
      </div>
    </div>
  );
};

export default ClassroomNextStepHero;
