import { createTicket, updateTicketStatus, addTicketComment, getTicketsByEntity } from '../ticketService';
import { CaseMode, CaseState } from '../../types/inboxCase';

// Bridges the Inbox Intel Case Resolution Engine into the existing Tickets
// board (Ali: "All work should be done in a ticket by the agents... I can
// see the work being done in a ticket"). Every case gets one ticket
// (deduped on entity_type='inbox_case' + entity_id=caseId + type='inbox_case',
// via createTicket()'s own dedup — see services/ticketService.ts), walked
// through the board's real backlog→todo→in_progress→in_review→done state
// machine as the case progresses, with narrative comments at each
// meaningful step (mirrors the existing platformFixAgent.ts / coryInitiatives.ts
// pattern). Every call here is best-effort: a ticket-sync failure must
// NEVER break the actual case workflow, so every entry point swallows its
// own errors after logging them.

export type TicketStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled';

const ACTOR_TYPE = 'agent' as const;
const ACTOR_ID = 'InboxCaseEngine';

// The board's real transition graph (services/ticketService.ts::VALID_TRANSITIONS).
// Case state changes are NOT always adjacent on this graph (e.g. NEEDS_ALI ->
// READY_TO_PLAN both map to different ticket buckets that may require more than
// one hop), so advanceTicketTo() walks it via BFS instead of assuming a direct edge.
const BOARD_ADJACENCY: Record<TicketStatus, TicketStatus[]> = {
  backlog: ['todo', 'cancelled'],
  todo: ['in_progress', 'cancelled'],
  in_progress: ['in_review', 'done', 'cancelled'],
  in_review: ['done', 'in_progress', 'cancelled'],
  done: [],
  cancelled: [],
};

function findPath(from: TicketStatus, to: TicketStatus): TicketStatus[] {
  if (from === to) return [];
  const queue: Array<{ node: TicketStatus; path: TicketStatus[] }> = [{ node: from, path: [] }];
  const seen = new Set<TicketStatus>([from]);
  while (queue.length > 0) {
    const { node, path } = queue.shift()!;
    for (const next of BOARD_ADJACENCY[node]) {
      if (seen.has(next)) continue;
      const nextPath = [...path, next];
      if (next === to) return nextPath;
      seen.add(next);
      queue.push({ node: next, path: nextPath });
    }
  }
  return []; // no path (e.g. target is terminal and unreachable from a different terminal) — caller no-ops
}

// Three-bucket mapping, chosen deliberately coarse: the case state machine
// has legitimate back-and-forth (NEEDS_ALI <-> ASSESSING) the board's mostly-
// linear columns can't mirror 1:1. What matters for "can I see the work
// happening" is simpler: is the agent actively working, does it need Ali,
// or is it done.
function mapCaseStateToTicketStatus(state: CaseState): TicketStatus {
  switch (state) {
    case 'DISCOVERING':
    case 'ASSESSING':
    case 'EXECUTING':
    case 'REOPENED':
      return 'in_progress';
    case 'NEEDS_ALI':
    case 'READY_TO_PLAN':
    case 'AWAITING_APPROVAL':
    case 'WAITING':
    case 'DELEGATED':
    case 'FAILED':
      return 'in_review';
    case 'RESOLVED':
      return 'done';
    default:
      return 'in_review';
  }
}

async function advanceTicketTo(ticketId: string, target: TicketStatus, current: TicketStatus): Promise<void> {
  const path = findPath(current, target);
  for (const step of path) {
    await updateTicketStatus(ticketId, step, ACTOR_TYPE, ACTOR_ID);
  }
}

// Creates (or, thanks to createTicket's own entity dedup, fetches) the one
// ticket for this case. Call at case-open time so the ticket exists before
// the first status sync ever needs it. Idempotent — safe to call more than
// once for the same case (e.g. on reopen, where the prior ticket may already
// be `done`/`cancelled` and therefore terminal; createTicket's dedup only
// matches non-terminal tickets, so reopening correctly opens a FRESH ticket
// rather than trying to un-terminate the old one).
export async function ensureCaseTicket(caseId: string, title: string, mode: CaseMode, openedBy: string): Promise<void> {
  try {
    await createTicket({
      title: `[Inbox Case] ${title}`,
      description: `Resolve-Work case (${mode.toLowerCase()}) opened by ${openedBy}. Tracks Discover -> Assess -> Plan -> Approve -> Execute -> Verify -> Close.`,
      type: 'inbox_case' as any,
      source: 'inbox_case',
      created_by_type: ACTOR_TYPE,
      created_by_id: ACTOR_ID,
      entity_type: 'inbox_case',
      entity_id: caseId,
      metadata: { case_id: caseId, mode },
    });
  } catch (err: any) {
    console.error(`[InboxCase] Failed to create ticket for case ${caseId}: ${err?.message}`);
  }
}

async function getCaseTicket(caseId: string) {
  const tickets = await getTicketsByEntity('inbox_case', caseId);
  if (tickets.length === 0) return null;
  // Most-recently-created non-terminal ticket, falling back to the most
  // recent overall — matches "the ticket currently representing this case"
  // even across a reopen that started a fresh one.
  const open = tickets.filter((t) => t.status !== 'done' && t.status !== 'cancelled');
  const pool = open.length > 0 ? open : tickets;
  return pool.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
}

// Walks the case's ticket toward the ticket-board bucket for `state`. Call
// this after every successful InboxCase.state write (wired centrally in
// caseRepository.ts, not scattered across every service) so a human
// watching the Tickets board sees the case move without any extra calls
// from individual services.
export async function syncTicketForCase(caseId: string, state: CaseState): Promise<void> {
  try {
    const ticket = await getCaseTicket(caseId);
    if (!ticket) return; // no ticket yet (e.g. ensureCaseTicket failed) — nothing to sync, already logged
    const target = mapCaseStateToTicketStatus(state);
    await advanceTicketTo(ticket.id, target, ticket.status as TicketStatus);
  } catch (err: any) {
    console.error(`[InboxCase] Failed to sync ticket status for case ${caseId} -> ${state}: ${err?.message}`);
  }
}

// Read-only lookup for the frontend: lets the case workspace link directly
// to this case's ticket (the board already supports deep-linking via
// `/admin/tickets?open=<ticketId>` — the same pattern the approval-email
// links use).
export async function getCaseTicketId(caseId: string): Promise<string | null> {
  try {
    const ticket = await getCaseTicket(caseId);
    return ticket?.id ?? null;
  } catch (err: any) {
    console.error(`[InboxCase] Failed to look up ticket id for case ${caseId}: ${err?.message}`);
    return null;
  }
}

// The narrative visibility layer — one human-readable line per meaningful
// step, rendered in the ticket's activity feed exactly like the existing
// platformFixAgent.ts progress notes.
export async function postCaseProgressNote(caseId: string, note: string): Promise<void> {
  try {
    const ticket = await getCaseTicket(caseId);
    if (!ticket) return;
    await addTicketComment(ticket.id, note, ACTOR_TYPE, ACTOR_ID);
  } catch (err: any) {
    console.error(`[InboxCase] Failed to post progress note for case ${caseId}: ${err?.message}`);
  }
}
