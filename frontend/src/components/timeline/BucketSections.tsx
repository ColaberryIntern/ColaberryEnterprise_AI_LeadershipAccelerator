import React, { useMemo, useState } from 'react';
import { TimelineFeedCard } from './TimelineCard';
import TimelineFeed from './TimelineFeed';
import { groupIntoBuckets, RAIL_VISIBLE, BucketSection } from '../../pages/portal/classroomBuckets';
import type { ClassroomProjection, SurfaceNextAction } from '../../pages/portal/classroomProjectionApi';
import { SURFACE_BY_BUCKET } from '../../pages/portal/classroomProjectionApi';

/**
 * The classroom week, rendered as the sections the platform already defines.
 *
 * Before this, a week arrived as one flat stream in publication order — a
 * required build sitting below nine optional intelligence cards, with nothing
 * to say which was which. Every card already carried its bucket; nothing read
 * it.
 *
 * Two shapes, and the choice is about the card rather than the count:
 *
 *   stack — the existing vertical feed, unchanged, for sections whose cards ask
 *           for a decision (build, share, advance, pre_class).
 *   rail  — a horizontal scroller for sections the student BROWSES (learn,
 *           practice, reflect). `learn` alone holds seventeen card types;
 *           stacked, a fortnight of optional reading buries the one required
 *           course above it.
 *
 * The rail is deliberately thin. It reuses the same `TimelineCard` for its
 * detail view rather than inventing a second card component, because two card
 * renderers is how two surfaces start disagreeing about what a card says.
 */

interface Props {
  cards: TimelineFeedCard[];
  compactCompleted?: boolean;
  onOpen?: (card: TimelineFeedCard) => void;
  onComplete?: (card: TimelineFeedCard) => Promise<void> | void;
  onComments?: (card: TimelineFeedCard) => void;
  onWorkspace?: (card: TimelineFeedCard) => void;
  /** Render sections with no cards this week, with their empty line. */
  showEmptySections?: boolean;
  /** What each owning surface says to do next. Absent = sections render as before. */
  projection?: ClassroomProjection | null;
}

const minutes = (card: TimelineFeedCard): string | null => {
  const m = (card as { estimated_time?: number | null }).estimated_time;
  return typeof m === 'number' && m > 0 ? `${m} min` : null;
};

const pointsOf = (card: TimelineFeedCard): number => {
  const p = (card as { points?: Record<string, number> | null }).points || {};
  return Object.values(p).reduce((sum, v) => sum + (Number(v) || 0), 0);
};

/** One tile in a rail: the smallest thing that still says what the card is. */
const RailTile: React.FC<{ card: TimelineFeedCard; onOpen?: (c: TimelineFeedCard) => void }> = ({ card, onOpen }) => {
  const pts = pointsOf(card);
  const mins = minutes(card);
  const done = card.status === 'completed';
  const media = (card as { image?: string | null }).image
    || (card as { video?: { poster?: string | null } | null }).video?.poster
    || null;

  return (
    <button
      type="button"
      className={`tl-tile${done ? ' is-done' : ''}`}
      onClick={() => onOpen?.(card)}
      aria-label={card.title}
    >
      <span className="tl-tile-th">
        {media
          ? <img src={media} alt="" loading="lazy" />
          : <span className="tl-tile-band">{card.student_label || card.type}</span>}
        {mins && <span className="tl-tile-dur">{mins}</span>}
      </span>
      <span className="tl-tile-b">
        <span className="tl-tile-k">{card.student_label || card.type}</span>
        <span className="tl-tile-t">{card.title}</span>
        {pts > 0 && <span className="tl-tile-p">+{pts} pts</span>}
        {done && <span className="tl-tile-done">Done</span>}
      </span>
    </button>
  );
};

const Rail: React.FC<{ section: BucketSection; onOpen?: (c: TimelineFeedCard) => void }> = ({ section, onOpen }) => {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? section.cards : section.cards.slice(0, RAIL_VISIBLE);
  const hidden = section.cards.length - visible.length;

  return (
    <>
      <div className="tl-rail" role="list">
        {visible.map((card) => (
          <div role="listitem" key={card.id}><RailTile card={card} onOpen={onOpen} /></div>
        ))}
        {hidden > 0 && (
          <div role="listitem">
            <button type="button" className="tl-tile tl-tile-more" onClick={() => setExpanded(true)}>
              {hidden} more →
            </button>
          </div>
        )}
      </div>
      {/* A rail is horizontally scrollable, which keyboard and screen-reader
          users navigate by tabbing through the tiles above; the count is stated
          so the section's size is knowable without scrolling it. */}
      <p className="tl-rail-count tl-small">{section.cards.length} in this section</p>
    </>
  );
};

/**
 * The owning surface's own next action, shown at the head of its section.
 *
 * This is the projection made visible: the Build section says what the PROJECT
 * thinks is next, not what the curriculum guessed months ago. When the surface
 * has nothing to offer it says why — an unopened certification lane names the
 * week rather than showing a padlock.
 */
const NextFromSurface: React.FC<{ next: SurfaceNextAction }> = ({ next }) => (
  <a className={`tl-next${next.available ? '' : ' is-unavailable'}`} href={next.href}>
    <span className="tl-next-lab">{next.available ? 'Next, from your ' : ''}{next.surface === 'project' ? 'project' : 'certification track'}</span>
    <span className="tl-next-h">{next.headline}</span>
    {next.detail && <span className="tl-next-d">{next.detail}</span>}
  </a>
);

const BucketSections: React.FC<Props> = ({
  cards, compactCompleted, onOpen, onComplete, onComments, onWorkspace, showEmptySections, projection,
}) => {
  const { sections, unbucketed } = useMemo(
    () => groupIntoBuckets(cards, { includeEmpty: !!showEmptySections }),
    [cards, showEmptySections],
  );

  if (sections.length === 0) return <div className="tl-empty">No cards here yet.</div>;

  return (
    <div className="tl-buckets">
      {sections.map((section) => (
        <section className={`tl-bucket tl-bk-${section.bucket}`} key={section.bucket}>
          <div className="tl-bucket-hd">
            <h3>{section.meta.label}</h3>
            <span className="tl-bucket-q">{section.meta.question}</span>
            <span className="tl-bucket-n">{section.cards.length}</span>
          </div>

          {(() => {
            const surface = SURFACE_BY_BUCKET[section.bucket];
            const next = surface && projection ? projection[surface] : null;
            return next ? <NextFromSurface next={next} /> : null;
          })()}

          {section.cards.length === 0
            ? <p className="tl-bucket-empty tl-small">{section.meta.empty}</p>
            : section.meta.layout === 'rail'
              ? <Rail section={section} onOpen={onOpen} />
              : (
                <TimelineFeed
                  cards={section.cards}
                  compactCompleted={compactCompleted}
                  onOpen={onOpen}
                  onComplete={onComplete}
                  onComments={onComments}
                  onWorkspace={onWorkspace}
                />
              )}
        </section>
      ))}

      {/* Countable rather than invisible: three of the live card types carry no
          bucket, and a card with an unknown bucket is shown under Learn rather
          than dropped. Saying so is how the taxonomy gap gets closed. */}
      {unbucketed > 0 && (
        <p className="tl-small tl-bucket-note">
          {unbucketed} card{unbucketed === 1 ? '' : 's'} had no section and {unbucketed === 1 ? 'is' : 'are'} shown under Learn.
        </p>
      )}
    </div>
  );
};

export default BucketSections;
export { RailTile };
