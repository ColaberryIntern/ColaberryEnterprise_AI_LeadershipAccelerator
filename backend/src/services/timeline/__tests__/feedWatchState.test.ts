/**
 * The feed carries each tile's watch progress.
 *
 * Reported by the QA tester 2026-11-24: a tile for a part-watched video showed
 * no progress until it was reopened and played again. The tile had nothing to
 * show because the feed sent nothing — so this is where it is proved.
 */
jest.mock('../../runtime/watchProgressService', () => ({
  resolveAuthoritativeDurationS: jest.fn().mockResolvedValue(null),
}));

import { buildFeedWatchMap } from '../feedWatchState';
import { resolveAuthoritativeDurationS } from '../../runtime/watchProgressService';

const resolveDuration = resolveAuthoritativeDurationS as jest.MockedFunction<typeof resolveAuthoritativeDurationS>;

/** A card as the feed holds it: only the fields the watch math reads. */
const card = (over: Record<string, unknown> = {}) => ({
  id: 'card-1',
  type: 'video',
  metadata: { video: { url: 'https://youtu.be/abc', duration_seconds: 1200 } },
  completion_rules: null,
  ...over,
} as any);

/** A progress row carrying a stored watch blob. */
const progress = (watch: Record<string, unknown> | null, over: Record<string, unknown> = {}) => ({
  card_id: 'card-1',
  analytics: watch === null ? {} : { watch },
  status: 'in_progress',
  ...over,
} as any);

const rules = () => new Map<string, unknown>([['video', null]]);

beforeEach(() => {
  resolveDuration.mockReset();
  resolveDuration.mockResolvedValue(null);
});

describe('buildFeedWatchMap', () => {
  it('reports the percentage and the resume point for a part-watched video', async () => {
    const c = card();
    const map = await buildFeedWatchMap('enr-1', [c], new Map([[c.id, progress({
      watched_s: 600, max_position_s: 612, duration_s: 1200, watched_pct: 50,
    })]]), rules());

    expect(map.get('card-1')).toEqual({
      watched_pct: 50,
      required_pct: 75,     // the default watch bar
      met: false,
      position_s: 612,
      duration_s: 1200,
    });
  });

  it('says a card is met once the bar is cleared', async () => {
    const c = card();
    const map = await buildFeedWatchMap('enr-1', [c], new Map([[c.id, progress({
      watched_s: 1020, max_position_s: 1020, duration_s: 1200, watched_pct: 85,
    })]]), rules());

    expect(map.get('card-1')).toMatchObject({ watched_pct: 85, required_pct: 75, met: true });
  });

  it('leaves out a card nobody has played, so the tile renders as it always did', async () => {
    const c = card();
    expect((await buildFeedWatchMap('enr-1', [c], new Map(), rules())).has('card-1')).toBe(false);
    // A progress row with no watch blob at all.
    expect((await buildFeedWatchMap('enr-1', [c], new Map([[c.id, progress(null)]]), rules())).has('card-1')).toBe(false);
    // A row created by a beat that credited nothing is not "played" either.
    const empty = progress({ watched_s: 0, max_position_s: 0, duration_s: 1200, watched_pct: 0 });
    expect((await buildFeedWatchMap('enr-1', [c], new Map([[c.id, empty]]), rules())).has('card-1')).toBe(false);
  });

  it('resolves ONLY the cards with something recorded, never one lookup per tile', async () => {
    // The whole reason this lives in the feed: a tile fetching its own verdict
    // would be one request per video card on screen.
    const played = card({ id: 'played' });
    const untouched = [card({ id: 'a' }), card({ id: 'b' }), card({ id: 'c' })];
    const map = await buildFeedWatchMap(
      'enr-1',
      [played, ...untouched],
      new Map([['played', progress({ watched_s: 300, max_position_s: 300, duration_s: 1200, watched_pct: 25 }, { card_id: 'played' })]]),
      rules(),
    );

    expect(map.size).toBe(1);
    expect(resolveDuration).toHaveBeenCalledTimes(1);
  });

  it('self-heals against a duration the server can prove, so the tile and the drawer agree', async () => {
    // The stored duration was half the real one, which inflated the percentage.
    // The drawer's verdict applies this same correction; if the tile did not, the
    // two would quote different numbers for the same video.
    resolveDuration.mockResolvedValue(1200);
    const c = card();
    const map = await buildFeedWatchMap('enr-1', [c], new Map([[c.id, progress({
      watched_s: 600, max_position_s: 600, duration_s: 600, watched_pct: 100,
    })]]), rules());

    expect(map.get('card-1')).toMatchObject({ watched_pct: 50, met: false, duration_s: 1200 });
  });

  it('still reports a resume point for a card that carries no watch requirement', async () => {
    // A card whose video was removed after someone watched it is no longer
    // watch-gated, so there is no bar to reach - but they still left off
    // somewhere, and a resume is still the right thing to offer.
    const c = card({ type: 'reading', metadata: {} });
    const map = await buildFeedWatchMap('enr-1', [c], new Map([[c.id, progress({
      watched_s: 400, max_position_s: 400, duration_s: 1200, watched_pct: 33,
    })]]), new Map<string, unknown>([['reading', null]]));

    expect(map.get('card-1')).toEqual({
      watched_pct: 33, required_pct: null, met: true, position_s: 400, duration_s: 1200,
    });
  });
});
