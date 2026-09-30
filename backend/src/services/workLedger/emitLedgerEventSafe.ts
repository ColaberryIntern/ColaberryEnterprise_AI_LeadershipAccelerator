import { emitEvent } from './workLedgerService';
import type { WorkLedgerEventInput } from '../../schemas/workLedgerEventSchema';

// ProofDesk Work Ledger (Milestone 1 - Foundation, shadow mode): a safe wrapper
// around emitEvent() that NEVER throws — a ledger-write failure must never change
// a caller's own return value or error behavior. See workLedgerService.ts's header
// comment for the full Failure-First Design rationale.
//
// Extracted out of ticketService.ts (T009, ticket-ux-fixes run) so a second module
// (ticketStudentSupportReuse.ts) could reuse it without creating a circular import
// back into ticketService.ts — this is the "third module C" CLAUDE.md's
// no-circular-dependencies rule calls for when two modules would otherwise need
// each other. service label stays 'ticketService' in the emitted log line since
// every current caller is still part of that domain; revisit if a caller outside
// ticket-domain code ever needs this.
export async function emitLedgerEventSafe(input: WorkLedgerEventInput): Promise<void> {
  try {
    await emitEvent(input);
  } catch (err: any) {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'ticketService',
        event: 'work_ledger_emit_failed',
        outcome: 'failure',
        error_class: err?.error_class || err?.name || 'Error',
        context: { action_class: input.actionClass, idempotency_key: input.idempotencyKey, message: err?.message },
      }),
    );
  }
}
