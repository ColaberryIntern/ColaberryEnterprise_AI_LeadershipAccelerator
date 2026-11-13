/**
 * The words the producer strip says, lifted out of the component.
 *
 * WHY IT IS ITS OWN MODULE. Two of these sentences are load-bearing — they are the only warning
 * a producer gets before, and the only explanation after, an action that cannot be taken back —
 * and a sentence that carries a consequence deserves a test of its own rather than an assertion
 * buried in a render. The component had the stylesheet taken out of it for the same reason it has
 * the copy taken out now: what is left is control flow.
 *
 * The wire values are the contract. Everything here is for a person under time pressure.
 */
import type { ProducerCommand } from '../../services/broadcastProducer';

/** Human labels, in the producer's language rather than the state machine's. */
export const LABELS: Record<ProducerCommand, string> = {
  enter_backstage: 'Go backstage',
  mark_content_started: 'Mark content started',
  go_live: 'Go live',
  end: 'End broadcast',
  return_to_scheduled: 'Back to scheduled',
  cancel: 'Cancel this airing',
};

/**
 * WHAT EACH IRREVERSIBLE COMMAND ACTUALLY COSTS, in the sentence a producer reads with a finger
 * already on the button.
 *
 * Both used to say "This cannot be undone", which told the truth about neither. For `end` it is
 * very nearly enough: an ended class still goes on to processing and a published replay, so the
 * thing that cannot be undone is the ending itself, which is exactly what the sentence says.
 *
 * For `cancel` it was misleading in the one direction that matters. "You cannot un-cancel this
 * airing" is what it means, and what a producer reasonably hears is "so re-schedule the class" —
 * which does not work and gives no error. `cancelled` has no outbound transition
 * (`broadcastStateMachine.ts`: `cancelled: []`), and `uq_broadcast_source_ref` is UNIQUE on
 * (source_type, source_id), so the session cannot be handed a second occurrence either. Between
 * those two facts the class is off Colaberry Live permanently, and the admin page's own
 * re-schedule refuses in a server log nobody is watching. The producer about to click is the
 * last person who can still decide not to, so this is where that is said.
 */
export const CONFIRM_Q: Partial<Record<ProducerCommand, string>> = {
  end: 'End it? This cannot be undone.',
  cancel: 'Cancel this airing? The class cannot be put back on air afterwards. Re-scheduling it '
    + 'will not bring the broadcast back.',
};

/**
 * Which commands ask before they run — derived from the questions above rather than listed a
 * second time, so a command can never be given a confirmation step with no question written for
 * it, or a question the button never gets around to asking.
 */
export function needsConfirm(command: ProducerCommand): boolean {
  return CONFIRM_Q[command] !== undefined;
}

/**
 * WHY THERE IS NOTHING TO DO, when there is nothing to do.
 *
 * "Nothing to do from here" is true of every state with an empty command list, and useful in
 * none of the terminal ones, where the producer's actual question is whether this is
 * recoverable. Two states answer it differently and both answers matter:
 *
 *  - `replay_ready` is the end of a successful airing. Nothing left to run is good news.
 *  - `cancelled` is the end of this class's life on Live, and nothing in the product says so.
 *    A producer who has just cancelled the wrong occurrence will re-schedule the class and
 *    wait — the re-schedule is accepted, the occurrence is not moved, and the next signal is an
 *    empty room at the top of the hour. So this says it plainly, and does not send them to an
 *    admin screen that cannot fix it either.
 */
export function noActionsNote(editorialState: string): string {
  if (editorialState === 'cancelled') {
    return 'This airing was cancelled, and cancelling cannot be undone. Re-scheduling the class '
      + 'will not put it back on air: there is no supported way yet to give a cancelled class a '
      + 'second broadcast, so flag it rather than re-scheduling and waiting.';
  }
  if (editorialState === 'replay_ready') {
    return 'The replay is published. Nothing left to run here.';
  }
  return 'Nothing to do from here.';
}

/**
 * A reading in the header, and whether it is a measurement at all.
 *
 * `state` is what the stylesheet keys off, and the italic treatment for `unknown` and `failed`
 * is the whole point: those two are NOT numbers and must not be read as numbers at a glance.
 */
export interface Chip {
  state: 'ok' | 'stale' | 'unknown' | 'failed';
  text: string;
  /** Worth a producer's attention right now. Only the stuck count sets it. */
  raised?: boolean;
}

/**
 * THE RULE SHARED BY EVERY COUNT IN THE HEADER, in one place so a new count cannot invent its
 * own version of it.
 *
 * Three things that look alike and mean completely different things:
 *
 *   - a measurement, including a measurement of zero, which renders as a number;
 *   - a measurement that has stopped arriving, which keeps the last good number and says so,
 *     because a producer mid-show needs the stale figure more than an empty panel;
 *   - no measurement at all, which says so in words and never prints a digit.
 *
 * A fabricated `0` is the failure this exists to prevent: it reads as an empty room, and a
 * producer who believes an empty room may end a class people are in.
 */
function countChip(
  value: number | null, unmeasurable: boolean, stale: boolean, unit: string, noneLabel: string,
): Chip | null {
  if (unmeasurable) return { state: 'unknown', text: noneLabel };
  if (value === null) {
    // Nothing good has ever arrived. Only worth saying once an attempt has actually failed;
    // before the first answer lands there is nothing to report.
    return stale ? { state: 'failed', text: 'no answer' } : null;
  }
  return {
    state: stale ? 'stale' : 'ok',
    text: `${value} ${unit}${stale ? ' · not updating' : ''}`,
  };
}

/**
 * The viewer-count chip, as four distinct readings that must never be mistaken for each other.
 *
 * `12 watching` is a measurement. `not measuring` is the server saying collection is down - it
 * answers 503 and omits the count entirely so that no client can print a fabricated zero, and a
 * producer who read that as "nobody is here" would stop a class people are watching. `no answer`
 * is this tab failing to ask or failing to hear, which is a different fault with a different
 * fix. And a kept number marked `not updating` is the honest version of the last two when there
 * IS a last good count worth showing.
 *
 * `0 watching` is a measurement like any other and renders as a number, not as an absence.
 *
 * Only shown while on air: a viewer count on a scheduled occurrence is a count of nothing, and
 * one left on screen after the class ended is a stale claim about a broadcast that is over.
 */
export function audienceChip(
  onAir: boolean,
  aud: { outcome: string; watchingNow?: number } | null,
  stale: boolean,
): Chip | null {
  if (!onAir) return null;
  return countChip(
    aud?.outcome === 'ok' ? aud.watchingNow ?? 0 : null,
    aud?.outcome === 'unknown',
    stale,
    'watching',
    'not measuring',
  );
}

/**
 * HOW MANY PHONES ARE IN THE ROOM (D8), which is a different question from how many are watching.
 *
 * The audience chip counts remote viewers on the broadcast. This counts people who scanned the
 * code and are following along on the companion, which is the number a presenter in the room
 * actually asks for. They are read from two different routes and either can fail without the
 * other, so they are two chips rather than one sum.
 *
 * Shown from backstage onward rather than only on air, because the room fills up BEFORE the
 * class starts and "is anyone here yet" is a backstage question.
 */
export function roomChip(
  pulse: { present: number } | null, unmeasurable: boolean, stale: boolean,
): Chip | null {
  return countChip(
    pulse ? pulse.present : null, unmeasurable, stale, 'in the room', 'room not measured',
  );
}

/**
 * HOW MANY OF THEM ARE STUCK (D8). The one reading here that asks for a decision.
 *
 * `raised` only when somebody actually is stuck. A plain `0 stuck` is good news and should not
 * be colored like a problem, and `raised` is deliberately NOT set for the unmeasurable states:
 * "stuck not measured" is a gap in instrumentation, not a room full of stuck people, and
 * coloring it would invent an alarm out of a failed request.
 */
export function stuckChip(
  pulse: { stuck: number } | null, unmeasurable: boolean, stale: boolean,
): Chip | null {
  const chip = countChip(
    pulse ? pulse.stuck : null, unmeasurable, stale, 'stuck', 'stuck not measured',
  );
  if (!chip) return null;
  const isCount = chip.state === 'ok' || chip.state === 'stale';
  return { ...chip, raised: isCount && !!pulse && pulse.stuck > 0 };
}

/**
 * WHO ENDED IT (D8). A human, or the safety net, or nobody can tell.
 *
 * `end_reason` has been on the producer payload all along and nothing rendered it, so a
 * producer coming back to a class that is over could not tell whether a colleague pressed End
 * or the auto-end watchdog fired because the stream vanished. Those call for opposite next
 * actions: one is finished, the other means the feed broke and the recording may be short.
 *
 * The third case is the one worth being careful about. `null` on an ended occurrence is not
 * evidence of either, and it is reachable: every occurrence that ended before the column
 * existed carries null. So it says the reason was not recorded rather than guessing `producer`,
 * which is the same rule the counts obey - no fabricated value where there is no measurement.
 *
 * Deliberately NOT linked to a post-show check. D12 adds that route; linking to it now would
 * ship a dead link, which is the failure this subsystem keeps finding in its own surfaces.
 */
export function endReasonCopy(editorialState: string, endReason: string | null): string | null {
  if (!ENDED_STATES.includes(editorialState)) return null;
  if (endReason === 'producer') return 'Ended by a producer.';
  if (endReason === 'auto_stream_gone') {
    return 'Ended automatically: the feed stopped and did not come back. Check the recording '
      + 'before publishing a replay, because it ends where the feed did.';
  }
  if (endReason === null) return 'No end reason was recorded for this airing.';
  // An unrecognized value is still a fact about this airing, and printing it beats hiding it.
  return `Ended: ${endReason.replace(/_/g, ' ')}.`;
}

/** Everything after the airing. `cancelled` is excluded: it never aired, so nothing ended it. */
const ENDED_STATES = ['ended', 'processing', 'replay_ready'];

/** The badge. `live` and `reconnecting` read as a broadcast; the rest read as the state name. */
export function stateLabel(editorialState: string): string {
  if (editorialState === 'live') return 'ON AIR';
  if (editorialState === 'reconnecting') return 'RECONNECTING';
  return editorialState.replace(/_/g, ' ').toUpperCase();
}

/**
 * WHY A BLOCKED COMMAND IS BLOCKED, in a sentence rather than in the server's own words.
 *
 * The strip used to print the state machine's `reason` verbatim, so a producer with a class
 * about to start read `mark_content_started_first` or
 * `provider_health is unknown, expected ready`. Both are exactly right and neither tells a
 * person under time pressure what to do next. The second is worse than useless: "unknown" is the
 * health value before the first provider poll lands, so the honest answer is usually "wait a
 * moment", and nothing in that string says so.
 *
 * The wire values stay the contract and are still logged. This is the translation layer, and it
 * lives here with the rest of the words rather than in the component.
 *
 * TWO OF THESE REASONS ARE DYNAMIC, which is why this is a function and not a map:
 * `provider_health is X, expected ready` carries the current health, and the version-conflict
 * reason carries two numbers. Matching on a prefix keeps the sentence stable while the server is
 * free to put whatever detail it likes after it.
 */
export function blockedReasonCopy(command: ProducerCommand, reason: string): string {
  const name = LABELS[command];

  if (reason === 'mark_content_started_first') {
    return `${name} is not available yet. Press Mark content started first - it starts the clock `
      + 'that the recording and the clip timecodes are measured from.';
  }

  if (reason.startsWith('provider_health is')) {
    // `unknown` is the value before the first health poll lands, and is the one a producer sees
    // most often. It means wait, not fix.
    const waiting = reason.includes('unknown');
    return waiting
      ? `${name} is not available yet. The stream has not reached us. If Zoom is already `
        + 'pushing, give it a few seconds and this will clear by itself.'
      : `${name} is not available yet. The stream is not healthy enough to go out. Check that `
        + 'Zoom is still streaming to the custom service before trying again.';
  }

  if (reason === 'content_start_requires_backstage_or_live') {
    return `${name} is not available yet. Open backstage first, then mark the content started.`;
  }

  if (reason === 'not_a_producer') {
    return `${name} is not available to this account. Producer controls need staff access.`;
  }

  if (reason.startsWith('expected version')) {
    return `${name} is not available yet. Someone else changed this broadcast while this page `
      + 'was open. Reload to see their change before acting.';
  }

  if (reason === 'no_change') {
    return `${name} would not change anything from here.`;
  }

  /*
   * The fallback says nothing rather than saying the code.
   *
   * A reason this layer has not been taught is a reason a producer cannot act on, and printing
   * the identifier would put us back where we started. The raw value is still in the network
   * response and the server's own log, which is where someone debugging should read it.
   */
  return `${name} is not available yet. The system did not give a reason this screen can `
    + 'explain - the detail is in the broadcast log.';
}

/** `02:47`, or `1:02:47` past an hour. The same shape the clip list uses. */
export function formatMarkTimecode(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hh > 0 ? `${hh}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`;
}

/**
 * WHAT HAPPENED WHEN THE PRODUCER PRESSED MARK (D10), in a sentence.
 *
 * The four outcomes are kept apart rather than collapsed into worked/did-not, because three of
 * them lead to different next actions:
 *
 *   - `marked` names the timecode, so it can be checked against what was on screen;
 *   - `duplicate` is a CORRECT press that created nothing, because that second was already
 *     marked. Calling it success would tell a producer who pressed twice they have two clips;
 *   - `refused` is the world not being ready, and the reason decides what to do about it;
 *   - `failed` must never be quiet. A producer who believes a moment was captured stops
 *     watching for it, and finds out after the class that it is not in the list.
 */
export function markOutcomeCopy(r: {
  outcome: string; timecodeSeconds?: number; labelled?: boolean; reason?: string;
}): string {
  if (r.outcome === 'marked') {
    const at = formatMarkTimecode(r.timecodeSeconds ?? 0);
    return r.labelled
      ? `Marked at ${at}.`
      : `Marked at ${at}. No segment note to label it with, so it is in the list as a timecode.`;
  }
  if (r.outcome === 'duplicate') {
    return `Already marked at ${formatMarkTimecode(r.timecodeSeconds ?? 0)}. Nothing added.`;
  }
  if (r.outcome === 'refused') return MARK_REFUSALS[r.reason ?? ''] ?? MARK_REFUSALS.not_available;
  return 'That did not save. The moment is NOT in the clip list. Try again.';
}

/**
 * The server's reasons, as sentences. Same rule as `blockedReasonCopy`: a producer under time
 * pressure never reads a wire value, and a reason nobody wrote copy for points at the log
 * rather than printing the identifier.
 */
const MARK_REFUSALS: Record<string, string> = {
  no_occurrence: 'This class is not set up on Colaberry Live, so there is no recording to mark.',
  not_on_air: 'Nothing is airing yet. Marking starts once the class is live.',
  no_content_anchor: 'Press Mark content started first, so there is something to measure from.',
  before_content_start: 'The clock says this is before the class started. Nothing was marked.',
  no_slide_context: 'The deck has not said which slide is up yet, so there is nowhere to hang it.',
  not_a_producer: 'The server does not list you as a producer for this class.',
  not_available: 'The system gave no reason it can explain. The log has it.',
};

/**
 * Why Mark this moment is not pressable yet (D10).
 *
 * Returns undefined when it IS pressable, so the button has nothing to explain. The two
 * conditions are the server's own, mirrored here only to say why - the server refuses either
 * way, and this exists so the producer does not have to press to find out.
 */
export function markNotReady(
  occurrence: { editorial_state: string; content_started_at: string | null },
): string | undefined {
  const onAir = occurrence.editorial_state === 'live' || occurrence.editorial_state === 'reconnecting';
  if (!onAir) return 'Marking starts once the class is on air.';
  if (!occurrence.content_started_at) return 'Press Mark content started first.';
  return undefined;
}
