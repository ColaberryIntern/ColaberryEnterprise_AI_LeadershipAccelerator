import React, { useState } from 'react';
import TimelineCard, { TimelineFeedCard } from './TimelineCard';

/**
 * TimelineFeed — the reusable vertical feed of Timeline Cards (Design E).
 * Presentational: the parent owns the data + the open handler; this component
 * only tracks local "like" state. Shared primitive — the Classroom owns it and
 * Today / Projects / Portfolio consume the same component.
 *
 * `groupCompleted` (Classroom) folds every completed card into one collapsible
 * "Completed (N)" section at the bottom of the week, collapsed by default, so
 * finished work stops eating vertical space. Completed cards render compact —
 * header + social footer (likes / comments) only — so the cohort can still
 * communicate on them. The open/closed choice is remembered across visits.
 */

interface Props {
  cards: TimelineFeedCard[];
  /** Fold completed cards into a collapsible "Completed (N)" section. */
  groupCompleted?: boolean;
  onOpen?: (card: TimelineFeedCard) => void;
  onComplete?: (card: TimelineFeedCard) => Promise<void> | void;
  onComments?: (card: TimelineFeedCard) => void;
  onWorkspace?: (card: TimelineFeedCard) => void;
}

// deterministic seed so like counts are stable across renders (no API field yet)
const baseLikes = (id: string): number => 6 + (id.charCodeAt(id.length - 1) % 17);

// Remember whether the student wants completed work expanded. Default collapsed.
const DONE_OPEN_KEY = 'tl-completed-open';
const readDoneOpen = (): boolean => {
  try { return window.localStorage.getItem(DONE_OPEN_KEY) === '1'; } catch { return false; }
};
const writeDoneOpen = (v: boolean): void => {
  try { window.localStorage.setItem(DONE_OPEN_KEY, v ? '1' : '0'); } catch { /* private mode / quota — non-fatal */ }
};

const TimelineFeed: React.FC<Props> = ({ cards, groupCompleted, onOpen, onComplete, onComments, onWorkspace }) => {
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [doneOpen, setDoneOpen] = useState<boolean>(readDoneOpen);
  const toggleLike = (c: TimelineFeedCard) => setLiked((m) => ({ ...m, [c.id]: !m[c.id] }));
  const toggleDone = () => setDoneOpen((v) => { const next = !v; writeDoneOpen(next); return next; });

  const renderCard = (c: TimelineFeedCard, compact = false) => (
    <TimelineCard
      key={c.id}
      card={c}
      compact={compact}
      onOpen={onOpen}
      onComplete={onComplete}
      onComments={onComments}
      onWorkspace={onWorkspace}
      onLike={toggleLike}
      liked={!!liked[c.id]}
      likes={baseLikes(c.id) + (liked[c.id] ? 1 : 0)}
    />
  );

  if (!groupCompleted) {
    return <div>{cards.map((c) => renderCard(c))}</div>;
  }

  // Partition: active/available/locked stay in the live feed; completed fold away.
  const active = cards.filter((c) => c.status !== 'completed');
  const completed = cards.filter((c) => c.status === 'completed');

  return (
    <div>
      {active.map((c) => renderCard(c))}
      {completed.length > 0 && (
        <div className="tl-donegrp">
          <button
            type="button"
            className={`tl-donebar${doneOpen ? ' open' : ''}`}
            onClick={toggleDone}
            aria-expanded={doneOpen}
          >
            <span className="db-l">
              <span className="db-ic"><svg viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4L19 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
              Completed <span className="db-n">{completed.length}</span>
            </span>
            <span className="db-chev"><svg viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
          </button>
          {doneOpen && <div className="tl-donelist">{completed.map((c) => renderCard(c, true))}</div>}
        </div>
      )}
    </div>
  );
};

export default TimelineFeed;
