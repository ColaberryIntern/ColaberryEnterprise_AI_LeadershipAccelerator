/**
 * The events rail's tiles must carry the event they name.
 *
 * WHY THIS EXISTS. `RailAction`'s own contract says a tile "navigates the student
 * INTO the working surface with the right thing already open", and `ClassroomRails`
 * says a tile that "only navigated to an index would have moved the problem rather
 * than solved it". Every rail honoured that except this one: community sends
 * `?post=<id>`, portfolio `?artifact=<id>`, rooms `/rooms/<id>`, cert-prep
 * `?start=<mode>` - and events sent a bare `/portal/events`.
 *
 * The result was reported from the live site: clicking one event out of the rail
 * landed on a list of every event, with the one just clicked nowhere in particular.
 * Nothing failed, because an index page is a perfectly good page. That is exactly
 * the shape of defect a composition test cannot see - `railComposition.test.ts`
 * mocks every resolver, so it never looks at a single href.
 */
jest.mock('../../../publicEventsService', () => ({ getUpcomingPublicEvents: jest.fn() }));

import { resolveEventsRail } from '../eventsRail';
import { getUpcomingPublicEvents } from '../../../publicEventsService';
import { RailContext } from '../types';

const mEvents = getUpcomingPublicEvents as unknown as jest.Mock;
const CTX = {} as RailContext;
const NOW = new Date('2026-09-07T12:00:00Z');

/** One upcoming event, overridable per test. */
function event(over: Record<string, unknown> = {}) {
  return {
    id: 'evt-123',
    title: 'Welcome to your free AI preview',
    description: 'A short introduction to what the programme covers.',
    image_url: null,
    registration_url: null,
    starts_at: new Date('2026-09-20T18:00:00Z'),
    ends_at: new Date('2026-09-20T19:00:00Z'),
    ...over,
  };
}

beforeEach(() => mEvents.mockReset());

describe('events rail tiles carry their event', () => {
  it('the "see details" fallback links to THIS event, not the index', async () => {
    mEvents.mockResolvedValue([event()]);

    const rail = await resolveEventsRail(CTX, NOW);
    const href = rail!.tiles[0].action!.href;

    // The regression in one line: a bare index is not an answer.
    expect(href).not.toBe('/portal/events');
    expect(href).toBe('/portal/events?event=evt-123');
  });

  it('encodes the id, so an id with a slash cannot forge a path', async () => {
    mEvents.mockResolvedValue([event({ id: 'a/b?c=d' })]);

    const rail = await resolveEventsRail(CTX, NOW);

    expect(rail!.tiles[0].action!.href).toBe('/portal/events?event=a%2Fb%3Fc%3Dd');
  });

  it('still links out to Eventbrite when the event has a registration url', async () => {
    // Registration genuinely happens off-platform. Carrying the id must not have
    // quietly captured the one action that is supposed to leave.
    mEvents.mockResolvedValue([event({ registration_url: 'https://eventbrite.com/e/123' })]);

    const rail = await resolveEventsRail(CTX, NOW);

    expect(rail!.tiles[0].action).toMatchObject({
      label: 'Register',
      href: 'https://eventbrite.com/e/123',
    });
  });

  it('every tile carries an identifier or leaves the platform', async () => {
    // The invariant, rather than the instance. A rail added later that forgets its
    // id fails here even if nobody thinks to write a test for that rail.
    mEvents.mockResolvedValue([
      event({ id: 'one' }),
      event({ id: 'two', registration_url: 'https://eventbrite.com/e/2' }),
      event({ id: 'three' }),
    ]);

    const rail = await resolveEventsRail(CTX, NOW);

    for (const tile of rail!.tiles) {
      const href = tile.action!.href;
      const leavesPlatform = /^https?:\/\//.test(href);
      const carriesId = href.includes(encodeURIComponent(tile.id));
      expect({ id: tile.id, ok: leavesPlatform || carriesId }).toEqual({ id: tile.id, ok: true });
    }
  });

  it('a past event is not offered at all', async () => {
    mEvents.mockResolvedValue([event({ starts_at: new Date('2026-09-01T18:00:00Z') })]);

    expect(await resolveEventsRail(CTX, NOW)).toBeNull();
  });
});
