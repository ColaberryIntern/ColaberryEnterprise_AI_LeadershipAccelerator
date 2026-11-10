/**
 * The nudge brief: the long, per-intern message the Agent nudges tab shows and sends.
 *
 * It replaces nothing in `agentNudgeComposer.ts` - that one still drives the weekday run for the
 * seven agent builders. This is the on-demand, every-intern, full-detail version: a manager opens a
 * row, the message is generated from live data at that moment, and it is sent from the page.
 *
 * Contract rules, which exist because the sender enforces them (`sendAsAli.js`, and `guardedSendMail`):
 *   - `body` is PLAIN TEXT. It must contain no `<` or `>`; the HTML is built from it downstream.
 *   - no em dash or en dash anywhere in `body`.
 *   - `body` must not end with a sign-off or with the sender's name; a signature is appended.
 * `briefProblems()` asserts all three, and the route refuses to return a brief that fails.
 */
import type { SidecarIntern, TriageTier } from '../portfolioReport/sidecar/types';

/** A deadline that is close enough to lead the message with. */
export interface BriefDeadline {
  /** What is due, e.g. "case study package". */
  readonly what: string;
  /** ISO date, from `due_baseline_on` - never `due_on`, which is back-dated on gov projects. */
  readonly dueOn: string;
  /** Negative means it has passed. */
  readonly daysLeft: number;
  /** The task titles still outstanding against that date. */
  readonly outstanding: readonly string[];
}

/**
 * A dated commitment found in our own last outbound message.
 *
 * The report counts replies owed; nothing counted promises made. A promise with a date in it that
 * quietly lapses costs more trust than a slow reply, so every one is surfaced on the row and the
 * manager decides whether today's message keeps it or re-dates it.
 */
export interface BriefPromise {
  readonly sentAt: string;
  readonly subject: string | null;
  /** The sentence the commitment was made in, verbatim. */
  readonly quote: string;
}

/**
 * The numbers behind the message, carried so the screen can show the evidence next to the words.
 *
 * Every one of these already decided something in the body. Surfacing them is not decoration: a
 * manager who is about to send "you have been quiet for nineteen days" should be able to see the
 * nineteen, and the activity strip it came from, without opening another tab. Nothing here is
 * computed on the client, so the chart and the paragraph can never disagree.
 */
export interface BriefSignals {
  readonly day: number | null;
  readonly percentBuilt: number | null;
  readonly storiesVerified: number | null;
  readonly storiesTotal: number | null;
  readonly overdueTasks: number | null;
  /** Null means no commit or verified story has ever been seen, which is not the same as zero. */
  readonly daysSinceBuildWork: number | null;
  readonly artifacts: number;
  readonly trainingWeeksCompleted: number;
  readonly trainingWeeksTotal: number;
  readonly gateCleared: boolean;
  /** Their questions still waiting on an answer from us. */
  readonly openQuestions: number;
  readonly hasRepo: boolean;
}

/** Our own last message to them. The one fact that decides whether a second one today is a nudge. */
export interface BriefLastOutbound {
  readonly sentAt: string;
  readonly subject: string | null;
}

export interface NudgeBrief {
  readonly enrollmentId: string;
  readonly name: string;
  readonly firstName: string;
  readonly email: string | null;
  readonly tier: TriageTier;
  readonly tierReason: string;
  readonly trackLabel: string;
  readonly projectName: string | null;
  readonly signals: BriefSignals;
  readonly lastOutbound: BriefLastOutbound | null;
  /**
   * When they wrote back AFTER our last message, the time of that reply.
   *
   * This is the difference between "we already messaged them today, leave them alone" and "we
   * messaged them today and they answered, so now we owe them one". Collapsing the two is how a
   * reply gets left sitting while the queue reports the day as done.
   */
  readonly inboundSince: string | null;
  readonly deadline: BriefDeadline | null;
  readonly promises: readonly BriefPromise[];
  readonly subject: string;
  readonly body: string;
  /** The attachment this ask needs, when it needs one; the file is staged by the send path. */
  readonly attachment: { readonly filename: string; readonly prompt: string } | null;
  /** Anything the composer could not evidence, shown on the row so nobody sends a guess. */
  readonly warnings: readonly string[];
  readonly generatedAt: string;
}

export interface BriefInputs {
  readonly intern: SidecarIntern;
  readonly deadline: BriefDeadline | null;
  readonly now: Date;
}

/** Human label per tier, used on the row and in tests. */
export const TIER_LABEL: Record<TriageTier, string> = {
  no_project_at_day_N: 'No project',
  never_started_building: 'Never started',
  blocked_waiting_on_ali: 'Waiting on you',
  overdue_backlog: 'Overdue backlog',
  quiet: 'Gone quiet',
  on_track: 'On track',
};

/** Order the rows the way the day should be worked, most urgent first. */
export const TIER_RANK: Record<TriageTier, number> = {
  blocked_waiting_on_ali: 0,
  no_project_at_day_N: 1,
  never_started_building: 2,
  overdue_backlog: 3,
  quiet: 4,
  on_track: 5,
};

/**
 * The three guards the sender applies, checked here so a bad body is caught while it is still on
 * screen rather than by a rejected send. Returns one string per problem; empty means clean.
 */
export function briefProblems(body: string): string[] {
  const out: string[] = [];
  if (/[—–]/.test(body)) out.push('contains an em or en dash');
  if (/[<>]/.test(body)) out.push('contains an angle bracket, which the sender escapes into visible text');
  if (/Managing Director/.test(body)) out.push('repeats the signature title in the body');
  if (/\n\s*(best|thanks|thank you|regards|sincerely|cheers|warmly)[,.!]?\s*(\n\s*ali[\s.!]*)?$/i.test(body)) {
    out.push('ends with a sign-off, which would double-sign against the appended signature');
  }
  return out;
}
