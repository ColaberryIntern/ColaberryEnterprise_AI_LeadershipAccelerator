/**
 * The show's rundown — which segment is on air, what the plan said, and where the show sits
 * against it. P4-02's last open item (docs/COLABERRY_LIVE_PROGRAM_SPEC.md §9 item 3).
 *
 * WHY THIS IS A READER AND NOT A FEATURE. Everything a rundown needs has existed for weeks and
 * has never met in one place:
 *
 *   - the run of show, authored per day kind and scaled to the session's real duration, is on
 *     every slide the kit builder produces (`segmentId`, `segmentLabel`, `segStartMin`,
 *     `segEndMin` — `classKit/kitSpec.ts`);
 *   - the show's position is `slide_index` inside `session_broadcast.state`, written by the
 *     deck on every advance;
 *   - the only trustworthy class clock is `content_started_at` on the occurrence.
 *
 * The one surface that joins them today is the deck's own pace bar, and it is inside the
 * instructor's Present tab — which is also the screen-recording source. A producer standing
 * anywhere else, including on the producer strip this feeds, has never been able to see it.
 *
 * THERE ARE TWO CLASS CLOCKS AND THEY HAVE NEVER MET. The deck's pace bar measures from
 * `localStorage.kit_start_<sessionId>`, set by a button labeled "Start class"
 * (`classKit/kitDeckScript.ts`): per-browser, resettable, gone if the tab is opened on another
 * machine, and absent entirely if the instructor forgets to press it. The broadcast measures
 * from `content_started_at`, a column written by a producer command that `go_live` refuses
 * without. `broadcastClipMarkerPolicy.ts` already picked the second one and said why. This
 * module uses the same anchor, so the rundown and the clip list can never disagree about which
 * second was minute 0 of the same class. The deck is not changed here — see the spec finding.
 *
 * THE SEGMENTS ARE DERIVED FROM THE SLIDES, not from a second list. `KitSpec` also carries
 * `segments`, but `slidesForSession` returns only the slides, and the slides carry the same
 * planned window on every row. Reading one of them means the rundown's windows are by
 * construction the windows the slides claim. The cost is that a segment holding no slides does
 * not appear — correct for a producer, because the show cannot stop somewhere it has no slide.
 *
 * NOTHING HERE IS A CLOCK. The verdict (on time / behind / ahead) is computed where the tick
 * is, against the same `content_started_at` the strip's clock already reads. This module
 * answers only "what is the plan and where are we in it", which is the half that needs no
 * notion of now.
 */
import { deckHasDrifted } from './broadcastClipMarkerPolicy';

/**
 * The slide fields a rundown needs, and deliberately nothing else.
 *
 * A structural subset of `KitSlide` rather than an import of it: this module is pure, and
 * pulling the kit spec's types in would put the deck builder's module graph behind a function
 * whose whole job is arithmetic on five fields.
 */
export interface RundownSlide {
  segmentId: string;
  segmentLabel: string;
  segStartMin: number;
  segEndMin: number;
  title: string;
}

/**
 * Where the deck says the show is.
 *
 * Both fields can be absent, and that is the ordinary case rather than an error: a class that
 * has not been presented yet has never written a broadcast row, so it has no position at all.
 */
export interface DeckPosition {
  /**
   * `unknown`, AND THAT IS THE POINT. This value comes straight out of `session_broadcast.state`,
   * a JSONB column, so nothing about its shape is guaranteed by a type. Narrowing it at the
   * route boundary looked tidier and was wrong: collapsing a non-number to `null` there would
   * report a deck that sent `"2"` as a class nobody has presented, which is a different and more
   * reassuring statement than the truth. The distinction between "no index arrived" and "an
   * index arrived and could not be used" is the whole of `PositionState`, so the narrowing
   * belongs in the one place that owns that answer.
   */
  slideIndex: unknown;
  /**
   * What the deck asserted the slide at that index was. Used ONLY to detect drift, never as
   * content — the same rule, for the same reason, as `MarkerInput.deckTitle`.
   */
  deckTitle: string | null;
}

/** Where a segment stands relative to the one on air. */
export type SegmentStanding = 'done' | 'current' | 'upcoming';

export interface RundownSegment {
  id: string;
  label: string;
  /** Minutes from content start, as authored and scaled to this session's duration. */
  plannedStartMin: number;
  plannedEndMin: number;
  /** The span of slides that belong to this segment, as indices into the same list. */
  firstSlide: number;
  lastSlide: number;
  slideCount: number;
  standing: SegmentStanding;
}

/**
 * Whether the position can be believed, and if not, which way it failed.
 *
 *  - `on_segment`   the index resolved and the deck agrees about what is there.
 *  - `deck_drifted` the index resolved to a different slide than the deck claims. The index
 *                   means different things on each side, so there is NO trustworthy position —
 *                   and clip markers are being dropped for the same reason, silently.
 *  - `unresolvable` the index is past the end of the current spec.
 *  - `no_position`  nothing has been presented yet. Not a fault.
 */
export type PositionState = 'on_segment' | 'deck_drifted' | 'unresolvable' | 'no_position';

export interface Rundown {
  segments: RundownSegment[];
  /** The plan's own length in minutes — the last segment's end, not a session duration guess. */
  totalMinutes: number;
  slideCount: number;
  positionState: PositionState;
  /** Null whenever `positionState` is anything but `on_segment`. */
  currentSegmentId: string | null;
  currentSlideIndex: number | null;
  /** The server's own title for the current slide. Null unless the position is trustworthy. */
  currentSlideTitle: string | null;
  /**
   * What the deck claimed, carried only when it disagrees with the server. Two titles side by
   * side is what makes a drift report actionable instead of alarming.
   */
  deckClaimedTitle: string | null;
}

const EMPTY: Rundown = {
  segments: [],
  totalMinutes: 0,
  slideCount: 0,
  positionState: 'no_position',
  currentSegmentId: null,
  currentSlideIndex: null,
  currentSlideTitle: null,
  deckClaimedTitle: null,
};

/**
 * Group the slides into segments, in the order they are first reached.
 *
 * First-appearance order rather than a sort on `plannedStartMin`: the order the deck walks is
 * the order a producer experiences, and if the two ever disagree the walk is the truth. A sort
 * would silently reorder the rundown away from the show.
 */
function segmentsOf(slides: RundownSlide[]): Omit<RundownSegment, 'standing'>[] {
  const byId = new Map<string, Omit<RundownSegment, 'standing'>>();
  slides.forEach((s, index) => {
    const id = s.segmentId || '';
    const held = byId.get(id);
    if (held) {
      held.lastSlide = index;
      held.slideCount += 1;
      return;
    }
    byId.set(id, {
      id,
      label: s.segmentLabel || id || 'Untitled segment',
      plannedStartMin: Number.isFinite(s.segStartMin) ? s.segStartMin : 0,
      plannedEndMin: Number.isFinite(s.segEndMin) ? s.segEndMin : 0,
      firstSlide: index,
      lastSlide: index,
      slideCount: 1,
    });
  });
  return [...byId.values()];
}

/**
 * The plan's length: the furthest planned end, not the last segment's.
 *
 * `Math.max` rather than `segments[last].plannedEndMin`, because first-appearance order is not
 * guaranteed to be chronological order — and a total shorter than a segment it contains would
 * put a progress marker past the end of its own bar.
 */
function planLength(segments: Omit<RundownSegment, 'standing'>[]): number {
  return segments.reduce((max, s) => (s.plannedEndMin > max ? s.plannedEndMin : max), 0);
}

/**
 * The rundown for one show, and an honest account of where in it the class is.
 *
 * Pure. Every branch below is a test rather than an argument, which matters more here than
 * usual: this is read while a class is on air and the cost of a confident wrong answer is a
 * producer acting on it.
 */
export function buildRundown(slides: RundownSlide[], position: DeckPosition): Rundown {
  if (!slides.length) return EMPTY;

  const bare = segmentsOf(slides);
  const base = {
    totalMinutes: planLength(bare),
    slideCount: slides.length,
  };

  /**
   * NO POSITION AND AN UNUSABLE ONE ARE DIFFERENT ANSWERS, and the split is on whether the deck
   * sent an index at all — not on whether the index worked. A class nobody has presented has
   * never written a broadcast row, which is the ordinary state of most sessions and not a
   * fault. An index that is out of range, negative or fractional came from somewhere and failed
   * to resolve, which is worth a different word even though both render the same rundown: the
   * whole plan, nothing marked current. A segment marked `current` on a guess is worth more
   * than the convenience of a highlight.
   */
  const raw = position.slideIndex;
  const plan = bare.map((s) => ({ ...s, standing: 'upcoming' as SegmentStanding }));

  if (raw === null || raw === undefined) {
    return { ...EMPTY, ...base, segments: plan, positionState: 'no_position' };
  }

  const index = typeof raw === 'number' && Number.isInteger(raw) ? raw : null;
  const slide = index !== null && index >= 0 ? slides[index] : undefined;
  if (!slide) {
    return {
      ...EMPTY,
      ...base,
      segments: plan,
      positionState: 'unresolvable',
      // Carried only when it is a number a human can read back. `"2"` and `true` are reported
      // as unresolvable with no index, because quoting the bad value into a producer's screen
      // explains nothing they can act on.
      currentSlideIndex: index,
    };
  }

  if (deckHasDrifted(position.deckTitle, slide.title)) {
    return {
      ...EMPTY,
      ...base,
      segments: plan,
      positionState: 'deck_drifted',
      // Both titles, so the report says what disagrees rather than that something does.
      currentSlideTitle: slide.title || null,
      deckClaimedTitle: position.deckTitle,
      currentSlideIndex: index,
    };
  }

  const currentId = slide.segmentId || '';
  const at = bare.findIndex((s) => s.id === currentId);

  return {
    ...base,
    segments: bare.map((s, i) => ({
      ...s,
      standing: (i < at ? 'done' : i === at ? 'current' : 'upcoming') as SegmentStanding,
    })),
    positionState: 'on_segment',
    currentSegmentId: currentId || null,
    currentSlideIndex: index,
    currentSlideTitle: slide.title || null,
    deckClaimedTitle: null,
  };
}
