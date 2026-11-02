import {
  buildRundown,
  type DeckPosition,
  type RundownSlide,
} from '../broadcastRundown';
import { decideClipMarker, deckHasDrifted } from '../broadcastClipMarkerPolicy';

/**
 * The rundown's arithmetic, and the one guarantee it shares with the clip marker.
 *
 * Pure throughout: no database, no clock. The verdict a producer reads (on time / behind) is
 * computed on the client against `content_started_at`, so there is deliberately nothing here
 * about elapsed time — this module answers only what the plan is and where the show sits in it.
 */

/** A Thursday-shaped plan: three segments, nine slides, planned windows in order. */
function thursday(): RundownSlide[] {
  const s = (segmentId: string, segmentLabel: string, segStartMin: number, segEndMin: number) =>
    (title: string): RundownSlide => ({ segmentId, segmentLabel, segStartMin, segEndMin, title });
  const preview = s('result-preview', 'Result preview', 0, 5);
  const map = s('build-map', 'Build map', 5, 25);
  const build = s('guided-build', 'Guided Claude Code build', 25, 75);
  return [
    preview('What you are building'),
    preview('The finished thing'),
    map('Checkpoints'),
    map('Safety rules'),
    map('Where it breaks'),
    build('Checkpoint 1'),
    build('Checkpoint 2'),
    build('Checkpoint 3'),
    build('Checkpoint 4'),
  ];
}

const nowhere: DeckPosition = { slideIndex: null, deckTitle: null };

describe('buildRundown — the plan', () => {
  it('groups the slides into segments with their planned windows and slide spans', () => {
    const r = buildRundown(thursday(), nowhere);
    expect(r.segments.map((s) => s.id)).toEqual(['result-preview', 'build-map', 'guided-build']);
    expect(r.segments.map((s) => s.slideCount)).toEqual([2, 3, 4]);
    expect(r.segments.map((s) => [s.firstSlide, s.lastSlide])).toEqual([[0, 1], [2, 4], [5, 8]]);
    expect(r.segments[1]).toMatchObject({
      label: 'Build map', plannedStartMin: 5, plannedEndMin: 25,
    });
    expect(r.slideCount).toBe(9);
    expect(r.totalMinutes).toBe(75);
  });

  it('KEEPS THE ORDER THE DECK WALKS, not the order the clock implies', () => {
    /**
     * A plan whose segments are authored out of chronological order. First-appearance order is
     * what a producer experiences, so a sort on `plannedStartMin` would quietly show them a
     * rundown in an order the show never takes.
     */
    const slides: RundownSlide[] = [
      { segmentId: 'late', segmentLabel: 'Late', segStartMin: 60, segEndMin: 90, title: 'A' },
      { segmentId: 'early', segmentLabel: 'Early', segStartMin: 0, segEndMin: 10, title: 'B' },
    ];
    const r = buildRundown(slides, nowhere);
    expect(r.segments.map((s) => s.id)).toEqual(['late', 'early']);
    // And the total is the furthest planned end, not the last segment's — otherwise a progress
    // marker would sit past the end of its own bar.
    expect(r.totalMinutes).toBe(90);
  });

  it('falls back to the segment id, then to a placeholder, when no label was authored', () => {
    const r = buildRundown([
      { segmentId: 'reset', segmentLabel: '', segStartMin: 0, segEndMin: 5, title: 'A' },
      { segmentId: '', segmentLabel: '', segStartMin: 5, segEndMin: 9, title: 'B' },
    ], nowhere);
    expect(r.segments.map((s) => s.label)).toEqual(['reset', 'Untitled segment']);
  });

  it('returns an empty rundown for a session with no slides at all', () => {
    const r = buildRundown([], nowhere);
    expect(r.segments).toEqual([]);
    expect(r.totalMinutes).toBe(0);
    expect(r.positionState).toBe('no_position');
  });
});

describe('buildRundown — where the show is', () => {
  it('marks done, current and upcoming around the slide the deck is on', () => {
    const r = buildRundown(thursday(), { slideIndex: 3, deckTitle: 'Safety rules' });
    expect(r.positionState).toBe('on_segment');
    expect(r.currentSegmentId).toBe('build-map');
    expect(r.currentSlideTitle).toBe('Safety rules');
    expect(r.segments.map((s) => s.standing)).toEqual(['done', 'current', 'upcoming']);
  });

  it('marks the first segment current without marking anything done', () => {
    const r = buildRundown(thursday(), { slideIndex: 0, deckTitle: 'What you are building' });
    expect(r.segments.map((s) => s.standing)).toEqual(['current', 'upcoming', 'upcoming']);
  });

  it('SAYS NOTHING HAS BEEN PRESENTED rather than putting the show at the start', () => {
    // The ordinary state of most sessions: taught without ever being presented from the deck,
    // so no broadcast row exists. Marking segment one `current` would read as a show in
    // progress, which is the opposite of true.
    const r = buildRundown(thursday(), nowhere);
    expect(r.positionState).toBe('no_position');
    expect(r.currentSegmentId).toBeNull();
    expect(r.segments.every((s) => s.standing === 'upcoming')).toBe(true);
  });

  it('separates an index that never arrived from one that failed to resolve', () => {
    /**
     * The split is on whether an index arrived, NOT on whether it worked — and it is the reason
     * `DeckPosition.slideIndex` is `unknown` rather than narrowed by the caller. "Nobody has
     * presented this class" is the ordinary state of most sessions; "the broadcast row holds
     * something the deck never writes" is a contract violation. Collapsing the second into the
     * first gives a producer the reassuring answer and the wrong one.
     */
    expect(buildRundown(thursday(), nowhere).positionState).toBe('no_position');
    expect(buildRundown(thursday(), { slideIndex: undefined, deckTitle: null }).positionState)
      .toBe('no_position');

    (['99', -1, 2.5, 99, true, {}, NaN] as unknown[]).forEach((slideIndex) => {
      expect(buildRundown(thursday(), { slideIndex, deckTitle: null }).positionState)
        .toBe('unresolvable');
    });
  });

  it('keeps the unresolvable index itself, because the number is the diagnosis', () => {
    // "Slide 40 of 9" is what tells a producer the deck is on a longer list than the server.
    const r = buildRundown(thursday(), { slideIndex: 40, deckTitle: null });
    expect(r.currentSlideIndex).toBe(40);
    expect(r.currentSegmentId).toBeNull();
  });
});

describe('buildRundown — drift', () => {
  it('REFUSES A POSITION when the deck is on a different slide list, and names both titles', () => {
    /**
     * The index resolved, so a naive reading would highlight a segment with full confidence.
     * It means different things on each side, so there is no position to report — and the same
     * disagreement is causing every clip marker for this advance to be discarded.
     */
    const r = buildRundown(thursday(), { slideIndex: 3, deckTitle: 'Something else entirely' });
    expect(r.positionState).toBe('deck_drifted');
    expect(r.currentSegmentId).toBeNull();
    expect(r.segments.every((s) => s.standing === 'upcoming')).toBe(true);
    // Two titles side by side is what makes the report actionable rather than alarming.
    expect(r.currentSlideTitle).toBe('Safety rules');
    expect(r.deckClaimedTitle).toBe('Something else entirely');
    expect(r.currentSlideIndex).toBe(3);
  });

  it('takes an older deck at its word when it sends no title', () => {
    // The title field postdates the deck. Refusing a position for a tab that predates it would
    // take the rundown away from the surface most likely to need one.
    const r = buildRundown(thursday(), { slideIndex: 3, deckTitle: null });
    expect(r.positionState).toBe('on_segment');
    expect(r.currentSegmentId).toBe('build-map');
  });

  it('CANNOT DISAGREE WITH THE CLIP MARKER about what counts as drift', () => {
    /**
     * The load-bearing test in this file. Both surfaces resolve the same slide index against
     * the same spec, and the failure worth preventing is this rundown reporting a confident
     * position while `decideClipMarker` silently drops every marker for the same advance as
     * `deck_drifted`. They share one predicate; this proves the two answers move together.
     */
    const serverTitle = 'Safety rules';
    const cases: (string | null)[] = [null, '', serverTitle, 'Safety Rules', 'Something else'];

    cases.forEach((deckTitle) => {
      const markerRefused = decideClipMarker({
        occurrenceId: 'occ-1',
        editorialState: 'live',
        contentStartedAtMs: 1_000,
        nowMs: 61_000,
        slideIndex: 3,
        deckTitle,
        slide: { title: serverTitle, segmentId: 'build-map', segmentLabel: 'Build map' },
      });
      const driftedForMarker = !markerRefused.record && markerRefused.reason === 'deck_drifted';
      const driftedForRundown =
        buildRundown(thursday(), { slideIndex: 3, deckTitle }).positionState === 'deck_drifted';

      expect(driftedForRundown).toBe(driftedForMarker);
      // And both of them are the one predicate, rather than two implementations that agree
      // today on the five inputs above.
      expect(driftedForMarker).toBe(deckHasDrifted(deckTitle, serverTitle));
    });
  });

  it('is case- and whitespace-sensitive, which is the conservative direction', () => {
    // A title that differs only in case is still a different slide list as far as anything here
    // can tell. Normalising would make drift harder to see, and the cost of a missed drift is a
    // clip list quietly short of rows.
    expect(deckHasDrifted('Safety rules ', 'Safety rules')).toBe(true);
    expect(deckHasDrifted('safety rules', 'Safety rules')).toBe(true);
    expect(deckHasDrifted('Safety rules', 'Safety rules')).toBe(false);
  });
});
