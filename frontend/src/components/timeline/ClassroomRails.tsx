import React, { useCallback, useRef } from 'react';
import { Rail, RailTile } from '../../pages/portal/classroomRailsApi';
import './classroomRails.css';

/**
 * A classroom rail: a colour-coded, horizontally scrolling row of tiles for one
 * surface of the platform, rendered between the week's curriculum cards.
 *
 * IT NEVER TOUCHES THE CURRICULUM. This component renders alongside the week's
 * cards and knows nothing about them. `TimelineFeed` and `TimelineCard` are
 * untouched by this feature, which is the constraint the whole design is built
 * around.
 *
 * THE TILE DOES THE FIRST THING. Every action is a real link into the owning
 * surface with the right thing already selected — the workstation open on that
 * task, the post open with the composer focused, the diagnostic started. A tile
 * that only navigated to an index would have moved the problem rather than
 * solved it, which is the whole reason students never visit these pages.
 *
 * SCROLL AFFORDANCES, in the order they do the work: the last tile is cut off
 * by the container so something is visibly beyond the edge; a gradient softens
 * that edge; and an arrow button exists for anyone who would rather click than
 * swipe. The arrow is a real button so it is reachable by keyboard, and the rail
 * itself is focusable and scrolls with the arrow keys for the same reason.
 */

interface Props {
  rail: Rail;
  /** Rendered instead of an image when a tile has none. */
  onOpen?: (tile: RailTile, rail: Rail) => void;
}

const SCROLL_TILES = 2;

const Tile: React.FC<{ tile: RailTile; rail: Rail; onOpen?: Props['onOpen'] }> = ({ tile, rail, onOpen }) => (
  <article className={`cr-tile${tile.featured ? ' cr-featured' : ''}`}>
    <div className="cr-pic" aria-hidden={tile.image_url ? undefined : true}>
      {tile.image_url
        ? <img src={tile.image_url} alt="" loading="lazy" />
        : <span className="cr-glyph">{tile.glyph ?? '•'}</span>}
      {tile.stamp ? <span className="cr-stamp">{tile.stamp}</span> : null}
    </div>
    <div className="cr-in">
      <h5 className="cr-title">{tile.title}</h5>
      {tile.detail ? <p className="cr-detail">{tile.detail}</p> : null}
      {tile.meta ? <p className="cr-meta">{tile.meta}</p> : null}
      <div className="cr-spacer" />
      {tile.action ? (
        <a
          className={`cr-act${tile.action.kind === 'quiet' ? ' cr-quiet' : ''}`}
          href={tile.action.href}
          onClick={() => onOpen?.(tile, rail)}
        >
          {tile.action.label}
        </a>
      ) : null}
    </div>
  </article>
);

const ClassroomRails: React.FC<Props> = ({ rail, onOpen }) => {
  const scroller = useRef<HTMLDivElement | null>(null);

  const nudge = useCallback((direction: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    const tile = el.querySelector('.cr-tile') as HTMLElement | null;
    const step = ((tile?.getBoundingClientRect().width ?? 232) + 10) * SCROLL_TILES;
    el.scrollBy({ left: step * direction, behavior: 'smooth' });
  }, []);

  if (rail.tiles.length === 0) return null;   // belt and braces; the API drops these

  return (
    <section className={`cr-rail cr-${rail.surface}`} aria-label={rail.label}>
      <header className="cr-hd">
        <span className="cr-name">{rail.label}</span>
        {rail.count_label ? <span className="cr-count">{rail.count_label}</span> : null}
        <a className="cr-all" href={rail.href}>Open{' '}&rarr;</a>
      </header>

      <div className="cr-wrap">
        <button type="button" className="cr-arrow cr-left" onClick={() => nudge(-1)}
                aria-label={`Scroll ${rail.label} back`}>&lsaquo;</button>
        <div className="cr-scroller" ref={scroller} tabIndex={0} role="group" aria-label={`${rail.label} items`}>
          {rail.tiles.map((t) => <Tile key={t.id} tile={t} rail={rail} onOpen={onOpen} />)}
        </div>
        <button type="button" className="cr-arrow cr-right" onClick={() => nudge(1)}
                aria-label={`Scroll ${rail.label} forward`}>&rsaquo;</button>
        <div className="cr-fade" aria-hidden="true" />
      </div>
    </section>
  );
};

export default ClassroomRails;
