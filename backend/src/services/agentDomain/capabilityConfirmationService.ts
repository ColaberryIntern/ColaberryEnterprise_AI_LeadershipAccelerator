/**
 * capabilityConfirmationService — resolve who is asking, then write the confirmation down.
 *
 * AF11.0. The pure judgement lives in `capabilityConfirmationContract.ts`; this module reads the
 * rosters, checks the caller is a Super Admin, and persists. It deliberately does nothing else:
 * **no tool is granted, no agent is touched, no capability file is edited.** Those are AF3.5's
 * and AF11.4's, and none of them is reachable from here.
 *
 * ## The rosters are read HERE and passed IN
 *
 * Same split as `agentChangeRequestService.fileChangeRequest`: the contract stays a function of
 * its inputs, and an unreadable roster becomes a named refusal rather than a pass. That matters
 * more here than anywhere else in this subtree, because the thing being refused is the authority
 * to make a capability eligible for a tool grant.
 *
 * ## Why `resolveRecordedHumans` and not a new roster
 *
 * AF11.0 says so, and it lives in `recordedHumans.ts` (moved there by this ticket, because
 * importing `agentChangeRequestService` for it trips a deliberate pin that allows only two
 * importers of that module). The reason it is a positive lookup is in its own header: humanity is established by a
 * POSITIVE lookup against records we keep, because a denylist cannot do it —
 * `isNonHumanIdentity('unknown')` returns false, and `'unknown'` is exactly what
 * `approvalRequestController` writes when it cannot resolve anybody.
 */

import type { Sequelize } from 'sequelize';
import AgentDomainCapabilityConfirmation from '../../models/AgentDomainCapabilityConfirmation';
import { allCapabilities } from './capabilityRecord';
import { resolveRecordedHumans } from './recordedHumans';
import {
  acceptCapabilityConfirmation,
  type ConfirmationIssue,
  type ConfirmedCapability,
} from './capabilityConfirmationContract';
import type { EvidenceRecord } from './promotionContract';

/** Thrown with the whole refusal list, so a caller renders all of them at once. */
export class CapabilityConfirmationRefusedError extends Error {
  readonly issues: ConfirmationIssue[];

  constructor(issues: ConfirmationIssue[]) {
    super(issues.map((i) => i.detail).join(' '));
    this.name = 'CapabilityConfirmationRefusedError';
    this.issues = issues;
  }
}

/** Ali's ruling, 4 Nov 2026. The only role that may move a capability out of draft. */
export const CONFIRMING_ROLE = 'super_admin';

export interface RecordConfirmationArgs {
  readonly sequelize: Sequelize;
  /** The acting person's email, from the verified token. Never from a request body. */
  readonly email: string;
  /** The acting person's role, from the verified token. */
  readonly actorRole: string;
  readonly capabilityId: string;
  readonly evidence: Partial<EvidenceRecord>;
}

/** Every capability id with a confirmation recorded. The input to the replaced invariant. */
export async function loadConfirmedCapabilityIds(): Promise<string[]> {
  const rows = await AgentDomainCapabilityConfirmation.findAll({ attributes: ['capability_id'] });
  return rows.map((r) => r.capability_id);
}

/** One capability's confirmation, or null. */
export async function loadConfirmation(
  capabilityId: string,
): Promise<ConfirmedCapability | null> {
  const row = await AgentDomainCapabilityConfirmation.findByPk(capabilityId);
  if (!row) return null;
  return {
    capability_id: row.capability_id,
    confirmed_by_identity: row.confirmed_by_identity,
    evidence: {
      kind: row.evidence_kind,
      source: row.evidence_source,
      observed_at: row.evidence_observed_at,
      evaluated_by: row.evidence_evaluated_by,
      summary: row.evidence_summary ?? '',
    },
  };
}

/**
 * Record that a Super Admin confirmed a capability.
 *
 * Refuses before writing anything, for the same reason ownership is checked before a change
 * request is filed: a refusal that happens after a row exists is not a refusal.
 */
export async function recordCapabilityConfirmation(
  args: RecordConfirmationArgs,
): Promise<ConfirmedCapability> {
  const { sequelize, email, actorRole, capabilityId, evidence } = args;

  // Read the rosters first. An unreadable roster is reported as unreadable rather than as an
  // empty one, because "we could not tell" and "nobody qualifies" are different facts and only
  // one of them is the person's problem.
  let recordedHumans: string[] = [];
  let rosterReadable = true;
  try {
    recordedHumans = await resolveRecordedHumans(sequelize, email);
  } catch {
    rosterReadable = false;
  }

  const known = allCapabilities();
  const alreadyConfirmedIds = await loadConfirmedCapabilityIds();

  const verdict = acceptCapabilityConfirmation({
    proposed: { capability_id: capabilityId, confirmed_by: email, evidence },
    knownCapabilityIds: known.map((c) => c.capability_id),
    rejectedCapabilityIds: known
      .filter((c) => c.requirement_validation_state === 'rejected')
      .map((c) => c.capability_id),
    alreadyConfirmedIds,
    recordedHumans,
    rosterReadable,
    confirmerIsSuperAdmin: actorRole === CONFIRMING_ROLE,
  });
  if (!verdict.ok) throw new CapabilityConfirmationRefusedError(verdict.issues);

  const { confirmation } = verdict;
  await AgentDomainCapabilityConfirmation.create({
    capability_id: confirmation.capability_id,
    confirmed_by_identity: confirmation.confirmed_by_identity,
    evidence_kind: confirmation.evidence.kind,
    evidence_source: confirmation.evidence.source,
    evidence_observed_at: confirmation.evidence.observed_at,
    evidence_evaluated_by: confirmation.evidence.evaluated_by,
    evidence_summary: confirmation.evidence.summary ?? '',
  });

  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'info',
    service: 'backend',
    event: 'capability_confirmed',
    outcome: 'success',
    context: {
      capability_id: confirmation.capability_id,
      confirmed_by: confirmation.confirmed_by_identity,
      evidence_kind: confirmation.evidence.kind,
    },
  }));

  return confirmation;
}
