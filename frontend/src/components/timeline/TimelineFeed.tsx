import React, { useState } from 'react';
import TimelineCard, { TimelineFeedCard } from './TimelineCard';

/**
 * TimelineFeed — the reusable vertical feed of Timeline Cards (Design E).
 * Presentational: the parent owns the data + the open handler; this component
 * only tracks local "like" state. Shared primitive — the Classroom owns it and
 * Today / Projects / Portfolio consume the same component.
 *
 * `compactCompleted` (Classroom) keeps completed cards INLINE in timeline order
 * but renders them compact — a regular, smaller feed post (header + text + social
 * footer, no big media tile) — so finished work reads light and stays in place,
 * while the cohort can still like and comment on it.
 */

interface Props {
  cards: TimelineFeedCard[];
  /** Render completed cards inline but compact (smaller, no media tile). */
  compactCompleted?: boolean;
  onOpen?: (card: TimelineFeedCard) => void;
  onComplete?: (card: TimelineFeedCard) => Promise<void> | void;
  onComments?: (card: TimelineFeedCard) => void;
  onWorkspace?: (card: TimelineFeedCard) => void;
}

// deterministic seed so like counts are stable across renders (no API field yet)
const baseLikes = (id: string): number => 6 + (id.charCodeAt(id.length - 1) % 17);

const TimelineFeed: React.FC<Props> = ({ cards, compactCompleted, onOpen, onComplete, onComments, onWorkspace }) => {
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const toggleLike = (c: TimelineFeedCard) => setLiked((m) => ({ ...m, [c.id]: !m[c.id] }));

  return (
    <div>
      {cards.map((c) => (
        <TimelineCard
          key={c.id}
          card={c}
          compact={!!compactCompleted && c.status === 'completed'}
          onOpen={onOpen}
          onComplete={onComplete}
          onComments={onComments}
          onWorkspace={onWorkspace}
          onLike={toggleLike}
          liked={!!liked[c.id]}
          likes={baseLikes(c.id) + (liked[c.id] ? 1 : 0)}
        />
      ))}
    </div>
  );
};

export default TimelineFeed;
