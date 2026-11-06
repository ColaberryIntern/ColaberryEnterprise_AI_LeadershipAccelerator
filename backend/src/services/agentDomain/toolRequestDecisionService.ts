/**
 * toolRequestDecisionService — resolve who is asking, judge it, then record the decision and move
 * the request in ONE transaction.
 *
 * AF11.3. The pure judgement is in `toolRequestDecisionContract.ts`; this reads the rosters and
 * the configuration, writes the log row and the parent status together, and does nothing else.
 *
 * ## What it deliberately does not do
 *
 * It does not write `tools_granted`, `autonomy_level`, `enabled` or `abac_mode_override`. It does
 * not touch `ai_agents` at all. `assign_existing_tool` raises an intent that AF11.4 acts on,
 * because the ticket is explicit that a grant and an autonomy level are two decisions and must
 * never be one click.
 *
 * ## The approver set is configuration
 *
 * Ali's ruling says "only Ali approves a tool grant, **for now**". The words "for now" are why
 * this reads an env var with a documented default rather than hard-coding an address: widening it
 * is then a setting change and not a rewrite, which is what the ticket asks for.
 */

import { Transaction, type Sequelize } from 'sequelize';
import AgentDomainChangeRequest from '../../models/AgentDomainChangeRequest';
import AgentDomainToolRequestDecision from '../../models/AgentDomainToolRequestDecision';
import { resolveRecordedHumans } from './recordedHumans';
import { configuredApprovers } from './approverConfiguration';
import { loadToolCatalogForMatching } from './toolCatalogForMatching';
import {
  acceptToolRequestDecision,
  statusAfter,
  type AcceptedDecision,
  type DecisionIssue,
  type ProposedDecision,
} from './toolRequestDecisionContract';

/** Thrown with the whole refusal list, so the console renders all of them at once. */
export class ToolRequestDecisionRefusedError extends Error {
  readonly issues: DecisionIssue[];

  constructor(issues: DecisionIssue[]) {
    super(issues.map((i) => i.detail).join(' '));
    this.name = 'ToolRequestDecisionRefusedError';
    this.issues = issues;
  }
}

export class ToolRequestNotFoundError extends Error {
  constructor(id: string) {
    super(`No change request with id ${id}.`);
    this.name = 'ToolRequestNotFoundError';
  }
}

/**
 * The approver set MOVED to `approverConfiguration.ts` when AF3.5's grant service needed it.
 *
 * Re-exported here so every existing caller and test keeps importing the name it already
 * imported, which is what makes the move provably not a behaviour change. It moved rather than
 * being imported from here because a second importer of THIS file would weaken the pin in
 * `toolRequestDecisionGrantsNothing.test.ts` — the same reason `resolveRecordedHumans` moved
 * into `recordedHumans.ts` during AF11.0.
 */
export { DEFAULT_TOOL_GRANT_APPROVERS, configuredApprovers } from './approverConfiguration';

export interface DecideToolRequestArgs {
  readonly sequelize: Sequelize;
  /** The acting person's email, from the verified token. Never from a request body. */
  readonly email: string;
  readonly id: string;
  readonly proposed: ProposedDecision;
}

export interface RecordedDecision extends AcceptedDecision {
  readonly change_request_id: string;
  readonly decided_at: string;
  readonly request_status: string;
}

/**
 * Decide one tool request.
 *
 * The row is re-read and LOCKED inside the transaction, so two simultaneous decisions cannot both
 * see `submitted` and both proceed. That is the same reason `decideChangeRequest` does it, and
 * the reason a status check made before the transaction opened would be worthless.
 */
export async function decideToolRequest(args: DecideToolRequestArgs): Promise<RecordedDecision> {
  const { sequelize, email, id, proposed } = args;

  // Read everything the contract needs BEFORE the transaction: it stays pure, and an unreadable
  // roster becomes a named refusal instead of a pass.
  let recordedHumans: string[] = [];
  try {
    recordedHumans = await resolveRecordedHumans(sequelize, email);
  } catch {
    recordedHumans = [];
  }
  const catalog = await loadToolCatalogForMatching().catch(() => ({ tools: [], degraded: true }));

  return sequelize.transaction(async (transaction) => {
    const row = await AgentDomainChangeRequest.findByPk(id, {
      transaction,
      lock: Transaction.LOCK.UPDATE,
    });
    if (!row) throw new ToolRequestNotFoundError(id);

    const verdict = acceptToolRequestDecision({
      proposed,
      decidedBy: email,
      requestKind: String(row.kind ?? 'change'),
      requestStatus: String(row.status),
      proposedByIdentity: String(row.requested_by_identity ?? ''),
      recordedHumans,
      approverSet: configuredApprovers(),
      knownToolNames: catalog.tools.map((t) => t.tool_name),
    });
    if (!verdict.ok) throw new ToolRequestDecisionRefusedError(verdict.issues);

    const { decision } = verdict;
    const now = new Date();

    const written = await AgentDomainToolRequestDecision.create({
      change_request_id: row.id,
      verb: decision.verb,
      decided_by_identity: decision.decided_by_identity,
      decided_at: now,
      reason: decision.reason,
      missing_field: decision.missing_field,
      assigned_tool_name: decision.assigned_tool_name,
    }, { transaction });

    // The parent keeps the governance status. `send_back` leaves it `submitted` on purpose: the
    // request is still live and the intern is expected to edit it.
    const nextStatus = statusAfter(decision.verb);
    if (nextStatus !== row.status) {
      await row.update({
        status: nextStatus,
        approved_by_identity: decision.decided_by_identity,
        approved_at: now,
        declined_reason: decision.verb === 'deny' ? decision.reason : null,
        updated_at: now,
      }, { transaction });
    }

    console.log(JSON.stringify({
      timestamp: now.toISOString(),
      level: 'info',
      service: 'backend',
      event: 'tool_request_decided',
      outcome: 'success',
      context: {
        change_request_id: row.id,
        verb: decision.verb,
        decided_by: decision.decided_by_identity,
        request_status: nextStatus,
      },
    }));

    return {
      ...decision,
      change_request_id: row.id,
      decided_at: written.decided_at.toISOString(),
      request_status: nextStatus,
    };
  });
}

/** Every decision made on a request, oldest first. The console's history panel. */
export async function loadDecisions(changeRequestId: string): Promise<RecordedDecision[]> {
  const rows = await AgentDomainToolRequestDecision.findAll({
    where: { change_request_id: changeRequestId },
    order: [['decided_at', 'ASC']],
  });
  return rows.map((r) => ({
    change_request_id: r.change_request_id,
    verb: r.verb,
    decided_by_identity: r.decided_by_identity,
    decided_at: new Date(r.decided_at).toISOString(),
    reason: r.reason ?? null,
    missing_field: r.missing_field ?? null,
    assigned_tool_name: r.assigned_tool_name ?? null,
    request_status: '',
  }));
}
