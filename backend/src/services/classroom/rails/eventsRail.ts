import { getUpcomingPublicEvents } from '../../publicEventsService';
import { Rail, RailContext, RailTile, omitIfEmpty } from './types';

/**
 * Upcoming events, from the same CCPP `EventBrite_Events` feed the Events page,
 * the Schedule page and the topbar chip already read. No second source: if the
 * Events page shows it, this shows it, and a change to that feed reaches both.
 *
 * THIS IS THE ONLY RAIL WITH REAL ARTWORK. `image_url` is Eventbrite's own
 * `Logo_url`, which is why event tiles look like their listing without us
 * re-hosting anything. It is null on the Postgres fallback — that path has no
 * image column — so the tile falls back to a glyph rather than a broken frame.
 *
 * The nearest event is `featured`, because it is the only one with a decision
 * attached: everything else can be read later, and that one is either attended
 * or missed.
 */

/** Enough to fill a rail without turning it into the Events page. */
const TILE_LIMIT = 8;
/** Match the Events page's own window rather than inventing a shorter one. */
const WINDOW_DAYS = 90;

const CT = 'America/Chicago';

/** "THU 6:30 PM" — the corner stamp. Short enough not to wrap on a 232px tile. */
function stampFor(startsAt: Date): string {
  const day = startsAt.toLocaleDateString('en-US', { weekday: 'short', timeZone: CT }).toUpperCase();
  const time = startsAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: CT });
  return `${day} ${time}`;
}

/** "Sep 12" for anything beyond this week, where the weekday stops being useful. */
function dateStamp(startsAt: Date): string {
  return startsAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: CT }).toUpperCase();
}

function daysUntil(startsAt: Date, now: Date): number {
  return Math.round((startsAt.getTime() - now.getTime()) / 86_400_000);
}

/** Today shows the next 7 (Ali, 2026-09-11); Classroom keeps its 8. Same rail, one knob. */
export interface EventsRailOptions { limit?: number }

export async function resolveEventsRail(_ctx: RailContext, now: Date = new Date(), opts: EventsRailOptions = {}): Promise<Rail | null> {
  const limit = Math.max(1, Math.min(TILE_LIMIT, Math.floor(opts.limit ?? TILE_LIMIT)));
  const events = await getUpcomingPublicEvents(WINDOW_DAYS);

  const upcoming = events
    .filter((e) => e.starts_at instanceof Date && e.starts_at.getTime() > now.getTime())
    .sort((a, b) => a.starts_at.getTime() - b.starts_at.getTime())
    .slice(0, limit);

  const tiles: RailTile[] = upcoming.map((e, i) => {
    const soon = daysUntil(e.starts_at, now) <= 7;
    return {
      id: e.id,
      title: e.title,
      detail: e.description ? e.description.slice(0, 90) : null,
      meta: null,
      image_url: e.image_url,
      glyph: '\u{1F4C5}',
      stamp: soon ? stampFor(e.starts_at) : dateStamp(e.starts_at),
      // Registration happens in Eventbrite, exactly as the Events page says. We
      // link out rather than pretending to register somebody from a tile.
      //
      // THE FALLBACK CARRIES THE EVENT ID. It used to be a bare `/portal/events`,
      // which made this the only rail in the set that dropped its identifier:
      // community sends `?post=`, portfolio `?artifact=`, rooms `/rooms/<id>`,
      // cert-prep `?start=`. "See details" therefore landed you on a list of
      // every event with the one you had just clicked nowhere in particular -
      // the exact "a tile that only navigated to an index would have moved the
      // problem rather than solved it" failure this feature's own contract
      // warns against, in the one rail that did it.
      action: e.registration_url
        ? { label: i === 0 ? 'Register' : 'Register', href: e.registration_url, kind: i === 0 ? 'primary' : 'quiet' }
        : { label: 'See details', href: `/portal/events?event=${encodeURIComponent(e.id)}`, kind: 'quiet' },
      featured: i === 0,
    };
  });

  return omitIfEmpty({
    surface: 'events',
    label: 'Upcoming',
    count_label: tiles.length > 1 ? `next up, then ${tiles.length - 1} more` : null,
    href: '/portal/events',
    tiles,
  });
}
