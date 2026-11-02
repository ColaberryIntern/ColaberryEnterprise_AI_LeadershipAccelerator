import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import ProducerRundown from '../ProducerRundown';
import type {
  ProducerOccurrence, RundownResult, RundownSegment,
} from '../../../services/broadcastProducer';

/**
 * P4-02's segment rundown.
 *
 * The tests that matter are the ones about what it refuses to claim. A rundown that highlights a
 * segment it is not sure about is worse than one that highlights nothing, because a producer
 * acts on the highlight — and the position can be wrong for three different reasons, one of
 * which means the clip list for the class is quietly losing rows.
 */

const T0 = Date.parse('2026-11-01T18:00:00.000Z');
const min = (n: number) => n * 60_000;

const segment = (over: Partial<RundownSegment> = {}): RundownSegment => ({
  id: 'build-map',
  label: 'Build map',
  planned_start_min: 5,
  planned_end_min: 25,
  first_slide: 2,
  last_slide: 4,
  slide_count: 3,
  standing: 'current',
  ...over,
});

const plan = (over: Partial<RundownResult> = {}): RundownResult => ({
  outcome: 'ok',
  totalMinutes: 75,
  slideCount: 9,
  positionState: 'on_segment',
  currentSegmentId: 'build-map',
  currentSlideIndex: 3,
  currentSlideTitle: 'Safety rules',
  deckClaimedTitle: null,
  segments: [
    segment({
      id: 'result-preview', label: 'Result preview', planned_start_min: 0, planned_end_min: 5,
      first_slide: 0, last_slide: 1, slide_count: 2, standing: 'done',
    }),
    segment(),
    segment({
      id: 'guided-build', label: 'Guided Claude Code build', planned_start_min: 25,
      planned_end_min: 75, first_slide: 5, last_slide: 8, slide_count: 4, standing: 'upcoming',
    }),
  ],
  ...over,
});

const occurrence = (
  over: Partial<Pick<ProducerOccurrence, 'editorial_state' | 'content_started_at'>> = {},
) => ({
  editorial_state: 'live',
  content_started_at: new Date(T0).toISOString(),
  ...over,
});

let container: HTMLDivElement;
let root: Root;
let load: jest.Mock;

async function render(
  rundown: RundownResult = plan(),
  occ = occurrence(),
  now = T0 + min(14),
) {
  load = jest.fn().mockResolvedValue(rundown);
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(
      <ProducerRundown sessionId="s1" occurrence={occ} now={now} load={load} />,
    );
  });
}

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  jest.clearAllMocks();
  jest.useRealTimers();
});

const find = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const text = () => container.textContent || '';

describe('when there is nothing to show', () => {
  it('renders NOTHING for a session with no run of show', async () => {
    // `none` is the server saying this class has no plan to render. An empty heading would be a
    // section announcing that it has nothing to say.
    await render({ outcome: 'none' });
    expect(find('producer-rundown')).toBeNull();
    expect(text()).toBe('');
  });

  it('renders nothing when the server declines the read', async () => {
    await render({ outcome: 'forbidden' });
    expect(find('producer-rundown')).toBeNull();
  });

  it('renders nothing when the read never landed, rather than an empty table', async () => {
    // An empty rundown would assert that this class has no segments, which is a different and
    // wrong statement from "we could not ask".
    await render({ outcome: 'failed' });
    expect(find('producer-rundown')).toBeNull();
  });

  it('renders nothing for a plan that came back with no segments in it', async () => {
    await render(plan({ segments: [] }));
    expect(find('producer-rundown')).toBeNull();
  });
});

describe('the plan', () => {
  it('lists the segments with their planned windows and slide counts', async () => {
    await render();
    const row = find('rundown-segment-build-map')!;
    expect(row.textContent).toContain('Build map');
    expect(row.textContent).toContain('5–25 min');
    expect(find('rundown-plan')!.textContent).toBe('75 min planned · 3 segments');
  });

  it('marks exactly one segment current, and the ones before it done', async () => {
    await render();
    const standings = [...container.querySelectorAll('.cpr-row')]
      .map((r) => r.getAttribute('data-standing'));
    expect(standings).toEqual(['done', 'current', 'upcoming']);
  });

  it('says WHICH SLIDE of the current segment, on that row only', async () => {
    /**
     * The reading the planned window cannot give. Five minutes into a fifty-minute guided build,
     * "slide 2 of 3" is what says whether the class is actually moving.
     */
    await render();
    expect(find('rundown-segment-build-map')!.textContent).toContain('slide 2 of 3');
    expect(find('rundown-segment-result-preview')!.textContent).not.toContain('slide');
    expect(find('rundown-segment-guided-build')!.textContent).not.toContain('slide');
  });

  it('omits the slide position when the index falls outside the segment it claims', async () => {
    // Defensive rather than expected: a server answer that puts the cursor outside the current
    // segment's own span is a contract violation, and "slide -2 of 3" would be the visible form
    // of it. Nothing is shown instead.
    await render(plan({ currentSlideIndex: 40 }));
    expect(find('rundown-segment-build-map')!.textContent).not.toContain('slide');
  });
});

describe('the pace', () => {
  it('reads on time inside the planned window', async () => {
    await render(plan(), occurrence(), T0 + min(14));
    expect(find('rundown-pace')!.textContent).toBe('on time');
    expect(find('rundown-pace')!.getAttribute('data-verdict')).toBe('on_time');
  });

  it('reads behind, in whole minutes, once the segment has overrun', async () => {
    await render(plan(), occurrence(), T0 + min(31));
    expect(find('rundown-pace')!.textContent).toBe('behind 6 min');
  });

  it('SHOWS NO VERDICT rather than a stale one on a class that has ended', async () => {
    // The clock in the strip above already says how long it ran. A pace verdict afterwards is
    // a judgement nobody can act on that then sits there until the page is closed.
    await render(plan(), occurrence({ editorial_state: 'ended' }), T0 + min(31));
    expect(find('producer-rundown')).not.toBeNull();
    expect(find('rundown-pace')).toBeNull();
    expect(find('rundown-track')).toBeNull();
  });

  it('shows the plan with no verdict before anybody marked content as started', async () => {
    await render(
      plan({ positionState: 'no_position', currentSegmentId: null, currentSlideIndex: null }),
      occurrence({ editorial_state: 'backstage', content_started_at: null }),
    );
    expect(find('producer-rundown')).not.toBeNull();
    expect(find('rundown-pace')).toBeNull();
    expect(find('rundown-position-note')!.textContent).toContain('Nothing has been presented yet');
  });
});

describe('a position that cannot be believed', () => {
  it('NAMES BOTH TITLES on drift, and says the clip list is losing rows', async () => {
    /**
     * The most valuable thing this component does. Drift means the instructor's Present tab is a
     * frozen copy of an edited timeline — and while it lasts, `decideClipMarker` discards every
     * marker for the class as `deck_drifted`, reporting it to a server log and nobody else.
     */
    await render(plan({
      positionState: 'deck_drifted',
      currentSegmentId: null,
      currentSlideTitle: 'Safety rules',
      deckClaimedTitle: 'An older slide',
      segments: plan().segments!.map((s) => ({ ...s, standing: 'upcoming' as const })),
    }));

    const note = find('rundown-position-note')!;
    expect(note.getAttribute('data-tone')).toBe('warn');
    expect(note.textContent).toContain('An older slide');
    expect(note.textContent).toContain('Safety rules');
    expect(note.textContent).toMatch(/clip marker/i);
    expect(note.textContent).toMatch(/Re-open Present/i);
    // And no segment is highlighted: the index means different things on each side, so there is
    // no position to report.
    expect(container.querySelector('.cpr-row[data-standing="current"]')).toBeNull();
    expect(find('rundown-pace')).toBeNull();
  });

  it('gives both numbers when the index is past the end of the plan', async () => {
    await render(plan({
      positionState: 'unresolvable',
      currentSegmentId: null,
      currentSlideIndex: 40,
      slideCount: 9,
      segments: plan().segments!.map((s) => ({ ...s, standing: 'upcoming' as const })),
    }));
    const note = find('rundown-position-note')!;
    expect(note.textContent).toContain('slide 40');
    expect(note.textContent).toContain('9');
    expect(note.getAttribute('data-tone')).toBe('warn');
  });

  it('DOES NOT WRITE "slide ," when the position is not a number at all', async () => {
    /**
     * The broadcast row is JSONB, so `slide_index` can hold something the deck never writes. The
     * server reports that as unresolvable with no index — and the sentence with the number in it
     * would then render "The deck is on slide , and this plan has 9", which reads as a bug in the
     * panel rather than a fault in the show. Different sentence, no quantity claimed.
     */
    await render(plan({
      positionState: 'unresolvable',
      currentSegmentId: null,
      currentSlideIndex: null,
      slideCount: 9,
      segments: plan().segments!.map((s) => ({ ...s, standing: 'upcoming' as const })),
    }));
    const note = find('rundown-position-note')!;
    expect(note.textContent).not.toMatch(/slide\s*,/);
    expect(note.textContent).toMatch(/position cannot be read/i);
    expect(note.getAttribute('data-tone')).toBe('warn');
  });

  it('says nothing at all when the position IS trustworthy', async () => {
    await render();
    expect(find('rundown-position-note')).toBeNull();
  });
});

describe('polling', () => {
  it('re-reads while the show can still be advanced', async () => {
    jest.useFakeTimers();
    await render();
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => { jest.advanceTimersByTime(10_000); });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('READS ONCE AND STOPS for an airing nobody can advance', async () => {
    // A poll that runs for the rest of the page's life to re-fetch a frozen answer is the same
    // waste the clock's tick already refuses.
    jest.useFakeTimers();
    await render(plan(), occurrence({ editorial_state: 'replay_ready' }));
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => { jest.advanceTimersByTime(60_000); });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('keeps the last good answer on screen when a later read fails', async () => {
    // This is a reference panel, not the thing putting the class on air: a transient failure
    // must not blank it, and is not worth a notice of its own.
    jest.useFakeTimers();
    await render();
    expect(find('rundown-segment-build-map')).not.toBeNull();
    load.mockRejectedValue(new Error('offline'));
    await act(async () => { jest.advanceTimersByTime(10_000); });
    expect(find('rundown-segment-build-map')).not.toBeNull();
  });
});
