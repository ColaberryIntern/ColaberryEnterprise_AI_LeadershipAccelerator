import { Op } from 'sequelize';
import InboxCase from '../../models/InboxCase';
import InboxCaseItem from '../../models/InboxCaseItem';

// /inbox-zero visibility (T16). "What may the console show Ali at all?" —
// split out of inboxZeroService when that file crossed the 500-line ceiling.
//
// Ali: "This process should only be looking in my current inboxes. If I
// delete something from my inbox, then it should not show up on this
// report." Every console read (overview, next, queue, delta) comes through
// here. A case is hidden only when it has evidence and ALL of it is confirmed
// gone from the inbox (`inbox_case_items.source_live === false`, written only
// from a definitive provider answer by inboxLivenessService). Unknown is not
// gone: an item never checked is shown and counted as unverified. One bulk
// item query, never a provider call.

/** How much of the visible set has been confirmed against the mailbox. */
export interface LivenessSummary {
  /** Open, checkable items on visible cases that no reconcile pass has reached yet. */
  unchecked_items: number;
  /** Cases hidden because every non-excluded item is confirmed gone from the inbox. */
  gone_hidden_cases: number;
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
  let unchecked = 0;
  const cases = open.filter((c) => {
    const items = itemsByCase.get(c.id) ?? [];
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
  return { cases, itemsByCase, liveness: { unchecked_items: unchecked, gone_hidden_cases: hidden, last_checked_at: lastChecked } };
}

/** Ids among `caseIds` whose non-excluded evidence is all confirmed gone. One bulk query. */
export async function allGoneCaseIds(caseIds: string[]): Promise<Set<string>> {
  const by = await itemsByCaseFor(caseIds);
  const gone = new Set<string>();
  for (const [id, list] of by) if (isAllGone(list)) gone.add(id);
  return gone;
}
