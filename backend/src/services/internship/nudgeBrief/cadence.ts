/**
 * cadence - PURE. Who gets a message when nobody is driving, and the reason it is being sent.
 *
 * Ali, 2026-11-11: *"If for whatever reason I detach from the system, I still want there to be
 * communication at least every 48 hours (can only be once on the weekend) so if an intern has not
 * interacted or done any work or appears to be stuck then this should be triggered for that
 * intern. It should be strategic and not just be based on time."* And: *"the goal is to create a
 * process that keeps the engagement up and doesn't let anyone slide from the cracks."*
 *
 * ## A timer is the backstop, never the reason
 *
 * A message that exists because 48 hours elapsed is the sameness problem wearing a schedule. So
 * the triggers below are reasons to write that the data already knows about, and the floor only
 * catches the person none of them found. `TRIGGERS` is ordered hardest truth first, the same way
 * `chooseFocus` and `triage` are ordered, because somebody waiting on an answer from us outranks
 * somebody we simply have not spoken to lately.
 *
 * ## No presence detection, deliberately
 *
 * There is no "has Ali detached" flag and there should not be one. The clock keys on the intern's
 * last contact FROM US, whoever sent it. When Ali is working, his own sends reset it; when he is
 * not, the floor fires. One rule covers both states and there is no mode to get wrong.
 *
 * ## What stops a double message
 *
 * Three independent guards, none of which replaces the others:
 *   - `holdFor` carries `messaged_today`, so a second message the same day is never proposed
 *   - `engagementState` collapses Saturday and Sunday into one slot
 *   - `sendBrief` is idempotent on `intern-brief-<enrollment>-<central date>`, so even a double
 *     RUN of this worker sends once
 * The third is the one that holds when the first two are wrong, which is why the send path keeps
 * its own key rather than trusting this module to have decided correctly.
 */
import type { EngagementState } from './engagement';
import type { HoldDecision } from './hold';
import type { NudgeBrief } from './types';

/** Why a message is going out. Ordered hardest truth first; the floor is last on purpose. */
export type CadenceTrigger =
  /** They asked us something, or their mail is waiting on a reply. */
  | 'answer_owed'
  /** We made them a dated promise and nothing has come back since. */
  | 'promise_open'
  /** A deadline is close and work is still outstanding against it. */
  | 'deadline_near'
  /** No commit and no verified story for long enough to count as stopped. */
  | 'build_stalled'
  /** None of the above found them, and the contact floor has passed. */
  | 'contact_floor';

export const STALLED_DAYS = 4;
export const DEADLINE_DAYS = 14;

export interface CadenceDecision {
  readonly enrollmentId: string;
  readonly name: string;
  readonly send: boolean;
  readonly trigger: CadenceTrigger | null;
  /** One sentence naming the fact, so a log line explains itself without the code beside it. */
  readonly reason: string;
  /** Set when a message was wanted but withheld, carrying the hold's own words. */
  readonly withheld: string | null;
}

/**
 * The strategic reasons, hardest first. Each returns its sentence or null.
 *
 * Written as data rather than an if-chain so the ORDER is visible in one place and a new trigger
 * cannot be quietly inserted above "they are waiting on us".
 */
const TRIGGERS: ReadonlyArray<{
  readonly key: CadenceTrigger;
  readonly test: (b: NudgeBrief, e: EngagementState) => string | null;
}> = [
  {
    key: 'answer_owed',
    test: (b) => {
      if (b.tier === 'blocked_waiting_on_ali') return 'Their latest message is waiting on a reply from us.';
      const n = b.openQuestions.length;
      return n ? `They have ${n} message${n === 1 ? '' : 's'} we have not answered.` : null;
    },
  },
  {
    key: 'promise_open',
    test: (b, e) => {
      if (!b.promises.length || e.engagedSinceContact === true) return null;
      return `We promised them something and nothing has come back since: "${b.promises[0].quote}"`;
    },
  },
  {
    key: 'deadline_near',
    test: (b) => {
      const d = b.deadline;
      if (!d || d.daysLeft > DEADLINE_DAYS || d.outstanding.length === 0) return null;
      const day = d.daysLeft === 1 ? 'day' : 'days';
      return `${d.daysLeft} ${day} to ${d.dueOn} with ${d.outstanding.length} still outstanding.`;
    },
  },
  {
    key: 'build_stalled',
    test: (b) => {
      const q = b.signals.daysSinceBuildWork;
      if (q === null || q < STALLED_DAYS) return null;
      return `No commit or verified story in ${q} days.`;
    },
  },
];

export interface CadenceInput {
  readonly brief: NudgeBrief;
  readonly engagement: EngagementState;
  readonly hold: HoldDecision | null;
}

/**
 * Should this intern hear from us right now, and why.
 *
 * A hold always wins, and it is reported rather than swallowed: "nobody slides through the cracks"
 * is only true if the reason somebody got nothing is visible. An intern with no address on file is
 * not covered just because the worker declined to crash on them.
 */
export function decide({ brief, engagement, hold }: CadenceInput): CadenceDecision {
  const base = { enrollmentId: brief.enrollmentId, name: brief.name };

  for (const t of TRIGGERS) {
    const reason = t.test(brief, engagement);
    if (!reason) continue;
    return hold
      ? { ...base, send: false, trigger: t.key, reason, withheld: hold.detail }
      : { ...base, send: true, trigger: t.key, reason, withheld: null };
  }

  if (engagement.overdue) {
    return hold
      ? { ...base, send: false, trigger: 'contact_floor', reason: engagement.reason, withheld: hold.detail }
      : { ...base, send: true, trigger: 'contact_floor', reason: engagement.reason, withheld: null };
  }

  return {
    ...base,
    send: false,
    trigger: null,
    reason: hold ? hold.detail : engagement.reason,
    withheld: hold ? hold.detail : null,
  };
}

/**
 * The body an UNREVIEWED send uses.
 *
 * Ali, 2026-11-11, answering the question directly: when nobody has read the message first, it
 * sends the deterministic wording. A model-written body is for the console, where a person
 * approves it.
 *
 * One function so that stays one decision. PR #3914 adds `deterministicBody` to the brief; when it
 * lands, this returns that field and nothing else in the worker changes. Today `body` IS the
 * deterministic text, because nothing upgrades it on this branch.
 */
export function unreviewedBody(brief: NudgeBrief): string {
  return brief.body;
}

export interface CadenceSummary {
  readonly total: number;
  readonly sending: number;
  readonly withheld: number;
  readonly quiet: number;
  readonly byTrigger: Record<string, number>;
}

/** What the run did, in the shape a log line and a person both want. */
export function summarize(decisions: ReadonlyArray<CadenceDecision>): CadenceSummary {
  const byTrigger: Record<string, number> = {};
  for (const d of decisions) {
    if (!d.send || !d.trigger) continue;
    byTrigger[d.trigger] = (byTrigger[d.trigger] ?? 0) + 1;
  }
  return {
    total: decisions.length,
    sending: decisions.filter((d) => d.send).length,
    withheld: decisions.filter((d) => !d.send && d.withheld !== null).length,
    quiet: decisions.filter((d) => !d.send && d.withheld === null).length,
    byTrigger,
  };
}
