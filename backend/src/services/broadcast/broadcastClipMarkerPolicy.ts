/**
 * Where a clip starts, decided when the instructor advances the show (L7.3).
 *
 * WHAT WAS THERE BEFORE. The deck has had a "mark this moment" button for as long as it has
 * existed, and it pushes into an in-memory array that is downloadable as a CSV and lost when
 * the tab closes. Nothing server-side records a clip marker: there is no table, no endpoint and
 * no model, and no marker has ever been joined to a recording. So the editing pass after a
 * class starts from a human scrubbing a 38-minute video.
 *
 * WHAT MAKES THIS POSSIBLE NOW. Two things that did not exist a week ago. The occurrence knows
 * when content started (`content_started_at`, the preview anchor), and it knows which recording
 * it produced (`provider_instance_uuid`, bound while the show is on air by L8.4). Together they
 * turn "the instructor advanced at 14:21:06" into "02:47 into the recording", which is the only
 * form a marker is useful in.
 *
 * THE TIMECODE IS SERVER-SIDE, DELIBERATELY. The deck's own class clock lives in localStorage
 * (`kit_start_<sessionId>`), so it is per-browser, resettable, and gone when the tab closes. A
 * clip list built on it would be unreproducible. `content_started_at` is a column, set once by a
 * producer command, and it is the same anchor the preview paywall is measured from — so a marker
 * and an entitlement window can never disagree about when the class began.
 *
 * NOTHING IS GUESSED. Every branch below either produces a marker from facts that are all
 * present, or refuses and says which fact was missing. A marker pointing at the wrong second is
 * worse than no marker: it sends an editor to the wrong place and quietly wastes the thing the
 * feature exists to save.
 */

/** The authored slide, resolved SERVER-SIDE from the live kit spec — never the deck's claim. */
export interface ResolvedSlide {
  title: string;
  segmentId: string;
  segmentLabel: string;
  /** "Reminder of what this segment is worth as public content." Authored, and until now
   *  never read by any backend path. It is the clip's label. */
  publicValue?: string;
}

export interface MarkerInput {
  /** The broadcast this class is airing as, if it is airing at all. */
  occurrenceId: string | null;
  editorialState: string | null;
  /** When content started, from the occurrence. The only trustworthy class clock. */
  contentStartedAtMs: number | null;
  nowMs: number;
  /** Where the instructor just moved to. An index, never a slide id — ids are not unique. */
  slideIndex: number | null;
  /** What the deck asserted the slide was. Used ONLY to detect drift, never as content. */
  deckTitle: string | null;
  /** The same position resolved against the current spec. Null when it cannot be resolved. */
  slide: ResolvedSlide | null;
}

export interface ClipMarker {
  slideIndex: number;
  /** Seconds into the recording. Floored: a marker must never point past its moment. */
  timecodeSeconds: number;
  /** What this moment is worth as public content. */
  label: string;
  segmentId: string;
  segmentLabel: string;
  slideTitle: string;
}

/**
 * Whether the deck is looking at a different slide list than the server.
 *
 * An open deck tab is a frozen snapshot: the slide list was baked into the page when Present
 * was pressed. Edit the timeline mid-class and the server's spec no longer matches what the
 * instructor is looking at, so index 12 is a different slide on each side. `getPresenterNotes`
 * already refuses in that case rather than show notes for the wrong slide, and a marker has the
 * same obligation — a silently mislabeled clip is harder to notice than a blank note.
 *
 * EXPORTED BECAUSE A SECOND READER NOW DEPENDS ON THE SAME ANSWER. The producer rundown
 * (`broadcastRundown.ts`) resolves the current segment from the same index, so a second copy of
 * this comparison could let it report a confident position while every marker for that same
 * advance is being discarded here. One predicate means the two cannot disagree.
 *
 * A deck that sends no title cannot be checked and is taken at its word — that is the older
 * deck's behavior, preserved on purpose rather than tightened into a refusal that would reject
 * every advance from a tab that predates the field.
 */
export function deckHasDrifted(deckTitle: string | null, serverTitle: string): boolean {
  return Boolean(deckTitle) && deckTitle !== serverTitle;
}

export type MarkerDecision =
  | { record: true; marker: ClipMarker }
  | {
    record: false;
    reason:
      /** The class is not being broadcast, so there is no recording to point into. */
      | 'no_occurrence'
      | 'not_on_air'
      /** Nobody has marked content as started, so "how far in" has no answer. */
      | 'no_content_anchor'
      | 'no_slide_index'
      /** The spec could not be built, or the index is past its end. */
      | 'slide_not_resolvable'
      /** The deck is on a different slide list than the server. See below. */
      | 'deck_drifted'
      /** The advance happened before content started. */
      | 'before_content_start';
  };

/** Only an occurrence that is actually airing produces a recording to mark into. */
const ON_AIR = ['live', 'reconnecting'];

export function decideClipMarker(input: MarkerInput): MarkerDecision {
  const {
    occurrenceId, editorialState, contentStartedAtMs, nowMs, slideIndex, deckTitle, slide,
  } = input;

  if (!occurrenceId) return { record: false, reason: 'no_occurrence' };
  if (!editorialState || !ON_AIR.includes(editorialState)) {
    // A class can be taught without being broadcast, and that is normal. Markers are a
    // by-product of airing, not of teaching.
    return { record: false, reason: 'not_on_air' };
  }
  if (contentStartedAtMs === null) return { record: false, reason: 'no_content_anchor' };
  if (typeof slideIndex !== 'number' || !Number.isFinite(slideIndex) || slideIndex < 0) {
    return { record: false, reason: 'no_slide_index' };
  }
  if (!slide) return { record: false, reason: 'slide_not_resolvable' };

  // DRIFT GUARD, originally copied from `getPresenterNotes` because it is the same hazard. The
  // comparison itself now lives in `deckHasDrifted` above, because the producer rundown reads
  // the same index and must not be able to reach a different verdict about it.
  if (deckHasDrifted(deckTitle, slide.title)) {
    return { record: false, reason: 'deck_drifted' };
  }

  const elapsedMs = nowMs - contentStartedAtMs;
  if (elapsedMs < 0) return { record: false, reason: 'before_content_start' };

  return {
    record: true,
    marker: {
      slideIndex,
      // Floor, not round: a marker must land on or before its moment. Rounding up can start a
      // clip after the line it exists to capture.
      timecodeSeconds: Math.floor(elapsedMs / 1000),
      // The authored value first, because it is the one a human wrote to describe what this
      // segment is worth. The labels after it are fallbacks, not equals.
      label: (slide.publicValue || slide.segmentLabel || slide.title || '').trim(),
      segmentId: slide.segmentId,
      segmentLabel: slide.segmentLabel,
      slideTitle: slide.title,
    },
  };
}

/**
 * What a press is called when nothing better can be said about it (D10).
 *
 * Also the label the clip review shows, so an editor scanning the list can tell a moment a human
 * chose from a moment the deck produced.
 */
export const LIVE_MARK_LABEL = 'Marked live';

export type LiveMarkDecision =
  | { record: true; marker: ClipMarker; labelled: boolean }
  | {
    record: false;
    reason:
      | 'no_occurrence'
      | 'not_on_air'
      /** Content has not been marked as started, so "how far in" has no answer. */
      | 'no_content_anchor'
      | 'before_content_start'
      /** The deck has never said which slide is up, so there is nowhere to hang the mark. */
      | 'no_slide_context';
  };

/**
 * A DELIBERATE PRESS, as against an advance (D10).
 *
 * Separate from `decideClipMarker` rather than a flag on it, because the two differ on the one
 * question that matters and a flag would hide that: WHAT MAKES THE MOMENT WORTH RECORDING.
 *
 * An advance IS its slide. If the slide cannot be resolved there is nothing to record - the
 * advance was the event, and an advance to an unknown place is not a moment.
 *
 * A press is a timecode. Somebody watching the class decided that what just happened is worth
 * cutting, and that is true whether or not the server can name the slide it happened on. So an
 * unresolvable slide DOWNGRADES THE LABEL here instead of discarding the mark, and `labelled`
 * says which happened so the caller can log it honestly.
 *
 * DRIFT IS HANDLED THE SAME WAY, and this is the subtler half. The press itself claims nothing,
 * but the slide it gets attached to comes from the index the DECK last broadcast - so a deck on
 * a different slide list than the server would hand this function a confidently wrong label. It
 * reuses `deckHasDrifted`, the same predicate the advance path and the producer rundown use, and
 * on drift keeps the timecode while dropping the label. A clip with no label costs an editor a
 * few seconds; a clip labelled as the wrong segment sends them to the wrong part of the video.
 */
export function decideLiveClipMark(input: MarkerInput): LiveMarkDecision {
  const {
    occurrenceId, editorialState, contentStartedAtMs, nowMs, slideIndex, deckTitle, slide,
  } = input;

  if (!occurrenceId) return { record: false, reason: 'no_occurrence' };
  if (!editorialState || !ON_AIR.includes(editorialState)) {
    return { record: false, reason: 'not_on_air' };
  }
  if (contentStartedAtMs === null) return { record: false, reason: 'no_content_anchor' };
  if (typeof slideIndex !== 'number' || !Number.isFinite(slideIndex) || slideIndex < 0) {
    return { record: false, reason: 'no_slide_context' };
  }

  const elapsedMs = nowMs - contentStartedAtMs;
  if (elapsedMs < 0) return { record: false, reason: 'before_content_start' };

  const trusted = slide !== null && !deckHasDrifted(deckTitle, slide.title);
  const authored = trusted
    ? (slide!.publicValue || slide!.segmentLabel || slide!.title || '').trim()
    : '';

  return {
    record: true,
    labelled: authored !== '',
    marker: {
      slideIndex,
      // Floor for the same reason as an advance: a marker must land on or before its moment.
      timecodeSeconds: Math.floor(elapsedMs / 1000),
      label: authored || LIVE_MARK_LABEL,
      segmentId: trusted ? slide!.segmentId : '',
      segmentLabel: trusted ? slide!.segmentLabel : '',
      slideTitle: trusted ? slide!.title : '',
    },
  };
}

/** `02:47`, or `1:02:47` past an hour. For the clip list a human reads. */
export function formatTimecode(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hh > 0 ? `${hh}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`;
}
