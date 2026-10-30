import { QueryTypes, Transaction, type Sequelize } from 'sequelize';
import AgentDomainChangeRequest from '../../models/AgentDomainChangeRequest';
import { AGENT_DOMAIN_ORG_ID } from './agentDomainRegistry';
import { loadMyDomains, resolveOwnerIdentityIds } from './agentDomainProvisionedReader';
import type { ChangeRequestKind } from '../../db/ensureAgentDomainChangeRequestSchema';
import {
  gateAgentChangeRequest,
  type AgentChangeRequestIssue,
  type AgentChangeRequestStatus,
} from './agentChangeRequest';

/**
 * AF4.2 — persist an intern's change request, and record which human decided it.
 *
 * The pure refusal logic lives in `agentChangeRequest.ts`. This module resolves identities, checks
 * ownership, and writes. It deliberately does nothing else: **no build is triggered, scheduled or
 * queued by an approval**, which is the ticket's fourth acceptance criterion and is asserted
 * structurally by `agentChangeRequestNoTrigger.test.ts` rather than left to a reader's judgement.
 *
 * ## Refuse the actor you cannot name
 *
 * `approvalRequestController.ts` resolves its actor as `req.admin?.email || 'unknown'` and writes
 * that into `decided_by`. `isNonHumanIdentity('unknown')` returns **false**, so the literal string
 * `'unknown'` reads as a person to the denylist, and the governance row then claims a human decided
 * something nobody did. This module throws `ActorNotResolvedError` instead. A refusal is recoverable
 * and a placeholder is not: once `'unknown'` is on the row, nothing downstream can tell it from a
 * real approval.
 */

export class ActorNotResolvedError extends Error {
  constructor() {
    super('We could not tell who you are signed in as, so nothing was recorded.');
    this.name = 'ActorNotResolvedError';
  }
}

export class DomainNotYoursError extends Error {
  constructor() {
    super('That domain is not one of yours.');
    this.name = 'DomainNotYoursError';
  }
}

export class ChangeRequestNotFoundError extends Error {
  constructor() {
    super('That change request does not exist.');
    this.name = 'ChangeRequestNotFoundError';
  }
}

/** Carries the gate's own sentences, so the portal can render them verbatim. */
export class ChangeRequestRefusedError extends Error {
  readonly issues: AgentChangeRequestIssue[];

  constructor(issues: AgentChangeRequestIssue[]) {
    super(issues.map((i) => i.detail).join(' '));
    this.name = 'ChangeRequestRefusedError';
    this.issues = issues;
  }
}

export interface ChangeRequestRow {
  id: string;
  kind: ChangeRequestKind;
  domain_key: string;
  title: string;
  description: string | null;
  status: AgentChangeRequestStatus;
  requested_by_identity: string;
  requested_at: string | null;
  approved_by_identity: string | null;
  approved_at: string | null;
  declined_reason: string | null;
}

/**
 * Is this email a person we have a record of?
 *
 * This is the ALLOWLIST half of the humanity check, and it has to be a positive lookup against
 * records we keep, because a denylist cannot establish humanity: `isNonHumanIdentity` returns
 * false for `'unknown'` and false for `'auto-approval'`, which is one letter off the real
 * production timer identity.
 *
 * Both tables are consulted on purpose. An intern is an `org_members` row in the agent-domain org;
 * Ali is an `admin_users` row. Checking only one would have silently excluded whichever group it
 * left out — and since the decide route is admin-gated, checking only `org_members` would have made
 * approval impossible for the one person the ticket names as the approver.
 */
export async function resolveRecordedHumans(
  sequelize: Sequelize,
  email: string,
): Promise<string[]> {
  const trimmed = (email || '').trim();
  if (!trimmed) return [];
  const rows = await sequelize.query<{ email: string }>(
    `SELECT au.email AS email FROM admin_users au WHERE lower(au.email) = lower($1)
      UNION
     SELECT om.email AS email
       FROM org_members om
       LEFT JOIN enrollments e ON e.id = om.enrollment_id
      WHERE om.org_id = $2
        AND (lower(om.email) = lower($1) OR lower(e.email) = lower($1))`,
    { bind: [trimmed, AGENT_DOMAIN_ORG_ID], type: QueryTypes.SELECT },
  );
  // The acting email is what the gate compares, so return THAT rather than the stored spelling:
  // a record existing is the fact being established, not how the record happens to be cased.
  return rows.length > 0 ? [trimmed] : [];
}

function project(r: AgentDomainChangeRequest): ChangeRequestRow {
  const iso = (d: Date | null): string | null => (d ? new Date(d).toISOString() : null);
  return {
    id: r.id,
    kind: (r.kind ?? 'change') as ChangeRequestKind,
    domain_key: r.domain_key,
    title: r.title,
    description: r.description ?? null,
    status: r.status,
    requested_by_identity: r.requested_by_identity,
    requested_at: iso(r.requested_at ?? null),
    approved_by_identity: r.approved_by_identity ?? null,
    approved_at: iso(r.approved_at ?? null),
    declined_reason: r.declined_reason ?? null,
  };
}

export interface FileChangeRequestArgs {
  sequelize: Sequelize;
  email: string;
  /** AF7.1. Omitted means `change`, so AF4.2 callers are unaffected. */
  kind?: ChangeRequestKind;
  domainKey: string;
  title: string;
  description?: string | null;
}

/**
 * File a change request against a domain the caller owns.
 *
 * Ownership is checked BEFORE anything is written, the same order `agentDisplayNameService` uses:
 * a 403 that happens after a row exists is not a 403.
 */
export async function fileChangeRequest(args: FileChangeRequestArgs): Promise<ChangeRequestRow> {
  const { sequelize, email, domainKey, title } = args;

  const identityIds = await resolveOwnerIdentityIds(sequelize, email);
  const recorded = await resolveRecordedHumans(sequelize, email);
  if (recorded.length === 0) throw new ActorNotResolvedError();

  const mine = await loadMyDomains(sequelize, email, identityIds);
  if (!mine.some((d) => d.domain_key === domainKey)) throw new DomainNotYoursError();

  // The gate runs even though filing cannot fail its approver rules, because `proposer_not_recorded`
  // is checked at every transition and this is the transition that establishes the proposer.
  const issues = gateAgentChangeRequest({
    status: 'submitted',
    targetStatus: 'submitted',
    proposedBy: recorded[0],
  }).filter((i) => i.rule !== 'illegal_transition');
  if (issues.length > 0) throw new ChangeRequestRefusedError(issues);

  const created = await AgentDomainChangeRequest.create({
    kind: args.kind ?? 'change',
    domain_key: domainKey,
    title,
    description: args.description ?? null,
    status: 'submitted',
    requested_by_identity: recorded[0],
  });
  return project(created);
}

export interface DecideChangeRequestArgs {
  sequelize: Sequelize;
  email: string;
  id: string;
  decision: 'approved' | 'declined';
  declinedReason?: string | null;
}

/**
 * Decide a change request. Nothing is built as a result; the row is the whole effect.
 *
 * The gate runs INSIDE the transaction against a re-read, locked row. Checking a status read
 * before the transaction opened would let two simultaneous decisions both see `submitted` and both
 * write, leaving the second to overwrite the first and the row to name the wrong human.
 */
export async function decideChangeRequest(
  args: DecideChangeRequestArgs,
): Promise<ChangeRequestRow> {
  const { sequelize, email, id, decision } = args;

  const recorded = await resolveRecordedHumans(sequelize, email);
  if (recorded.length === 0) throw new ActorNotResolvedError();
  const approver = recorded[0];

  return sequelize.transaction(async (transaction) => {
    const row = await AgentDomainChangeRequest.findByPk(id, {
      transaction,
      lock: Transaction.LOCK.UPDATE,
    });
    if (!row) throw new ChangeRequestNotFoundError();

    const issues = gateAgentChangeRequest({
      status: row.status,
      targetStatus: decision,
      proposedBy: row.requested_by_identity,
      approver,
      recordedHumanApprovers: recorded,
      declinedReason: args.declinedReason ?? null,
    });
    if (issues.length > 0) throw new ChangeRequestRefusedError(issues);

    // The approver and the timestamp are written TOGETHER, which the table also enforces with
    // `chk_adcr_decided_together`. A half-written decision is the governance record this ticket
    // exists to prevent.
    const now = new Date();
    await row.update(
      decision === 'approved'
        ? { status: 'approved', approved_by_identity: approver, approved_at: now, updated_at: now }
        : {
          status: 'declined',
          approved_by_identity: approver,
          approved_at: now,
          declined_reason: (args.declinedReason ?? '').trim(),
          updated_at: now,
        },
      { transaction },
    );
    return project(row);
  });
}

/** An intern's own requests, across every domain they own. */
export async function listMyChangeRequests(
  sequelize: Sequelize,
  email: string,
  kind?: ChangeRequestKind,
): Promise<ChangeRequestRow[]> {
  const recorded = await resolveRecordedHumans(sequelize, email);
  if (recorded.length === 0) throw new ActorNotResolvedError();
  const rows = await AgentDomainChangeRequest.findAll({
    where: { requested_by_identity: recorded[0], ...(kind ? { kind } : {}) },
    order: [['requested_at', 'DESC']],
    limit: 200,
  });
  return rows.map(project);
}

/** The whole queue, for the person who triages it. Admin-gated at the route. */
export async function listAllChangeRequests(
  _sequelize: Sequelize,
  status?: AgentChangeRequestStatus,
  kind?: ChangeRequestKind,
): Promise<ChangeRequestRow[]> {
  const where = { ...(status ? { status } : {}), ...(kind ? { kind } : {}) };
  const rows = await AgentDomainChangeRequest.findAll({
    ...(Object.keys(where).length ? { where } : {}),
    order: [['requested_at', 'DESC']],
    limit: 200,
  });
  return rows.map(project);
}
