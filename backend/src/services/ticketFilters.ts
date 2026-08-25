import { Op } from 'sequelize';
import type { TicketStatus, TicketPriority, TicketType } from '../models/Ticket';

// Ticket KPI filter-scoping fix (2026-08-25) — TicketFilters + its where-clause
// builder used to live inside ticketService.ts, but ticketService.ts also
// RE-EXPORTS getTicketStats from ticketStatsService.ts (see ticketService.ts's
// own bottom `export { getTicketStats } from './ticketStatsService'` line).
// Making ticketStatsService.ts import the where-builder straight from
// ticketService.ts would have created a real circular dependency (A imports B,
// B re-exports from A) — CLAUDE.md's own "A imports B imports A ... signals a
// missing third module C that both depend on" rule, verbatim. This file is
// that third module: no dependency on either ticketService.ts or
// ticketStatsService.ts, so both can depend on it safely.
export interface TicketFilters {
  status?: TicketStatus | TicketStatus[];
  priority?: TicketPriority | TicketPriority[];
  type?: TicketType | TicketType[];
  source?: string;
  assigned_to_id?: string;
  parent_ticket_id?: string | null;
  entity_type?: string;
  entity_id?: string;
  // Ticket Board Performance fix (2026-08-18) — powers the board's "last 7 days"
  // default view. Additive/optional: every existing caller that doesn't pass this
  // keeps today's unbounded behavior unchanged. See ensureTicketIndexesSchema.ts
  // for the supporting idx_tickets_created_at index this filter relies on to stay
  // fast as the table grows.
  createdAfter?: Date;
  // Org Chart v4 (2026-08-20) — the ticket-filter-by-agent button. Pre-resolved
  // by the route (ticketCreatorFilterResolver.ts) BEFORE reaching this
  // module — this stays a pure query builder, the identity-resolution logic
  // lives in its own module (see that file's header comment for why).
  creatorMatchIds?: string[];
}

/** THE canonical "TicketFilters -> Sequelize where clause" builder — reused by
 * getTicketsForBoard() (ticketService.ts) and getTicketStats()
 * (ticketStatsService.ts) so the Kanban board and the KPI cards above it can
 * never drift apart on what a given filter set means. Pure, no I/O. */
export function buildTicketFilterWhere(filters?: TicketFilters): Record<string, any> {
  const where: Record<string, any> = {};

  if (filters?.status) {
    where.status = Array.isArray(filters.status) ? { [Op.in]: filters.status } : filters.status;
  }
  if (filters?.priority) {
    where.priority = Array.isArray(filters.priority) ? { [Op.in]: filters.priority } : filters.priority;
  }
  if (filters?.type) {
    where.type = Array.isArray(filters.type) ? { [Op.in]: filters.type } : filters.type;
  }
  if (filters?.source) where.source = filters.source;
  if (filters?.assigned_to_id) where.assigned_to_id = filters.assigned_to_id;
  if (filters?.entity_type) where.entity_type = filters.entity_type;
  if (filters?.entity_id) where.entity_id = filters.entity_id;
  if (filters?.parent_ticket_id !== undefined) {
    where.parent_ticket_id = filters.parent_ticket_id;
  }
  if (filters?.createdAfter) {
    where.created_at = { [Op.gte]: filters.createdAfter };
  }
  // Org Chart v4 (2026-08-20) — ticket-filter-by-agent button. `where` is
  // typed `Record<string, any>` (declared above), so indexing it with the
  // `Op.or` symbol key needs an explicit cast under this repo's strict
  // tsconfig — same convention already used at this exact shape elsewhere in
  // this codebase (openclawRoutes.ts, communityService.ts, notebookService.ts).
  if (filters?.creatorMatchIds && filters.creatorMatchIds.length > 0) {
    (where as any)[Op.or] = [
      { created_by_id: { [Op.in]: filters.creatorMatchIds } },
      { assigned_to_id: { [Op.in]: filters.creatorMatchIds } },
    ];
  }

  return where;
}
