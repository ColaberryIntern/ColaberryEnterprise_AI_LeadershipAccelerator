import { emitEvent } from '../workLedger/workLedgerService';
import type { WorkLedgerEventInput } from '../../schemas/workLedgerEventSchema';

// Reese Agentic Employee & Manager Workspace, Phase 2 (2026-09-18) — the R13
// reconciliation memo's own recommendation: wire Reese's 5 silent behaviours
// (everything except reactive_dm_reply, which already writes real
// work_ledger_events via reeseTicketLinkService.ts) into the same real,
// already-deployed ProofDesk Work Ledger her replies use.
//
// A thin, fail-open wrapper — never `logAgentExchangeActivity()` (which also
// posts a ticket comment; these 5 callers already write their own comments/
// evidence where that makes sense, and this wrapper's only job is the ledger
// row). Matches `logAgentExchangeActivity()`'s own established contract: a
// ledger-write failure must never break the real send/closure it is
// observing, which has already happened by the time this is called.
export async function emitReeseLedgerEvent(input: WorkLedgerEventInput): Promise<void> {
  try {
    await emitEvent(input);
  } catch (e: any) {
    console.warn(JSON.stringify({
      level: 'warn',
      service: 'reese',
      event: 'work_ledger_emit_failed',
      intent: input.intent,
      error_class: e?.name || 'Error',
      message: String(e?.message || e),
    }));
  }
}
