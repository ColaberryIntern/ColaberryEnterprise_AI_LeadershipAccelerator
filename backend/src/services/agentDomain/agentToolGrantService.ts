/**
 * agentToolGrantService — the grant. It writes `tools_granted` and proves it wrote nothing else.
 *
 * AF3.5. The pure judgement is in `agentToolGrantContract.ts`; this reads the rosters, the
 * approver configuration, the confirmation store and the registered tool list, then records the
 * grant and updates the column in ONE transaction.
 *
 * ## The read-back diff is in the production path, not only in a test
 *
 * The ticket asks for the grant to be verified "by reading the whole agent row back and diffing
 * it, not by asserting the one field you set". A test that does that proves the paths the test
 * drives. Doing it inside the transaction proves it for every call, including ones written
 * later: if anything other than `tools_granted` moved between the pre-read and the post-read,
 * this throws and the transaction rolls back, so a future edit that quietly widened autonomy
 * would fail loudly at the moment it tried rather than in review.
 *
 * ## Why this does not call the classifier
 *
 * `classifyAgentAutonomyLevel` derives an autonomy level from the tool list, and its
 * `communicate` tier matches `send_` and `_email`. So granting `send_email` would, if anything
 * reclassified, lift an agent from observe to communicate as a side effect of a tool grant —
 * precisely the "two decisions, one click" failure the ticket names. Nothing here imports the
 * classifier or the reclassification service, and `agentToolGrantWritesOneColumn.test.ts`
 * asserts that structurally rather than trusting this comment.
 */

import { Transaction, type Sequelize } from 'sequelize';
import AiAgent from '../../models/AiAgent';
import AgentDomainToolGrant from '../../models/AgentDomainToolGrant';
import AgentDomainToolRequestDetail from '../../models/AgentDomainToolRequestDetail';
import type { ToolEnvironment } from '../../db/ensureAgentDomainToolRequestSchema';
import { datasetNames, loadDatasetCatalog } from './datasetCatalog';
import { resolveRecordedHumans } from './recordedHumans';
import { configuredApprovers } from './approverConfiguration';
import { loadConfirmedCapabilityIds } from './capabilityConfirmationService';
import { allCapabilities, effectiveValidationState } from './capabilityRecord';
import { registeredToolNames } from './registeredTools';
import { acceptToolGrant, type GrantIssue } from './agentToolGrantContract';

/** Thrown with the whole refusal list, so a caller renders all of them at once. */
export class ToolGrantRefusedError extends Error {
  readonly issues: GrantIssue[];

  constructor(issues: GrantIssue[]) {
    super(issues.map((i) => i.detail).join(' '));
    this.name = 'ToolGrantRefusedError';
    this.issues = issues;
  }
}

/**
 * Thrown when the grant wrote something it must not have. This is a contract violation, not a
 * user error: it means the code changed under the invariant.
 */
export class ToolGrantTouchedMoreThanToolsError extends Error {
  readonly changed: string[];

  constructor(changed: string[]) {
    super(`A tool grant changed ${changed.join(', ')}. A grant writes tools_granted and nothing `
      + 'else. The transaction was rolled back.');
    this.name = 'ToolGrantTouchedMoreThanToolsError';
    this.changed = changed;
  }
}

export interface GrantToolArgs {
  readonly agentId: string;
  readonly toolName: string;
  readonly capabilityId: string;
  /** The approver's identity, from the verified token. Never `|| 'unknown'`. */
  readonly approvedBy: string;
  /** Who asked for the capability, when known. Refused as the approver. */
  readonly proposedBy?: string | null;
  /**
   * The tool request this grant answers, when it answers one. AF11.4.
   *
   * PROVENANCE, not authority: nothing in `acceptToolGrant` judges it, because what makes a
   * grant legal is a confirmed capability and a configured approver, and a request id is
   * neither. It is recorded so the ledger can answer "which request did this settle", which is
   * the question the review console asks. Absent for a grant made for a capability promotion.
   */
  readonly changeRequestId?: string | null;
  /**
   * Where this grant applies. Phase 2b. REQUIRED, with no default.
   *
   * A default would be a guess about where a tool runs, and `'sandbox'` is the dangerous guess
   * to make silently: it reads as the safe one while recording that a production grant is not a
   * production grant. Every caller states it, and `tsc` is what makes that true — adding the
   * field without a default broke both call sites at compile time, which is the point.
   */
  readonly environment: ToolEnvironment;
  /**
   * The datasets this grant covers. Omitted means none are recorded, which is correct for a tool
   * that reads no table.
   *
   * Checked against `dataset_registry` and, when this grant answers a request, against what that
   * request declared. The caller passes it rather than the service deriving it from the request
   * so that an approver can one day record LESS than was asked for; until that path exists the
   * ordinary caller passes the request's own declaration straight through.
   */
  readonly datasets?: readonly string[];
}

export interface GrantToolResult {
  readonly grantId: string;
  readonly agentId: string;
  readonly agentName: string;
  readonly toolName: string;
  readonly capabilityId: string;
  readonly approvedBy: string;
  readonly toolsGranted: string[];
  /**
   * The request this grant is recorded against, read back off the row.
   *
   * Read back rather than echoed: on a re-grant `findOrCreate` returns the row that already
   * exists, which keeps the provenance it was written with. So this is what the ledger SAYS,
   * not what the caller asked it to say — otherwise a second call would appear to have changed
   * a record it deliberately left alone.
   */
  readonly changeRequestId: string | null;
  /**
   * The scope on the row, READ BACK, for the same reason `changeRequestId` is.
   *
   * On a re-grant `findOrCreate` returns the existing row and does not rewrite it, so this is
   * what the ledger SAYS rather than what the caller asked it to say. The contract refuses a
   * re-grant that would widen the scope, so the two can only differ by a narrowing — and a
   * caller who narrowed needs to be told the row still holds the wider scope rather than
   * believing their narrower one took effect.
   */
  readonly environment: string;
  readonly datasets: string[];
  /** True when the agent already held the tool and nothing changed. */
  readonly unchanged: boolean;
}

/** The fields a grant must never move. Read before, read after, compared. */
const MUST_NOT_CHANGE = [
  'autonomy_level',
  'autonomy_level_set_at',
  'autonomy_level_source',
  'enabled',
  'abac_mode_override',
  'status',
  'agent_name',
] as const;

type Snapshot = Record<string, string>;

/** A comparable snapshot. Dates and nulls are stringified so the diff is value-based. */
function snapshot(agent: InstanceType<typeof AiAgent>): Snapshot {
  const out: Snapshot = {};
  for (const field of MUST_NOT_CHANGE) {
    const value = (agent as unknown as Record<string, unknown>)[field];
    out[field] = value instanceof Date ? value.toISOString() : JSON.stringify(value ?? null);
  }
  return out;
}

function diff(before: Snapshot, after: Snapshot): string[] {
  return MUST_NOT_CHANGE.filter((f) => before[f] !== after[f]);
}

/** `tools_granted` is jsonb and may be an array, a JSON string, or null depending on the writer. */
function toolsOf(agent: InstanceType<typeof AiAgent>): string[] {
  const raw = agent.tools_granted as unknown;
  if (Array.isArray(raw)) return raw.map((t) => String(t));
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map((t) => String(t)) : [];
    } catch { return []; }
  }
  return [];
}

/** Everything the gate judges, read before the transaction so the contract stays pure. */
async function gatherFacts(sequelize: Sequelize, args: GrantToolArgs) {
  // An unreadable roster must become a NAMED refusal, not a thrown error and not a pass. The
  // contract turns an empty roster into `approver_roster_absent`.
  let recordedHumans: string[] | null = null;
  try {
    recordedHumans = await resolveRecordedHumans(sequelize, args.approvedBy);
  } catch {
    recordedHumans = [];
  }

  // Same posture for the confirmation store: if it cannot be read, no capability is confirmed,
  // so the grant is refused rather than allowed.
  let confirmedIds: string[] = [];
  try {
    confirmedIds = await loadConfirmedCapabilityIds();
  } catch {
    confirmedIds = [];
  }

  // A capability id that matches no record leaves the state null, which the contract refuses as
  // `capability_not_confirmed` — the right answer, since a capability nobody can find has
  // certainly not been proved by hand.
  const capability = allCapabilities().find((c) => c.capability_id === args.capabilityId);
  const capabilityState = capability
    ? effectiveValidationState(capability, confirmedIds)
    : null;

  // Agent Tools Phase 4: the tools the capability itself asks for, so the contract can refuse a
  // grant for a tool the capability never named.
  //
  // `null` ONLY when the record could not be found, which the contract fails closed on. A found
  // capability with no `required_tools` yields an empty array, which is a different refusal
  // (`tool_not_required_by_capability`) and must not be collapsed into "unreadable".
  const capabilityRequiredTools: readonly string[] | null = capability
    ? [...(capability.required_tools ?? [])]
    : null;

  // Phase 2b — the catalog a dataset name on this grant has to appear in. `loadDatasetCatalog`
  // never rejects; an unreadable or empty catalog comes back `catalog_absent`, which the contract
  // turns into `grant_dataset_roster_absent` when the grant actually names something. Passed as
  // `null` rather than `[]` because the contract treats those as different facts and only one of
  // them is a refusal.
  const catalog = await loadDatasetCatalog(sequelize);
  const knownDatasets: readonly string[] | null = catalog.catalog_absent
    ? null
    : datasetNames(catalog);

  // Phase 2b — THE CEILING, when a request is cited.
  //
  // Read HERE rather than taken from the caller, which is the same move as the read-back diff
  // below and for the same stated reason: a check the caller supplies the inputs to only proves
  // what the caller believes. `assignExistingToolService` passes the request's declaration
  // through, so today the comparison confirms the two agree. It becomes load-bearing the moment
  // anything computes a scope instead of copying one — and it is already live for a
  // HALF-APPLIED DEPLOY, where Phase 2a's `ADD COLUMN` ran and its `SET NOT NULL` did not: the
  // detail row then carries a null environment, and this refuses the grant rather than writing
  // a permission that does not say where it applies.
  //
  // `undefined` means no request was cited and there is no ceiling. `null` means one was cited
  // and could not be read, which is a refusal. Those must not collapse.
  let requestScope: { environment: string; datasets: readonly string[] } | null | undefined;
  if (args.changeRequestId) {
    requestScope = null;
    try {
      const detail = await AgentDomainToolRequestDetail.findByPk(args.changeRequestId);
      const declared = String(detail?.environment ?? '').trim();
      if (detail && declared) {
        requestScope = {
          environment: declared,
          datasets: Array.isArray(detail.read_datasets)
            ? detail.read_datasets.map((d) => String(d))
            : [],
        };
      }
    } catch {
      // Stays null. An unreadable ceiling is refused by name, never treated as absent.
      requestScope = null;
    }
  }

  return { recordedHumans, capabilityState, capabilityRequiredTools, knownDatasets, requestScope };
}

/**
 * Grant one tool to one agent, for one confirmed capability, on one person's authority.
 *
 * Idempotent: granting a tool the agent already holds records nothing new and returns
 * `unchanged: true`. The unique index on (agent_id, tool_name) means a concurrent retry cannot
 * produce a second row even if two callers pass the gate at once.
 */
export async function grantToolToAgent(
  sequelize: Sequelize,
  args: GrantToolArgs,
): Promise<GrantToolResult> {
  const {
    recordedHumans, capabilityState, capabilityRequiredTools, knownDatasets, requestScope,
  } = await gatherFacts(sequelize, args);
  const registered = registeredToolNames();

  return sequelize.transaction(async (transaction) => {
    const agent = await AiAgent.findByPk(args.agentId, {
      transaction,
      lock: Transaction.LOCK.UPDATE,
    });

    // Phase 2b — what the ledger ALREADY says about this (agent, tool), read inside the
    // transaction and under the same lock, so a concurrent grant cannot slip between the check
    // and the write. `undefined` when this is the first grant of this tool to this agent.
    //
    // Read before the gate rather than after `findOrCreate`, because by then the decision has
    // been made: `findOrCreate` keeps the existing row, so a caller asking for a wider scope
    // would get a 200 and a row that does not match it. The contract refuses that instead.
    const existing = await AgentDomainToolGrant.findOne({
      where: { agent_id: args.agentId, tool_name: args.toolName },
      transaction,
    });
    const recordedScope = existing
      ? {
        environment: String(existing.environment ?? ''),
        datasets: Array.isArray(existing.datasets)
          ? existing.datasets.map((d) => String(d))
          : [],
      }
      : undefined;

    const verdict = acceptToolGrant({
      agent: agent
        ? { id: agent.id, agentName: agent.agent_name, toolsGranted: toolsOf(agent) }
        : null,
      toolName: args.toolName,
      capabilityId: args.capabilityId,
      capabilityState,
      approvedBy: args.approvedBy,
      recordedHumans,
      approvers: configuredApprovers(),
      proposedBy: args.proposedBy ?? null,
      registeredToolNames: registered,
      capabilityRequiredTools,
      environment: args.environment,
      datasets: args.datasets ?? [],
      knownDatasets,
      requestScope,
      recordedScope,
    });
    if (!verdict.ok) throw new ToolGrantRefusedError(verdict.issues);

    const { grant } = verdict;
    const before = snapshot(agent!);

    // The record first. If the column update fails, the transaction takes the row with it, so
    // there is never a grant recorded that the agent does not hold.
    const [row] = await AgentDomainToolGrant.findOrCreate({
      where: { agent_id: grant.agentId, tool_name: grant.toolName },
      defaults: {
        agent_id: grant.agentId,
        agent_name: grant.agentName,
        tool_name: grant.toolName,
        capability_id: grant.capabilityId,
        change_request_id: args.changeRequestId ?? null,
        approved_by_identity: grant.approvedBy,
        environment: grant.environment,
        datasets: [...grant.datasets],
      },
      transaction,
    });

    if (!grant.alreadyGranted) {
      await agent!.update({ tools_granted: [...grant.toolsGrantedAfter] }, { transaction });
    }

    // READ IT BACK. Not the field that was set — the fields that must not have moved.
    const after = await AiAgent.findByPk(args.agentId, { transaction });
    const moved = diff(before, snapshot(after!));
    if (moved.length > 0) throw new ToolGrantTouchedMoreThanToolsError(moved);

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      service: 'agentToolGrantService',
      event: 'agent_tool_granted',
      outcome: 'success',
      context: {
        agent_name: grant.agentName,
        tool_name: grant.toolName,
        capability_id: grant.capabilityId,
        change_request_id: row.change_request_id ?? null,
        approved_by: grant.approvedBy,
        // Off the ROW, so the log records the scope that is now on the ledger rather than the
        // one that was asked for. On a re-grant those differ, and the log should say which.
        environment: row.environment ?? null,
        datasets: Array.isArray(row.datasets) ? row.datasets : [],
        unchanged: grant.alreadyGranted,
      },
    }));

    return {
      grantId: row.id,
      agentId: grant.agentId,
      agentName: grant.agentName,
      toolName: grant.toolName,
      capabilityId: grant.capabilityId,
      approvedBy: grant.approvedBy,
      toolsGranted: [...grant.toolsGrantedAfter],
      changeRequestId: row.change_request_id ?? null,
      environment: String(row.environment ?? ''),
      datasets: Array.isArray(row.datasets) ? row.datasets.map((d) => String(d)) : [],
      unchanged: grant.alreadyGranted,
    };
  });
}

/** Every grant recorded for one agent, newest last. Read-only. */
export async function listGrantsForAgent(agentId: string): Promise<AgentDomainToolGrant[]> {
  return AgentDomainToolGrant.findAll({
    where: { agent_id: agentId },
    order: [['approved_at', 'ASC']],
  });
}
