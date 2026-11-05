import { QueryTypes, Transaction, type Sequelize } from 'sequelize';
import AgentDomainChangeRequest from '../../models/AgentDomainChangeRequest';
import AgentDomainToolRequestDetail from '../../models/AgentDomainToolRequestDetail';
import AgentDomainToolDuplicateCheck from '../../models/AgentDomainToolDuplicateCheck';
import { resolveRecordedHumans } from './recordedHumans';
import { checkForDuplicateTool, type DuplicateCandidate } from './toolDuplicateCheck';
import { loadToolCatalogForMatching } from './toolCatalogForMatching';
import { loadMyDomains, resolveOwnerIdentityIds } from './agentDomainProvisionedReader';
import type { ChangeRequestKind } from '../../db/ensureAgentDomainChangeRequestSchema';
import { allCapabilities } from './capabilityRecord';
import {
  DUPLICATE_OPEN_REQUEST,
  TOOL_REQUEST_DETAIL_MISSING,
  TOOL_REQUEST_ON_A_CHANGE,
  acceptToolRequest,
  type ToolRequestDetail,
  type ToolRequestDetailInput,
  type ToolRequestIssue,
} from './toolRequestContract';
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

/**
 * AF11.1. An incomplete tool request, with the field names that are wrong.
 *
 * A SEPARATE class from `ChangeRequestRefusedError` because the two answer different HTTP statuses
 * and mean different things: that one is "your decision may not stand" (409, the caller is
 * authorized and the decision is not allowed), this one is "this request is not yet fileable"
 * (400, go and fill these in). Collapsing them would leave an intern unable to tell whether to
 * edit the form or stop trying.
 */
export class ToolRequestRefusedError extends Error {
  readonly issues: ToolRequestIssue[];

  constructor(issues: ToolRequestIssue[]) {
    super(issues.map((i) => i.detail).join(' '));
    this.name = 'ToolRequestRefusedError';
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
  /**
   * AF11.1. Present on a `tool` request and `null` on a `change` one.
   *
   * On the SAME row the approver already reads, so the review console in AF11.3 needs one call
   * rather than a second fetch per request — the ticket's own criterion is that all six groups are
   * visible without opening another screen.
   */
  tool_request?: ToolRequestDetail | null;
  /**
   * AF11.2. The duplicate-tool check AS IT WAS COMPUTED when the request was filed.
   *
   * Read off the stored row, never recomputed here. The ticket's criterion is exact: *"The stored
   * result is what the reviewer sees. Re-rendering the page does not recompute a different
   * answer."* Recomputing on read would also mean the answer changed every time somebody granted a
   * tool, so two people looking at one request on the same morning could disagree about it.
   *
   * `null` means no check is stored, which is NOT the same as "no duplicates found". A check that
   * ran and found nothing is a row with `candidate_count: 0`.
   */
  duplicate_check?: StoredDuplicateCheck | null;
}

/**
 * A stored duplicate check, in the shape a reader gets.
 *
 * Deliberately not the same type as `DuplicateCheckResult`: that one carries
 * `ignored_common_tokens`, which is matcher diagnostics rather than something an approver needs on
 * the row, and it has no `checked_at` because the matcher is pure and holds no clock.
 */
export interface StoredDuplicateCheck {
  checked_at: string;
  catalog_size: number;
  catalog_absent: boolean;
  threshold: number;
  candidates: DuplicateCandidate[];
  behaviorless_tools: string[];
}

/**
 * Re-exported from `recordedHumans.ts`, where it now lives.
 *
 * It moved for AF11.0: the capability-confirmation service needs the same roster, and importing
 * THIS module to get it would have tripped `agentChangeRequestNoTrigger.test.ts`, which allows
 * only two importers so that nothing can quietly start acting on approvals. The pin is right, so
 * the function moved rather than the allowlist widening. Re-exported so every existing caller and
 * test is untouched.
 */
export { resolveRecordedHumans };

/** A stored detail row, back in the contract's own shape. */
function projectDetail(d: AgentDomainToolRequestDetail): ToolRequestDetail {
  const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
  return {
    agent_id: d.agent_id,
    domain_key: d.domain_key,
    tool_name: d.tool_name,
    purpose: d.purpose,
    reads: strings(d.reads),
    produces: strings(d.produces),
    capability_id: d.capability_id,
    task_unblocked: d.task_unblocked,
    manual_today: d.manual_today,
    // `DATEONLY` already comes back as `YYYY-MM-DD`; `String()` rather than a `Date` round trip,
    // which is what would let a timezone move a needed-by date a day either way.
    needed_by: String(d.needed_by),
    run_frequency: d.run_frequency,
    touches: strings(d.touches),
    inputs: strings(d.inputs),
    writes: d.writes,
    side_effects: d.side_effects ?? null,
    reversible: d.reversible ?? null,
    reversibility_note: d.reversibility_note ?? null,
  };
}

/**
 * A stored duplicate check, back in the shape a reader gets.
 *
 * `threshold` is `NUMERIC` and this driver returns `NUMERIC` as a STRING, so it is parsed here
 * rather than handed on as something that looks like a number and compares like text. `candidates`
 * is already typed going in, so the cast is a re-assertion of a shape this codebase wrote, not a
 * guess about one it received.
 */
function projectDuplicateCheck(c: AgentDomainToolDuplicateCheck): StoredDuplicateCheck {
  return {
    checked_at: new Date(c.checked_at).toISOString(),
    catalog_size: Number(c.catalog_size),
    catalog_absent: Boolean(c.catalog_absent),
    threshold: Number(c.threshold),
    candidates: Array.isArray(c.candidates) ? (c.candidates as DuplicateCandidate[]) : [],
    behaviorless_tools: Array.isArray(c.behaviorless_tools)
      ? c.behaviorless_tools.map(String)
      : [],
  };
}

/**
 * Load the details for a page of requests in ONE query.
 *
 * Per request would be N+1 on a queue the whole point of which is to be read in a list.
 */
async function loadDetails(ids: string[]): Promise<Map<string, ToolRequestDetail>> {
  if (ids.length === 0) return new Map();
  const rows = await AgentDomainToolRequestDetail.findAll({ where: { change_request_id: ids } });
  return new Map(rows.map((r) => [r.change_request_id, projectDetail(r)]));
}

/** Same one-query rule as `loadDetails`, for the same reason. */
async function loadDuplicateChecks(ids: string[]): Promise<Map<string, StoredDuplicateCheck>> {
  if (ids.length === 0) return new Map();
  const rows = await AgentDomainToolDuplicateCheck.findAll({
    where: { change_request_id: ids },
  });
  return new Map(rows.map((r) => [r.change_request_id, projectDuplicateCheck(r)]));
}

/** Attach each row's detail and stored duplicate check, leaving `null` where there is none. */
async function withDetails(rows: AgentDomainChangeRequest[]): Promise<ChangeRequestRow[]> {
  const toolIds = rows.filter((r) => r.kind === 'tool').map((r) => r.id);
  // Two queries for the whole page, not two per row. Sequential rather than concurrent because
  // the second is cheap and a shared pool under a queue read is not the place to double demand.
  const details = await loadDetails(toolIds);
  const checks = await loadDuplicateChecks(toolIds);
  return rows.map((r) => ({
    ...project(r),
    tool_request: details.get(r.id) ?? null,
    duplicate_check: checks.get(r.id) ?? null,
  }));
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

/**
 * Does this person already have an undecided request open for this tool on this agent?
 *
 * WHAT THIS CLOSES. The double-click, and the retry after a response that never arrived: a form
 * submitted twice would otherwise put two identical requests in the queue Ali has to triage, and
 * `CLAUDE.md` is explicit that a script which "works once but breaks on the second run" is a
 * production defect rather than a rough edge.
 *
 * WHAT IT DOES NOT CLAIM, stated rather than left for someone to discover. This is a check, not a
 * constraint, so two genuinely simultaneous transactions could both pass it. The constraint that
 * would make it structural needs `status` on the detail row, and putting a status there is exactly
 * the second approval spine the whole design refuses — a status in two places is a status two
 * readers will disagree about. So the sequential case is closed and the concurrent one is
 * accepted, visibly, with a duplicate request in a queue as the worst outcome rather than a
 * duplicate grant.
 *
 * `lower()` on the tool name because `read_feed` and `Read_Feed` are the same ask, and a
 * near-duplicate that slips through is worse than none: it teaches the approver to stop reading.
 */
async function hasOpenRequestFor(
  sequelize: Sequelize,
  requester: string,
  detail: ToolRequestDetail,
): Promise<boolean> {
  const rows = await sequelize.query<{ id: string }>(
    `SELECT r.id AS id
       FROM agent_domain_tool_request_details d
       JOIN agent_domain_change_requests r ON r.id = d.change_request_id
      WHERE r.requested_by_identity = $1
        AND r.status = 'submitted'
        AND d.agent_id = $2
        AND lower(d.tool_name) = lower($3)
      LIMIT 1`,
    { bind: [requester, detail.agent_id, detail.tool_name], type: QueryTypes.SELECT },
  );
  return rows.length > 0;
}

export interface FileChangeRequestArgs {
  sequelize: Sequelize;
  email: string;
  /** AF7.1. Omitted means `change`, so AF4.2 callers are unaffected. */
  kind?: ChangeRequestKind;
  domainKey: string;
  title: string;
  description?: string | null;
  /**
   * AF11.1. REQUIRED when `kind` is `tool`, refused otherwise.
   *
   * This is a deliberate narrowing of what AF7.1 accepted. Between AF7.1 and now, a tool request
   * was a title and a description, and approving one did nothing — the service's own words,
   * unchanged below: *"Nothing is built as a result; the row is the whole effect."* So no behaviour
   * that worked is being taken away; what is being removed is the ability to file a tool request
   * that the approver cannot act on. No frontend sends `kind` at all today
   * (`frontend/src/services/agentDomainApi.ts` has no such field), so the narrowed contract reaches
   * no existing caller.
   */
  toolRequest?: ToolRequestDetailInput | null;
}

/**
 * File a change request against a domain the caller owns.
 *
 * Ownership is checked BEFORE anything is written, the same order `agentDisplayNameService` uses:
 * a 403 that happens after a row exists is not a 403.
 */
export async function fileChangeRequest(args: FileChangeRequestArgs): Promise<ChangeRequestRow> {
  const { sequelize, email, domainKey, title } = args;
  const kind: ChangeRequestKind = args.kind ?? 'change';

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

  // AF11.1 — the pairing, then the fields. Both BEFORE anything is written, for the same reason
  // ownership is checked first: a 400 that happens after a row exists is not a 400.
  if (kind === 'tool' && !args.toolRequest) {
    throw new ToolRequestRefusedError([TOOL_REQUEST_DETAIL_MISSING]);
  }
  if (kind !== 'tool' && args.toolRequest) {
    throw new ToolRequestRefusedError([TOOL_REQUEST_ON_A_CHANGE]);
  }

  let accepted: ToolRequestDetail | null = null;
  if (kind === 'tool' && args.toolRequest) {
    // The rosters are read HERE and passed in, so the contract stays pure and an unreadable
    // registry refuses the request rather than waving it through: `allCapabilities()` returning
    // nothing becomes `capability_roster_absent`, not a pass.
    const verdict = acceptToolRequest({
      detail: args.toolRequest,
      domainKey,
      knownCapabilityIds: allCapabilities().map((c) => c.capability_id),
      // Only the agents of domains this person owns. A null `agent_id` means the domain has no
      // employee yet, which is a real state and cannot be the agent a tool is requested for.
      ownedAgentIds: mine.map((d) => d.agent_id).filter((id): id is string => Boolean(id)),
    });
    if (!verdict.ok) throw new ToolRequestRefusedError(verdict.issues);
    accepted = verdict.detail;

    if (await hasOpenRequestFor(sequelize, recorded[0], accepted)) {
      throw new ToolRequestRefusedError([DUPLICATE_OPEN_REQUEST]);
    }
  }

  // AF11.2 — computed HERE, at submit time, and before the transaction opens.
  //
  // Before, because the catalog read is I/O and the matcher is pure: the same split as the rosters
  // above, so the comparison itself stays a function of its inputs and can be tested without a
  // database. At submit time, because the ticket requires the stored answer to be the one the
  // approver reads rather than a different answer recomputed on page load.
  //
  // This is ADVICE, so it cannot refuse the request: `checkForDuplicateTool` has no refusal
  // vocabulary, nothing below reads its result to make a decision, and a failure here leaves the
  // request filed with no check rather than failing the filing.
  let duplicateCheck: StoredDuplicateCheck | null = null;
  if (accepted) {
    try {
      const catalog = await loadToolCatalogForMatching();
      const result = checkForDuplicateTool({
        request: {
          tool_name: accepted.tool_name,
          purpose: accepted.purpose,
          reads: accepted.reads,
          produces: accepted.produces,
        },
        catalog: catalog.tools,
      });
      duplicateCheck = {
        checked_at: new Date().toISOString(),
        catalog_size: result.catalog_size,
        catalog_absent: result.catalog_absent,
        threshold: result.threshold,
        candidates: [...result.candidates],
        behaviorless_tools: [...result.behaviorless_tools],
      };
    } catch (err: unknown) {
      // Named class and full context, never a bare swallow. No row is written, so a reader sees
      // "no check stored" rather than "checked, found nothing", which are different facts.
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'backend',
        event: 'tool_duplicate_check_failed',
        outcome: 'failure',
        error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
        context: {
          message: err instanceof Error ? err.message : String(err),
          domain_key: domainKey,
          tool_name: accepted.tool_name,
        },
      }));
    }
  }

  // One transaction, because a tool request with no detail row is exactly the thin request this
  // ticket exists to stop. A partial commit here would create one that no gate can ever refuse,
  // since the gate only runs at filing time.
  const created = await sequelize.transaction(async (transaction) => {
    const row = await AgentDomainChangeRequest.create({
      kind,
      domain_key: domainKey,
      title,
      description: args.description ?? null,
      status: 'submitted',
      requested_by_identity: recorded[0],
    }, { transaction });

    if (accepted) {
      await AgentDomainToolRequestDetail.create({
        change_request_id: row.id,
        ...accepted,
        reads: [...accepted.reads],
        produces: [...accepted.produces],
        touches: [...accepted.touches],
        inputs: [...accepted.inputs],
      }, { transaction });
    }
    return row;
  });

  // Written AFTER the transaction, deliberately, and best effort.
  //
  // Inside it, a failure here would roll back the request itself, and losing a filed request to a
  // failed piece of ADVICE is the wrong trade: the request is what the intern cannot recreate, and
  // the check can be recomputed and backfilled at any time. The ranking still cannot half-exist,
  // because it is one row and `chk_adtdc_count_matches` makes the count agree with the list.
  let storedCheck: StoredDuplicateCheck | null = null;
  if (duplicateCheck) {
    try {
      await AgentDomainToolDuplicateCheck.create({
        change_request_id: created.id,
        checked_at: new Date(duplicateCheck.checked_at),
        catalog_size: duplicateCheck.catalog_size,
        catalog_absent: duplicateCheck.catalog_absent,
        threshold: duplicateCheck.threshold,
        candidate_count: duplicateCheck.candidates.length,
        candidates: duplicateCheck.candidates,
        behaviorless_tools: duplicateCheck.behaviorless_tools,
      });
      storedCheck = duplicateCheck;
    } catch (err: unknown) {
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'backend',
        event: 'tool_duplicate_check_not_stored',
        outcome: 'failure',
        error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
        context: {
          message: err instanceof Error ? err.message : String(err),
          change_request_id: created.id,
          candidate_count: duplicateCheck.candidates.length,
        },
      }));
    }
  }

  // `storedCheck`, not `duplicateCheck`: the caller is told what was STORED, so the response and
  // the next page load cannot disagree about whether a check exists.
  return { ...project(created), tool_request: accepted, duplicate_check: storedCheck };
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
    // The detail comes back with the decision so the console can render what was just approved
    // without a second fetch. Reading it inside the transaction keeps it the same row the decision
    // was made against.
    const detail = row.kind === 'tool'
      ? await AgentDomainToolRequestDetail.findByPk(row.id, { transaction })
      : null;
    // AF11.2 — the stored check comes back with the decision for the same reason the detail does,
    // and it is READ rather than recomputed. Recomputing at decision time would be the worst
    // possible moment to change the answer: the approver would be shown one ranking while
    // deciding and the record would keep a different one.
    const check = row.kind === 'tool'
      ? await AgentDomainToolDuplicateCheck.findByPk(row.id, { transaction })
      : null;
    return {
      ...project(row),
      tool_request: detail ? projectDetail(detail) : null,
      duplicate_check: check ? projectDuplicateCheck(check) : null,
    };
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
  return withDetails(rows);
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
  return withDetails(rows);
}
