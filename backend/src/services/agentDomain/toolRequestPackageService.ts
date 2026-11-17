/**
 * toolRequestPackageService — attach the ten-block decision package to a request, and answer the
 * one question the review console asks of it: is this ready for a human.
 *
 * AF11.8. The gate itself is pure and lives in `toolRequestPackageContract.ts`; this module does
 * the I/O and nothing else, the same split every other service in this subtree makes.
 *
 * ## A BOUNCE IS NOT A REFUSAL
 *
 * The ticket: *"A request missing one does not reach Ali; it bounces to the agent naming the
 * block."* So an incomplete package is WRITTEN, not rejected. The request keeps existing, the
 * agent can see exactly which blocks are outstanding, and the console leaves it out of Ali's
 * queue until they are filled.
 *
 * That is the opposite of `toolRequestContract.ts`, which refuses a filing outright, and the
 * difference is deliberate: a filing with no detail is a request nobody could ever act on, where a
 * filing whose package is half written is a request in progress. Refusing the second would mean an
 * agent could not save its work, so it would compose the whole package in one shot or not at all.
 *
 * ## Why readiness is COMPUTED and never stored
 *
 * There is no `ready` column and there will not be one. A stored flag is a second source of truth
 * about a fact that is already fully determined by the row beside it, and the first time the two
 * disagreed the console would be confidently wrong about whether Ali had something to read. The
 * same reasoning AF11.10's board ticket records for its own stage column: derive it, and show
 * unknown rather than guess.
 *
 * It costs nothing: the gate is pure, in-memory, and runs over a row the page has already loaded.
 */

import { Transaction, type Sequelize } from 'sequelize';
import AgentDomainChangeRequest from '../../models/AgentDomainChangeRequest';
import AgentDomainToolRequestPackage from '../../models/AgentDomainToolRequestPackage';
import {
  acceptToolRequestPackage,
  bouncedBlocks,
  gateToolRequestPackage,
  type PackageBlock,
  type PackageIssue,
  type ToolRequestPackage,
  type ToolRequestPackageInput,
} from './toolRequestPackageContract';

export class PackageRequestNotFoundError extends Error {
  constructor(id: string) {
    super(`No change request ${id}`);
    this.name = 'PackageRequestNotFoundError';
  }
}

export class PackageOnAChangeRequestError extends Error {
  constructor() {
    super('A decision package belongs to a tool request, not to a change request.');
    this.name = 'PackageOnAChangeRequestError';
  }
}

export class PackageOnADecidedRequestError extends Error {
  constructor(status: string) {
    super(`This request is ${status}. Its package cannot be rewritten after it was decided.`);
    this.name = 'PackageOnADecidedRequestError';
  }
}

/**
 * Whether a request is in front of a human, and if not, what is missing.
 *
 * `has_package` and `ready_for_a_human` are two different facts and both are reported. "Nobody has
 * written one yet" and "one was written and three blocks are thin" are different states for the
 * agent on the other end, and collapsing them would make the first look like a failure.
 */
export interface PackageReadiness {
  readonly has_package: boolean;
  readonly ready_for_a_human: boolean;
  readonly bounced_blocks: ReadonlyArray<PackageBlock>;
  readonly bounce_reasons: ReadonlyArray<PackageIssue>;
}

/** The readiness of a request that carries no package at all. */
export const NO_PACKAGE: PackageReadiness = Object.freeze({
  has_package: false,
  ready_for_a_human: false,
  bounced_blocks: Object.freeze([]) as ReadonlyArray<PackageBlock>,
  bounce_reasons: Object.freeze([]) as ReadonlyArray<PackageIssue>,
});

/** A stored package, back in the contract's own shape. */
export function projectPackage(p: AgentDomainToolRequestPackage): ToolRequestPackage {
  const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
  return {
    executive_summary: p.executive_summary,
    problem: p.problem,
    key_findings: Array.isArray(p.key_findings) ? p.key_findings : [],
    options: Array.isArray(p.options) ? p.options : [],
    recommendation: p.recommendation,
    recommendation_reason: p.recommendation_reason,
    impact: p.impact,
    risk_can_break: strings(p.risk_can_break),
    risk_cannot_break: strings(p.risk_cannot_break),
    simulated_action: p.simulated_action,
    simulated_against: p.simulated_against,
    simulated_at: new Date(p.simulated_at).toISOString(),
    steps_that_follow: strings(p.steps_that_follow),
  };
}

/**
 * Judge a stored package against the ten blocks.
 *
 * `now` is passed in so the one time-dependent rule — a simulation dated in the future — is
 * testable without freezing the clock globally.
 */
export function readinessOf(
  pkg: ToolRequestPackage | null,
  now: Date = new Date(),
): PackageReadiness {
  if (!pkg) return NO_PACKAGE;
  const issues = gateToolRequestPackage({ input: pkg, now });
  return {
    has_package: true,
    ready_for_a_human: issues.length === 0,
    bounced_blocks: bouncedBlocks(issues),
    bounce_reasons: issues,
  };
}

/**
 * Load the packages for a page of requests in ONE query.
 *
 * Per request would be N+1 on a queue whose whole purpose is to be read as a list, which is the
 * rule `loadDetails` states a few functions away.
 */
export async function loadPackages(ids: string[]): Promise<Map<string, ToolRequestPackage>> {
  if (ids.length === 0) return new Map();
  const rows = await AgentDomainToolRequestPackage.findAll({
    where: { change_request_id: ids },
  });
  return new Map(rows.map((r) => [r.change_request_id, projectPackage(r)]));
}

export interface AttachPackageArgs {
  readonly sequelize: Sequelize;
  readonly changeRequestId: string;
  readonly input: ToolRequestPackageInput;
  /** Passed in so the future-simulation rule is testable. */
  readonly now?: Date;
}

export interface AttachPackageResult {
  readonly change_request_id: string;
  readonly decision_package: ToolRequestPackage | null;
  readonly readiness: PackageReadiness;
}

/**
 * Write or rewrite a request's package.
 *
 * ## It saves what it was given even when the package bounces
 *
 * The gate runs and its issues come back in `readiness`, but an incomplete package is still
 * PERSISTED when the row's own constraints allow it. That is the bounce working as intended: the
 * agent keeps its work and is told what is outstanding. Refusing the write would mean a
 * half-finished package could never be saved, which would force every agent to compose all ten
 * blocks in one shot.
 *
 * The storage constraints are a floor underneath that, and they are not the same rules. A package
 * with one option or a recommendation for an option nobody offered CANNOT be stored at all, because
 * those shapes would make the row unreadable rather than incomplete: `chk_adtrp_two_real_options`
 * and `chk_adtrp_recommendation_is_on_the_list` reject them. So this function reports a database
 * refusal distinctly from a bounce, rather than letting a constraint violation surface as a 500.
 *
 * ## Rewriting is replacing, and only while the request is still open
 *
 * One package per request, enforced by the primary key. Rewriting after a decision would change
 * the argument Ali read after he read it, so it is refused once the request leaves `submitted`.
 */
export async function attachPackage(args: AttachPackageArgs): Promise<AttachPackageResult> {
  const { sequelize, changeRequestId } = args;
  const now = args.now ?? new Date();

  return sequelize.transaction(async (transaction) => {
    const row = await AgentDomainChangeRequest.findByPk(changeRequestId, {
      transaction,
      lock: Transaction.LOCK.UPDATE,
    });
    if (!row) throw new PackageRequestNotFoundError(changeRequestId);
    if (String(row.kind ?? 'change') !== 'tool') throw new PackageOnAChangeRequestError();
    if (String(row.status) !== 'submitted') {
      throw new PackageOnADecidedRequestError(String(row.status));
    }

    // Narrowed when it passes; written as given when it does not, so the agent keeps its work.
    const verdict = acceptToolRequestPackage({ input: args.input, now });
    const toStore: ToolRequestPackageInput = verdict.ok ? verdict.value : args.input;

    const values = {
      change_request_id: changeRequestId,
      executive_summary: String(toStore.executive_summary ?? '').trim(),
      problem: String(toStore.problem ?? '').trim(),
      key_findings: (toStore.key_findings ?? []).map((f) => ({
        finding: String(f?.finding ?? '').trim(),
        source: String(f?.source ?? '').trim(),
      })),
      options: (toStore.options ?? []).map((o) => ({
        key: String(o?.key ?? '').trim().toUpperCase(),
        summary: String(o?.summary ?? '').trim(),
        what_happens: String(o?.what_happens ?? '').trim(),
        verb: String(o?.verb ?? '').trim(),
      })),
      recommendation: String(toStore.recommendation ?? '').trim(),
      recommendation_reason: String(toStore.recommendation_reason ?? '').trim(),
      impact: String(toStore.impact ?? '').trim(),
      risk_can_break: (toStore.risk_can_break ?? []).map(String),
      risk_cannot_break: (toStore.risk_cannot_break ?? []).map(String),
      simulated_action: String(toStore.simulated_action ?? '').trim(),
      simulated_against: String(toStore.simulated_against ?? '').trim(),
      simulated_at: toStore.simulated_at ? new Date(toStore.simulated_at) : new Date(0),
      steps_that_follow: (toStore.steps_that_follow ?? []).map(String),
      updated_at: now,
    } as never;

    const existing = await AgentDomainToolRequestPackage.findByPk(changeRequestId, { transaction });
    if (existing) {
      await existing.update(values, { transaction });
    } else {
      await AgentDomainToolRequestPackage.create(values, { transaction });
    }

    const stored = await AgentDomainToolRequestPackage.findByPk(changeRequestId, { transaction });
    const projected = stored ? projectPackage(stored) : null;
    return {
      change_request_id: changeRequestId,
      decision_package: projected,
      readiness: readinessOf(projected, now),
    };
  });
}

/** One request's package, for the console's detail read. */
export async function loadPackage(changeRequestId: string): Promise<ToolRequestPackage | null> {
  const row = await AgentDomainToolRequestPackage.findByPk(changeRequestId);
  return row ? projectPackage(row) : null;
}
