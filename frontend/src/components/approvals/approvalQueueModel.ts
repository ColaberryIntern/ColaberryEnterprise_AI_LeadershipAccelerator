/**
 * The approval queue's rules, with no React in them.
 *
 * ## Why one queue
 *
 * Ali, 25 Nov 2026, looking at `/admin/change-requests`: *"Why do I have to go to two different
 * places. Can these 2 be merged."* They were split on 17 Nov for a good reason — a tool grant is
 * the moment an agent stops observing and starts acting, so it needs five verbs rather than two —
 * and the split solved the decision while breaking the queue. With two inboxes, the oldest thing
 * waiting is the one nobody opens: a capability request from the admissions builder sat submitted
 * for **eleven whole days** while a two-day-old platform request was chased by email.
 *
 * So the QUEUE merges and the DECISION does not. One list, sorted by how long somebody has waited,
 * and each row offers the verbs its own kind actually supports. `verbsFor` is where that promise
 * is kept, and it is a function rather than a prop so neither kind can be handed the other's
 * control by a caller that forgot.
 *
 * ## Sorted by waiting, never by arrival
 *
 * `oldestFirst` is the default order and there is no control to change it. A newest-first queue
 * is how the eleven-day request became invisible: every new arrival pushed it further down a page
 * nobody scrolled.
 */
import type { ChangeRequest } from '../../services/agentDomainApi';

export type ApprovalFilter = 'all' | 'change' | 'tool' | 'mine';

export interface ApprovalVerb {
  /** What the API is sent. Change requests use `decideChangeRequest`, tools `decideToolRequest`. */
  key: string;
  label: string;
  /** One line under the label. An approver should not have to know what a verb means from its name. */
  hint: string;
  tone: 'go' | 'neutral' | 'danger';
  /** A verb that must carry words. `deny` without a reason is refused by the server, not by us. */
  needsReason: boolean;
}

/**
 * The five tool verbs, from `toolRequestDecisionContract.ts`. Shown here as TEXT, never as buttons.
 *
 * ## Why this row does not offer them
 *
 * The first cut of this screen did, and it would have been dishonest. Only `approve_to_build` is
 * complete with a verb alone. `send_back` is refused without `missing_field`, one of a fixed set.
 * `assign_existing_tool` is refused without `assigned_tool_name`, which comes from the duplicate
 * check. `nothing` and its answer move together in both directions, and a request carrying a
 * decision package refuses any verb that disagrees with the option it names.
 *
 * None of those inputs exist in a collapsed row, so a row offering the buttons would produce 400s
 * at the moment of deciding. That is precisely the failure the tool console was built to end, and
 * re-creating it in a nicer layout would be a worse outcome than a link.
 *
 * So the queue merges and the DECISION DESK does not. The row carries the age, the facts and what
 * the grant releases, which is everything needed to triage it; settling it happens where its
 * evidence lives. The win is that the grant is no longer in a second inbox nobody remembers.
 */
export const TOOL_VERB_NAMES: ReadonlyArray<{ label: string; hint: string }> = Object.freeze([
  { label: 'Approve to build', hint: 'the tool does not exist and should' },
  { label: 'Use an existing tool', hint: 'the duplicate match was right' },
  { label: 'Send back', hint: 'name the field that is missing' },
  { label: 'Deny', hint: 'refuse it, with a reason' },
  { label: 'Nothing', hint: 'the capability itself should not exist' },
]);

/** The two change verbs. The server refuses the five tool verbs on a change request. */
export const CHANGE_VERBS: ReadonlyArray<ApprovalVerb> = Object.freeze([
  { key: 'approved', label: 'Approve', hint: 'Records that you approved it. Starts no work', tone: 'go', needsReason: false },
  { key: 'declined', label: 'Decline', hint: 'Refuse it, with a reason', tone: 'danger', needsReason: true },
]);

/**
 * The verbs this ROW may offer. Empty for a tool grant, on purpose: see TOOL_VERB_NAMES.
 *
 * A function rather than a prop so a caller cannot hand one kind the other's controls by mistake.
 */
export function verbsFor(kind: ChangeRequest['kind']): ReadonlyArray<ApprovalVerb> {
  return kind === 'tool' ? [] : CHANGE_VERBS;
}

/** Where a tool grant is actually settled. One route, no id segment: there is no detail route. */
export const TOOL_CONSOLE_HREF = '/admin/tool-requests';


/**
 * Whole days a request has been waiting.
 *
 * MOVED here from `AdminChangeRequestsPage`, which owned it first and still re-exports it so its
 * own test keeps importing it from where it was written. One home, because the queue header, the
 * age bar and the row pill all have to agree about what "2 days" means, and two implementations of
 * one invariant is how they stop agreeing.
 *
 * Null for anything undecidable rather than a guessed 0: a missing or unparseable date must not
 * render as "today". A future timestamp clamps to 0 rather than going negative.
 */
export function ageDays(iso: string | null, now: Date = new Date()): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const ms = now.getTime() - then;
  if (ms < 0) return 0;
  return Math.floor(ms / 86_400_000);
}

/**
 * Oldest first. The server returns newest-first, which buries the one most needing a decision.
 *
 * A missing date sorts OLDEST, not last. A row nobody can date is the one most likely to have been
 * forgotten, and dropping it to the bottom is how it stays forgotten.
 */
export function oldestFirst(a: ChangeRequest, b: ChangeRequest): number {
  const at = a.requested_at ? new Date(a.requested_at).getTime() : 0;
  const bt = b.requested_at ? new Date(b.requested_at).getTime() : 0;
  return at - bt;
}

/**
 * How loudly to show the wait: amber past two days, red past five.
 *
 * The thresholds are the ones this page already used, kept rather than re-chosen. An unattended
 * governance gate blocks a builder's story, so five days is not a mild delay. The band is never
 * the only signal: every pill carries the number of days in words beside it, so the meaning
 * survives a colourblind reader, a greyscale print and a screenshot pasted into a thread.
 */
export function ageBand(days: number | null): 'none' | 'fresh' | 'ageing' | 'overdue' {
  if (days === null) return 'none';
  if (days >= 5) return 'overdue';
  if (days >= 2) return 'ageing';
  return 'fresh';
}

/** The wording `AgeChip` already used, kept so one request reads the same wherever it appears. */
export function ageLabel(days: number | null): string {
  if (days === null) return 'no date';
  if (days === 0) return 'today';
  return `${days} day${days === 1 ? '' : 's'}`;
}

export function matchesFilter(
  r: ChangeRequest,
  filter: ApprovalFilter,
  mineIds: ReadonlySet<string>,
): boolean {
  if (filter === 'all') return true;
  if (filter === 'mine') return mineIds.has(r.id);
  return r.kind === filter;
}

/**
 * The sentence above the list.
 *
 * It leads with the longest wait rather than the count, because the count is not the thing that
 * went wrong. Six waiting is unremarkable; one of them waiting eleven whole days is the finding.
 */
export function queueHeadline(rows: ReadonlyArray<ChangeRequest>, now: Date = new Date()): string {
  if (!rows.length) return 'Nothing is waiting on you.';
  const longest = rows.reduce<number | null>((m, r) => {
    const d = ageDays(r.requested_at, now);
    return d !== null && (m === null || d > m) ? d : m;
  }, null);
  const n = `${rows.length} decision${rows.length === 1 ? ' is' : 's are'} yours.`;
  if (longest === null || longest < 2) return n;
  return `${n} The longest has waited ${ageLabel(longest)}.`;
}
