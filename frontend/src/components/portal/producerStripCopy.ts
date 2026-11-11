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
