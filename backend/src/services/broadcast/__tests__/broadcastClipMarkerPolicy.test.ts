import {
  decideClipMarker, formatTimecode, type MarkerInput, type ResolvedSlide,
} from '../broadcastClipMarkerPolicy';

/**
 * L7.3 — where a clip starts.
 *
 * The assertions that matter most are the refusals. A marker pointing at the wrong second is
 * worse than no marker: it sends an editor to the wrong place and quietly wastes the thing the
 * feature exists to save. Every refusal here is a fact that was missing, named, rather than a
 * value invented to keep the happy path going.
 */

const STARTED = Date.parse('2026-10-24T14:00:00.000Z');

const slide = (over: Partial<ResolvedSlide> = {}): ResolvedSlide => ({
  title: 'Prove it: ship the dashboard',
  segmentId: 'build',
  segmentLabel: 'Build Block',
  publicValue: 'The 90-second "it actually works" moment',
  ...over,
});

const at = (over: Partial<MarkerInput> = {}): MarkerInput => ({
  occurrenceId: 'occ-1',
  editorialState: 'live',
  contentStartedAtMs: STARTED,
  nowMs: STARTED + 167_000, // 2m47s
  slideIndex: 12,
  deckTitle: 'Prove it: ship the dashboard',
  slide: slide(),
  ...over,
});

describe('marking a moment', () => {
  it('records the position in the RECORDING, not the wall clock', () => {
    const d = decideClipMarker(at());

    expect(d.record).toBe(true);
    if (!d.record) throw new Error('unreachable');
    expect(d.marker.timecodeSeconds).toBe(167);
    expect(d.marker.slideIndex).toBe(12);
  });

  it('labels the clip with what the segment is worth as public content', () => {
    // `publicValue` is authored for exactly this and no backend path has ever read it.
    const d = decideClipMarker(at());

    if (!d.record) throw new Error('unreachable');
    expect(d.marker.label).toBe('The 90-second "it actually works" moment');
  });

  it('falls back to the segment label, then the title, rather than an empty clip', () => {
    const noValue = decideClipMarker(at({ slide: slide({ publicValue: undefined }) }));
    if (!noValue.record) throw new Error('unreachable');
    expect(noValue.marker.label).toBe('Build Block');

    const bare = decideClipMarker(at({
      slide: slide({ publicValue: undefined, segmentLabel: '' }),
    }));
    if (!bare.record) throw new Error('unreachable');
    expect(bare.marker.label).toBe('Prove it: ship the dashboard');
  });

  it('floors the timecode, so a clip never starts after the line it captures', () => {
    const d = decideClipMarker(at({ nowMs: STARTED + 167_999 }));
    if (!d.record) throw new Error('unreachable');
    expect(d.marker.timecodeSeconds).toBe(167);
  });

  it('marks the very first instant as zero rather than refusing it', () => {
    const d = decideClipMarker(at({ nowMs: STARTED }));
    expect(d.record).toBe(true);
    if (!d.record) throw new Error('unreachable');
    expect(d.marker.timecodeSeconds).toBe(0);
  });
});

describe('what must never produce a marker', () => {
  it('a class that is not being broadcast', () => {
    // Teaching without airing is normal. Markers are a by-product of airing.
    expect(decideClipMarker(at({ occurrenceId: null })))
      .toEqual({ record: false, reason: 'no_occurrence' });
  });

  it('an occurrence that is not on air', () => {
    for (const state of ['scheduled', 'backstage', 'ended', 'replay_ready', 'cancelled']) {
      expect(decideClipMarker(at({ editorialState: state })))
        .toEqual({ record: false, reason: 'not_on_air' });
    }
  });

  it('CONTROL: the on-air states DO produce one', () => {
    // Without this, every refusal above could be a function that never records anything.
    for (const state of ['live', 'reconnecting']) {
      expect(decideClipMarker(at({ editorialState: state })).record).toBe(true);
    }
  });

  it('a show with no content anchor, because "how far in" has no answer', () => {
    expect(decideClipMarker(at({ contentStartedAtMs: null })))
      .toEqual({ record: false, reason: 'no_content_anchor' });
  });

  it('an advance the server cannot place on the current spec', () => {
    expect(decideClipMarker(at({ slide: null })))
      .toEqual({ record: false, reason: 'slide_not_resolvable' });
  });

  it('a missing or nonsensical slide index', () => {
    for (const idx of [null, -1, Number.NaN]) {
      expect(decideClipMarker(at({ slideIndex: idx as number })).record).toBe(false);
    }
  });

  it('an advance that lands before content started', () => {
    expect(decideClipMarker(at({ nowMs: STARTED - 1000 })))
      .toEqual({ record: false, reason: 'before_content_start' });
  });
});

describe('a deck that has drifted from the spec', () => {
  it('refuses rather than labelling a clip with the wrong slide', () => {
    // An open deck tab is a frozen snapshot of the timeline. Edit the timeline mid-class and
    // index 12 means a different slide on each side. Presenter notes already refuse here; a
    // silently mislabelled clip is harder to notice than a blank note.
    const d = decideClipMarker(at({ deckTitle: 'Some slide that was there an hour ago' }));

    expect(d).toEqual({ record: false, reason: 'deck_drifted' });
  });

  it('does not require the deck to assert a title at all', () => {
    // Older decks, and the rehearse mode, may not send one. Absence is not drift.
    expect(decideClipMarker(at({ deckTitle: null })).record).toBe(true);
  });
});

describe('the timecode a human reads', () => {
  it('is mm:ss under an hour', () => {
    expect(formatTimecode(0)).toBe('00:00');
    expect(formatTimecode(167)).toBe('02:47');
    expect(formatTimecode(3599)).toBe('59:59');
  });

  it('grows an hours field rather than running past 59 minutes', () => {
    expect(formatTimecode(3600)).toBe('1:00:00');
    expect(formatTimecode(3767)).toBe('1:02:47');
  });

  it('never renders a negative time', () => {
    expect(formatTimecode(-5)).toBe('00:00');
  });
});
