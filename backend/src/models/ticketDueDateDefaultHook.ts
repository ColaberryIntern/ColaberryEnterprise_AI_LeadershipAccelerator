import { TicketPriority } from './Ticket';
import { computeDefaultTicketDueDate } from '../services/ticketDueDateDefault';

// Ticket due-date validation gap (2026-09-28) — `Ticket` model `beforeValidate`
// hook (wired in models/Ticket.ts), mirroring `workLedger/ticketCreationLedgerHook.ts`'s
// established shape: a named, exported function (not an inline closure) so it's
// directly unit-testable without needing Sequelize to actually run it.
//
// A model hook is the one choke point every real ticket-creation path passes
// through, whichever service wrote it: `ticketService.createTicket()`,
// `ticketOrchestrator.createTrackedTicket()` (whose own `TicketInput` type has no
// `due_date` field at all to pass), and `routes/projectRoutes.ts`'s BPOS fallback
// (`(Ticket as any).create(...)`, a real Sequelize call that fires this hook the
// same as any other). No future service wrapper can silently reintroduce a
// missing due date by skipping a helper function, the way it could if this were
// enforced only inside `createTicket()` itself.
//
// Unlike the ledger hook, this one is NOT wrapped in a try/catch that swallows
// failure: its entire purpose is guaranteeing `due_date` is populated, so a
// silently-swallowed failure here would silently reintroduce the exact bug this
// hook exists to close. `computeDefaultTicketDueDate()` is a trivially pure,
// synchronous function with no I/O, so it has no real failure mode to guard
// against beyond a genuine programming bug, which should surface loudly rather
// than be hidden.
//
// Never overwrites an already-set `due_date` — only fires when the field is
// `null` or `undefined` at validation time. This includes the real case where
// `growthJourney/handoffs/assignment.ts` explicitly passes
// `due_date: row.sla_due_at ?? null`: when `sla_due_at` is genuinely null (no
// SLA policy applies), this hook correctly treats that as unset and applies the
// generic default — the honest behavior, not a bug, since a ticket with no real
// SLA-computed date should get the same default as any other creation path.
export function setDefaultTicketDueDate(instance: {
  due_date?: Date | string | null;
  priority?: TicketPriority | null;
}): void {
  if (instance.due_date === null || instance.due_date === undefined) {
    instance.due_date = computeDefaultTicketDueDate(instance.priority);
  }
}
