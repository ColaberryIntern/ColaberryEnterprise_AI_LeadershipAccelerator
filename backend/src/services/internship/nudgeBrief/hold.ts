/**
 * hold - who should NOT get a message today, and why.
 *
 *     "we need a button that can prepare the messages that need to be sent out and also show of
 *      the interns that shouldn't get messages."  (Ali, 10 Nov 2026)
 *
 * ## Why this is a server decision and not a filter on the screen
 *
 * The rule that matters most here is "we already wrote to them today". On 10 Nov 2026 every one of
 * the thirteen interns had been sent a message at 8:21 CST; a queue that listed all thirteen again
 * at noon would have invited thirteen duplicates, and the only thing standing between that and a
 * send was a person remembering. It is a fact in the database, so it is decided here, next to the
 * data that proves it, and it arrives on the row already made.
 *
 * ## A hold is a default, never a lock
 *
 * Every held intern still carries their full message and can still be sent to in one more click.
 * The screen's job is to make the quiet choice the easy one, not to take the choice away: a manager
 * who has just spoken to someone on a call has context no table has.
 *
 * ## Order matters
 *
 * The reasons are checked hardest-first, so a row that cannot be sent at all never reports the
 * softer reason. "No address on file" outranks "we wrote to them this morning", because fixing the
 * second changes nothing while the first is true.
 */
import type { NudgeBrief } from './types';
import { briefProblems } from './types';

export type HoldReason =
  /** No address on file, so there is nothing to send to. */
  | 'no_email'
  /** The generated text breaks a sender guard. A defect on our side, surfaced rather than hidden. */
  | 'unsendable_text'
  /** Their internship is paused. A nudge to someone on a pause reads as not having noticed. */
  | 'paused'
  /** We already wrote to them today and they have not written back since. */
  | 'messaged_today';

export interface HoldDecision {
  readonly reason: HoldReason;
  /** One sentence a manager can act on, naming the specific fact. */
  readonly detail: string;
}

/** Short label for the chip on the row. */
export const HOLD_LABEL: Record<HoldReason, string> = {
  no_email: 'No address',
  unsendable_text: 'Message would be refused',
  paused: 'Paused',
  messaged_today: 'Already written to today',
};

/**
 * Calendar date in Central, which is the day a person means when they say "today".
 *
 * Comparing instants would call 11pm Monday and 1am Tuesday the same twenty-six hours apart, and
 * would call 11:59pm and 12:01am different. The manager's day is the one that counts.
 */
export function centralDay(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

export interface HoldInputs {
  readonly brief: NudgeBrief;
  /** The text as it currently stands, which may be an edit rather than the generated body. */
  readonly body?: string;
  readonly applicationState?: string | null;
  readonly now?: Date;
}

/**
 * Whether to hold this one, and why. `null` means send it.
 */
export function holdFor({ brief, body, applicationState = null, now = new Date() }: HoldInputs): HoldDecision | null {
  if (!brief.email) {
    return { reason: 'no_email', detail: 'There is no email address on this enrollment, so this message has nowhere to go.' };
  }

  const problems = briefProblems(body ?? brief.body);
  if (problems.length) {
    return {
      reason: 'unsendable_text',
      detail: `The sender would refuse this text: ${problems.join('; ')}. That is a defect in what we generated, not in them.`,
    };
  }

  if (applicationState === 'paused') {
    return { reason: 'paused', detail: 'Their internship is paused. Resume it first, or write to them about the pause itself.' };
  }

  // The reply check comes BEFORE the same-day check, not after. Someone who wrote back an hour
  // after our morning message is the most urgent person on the list, and a naive "already messaged
  // today" would bury exactly them.
  if (brief.lastOutbound && !brief.inboundSince) {
    const sentDay = centralDay(brief.lastOutbound.sentAt);
    if (sentDay && sentDay === centralDay(now)) {
      const subject = brief.lastOutbound.subject ? ` under "${brief.lastOutbound.subject}"` : '';
      return {
        reason: 'messaged_today',
        detail: `We already wrote to them today${subject}, and they have not replied since. A second message today reads as not having waited for an answer.`,
      };
    }
  }

  return null;
}
