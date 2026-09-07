/**
 * The classroom rails contract.
 *
 * A rail is a horizontally scrolling row of small tiles, inserted BETWEEN the
 * curriculum cards of a week. The curriculum itself is not touched: no card is
 * moved, regrouped, hidden or restyled by anything in this directory. That is
 * the whole design constraint and it is worth stating in the type file, because
 * the previous attempt at this problem reorganised the week into buckets and
 * had to be thrown away.
 *
 * WHY THE TILE CARRIES AN ACTION RATHER THAN A LINK. The point of a rail is not
 * to advertise that another page exists — the left nav already does that, and
 * students still never go. Each tile carries THE FIRST THING A STUDENT COULD DO
 * on that surface's own page: open the workstation, join the room, post the
 * reply, start the diagnostic. A tile that only navigates has moved the problem
 * rather than solved it.
 *
 * EVERY RAIL DEGRADES ALONE. `getClassroomRails` resolves all of them with
 * `Promise.allSettled` and names any that failed in `degraded`. A week must
 * never go blank because Rooms is having a bad afternoon, and a rail that
 * cannot answer is omitted rather than rendered empty.
 *
 * AN EMPTY RAIL IS NEVER RENDERED. A rail with no tiles is dropped from the
 * response entirely. This is a product rule, not an optimisation: a shelf with
 * a "start a project" placeholder in it teaches a student to skip that part of
 * the page, and they keep skipping it after it fills.
 */

/** The surfaces a rail can represent. One per owning area of the platform. */
export type RailSurface =
  | 'events'
  | 'project'
  | 'community'
  | 'rooms'
  | 'cert_prep'
  | 'portfolio'
  | 'timeline';

/**
 * The action a tile performs. `href` is a portal route, not an API call — the
 * tile navigates the student INTO the working surface with the right thing
 * already open, rather than reproducing that surface inside the classroom.
 */
export interface RailAction {
  label: string;
  href: string;
  /** `quiet` renders as an outlined secondary — "remind me", "preview". */
  kind: 'primary' | 'quiet';
}

export interface RailTile {
  /** Stable within the rail; used as the React key and for tests. */
  id: string;
  title: string;
  /** One line. Never the whole post, never the whole task. */
  detail: string | null;
  /** Small monospaced line: counts, timing, provenance. */
  meta: string | null;
  /**
   * A real image when the surface has one. Only events do today — Eventbrite's
   * own `Logo_url` via CCPP — and it is null on the Postgres fallback, so every
   * renderer must cope with null rather than assume artwork exists.
   */
  image_url: string | null;
  /** Fallback visual when there is no image. A single emoji, chosen per tile. */
  glyph: string | null;
  /** Corner stamp over the picture: the fact that decides relevance. */
  stamp: string | null;
  action: RailAction | null;
  /** Renders double width. At most one per rail, and only when one item leads. */
  featured?: boolean;
}

export interface Rail {
  surface: RailSurface;
  /** Student-facing heading. */
  label: string;
  /** Small grey line beside the heading. Null when there is nothing true to say. */
  count_label: string | null;
  /** The one click to the owning surface. */
  href: string;
  tiles: RailTile[];
}

export interface ClassroomRailsResult {
  /** The program week these rails were resolved for. */
  week: number;
  rails: Rail[];
  /** Surfaces that failed to resolve. Named, never silent. */
  degraded: RailSurface[];
}

/**
 * What a resolver is given. Deliberately not an Express `Request`: these run in
 * tests without a server, and a resolver that needs the request object is one
 * that will end up reading a header it should have been passed.
 */
export interface RailContext {
  enrollmentId: string;
  cohortId: string | null;
  /** The student's current program week, already fenced by the caller. */
  week: number;
  isStaff: boolean;
}

/** A resolver returns null when the rail should not appear at all. */
export type RailResolver = (ctx: RailContext) => Promise<Rail | null>;

/** Drop empty rails. The one place this rule is applied. */
export function omitIfEmpty(rail: Rail | null): Rail | null {
  if (!rail) return null;
  return rail.tiles.length > 0 ? rail : null;
}
