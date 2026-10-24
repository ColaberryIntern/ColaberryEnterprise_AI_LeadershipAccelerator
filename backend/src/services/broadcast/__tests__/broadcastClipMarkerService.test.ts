import { recordClipMarker, type ClipMarkerDeps } from '../broadcastClipMarkerService';

/**
 * L7.3 — recording the marker, as the advance actually runs it.
 *
 * The policy is pinned purely elsewhere. What these pin is what a pure test cannot reach: that
 * this NEVER throws into the instructor's request, that it does not reach for a slide spec when
 * there is no airing to mark into, and that the drift guard is actually consulted with the
 * server's slide rather than the deck's claim.
 */

const STARTED = Date.parse('2026-10-24T14:00:00.000Z');
const NOW = STARTED + 167_000;

const occurrence = (over: Record<string, unknown> = {}) => ({
  id: 'occ-1', editorial_state: 'live', content_started_at: new Date(STARTED), ...over,
});

const slide = (over: Record<string, unknown> = {}) => ({
  title: 'Prove it', segmentId: 'build', segmentLabel: 'Build Block',
  publicValue: 'The moment it works', ...over,
});

function harness(over: Partial<ClipMarkerDeps> = {}) {
  const insert = jest.fn().mockResolvedValue(undefined);
  const resolveSlide = jest.fn().mockResolvedValue(slide());
  const loadOccurrence = jest.fn().mockResolvedValue(occurrence());
  const logged: string[] = [];

  const deps: ClipMarkerDeps = {
    loadOccurrence, resolveSlide, insert, log: (l) => { logged.push(l); }, ...over,
  };
  return {
    deps, insert, resolveSlide, loadOccurrence, logged,
    run: () => recordClipMarker({
      sessionId: 'sess-1', slideIndex: 12, deckTitle: 'Prove it', nowMs: NOW,
    }, deps),
  };
}

const events = (lines: string[]) => lines.map((l) => JSON.parse(l));

describe('marking the moment', () => {
  it('writes the marker with its position in the recording', async () => {
    const h = harness();
    const reason = await h.run();

    expect(reason).toBe('recorded');
    expect(h.insert).toHaveBeenCalledWith('occ-1', expect.objectContaining({
      slideIndex: 12, timecodeSeconds: 167, label: 'The moment it works',
    }));
  });

  it('says what it marked, for the log a human reads afterwards', async () => {
    const h = harness();
    await h.run();

    const line = events(h.logged).find((l) => l.event === 'broadcast_clip_marked');
    expect(line.context).toMatchObject({
      occurrenceId: 'occ-1', slideIndex: 12, timecodeSeconds: 167,
    });
  });
});

describe('when there is nothing to mark into', () => {
  it('does not even build the slide spec with no airing', async () => {
    // Building the spec is the expensive half. Every class that is taught without being
    // broadcast would otherwise pay for it on every single advance.
    const h = harness({ loadOccurrence: jest.fn().mockResolvedValue(null) });
    const reason = await h.run();

    expect(reason).toBe('no_occurrence');
    expect(h.resolveSlide).not.toHaveBeenCalled();
    expect(h.insert).not.toHaveBeenCalled();
  });

  it('refuses an occurrence that is not on air', async () => {
    const h = harness({ loadOccurrence: jest.fn().mockResolvedValue(occurrence({ editorial_state: 'backstage' })) });
    expect(await h.run()).toBe('not_on_air');
    expect(h.insert).not.toHaveBeenCalled();
  });

  it('refuses a show with no content anchor', async () => {
    const h = harness({ loadOccurrence: jest.fn().mockResolvedValue(occurrence({ content_started_at: null })) });
    expect(await h.run()).toBe('no_content_anchor');
  });

  it('refuses when the index is past the end of the current spec', async () => {
    const h = harness({ resolveSlide: jest.fn().mockResolvedValue(null) });
    expect(await h.run()).toBe('slide_not_resolvable');
    expect(h.insert).not.toHaveBeenCalled();
  });
});

describe('a deck that has drifted', () => {
  it('refuses rather than labelling the clip with the wrong slide', async () => {
    // The deck tab froze its slide list at Present time. If the timeline has been edited since,
    // index 12 is a different slide on each side.
    const h = harness({ resolveSlide: jest.fn().mockResolvedValue(slide({ title: 'Something else entirely' })) });

    expect(await h.run()).toBe('deck_drifted');
    expect(h.insert).not.toHaveBeenCalled();
  });

  it('uses the SERVER slide for the label, not the deck title', async () => {
    const h = harness({
      resolveSlide: jest.fn().mockResolvedValue(slide({ publicValue: 'Server-authored label' })),
    });
    await h.run();

    expect(h.insert.mock.calls[0][1].label).toBe('Server-authored label');
  });
});

describe('it can never break the show', () => {
  it('swallows a failed write and says so', async () => {
    const h = harness({ insert: jest.fn().mockRejectedValue(new Error('connection terminated')) });

    await expect(h.run()).resolves.toBe('failed');
    const line = events(h.logged).find((l) => l.event === 'broadcast_clip_mark_failed');
    expect(line.outcome).toBe('failure');
  });

  it('swallows a failed occurrence lookup', async () => {
    const h = harness({ loadOccurrence: jest.fn().mockRejectedValue(new Error('db down')) });
    await expect(h.run()).resolves.toBe('failed');
  });

  it('swallows a spec build that throws', async () => {
    const h = harness({ resolveSlide: jest.fn().mockRejectedValue(new Error('kit spec exploded')) });
    await expect(h.run()).resolves.toBe('failed');
  });

  it('CONTROL: the same harness DOES record when nothing fails', async () => {
    // Without this, every "swallows" test above could pass against a function that always fails.
    expect(await harness().run()).toBe('recorded');
  });
});
