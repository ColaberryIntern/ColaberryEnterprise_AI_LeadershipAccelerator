import { fn as sequelizeFn, col as sequelizeCol } from 'sequelize';
import { Ticket } from '../models';
import type { TicketStatus, TicketPriority, TicketType } from '../models/Ticket';

// Ticket Board Performance fix (2026-08-18) — extracted out of ticketService.ts
// (which had already exceeded CLAUDE.md's 500-line hard ceiling; per that rule
// "the next change to it MUST split it before adding new code" — this stats
// aggregation is its own clear responsibility, cleanly separable from ticket
// CRUD/state-machine logic, so it moves here rather than growing that file
// further).
//
// The founder's stat cards (Total/Open/Critical/Done) previously cost a `SELECT
// status, priority, type FROM tickets` pulling ALL 16,000+ rows to Node just to
// count them in JS (confirmed live: 29.5ms + full row-set transfer/allocation
// for a numbers-only need). Rewritten to 4 small DB-side aggregate queries run
// in parallel (Ticket.count() for the total, GROUP BY for each breakdown) —
// same public {total, open, byStatus, byPriority, byType} shape, zero contract
// change, but Postgres now returns ~25 numbers instead of 16,000+ full rows,
// and Node never allocates a JS object per ticket just to discard it after
// counting.
interface StatusCountRow { status: TicketStatus; count: string }
interface PriorityCountRow { priority: TicketPriority; count: string }
interface TypeCountRow { type: TicketType; count: string }

export interface TicketStats {
  total: number;
  open: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  byType: Record<string, number>;
}

export async function getTicketStats(): Promise<TicketStats> {
  const [total, statusRows, priorityRows, typeRows] = await Promise.all([
    Ticket.count(),
    Ticket.findAll({
      attributes: ['status', [sequelizeFn('COUNT', sequelizeCol('id')), 'count']],
      group: ['status'],
      raw: true,
    }) as unknown as Promise<StatusCountRow[]>,
    Ticket.findAll({
      attributes: ['priority', [sequelizeFn('COUNT', sequelizeCol('id')), 'count']],
      group: ['priority'],
      raw: true,
    }) as unknown as Promise<PriorityCountRow[]>,
    Ticket.findAll({
      attributes: ['type', [sequelizeFn('COUNT', sequelizeCol('id')), 'count']],
      group: ['type'],
      raw: true,
    }) as unknown as Promise<TypeCountRow[]>,
  ]);

  const byStatus: Record<string, number> = {};
  for (const row of statusRows) byStatus[row.status] = Number(row.count);

  const byPriority: Record<string, number> = {};
  for (const row of priorityRows) byPriority[row.priority] = Number(row.count);

  const byType: Record<string, number> = {};
  for (const row of typeRows) byType[row.type] = Number(row.count);

  const openCount = (byStatus.backlog || 0) + (byStatus.todo || 0) +
    (byStatus.in_progress || 0) + (byStatus.in_review || 0);

  return { total, open: openCount, byStatus, byPriority, byType };
}
