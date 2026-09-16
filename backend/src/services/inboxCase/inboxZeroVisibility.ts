import { Op } from 'sequelize';
import InboxCase from '../../models/InboxCase';
import InboxCaseItem from '../../models/InboxCaseItem';

// /inbox-zero visibility (T16, T20). "What may the console show Ali at all?"
// Every console read (overview, next, queue, delta) comes through here. Two
// rules, both Ali's, both hard:
//
// T20 (2026-09-12) — EMAIL ONLY: "It should be emails only, but if you get a
// basecamp email, it needs to be handled in basecamp. Then what's every
// handled should be removed from the inbox, but make no mistake, it is all
// about the inbox. That is it!" A case is shown only if it has an email item
// that arrived in a mailbox. A Basecamp to-do that never came by email is not
// inbox work and never appears here (the engine still tracks it; the admin
// page still shows it). A Basecamp NOTIFICATION email does appear, because it
// landed in the inbox — and the to-dos the auto-sync attached to it travel
// with it, so the planner proposes the response in Basecamp and the archive
// on the email. Handled means filed: T19 archives the email as part of the
// decision.
//
// T16 (2026-09-11) — ONLY WHAT IS STILL THERE: "If I delete something from my
// inbox, then it should not show up on this report." A case is hidden when it
// has evidence and ALL of it is confirmed gone (`source_live === false`,
// written only from a definitive provider answer by inboxLivenessService).
// Unknown is not gone: an item never checked is shown and counted as
// unverified.
//
// One bulk item query for both, never a provider call.

/** How much of the visible set has been confirmed against the mailbox. */
export interface LivenessSummary {
  /** Open, checkable items on visible cases that no reconcile pass has reached yet. */
  unchecked_items: number;
  /** Cases hidden because every non-excluded item is confirmed gone from the inbox. */
  gone_hidden_cases: number;
  /** Open cases that are not inbox work at all (Basecamp-only). Reported, never counted as inbox. */
  non_email_cases: number;
  /** Most recent provider check on any item, or null if none has ever run. */
  last_checked_at: string | null;
}

export interface VisibleCases {
  cases: InboxCase[];
  /** Non-excluded items per visible case (one bulk query; reused by the queue views). */
  itemsByCase: Map<string, InboxCaseItem[]>;
  liveness: LivenessSummary;
}

/** Source types inboxLivenessService can ask a provider about; the rest stay null. */
const LIVENESS_CHECKABLE = new Set(['email', 'basecamp_todo']);

/**
 * T20: what makes a case inbox work. `email` only — a message that arrived in
 * one of Ali's mailboxes. NOT `sent_email` (his own outbound, never in the
 * inbox) and NOT `basecamp_*` on its own (board work, not mail).
 */
export function isInboxOriginated(items: InboxCaseItem[]): boolean {
  return items.some((i) => i.source_type === 'email');
}

export async function loadOpenCases(): Promise<InboxCase[]> {
  return InboxCase.findAll({ where: { state: { [Op.ne]: 'RESOLVED' } } as any }); // `as any`: Op-keyed where
}

/** Non-excluded items for `caseIds`, grouped by case. One query. */
async function itemsByCaseFor(caseIds: string[]): Promise<Map<string, InboxCaseItem[]>> {
  const by = new Map<string, InboxCaseItem[]>();
  if (caseIds.length === 0) return by;
  const items = await InboxCaseItem.findAll({
    where: { case_id: { [Op.in]: caseIds }, inclusion_status: { [Op.ne]: 'EXCLUDED' } } as any, // `as any`: Op-keyed where
  });
  for (const i of items) {
    if (!by.has(i.case_id)) by.set(i.case_id, []);
    by.get(i.case_id)!.push(i);
  }
  return by;
}

/** A case is "all gone" only when it has evidence and every piece is confirmed gone. */
export function isAllGone(items: InboxCaseItem[]): boolean {
  return items.length > 0 && items.every((i) => i.source_live === false);
}

/** The open set minus everything Ali has already cleared from his inbox. */
export async function loadVisibleCases(): Promise<VisibleCases> {
  const open = await loadOpenCases();
  const itemsByCase = await itemsByCaseFor(open.map((c) => c.id));
  let hidden = 0;
  let nonEmail = 0;
  let unchecked = 0;
  const cases = open.filter((c) => {
    const items = itemsByCase.get(c.id) ?? [];
    // T20 first: board work is not inbox work, so it is not "hidden mail" —
    // it is not mail at all, and is counted separately so the console never
    // implies Ali's inbox is bigger than it is.
    if (!isInboxOriginated(items)) { nonEmail++; return false; }
    if (isAllGone(items)) { hidden++; return false; }
    for (const i of items) if (i.disposition === null && LIVENESS_CHECKABLE.has(i.source_type) && i.source_live == null) unchecked++;
    return true;
  });
  let lastChecked: string | null = null;
  try {
    const max = await InboxCaseItem.max('source_checked_at');
    lastChecked = max ? new Date(max as Date).toISOString() : null;
  } catch {
    lastChecked = null; // a missing aggregate is reported as unknown, never as "just now"
  }
  return { cases, itemsByCase, liveness: { unchecked_items: unchecked, gone_hidden_cases: hidden, non_email_cases: nonEmail, last_checked_at: lastChecked } };
}

/**
 * Ids among `caseIds` the console must NOT show: evidence all confirmed gone
 * from the inbox, or not inbox work in the first place. One bulk query.
 */
export async function allGoneCaseIds(caseIds: string[]): Promise<Set<string>> {
  const by = await itemsByCaseFor(caseIds);
  const hide = new Set<string>();
  for (const id of caseIds) {
    const list = by.get(id) ?? [];
    if (!isInboxOriginated(list) || isAllGone(list)) hide.add(id);
  }
  return hide;
}
