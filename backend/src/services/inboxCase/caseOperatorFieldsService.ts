import InboxCase from '../../models/InboxCase';
import { PriorityBand } from '../../types/inboxCase';
import { getCaseOrThrow } from './caseRepository';
import { logCaseEvent } from './caseEventLog';

// The WRITER for the /inbox-zero operator fields on a case: snooze and
// priority override. T2 added the columns and three surfaces read them
// (the default queue filter, the skill's `snoozed` command, the admin
// snoozed view); the plan audit caught that nothing wrote them. This is the
// one path that does, so every snooze and every priority override is an
// audited, reversible event with the previous values on record.
//
// A snooze is "hidden until a date, for a stated reason" — the brief says
// "snoozed with a reason/date", and an unexplained snooze is how an item
// quietly falls off the edge of the world. So a non-null snoozed_until
// REQUIRES a reason (enforced in the Zod schema; re-checked here so a
// direct caller cannot bypass it). Clearing a snooze (snoozed_until: null)
// clears the reason with it.

export interface CaseOperatorFieldsPatch {
  snoozed_until?: string | null;
  snooze_reason?: string | null;
  priority_band?: PriorityBand | null;
  priority_reason?: string | null;
}

export type CaseOperatorFields = {
  snoozed_until: Date | null;
  snooze_reason: string | null;
  priority_band: PriorityBand | null;
  priority_reason: string | null;
};

export class CaseResolvedError extends Error {
  error_class = 'CaseResolvedError';
  constructor(caseId: string) {
    super(`Case ${caseId} is RESOLVED; snooze and priority are only meaningful on an open case`);
    this.name = 'CaseResolvedError';
  }
}

export class SnoozeRequiresReasonError extends Error {
  error_class = 'ValidationError';
  constructor() {
    super('A snooze requires a reason');
    this.name = 'SnoozeRequiresReasonError';
  }
}

function snapshot(row: InboxCase): CaseOperatorFields {
  return {
    snoozed_until: row.snoozed_until ?? null,
    snooze_reason: row.snooze_reason ?? null,
    priority_band: row.priority_band ?? null,
    priority_reason: row.priority_reason ?? null,
  };
}

export async function updateCaseOperatorFields(
  caseId: string,
  patch: CaseOperatorFieldsPatch,
  actorId: string,
): Promise<{ before: CaseOperatorFields; after: CaseOperatorFields }> {
  const row = await getCaseOrThrow(caseId);
  if (row.state === 'RESOLVED') throw new CaseResolvedError(caseId);

  const before = snapshot(row);
  const next: Partial<CaseOperatorFields> = {};

  if (patch.snoozed_until !== undefined) {
    if (patch.snoozed_until === null) {
      next.snoozed_until = null;
      next.snooze_reason = null; // clearing the snooze clears its reason
    } else {
      const reason = (patch.snooze_reason ?? before.snooze_reason ?? '').trim();
      if (!reason) throw new SnoozeRequiresReasonError();
      next.snoozed_until = new Date(patch.snoozed_until);
      next.snooze_reason = reason;
    }
  } else if (patch.snooze_reason !== undefined) {
    next.snooze_reason = patch.snooze_reason?.trim() || null;
  }

  if (patch.priority_band !== undefined) next.priority_band = patch.priority_band;
  if (patch.priority_reason !== undefined) next.priority_reason = patch.priority_reason?.trim() || null;

  await row.update({ ...next, updated_at: new Date() });
  const after = snapshot(row);

  await logCaseEvent({
    case_id: caseId,
    event_type: 'case_operator_fields_updated',
    actor_type: 'admin',
    actor_id: actorId,
    details: { before, after },
    correlation_id: row.correlation_id,
  });

  return { before, after };
}
