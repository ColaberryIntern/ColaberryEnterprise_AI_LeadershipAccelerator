jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));

import { recordLiveClipMark, type LiveMarkDeps } from '../broadcastClipMarkService';
import { LIVE_MARK_LABEL } from '../broadcastClipMarkerPolicy';

/**
 * D10 — a producer presses "mark this moment", and finds out whether it worked.
 *
 * THE DIFFERENCE FROM ITS SIBLING IS THE WHOLE POINT. `recordClipMarker` runs inside the deck's
 * advance request and must never be able to break the show, so it swallows everything and the
 * caller does not await it. That is right there and would be wrong here: a press is a person
 * pressing a button and then looking at the screen. Swallowing a failure would mean a producer
 * believing a moment was captured, and discovering after the class that it is not in the list.
 *
 * So every path returns an outcome, including the two that are easy to conflate: a press that
 * wrote a row, and a press that hit the second a mark already exists on.
 */

const STARTED = new Date('2026-10-24T14:00:00.000Z');
const NOW = STARTED.getTime() + 167_000; // 2m47s in

const deps = (over: Partial<LiveMarkDeps> = {}): LiveMarkDeps => ({
  loadOccurrence: jest.fn().mockResolvedValue({
    id: 'occ-1', editorial_state: 'live', content_started_at: STARTED,
  }),
  loadDeckPosition: jest.fn().mockResolvedValue({ slideIndex: 12, title: 'Prove it' }),
  resolveSlide: jest.fn().mockResolvedValue({
    title: 'Prove it', segmentId: 'build', segmentLabel: 'Build Block',
    publicValue: 'The 90-second it-actually-works moment',
  }),
  insert: jest.fn().mockResolvedValue(true),
  log: jest.fn(),
  ...over,
});

describe('a press that lands', () => {
  it('writes the mark and reports where it landed', async () => {
    const d = deps();
    const r = await recordLiveClipMark({ sessionId: 's1', nowMs: NOW }, d);

    expect(r).toEqual({ outcome: 'marked', timecodeSeconds: 167, labelled: true });
    expect(d.insert).toHaveBeenCalledWith('occ-1', expect.objectContaining({
      timecodeSeconds: 167,
      slideIndex: 12,
      label: 'The 90-second it-actually-works moment',
      labelled: true,
    }));
  });

  it('takes NOTHING about the moment from the caller', async () => {
    // The context carries a session id and the clock, and that is all. A client that could name
    // its own timecode or slide could point a clip anywhere in the recording.
    const d = deps();
    await recordLiveClipMark({ sessionId: 's1', nowMs: NOW }, d);

    expect(d.loadOccurrence).toHaveBeenCalledWith('s1');
    expect(d.loadDeckPosition).toHaveBeenCalledWith('s1');
  });
});

describe('a press that is the same press twice', () => {
  /**
   * THE CASE THAT WOULD OTHERWISE REPORT SUCCESS.
   *
   * The insert is ON CONFLICT DO NOTHING against (occurrence_id, timecode_seconds), so the
   * second press in a second writes nothing. Without the RETURNING clause behind `insert`, that
   * is indistinguishable from a write, and a producer pressing twice would be told twice that a
   * moment was captured.
   */
  it('says duplicate rather than claiming a second mark', async () => {
    const d = deps({ insert: jest.fn().mockResolvedValue(false) });
    const r = await recordLiveClipMark({ sessionId: 's1', nowMs: NOW }, d);

    expect(r).toEqual({ outcome: 'duplicate', timecodeSeconds: 167 });
  });
});

describe('a press that cannot land', () => {
  it('refuses when the class is not airing, and says why', async () => {
    const d = deps({
      loadOccurrence: jest.fn().mockResolvedValue({
        id: 'occ-1', editorial_state: 'backstage', content_started_at: STARTED,
      }),
    });

    expect(await recordLiveClipMark({ sessionId: 's1', nowMs: NOW }, d))
      .toEqual({ outcome: 'refused', reason: 'not_on_air' });
  });

  it('refuses before content has started, which is what the button waits for', async () => {
    const d = deps({
      loadOccurrence: jest.fn().mockResolvedValue({
        id: 'occ-1', editorial_state: 'live', content_started_at: null,
      }),
    });

    expect(await recordLiveClipMark({ sessionId: 's1', nowMs: NOW }, d))
      .toEqual({ outcome: 'refused', reason: 'no_content_anchor' });
  });

  it('refuses when there is no broadcast for this class at all', async () => {
    const d = deps({ loadOccurrence: jest.fn().mockResolvedValue(null) });

    expect(await recordLiveClipMark({ sessionId: 's1', nowMs: NOW }, d))
      .toEqual({ outcome: 'refused', reason: 'no_occurrence' });
  });

  it('does not write anything when it refuses', async () => {
    const d = deps({ loadOccurrence: jest.fn().mockResolvedValue(null) });
    await recordLiveClipMark({ sessionId: 's1', nowMs: NOW }, d);

    expect(d.insert).not.toHaveBeenCalled();
  });
});

describe('a press whose slide cannot be named', () => {
  it('still records the moment, unlabelled', async () => {
    // The moment happened. Discarding it because the server could not name the slide throws
    // away the only record that it did.
    const d = deps({ resolveSlide: jest.fn().mockResolvedValue(null) });
    const r = await recordLiveClipMark({ sessionId: 's1', nowMs: NOW }, d);

    expect(r).toEqual({ outcome: 'marked', timecodeSeconds: 167, labelled: false });
    expect(d.insert).toHaveBeenCalledWith('occ-1', expect.objectContaining({
      label: LIVE_MARK_LABEL, labelled: false,
    }));
  });

  it('keeps the moment and drops the label when the deck has drifted', async () => {
    const d = deps({
      loadDeckPosition: jest.fn().mockResolvedValue({ slideIndex: 12, title: 'A different slide' }),
    });
    const r = await recordLiveClipMark({ sessionId: 's1', nowMs: NOW }, d);

    expect(r).toEqual({ outcome: 'marked', timecodeSeconds: 167, labelled: false });
    expect(d.insert).toHaveBeenCalledWith('occ-1', expect.objectContaining({
      label: LIVE_MARK_LABEL, segmentLabel: '', slideTitle: '',
    }));
  });
});

describe('it never throws at the producer', () => {
  it('returns failed when the write blows up', async () => {
    const d = deps({ insert: jest.fn().mockRejectedValue(new Error('connection terminated')) });

    expect(await recordLiveClipMark({ sessionId: 's1', nowMs: NOW }, d)).toEqual({ outcome: 'failed' });
  });

  it('returns failed when the lookup blows up', async () => {
    const d = deps({ loadOccurrence: jest.fn().mockRejectedValue(new Error('nope')) });

    expect(await recordLiveClipMark({ sessionId: 's1', nowMs: NOW }, d)).toEqual({ outcome: 'failed' });
  });

  it('CONTROL: the happy path still marks, so the catches are not swallowing everything', async () => {
    expect((await recordLiveClipMark({ sessionId: 's1', nowMs: NOW }, deps())).outcome).toBe('marked');
  });
});
