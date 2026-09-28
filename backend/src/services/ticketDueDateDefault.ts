import { TicketPriority } from '../models/Ticket';

// Ticket due-date validation gap (2026-09-28) — Ali: "Tickets should not be
// allowed to be created with no due date. That's how ghost tickets and
// looking up to 500 open tickets happens." Confirmed system-wide, not
// Reese-only: exactly 3 real Sequelize choke points create a `Ticket` row
// (ticketService.createTicket, ticketOrchestrator.createTrackedTicket,
// routes/projectRoutes.ts's BPOS fallback), and only 2 of ~32 real call
// sites feeding them ever pass a `due_date` today.
//
// This is the pure default-computation half of the fix (see
// ticketDueDateDefaultHook.ts for where it's actually applied). Keyed on
// the ticket's real `priority` field (always populated — the column has a
// real `defaultValue: 'medium'`), not `estimated_effort` (frequently
// null). The hours themselves are a new mapping, not a pre-existing
// codebase value: anchored inside the real, already-shipped precedent's
// own range (autonomousEngine.ts's `estimateDueDate()`, 1-72h, itself
// falling back to 24h for an unrecognized value) and extended once,
// reasonably, for `low`.
const PRIORITY_HOURS: Record<TicketPriority, number> = {
  critical: 24,
  high: 48,
  medium: 72,
  low: 120,
};

const FALLBACK_HOURS = PRIORITY_HOURS.medium;

export function computeDefaultTicketDueDate(
  priority: TicketPriority | null | undefined,
  now: Date = new Date(),
): Date {
  const hours = (priority && PRIORITY_HOURS[priority]) || FALLBACK_HOURS;
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}
