/**
 * D12 — is this airing ready to hand to the videographer, and what is still missing.
 *
 * ## The distinction this whole module exists to make
 *
 * `DOC_07_YOUTUBE_MEDIA_PRODUCTION_ENGINE.md` lists seven things a handoff has to carry and
 * records, for each, whether anything in this system produces it. Most of them nothing does:
 * no transcript, no chapter markers, no retention policy field, no title or thumbnail drafts.
 * Its own summary is "two of fifteen outputs, and the build plan does not cover the other
 * thirteen".
 *
 * So a checklist with ten unticked boxes would be a lie by implication. An unticked box means
 * SOMEBODY FORGOT - it invites a videographer to wait for a transcript that no code anywhere is
 * going to produce, and to read the delay as somebody being slow.
 *
 * Three states, therefore, not two:
 *
 *   - `ready`      - the system has it, and here it is.
 *   - `missing`    - the system produces this and it is not there yet. A real to-do.
 *   - `not_built`  - nothing produces this. Waiting will not help; it needs a ticket.
 *
 * Collapsing the last two is the failure mode. They look identical on screen and lead to
 * opposite actions: one is "go and do it", the other is "stop waiting and go and build it".
 *
 * ## The post-show check is separate from the package
 *
 * Four facts about the AIRING, checkable the moment the class ends and worth checking while
 * everyone is still in the room - because three of the four can only be fixed then, or not at
 * all. A recording that was never bound cannot be bound retrospectively from a clip list.
 */

export type HandoffState = 'ready' | 'missing' | 'not_built';

export interface HandoffItem {
  key: string;
  label: string;
  state: HandoffState;
  /** One line: what it is, or what is in the way. Always set, including when ready. */
  detail: string;
}

/** Just enough of the occurrence to judge it. Keeps this pure and fixture-testable. */
export interface HandoffAiring {
  editorial_state: string;
  provider_session_id: string | null;
  provider_instance_uuid: string | null;
  content_started_at: Date | string | null;
  ended_at: Date | string | null;
  end_reason: string | null;
}

export interface HandoffClipSummary {
  /** Every moment recorded for the airing, advances and presses together. */
  total: number;
  /** Moments a producer pressed the button on, which are the strongest shortlist signal. */
  live: number;
  /** Segments a person has explicitly judged, as against defaulted. */
  decided: number;
  /** Moments inside segments currently marked keep. */
  kept: number;
}

/**
 * THE POST-SHOW CHECK (D12): four lines, while everyone is still in the room.
 *
 * Ordered by how recoverable the failure is, worst first. A missing recording binding is the
 * one that cannot be fixed later from anything in this system, so it is the one a producer
 * should see before they close the laptop.
 */
export function postShowCheck(airing: HandoffAiring): HandoffItem[] {
  const ended = airing.ended_at !== null && airing.ended_at !== undefined;
  return [
    {
      key: 'recording_bound',
      label: 'The recording is bound to this airing',
      state: airing.provider_instance_uuid ? 'ready' : 'missing',
      detail: airing.provider_instance_uuid
        ? 'The replay and the clip timecodes point at the same video.'
        : 'No recording is bound. The health loop captures this WHILE the show runs, so it '
          + 'cannot be recovered afterwards from anything here. Check the provider before '
          + 'anyone goes home.',
    },
    {
      key: 'input_bound',
      label: 'The live input is known',
      state: airing.provider_session_id ? 'ready' : 'missing',
      detail: airing.provider_session_id
        ? 'The airing is tied to a provider input, so it could be observed.'
        : 'No provider input. Nothing was ever watched for this airing, which means no health, '
          + 'no auto-end and no recording binding.',
    },
    {
      key: 'ended',
      label: 'The airing is closed out',
      state: ended ? 'ready' : 'missing',
      detail: ended
        ? 'It has an end time, so every clip has an out point.'
        : 'No end time. The last clip in the list has no out point until there is one.',
    },
    {
      key: 'end_reason',
      label: 'How it ended was recorded',
      // Not an error before the end: there is nothing to have recorded yet.
      state: !ended ? 'missing' : (airing.end_reason ? 'ready' : 'missing'),
      detail: !ended
        ? 'It has not ended yet.'
        : airing.end_reason === 'auto_stream_gone'
          ? 'Ended automatically after the feed stopped. The recording may stop short of the '
            + 'class, so check the tail before cutting from it.'
          : airing.end_reason === 'producer'
            ? 'A producer ended it deliberately.'
            : 'No reason was recorded, so it cannot be said whether a person or the safety net '
              + 'ended this airing.',
    },
  ];
}

/**
 * THE PACKAGE (D12): what the videographer is owed, and what exists.
 *
 * The six items are DOC 07's own list of what a handoff has to carry, with its own verdicts
 * carried across rather than re-guessed here. Where that document says nothing produces a
 * thing, this says `not_built` and names the ticket - because a videographer reading "missing"
 * will wait, and waiting for the transcript is waiting for something nobody is building.
 */
export function handoffPackage(
  airing: HandoffAiring,
  clips: HandoffClipSummary,
): HandoffItem[] {
  const shortlisted = clips.live + clips.kept;
  return [
    {
      key: 'recording',
      label: 'The recording, bound to this airing',
      state: airing.provider_instance_uuid ? 'ready' : 'missing',
      detail: airing.provider_instance_uuid
        ? 'Bound. This is the video every timecode below is measured against.'
        : 'Not bound, so the clip timecodes have nothing to be measured against.',
    },
    {
      key: 'clip_list',
      label: 'A clip shortlist with in and out points',
      // The one item on DOC 07's list that moved from "open design decision" to built, by the
      // two changes before this one: a producer's presses and a per-segment keep-or-cut.
      state: clips.total > 0 ? 'ready' : 'missing',
      detail: clips.total > 0
        ? `${clips.total} moments, ${clips.live} marked live by a producer, `
          + `${shortlisted} inside segments marked keep. Downloadable as CSV.`
        : 'No moments were recorded for this airing, so there is nothing to shortlist.',
    },
    {
      key: 'decisions',
      label: 'Somebody has been through the list',
      state: clips.decided > 0 ? 'ready' : 'missing',
      detail: clips.decided > 0
        ? `${clips.decided} segments have an explicit keep or cut.`
        : 'Every segment is still on its default. The file is usable, but nobody has judged it.',
    },
    {
      key: 'transcript',
      label: 'Transcript and chapter markers',
      state: 'not_built',
      detail: 'Nothing in this system produces either. DOC 07 lists both as not built; L8.2 is '
        + 'the ticket and it is open. Waiting will not produce one.',
    },
    {
      key: 'retention',
      label: 'What happens to the raw live',
      state: 'not_built',
      detail: 'There is no retention policy field on an occurrence, so no disposition can be '
        + 'recorded. L8.1 is the ticket and it is open.',
    },
    {
      key: 'drafts',
      label: 'Title, description, thumbnail and captions',
      state: 'not_built',
      detail: 'None of these are produced here. DOC 07 counts them among the thirteen outputs '
        + 'the build plan does not cover.',
    },
  ];
}

/**
 * Whether to warn, and about what.
 *
 * `missing` and `not_built` are counted SEPARATELY and the notice says both numbers, because
 * one is a to-do list and the other is a scope gap. A single "4 items outstanding" would read
 * as four things somebody could go and do, and three of them are not.
 */
export function handoffNotice(items: HandoffItem[]): {
  warn: boolean; missing: number; notBuilt: number; text: string;
} {
  const missing = items.filter((i) => i.state === 'missing').length;
  const notBuilt = items.filter((i) => i.state === 'not_built').length;
  if (missing === 0 && notBuilt === 0) {
    return { warn: false, missing, notBuilt, text: 'Everything this system can produce is here.' };
  }
  const parts: string[] = [];
  if (missing > 0) {
    parts.push(`${missing} ${missing === 1 ? 'item is' : 'items are'} missing and can still be fixed`);
  }
  if (notBuilt > 0) {
    parts.push(`${notBuilt} ${notBuilt === 1 ? 'is' : 'are'} not built at all, so waiting will not produce ${notBuilt === 1 ? 'it' : 'them'}`);
  }
  return { warn: true, missing, notBuilt, text: `${parts.join('; ')}.` };
}
