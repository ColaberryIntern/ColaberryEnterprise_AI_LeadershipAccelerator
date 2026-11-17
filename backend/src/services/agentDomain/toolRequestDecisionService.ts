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
  normalizeAnswer,
  statusAfter,
  type AcceptedDecision,
  type DecisionIssue,
  type ProposedDecision,
} from './toolRequestDecisionContract';
import AgentDomainToolRequestPackage from '../../models/AgentDomainToolRequestPackage';
import AgentDomainToolRequestDetail from '../../models/AgentDomainToolRequestDetail';
import { createDirective } from '../managerDirectiveService';

/** Trim, the same narrowing the contract applies, so the two agree about what blank means. */
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

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

    // AF11.8. The options the agent offered, read INSIDE the same locked transaction as the
    // request, so the list the gate checks against is the list that was on the request when the
    // decision was taken. Reading it before the lock would leave a window in which the package
    // was rewritten between the read and the write, and the log would then record a choice of
    // "option B" against a B that no longer says what Ali read.
    const pkg = await AgentDomainToolRequestPackage.findByPk(row.id, { transaction });
    const offeredOptions = Array.isArray(pkg?.options)
      ? pkg.options.map((o) => ({ key: String(o?.key ?? ''), verb: String(o?.verb ?? '') }))
      : [];

    const verdict = acceptToolRequestDecision({
      proposed,
      decidedBy: email,
      requestKind: String(row.kind ?? 'change'),
      requestStatus: String(row.status),
      proposedByIdentity: String(row.requested_by_identity ?? ''),
      recordedHumans,
      approverSet: configuredApprovers(),
      knownToolNames: catalog.tools.map((t) => t.tool_name),
      offeredOptions,
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
      chosen_option: decision.chosen_option,
    }, { transaction });

    // AF11.8 — ALI'S STANDING INSTRUCTIONS, WRITTEN IN THE SAME TRANSACTION AS THE DECISION.
    //
    // Ali, 16 Nov 2026: *"when approving the functionality, I should be able to add my details of
    // how the agent should work and respond."*
    //
    // Inside the transaction, which is the opposite of the call the AF11.2 duplicate check makes
    // a few files away, and deliberately so. That check is ADVICE and losing it costs a reader a
    // hint; these are CONDITIONS, and an approval whose conditions silently failed to save is an
    // approval Ali did not give. If the instruction cannot be written, the approval does not
    // stand either.
    //
    // Only on a decision that lets the capability proceed. Attaching behaviour rules to a denial
    // or a send-back would leave instructions in force for something nobody approved.
    const instructions = text(proposed.standing_instructions);
    const letsItProceed = decision.verb === 'approve_to_build'
      || decision.verb === 'assign_existing_tool';
    if (instructions && letsItProceed) {
      const detail = await AgentDomainToolRequestDetail.findByPk(row.id, { transaction });
      if (!detail?.agent_id) {
        // Named rather than skipped. Instructions typed against a request whose detail we cannot
        // read would otherwise disappear between the console and the database.
        throw new ToolRequestDecisionRefusedError([{
          rule: 'standing_instructions_have_no_agent',
          detail: 'This request has no agent on record, so there is nothing to attach your '
            + 'instructions to. The decision was not recorded.',
        }]);
      }
      await createDirective(
        detail.agent_id,
        null,
        decision.decided_by_identity,
        instructions,
        // Scoped to THE CAPABILITY, not the agent: the ticket's words are *"attached to the
        // capability, not to the ticket or the comment thread."*
        { capabilityId: detail.capability_id ?? null, transaction },
      );
    }

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
    chosen_option: normalizeAnswer(r.chosen_option),
    request_status: '',
  }));
}
