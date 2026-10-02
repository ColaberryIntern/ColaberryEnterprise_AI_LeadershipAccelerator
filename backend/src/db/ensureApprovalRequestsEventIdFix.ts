import { sequelize } from '../config/database';

// Approval-correlation fix (2026-10-02). `ensureApprovalRequestsSchema.ts` shipped
// `approval_requests.event_id UUID REFERENCES work_ledger_events(event_id)` — a
// correctly-AIMED constraint (a decision really does belong to the ledger event it
// governs) that is nonetheless unsatisfiable by construction: every real caller of
// authorizeTicketDispatch() evaluates authorization BEFORE the real action runs (the
// documented "gate ahead of the action" design, agentActionAuthorizationBridge.ts's
// own header), but the matching work_ledger_events row is never written until AFTER
// the action completes. So the approval_requests INSERT always runs before any row
// with that event_id could possibly exist — the FK is checked immediately (no
// DEFERRABLE clause was ever declared), and the insert fails 100% of the time, for
// every agent, on every would-deny decision. The failure is caught by
// agentActionAuthorizationBridge.ts's own catch block and silently replaced with
// SAFE_DEFAULT (allowed: true) — not just losing the record, but overriding the real
// computed policy decision. For Reese (the one agent with a real abac_mode_override
// of 'enforce'), this has meant her genuine "needs a human" decisions were silently
// flipped to "sent anyway" since her override was set.
//
// The fix is narrow: drop only the FK, keep the column (still a real, useful
// correlation id for debugging/traceability) and keep the existing unique index
// (idx_approval_requests_event_id) — idempotency ("one decision per ledger event")
// depends on that index, not the FK, so dedup is unaffected. The reverse FK
// (work_ledger_events.authorization_decision_id -> approval_requests.id, added in the
// same original migration) is untouched: it points the other direction, from a
// LATER-written row back to an EARLIER-written one, which is temporally valid and was
// never part of this defect.
//
// Idempotent raw SQL, same established pattern as every other ensure*Schema.ts file
// in this directory — safe to rerun on every boot.
export async function ensureApprovalRequestsEventIdFix(): Promise<void> {
  try {
    await sequelize.query(
      `ALTER TABLE approval_requests DROP CONSTRAINT IF EXISTS approval_requests_event_id_fkey`,
    );
  } catch (err: any) {
    console.warn('[DB] approval_requests event_id FK fix skipped:', err?.message);
  }
  console.log('[DB] approval_requests.event_id FK (ordering defect) removed');
}
