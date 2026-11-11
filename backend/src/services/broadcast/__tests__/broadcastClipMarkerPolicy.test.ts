import {
  decideClipMarker, decideLiveClipMark, formatTimecode, LIVE_MARK_LABEL,
  type MarkerInput, type ResolvedSlide,
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

/**
 * D10 - A DELIBERATE PRESS, which is not an advance with a different name.
 *
 * The whole reason this is a second function rather than a flag is that the two disagree about
 * what makes a moment worth recording, and a flag would have hidden the disagreement:
 *
 *   - an advance IS its slide, so an unresolvable slide means there was no moment;
 *   - a press IS a timecode, so an unresolvable slide means an unlabelled moment.
 *
 * Getting that backwards is the expensive mistake. Somebody watching a class presses the button
 * because something good just happened, and discarding it because the server could not name the
 * slide throws away the only record that it happened at all.
 */
describe('a press, as against an advance', () => {
  it('records the timecode and the segment label when everything resolves', () => {
    const d = decideLiveClipMark(at());

    expect(d.record).toBe(true);
    if (!d.record) throw new Error('unreachable');
    expect(d.marker.timecodeSeconds).toBe(167);
    expect(d.marker.label).toBe('The 90-second "it actually works" moment');
    expect(d.labelled).toBe(true);
  });

  it('KEEPS the mark when the slide cannot be resolved, and says it is unlabelled', () => {
    // The advance path refuses here, correctly. A press must not: the moment happened.
    const d = decideLiveClipMark(at({ slide: null }));

    expect(d.record).toBe(true);
    if (!d.record) throw new Error('unreachable');
    expect(d.marker.timecodeSeconds).toBe(167);
    expect(d.marker.label).toBe(LIVE_MARK_LABEL);
    expect(d.labelled).toBe(false);
  });

  it('CONTROL: the advance path still refuses the same input', () => {
    // Without this the test above only says what this function does, not that it differs.
    const advance = decideClipMarker(at({ slide: null }));
    expect(advance.record).toBe(false);
  });

  /**
   * DRIFT KEEPS THE TIME AND DROPS THE LABEL.
   *
   * The press claims nothing, but the slide it hangs on comes from the index the DECK last
   * broadcast. A deck on a different slide list hands this a confidently wrong label, and a clip
   * labelled as the wrong segment sends an editor to the wrong part of the video - worse than a
   * clip with no label, which costs them a few seconds.
   */
  it('drops the label when the deck has drifted, but keeps the moment', () => {
    const d = decideLiveClipMark(at({ deckTitle: 'A completely different slide' }));

    expect(d.record).toBe(true);
    if (!d.record) throw new Error('unreachable');
    expect(d.marker.timecodeSeconds).toBe(167);
    expect(d.marker.label).toBe(LIVE_MARK_LABEL);
    expect(d.marker.segmentLabel).toBe('');
    expect(d.marker.slideTitle).toBe('');
    expect(d.labelled).toBe(false);
  });

  it('refuses when there is no broadcast to mark into', () => {
    expect(decideLiveClipMark(at({ occurrenceId: null })).record).toBe(false);
    expect(decideLiveClipMark(at({ editorialState: 'backstage' })).record).toBe(false);
    expect(decideLiveClipMark(at({ editorialState: 'ended' })).record).toBe(false);
  });

  it('refuses before content has started, which is what the button waits for', () => {
    // D10's own wording: enabled once content has started. Before that there is no anchor, so
    // "how far into the recording" has no answer at all.
    expect(decideLiveClipMark(at({ contentStartedAtMs: null })))
      .toEqual({ record: false, reason: 'no_content_anchor' });
    expect(decideLiveClipMark(at({ nowMs: STARTED - 1 })))
      .toEqual({ record: false, reason: 'before_content_start' });
  });

  it('refuses when the deck has never said which slide is up', () => {
    // Not the same as an unresolvable slide. Here there is no index at all, so the row has
    // nothing to put in a NOT NULL column - the refusal is honest rather than inventing a 0,
    // which is a real slide.
    expect(decideLiveClipMark(at({ slideIndex: null as unknown as number })))
      .toEqual({ record: false, reason: 'no_slide_context' });
  });

  it('marks at the same second as an advance without either blocking the other', () => {
    // They are deduped by different partial indexes, so one slide can carry both an advance
    // and a press. This asserts the POLICY produces both; the schema header explains the keys.
    const advance = decideClipMarker(at());
    const press = decideLiveClipMark(at());

    expect(advance.record).toBe(true);
    expect(press.record).toBe(true);
    if (!advance.record || !press.record) throw new Error('unreachable');
    expect(press.marker.timecodeSeconds).toBe(advance.marker.timecodeSeconds);
  });
});
