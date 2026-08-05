import React from 'react';
import CondensedHeaderCard from '../../pages/portal/today/CondensedHeaderCard';
import { TimelineFeedCard, visualFor } from './TimelineCard';
import { nextIncompleteCard } from '../../pages/portal/classroomNextStep';

type Props = {
  weekCards: TimelineFeedCard[];
  variant: 'full' | 'condensed';
  onOpen: (card: TimelineFeedCard) => void;
};

// Single source of truth for Classroom's "your next step" hero — the same
// nextIncompleteCard derivation renders two presentations (full body card vs.
// condensed header slot), and both open the SAME CardDetailDrawer pipeline
// the rest of the feed already uses (no new drawer mechanism).
const ClassroomNextStepHero: React.FC<Props> = ({ weekCards, variant, onOpen }) => {
  if (weekCards.length === 0) return null; // the existing .tl-empty state already covers this

  const nextCard = nextIncompleteCard(weekCards);

  if (variant === 'condensed') {
    if (!nextCard) return <CondensedHeaderCard label="This week" title="All caught up 🎉" />;
    return (
      <CondensedHeaderCard
        label={`Your next step · ${nextCard.student_label}`}
        title={nextCard.title}
        action={<button className="te-btn ghost sm" type="button" onClick={() => onOpen(nextCard)}>Open →</button>}
      />
    );
  }

  // variant === 'full'
  if (!nextCard) {
    return (
      <div className="tl-hero tl-hero-done">
        <div className="eyebrow">This week</div>
        <h2>You're all caught up 🎉</h2>
        <p>Every item this week is complete.</p>
      </div>
    );
  }
  const visual = visualFor(nextCard.render_band);
  return (
    <div className="tl-hero" style={{ borderTopColor: visual.color }}>
      <div className="eyebrow">Your next step · {nextCard.student_label}</div>
      <h2>{nextCard.title}</h2>
      {nextCard.subtitle && <p>{nextCard.subtitle}</p>}
      <button type="button" className="tl-btn primary" onClick={() => onOpen(nextCard)}>Open</button>
    </div>
  );
};

export default ClassroomNextStepHero;
