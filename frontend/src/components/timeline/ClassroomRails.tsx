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
  /**
   * The page's chance to handle a tile ITSELF instead of letting the action's
   * href navigate. The Classroom uses it to open a community post's thread in
   * the card drawer — the pop-up where a student can actually reply — and the
   * community tile calls `preventDefault()` before this runs. A page that does
   * not pass a handler keeps the plain navigation.
   */
  onOpen?: (tile: RailTile, rail: Rail, e: React.MouseEvent | React.KeyboardEvent) => void;
}

const SCROLL_TILES = 2;

/**
 * A mark per surface, shown inside the header chip. The chip already carries the
 * colour; the mark is what makes it legible to somebody who has not yet learned
 * the palette, and to anybody who cannot rely on colour at all.
 */
const SURFACE_ICON: Record<string, string> = {
  events: '\u{1F4C5}',
  project: '\u{1F528}',
  community: '\u{1F4AC}',
  rooms: '\u{1F6AA}',
  cert_prep: '\u{1F393}',
  portfolio: '\u{1F4C1}',
  timeline: '\u{1F5D3}',
};

/**
 * Community tiles carry a person's profile picture, which must not be rendered
 * as though it were an event banner. `cr-avatar` shows it as a round portrait.
 */
const isPortrait = (surface: string): boolean => surface === 'community';

/** Initials + a colour derived from the name, so one person is always the same
 *  colour. The same treatment the post drawer and the People rail use. */
const initialsOf = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?';
const avColor = (n: string) => { let h = 0; for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0; return `hsl(${h % 360} 46% 42%)`; };

/** The byline under a quote: who said it, and how far along they are. */
const Person: React.FC<{ person: NonNullable<RailTile['person']> }> = ({ person }) => (
  <div className="cr-person">
    {person.avatar_url
      ? <img className="cr-pav" src={person.avatar_url} alt="" loading="lazy" />
      : <span className="cr-pav" style={{ background: avColor(person.name) }}>{initialsOf(person.name)}</span>}
    <span className="cr-pname">{person.name}</span>
    {person.level != null ? <span className="cr-plvl">Level {person.level}</span> : null}
  </div>
);

/**
 * A tile is a PICTURE + a line, except on community, where it is somebody's
 * WORDS. Ali, 2026-09-13: "I don't like the pictures/images. What can we
 * replace this with" — chosen from four options, and the words won because
 * every picture option repeats across tiles (19 of 58 ritual posts are Roll
 * Call) while the words never do. The picture area is not styled away, it is
 * not rendered: an empty 130px box would be the same bug with better colours.
 */
const Tile: React.FC<{ tile: RailTile; rail: Rail; onOpen?: Props['onOpen'] }> = ({ tile, rail, onOpen }) => {
  const quote = rail.surface === 'community';
  // A community tile opens the post's thread RIGHT HERE when the page gives us
  // a handler — the same pop-up Today opens, where the student can actually
  // read the replies and write one (Ali, 2026-09-13: "where did the pop up go
  // where I can actually comment… we want to add that same capability when
  // clicked on here"). The whole tile is the target, not just the button.
  // Without a handler nothing changes: the anchor still navigates to the post.
  // `stopPropagation` as well as `preventDefault`: the Reply anchor sits INSIDE
  // the clickable article, so without it one click on the button would open the
  // post twice.
  const openInPlace = quote && !!onOpen
    ? (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); onOpen(tile, rail, e); }
    : undefined;
  return (
    <article
      className={`cr-tile${tile.featured ? ' cr-featured' : ''}${quote ? ' cr-quotetile' : ''}${openInPlace ? ' cr-clickable' : ''}`}
      onClick={openInPlace}
      role={openInPlace ? 'button' : undefined}
      tabIndex={openInPlace ? 0 : undefined}
      onKeyDown={openInPlace ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen!(tile, rail, e); } } : undefined}
    >
      {!quote && (
        <div className={`cr-pic${isPortrait(rail.surface) && tile.image_url ? ' cr-avatar' : ''}`}
             aria-hidden={tile.image_url ? undefined : true}>
          {tile.image_url
            ? <img src={tile.image_url} alt="" loading="lazy" />
            : <span className="cr-glyph">{tile.glyph ?? '•'}</span>}
          {tile.stamp ? <span className="cr-stamp">{tile.stamp}</span> : null}
        </div>
      )}
      <div className="cr-in">
        {tile.eyebrow ? <span className="cr-eyebrow">{tile.eyebrow}</span> : null}
        {quote && tile.stamp ? <span className="cr-pin">{tile.stamp}</span> : null}
        {quote
          ? <p className="cr-quote">{tile.title}</p>
          : <h5 className="cr-title">{tile.title}</h5>}
        {tile.detail ? <p className="cr-detail">{tile.detail}</p> : null}
        {tile.person ? <Person person={tile.person} /> : null}
        {tile.meta ? <p className="cr-meta">{tile.meta}</p> : null}
        <div className="cr-spacer" />
        {tile.action ? (
          <a
            className={`cr-act${tile.action.kind === 'quiet' ? ' cr-quiet' : ''}`}
            href={tile.action.href}
            onClick={openInPlace ?? ((e) => onOpen?.(tile, rail, e))}
          >
            {tile.action.label}
          </a>
        ) : null}
      </div>
    </article>
  );
};

const ClassroomRails: React.FC<Props> = ({ rail, onOpen }) => {
  const scroller = useRef<HTMLDivElement | null>(null);

  const nudge = useCallback((direction: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    const tile = el.querySelector('.cr-tile') as HTMLElement | null;
    const step = ((tile?.getBoundingClientRect().width ?? 318) + 10) * SCROLL_TILES;
    el.scrollBy({ left: step * direction, behavior: 'smooth' });
  }, []);

  if (rail.tiles.length === 0) return null;   // belt and braces; the API drops these

  return (
    <section className={`cr-rail cr-${rail.surface}`} aria-label={rail.label}>
      <header className="cr-hd">
        <span className="cr-name">
          <span className="cr-ic" aria-hidden="true">{SURFACE_ICON[rail.surface] ?? ''}</span>
          {rail.label}
        </span>
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
