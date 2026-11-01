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
  cancel: 'Cancel this airing? The class cannot be put back on air afterwards — re-scheduling it '
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
