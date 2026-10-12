/**
 * Build authorization for an AI employee domain project — ONE gate, TWO storage locations.
 *
 * Run `20261007-school-agent-factory` (T11), session CC-20261006-a4k7.
 *
 * WHY THIS IS NOT A SECOND GATE
 * `services/factory/buildAuthorization.ts:37` `assertBuildAuthorized` is a PURE function over a
 * four-field shape (`approver_identity_id`, `scope`, `resource_limit`, `revoked_at`), with its
 * database access in a separate `loadBuildAuthorization()` at `:46`. This module imports that
 * refusal **verbatim** and supplies a second loader. No refusal logic is written here, and a test
 * asserts both paths resolve to the SAME function object — which is what makes "one gate" a fact
 * rather than a claim.
 *
 * WHY A SECOND TABLE RATHER THAN A COLUMN
 * The original design added a nullable `student_project_id` to `build_authorizations`. That is
 * structurally impossible: `ensureGovQualificationSchema.ts:76` declares
 * `delivery_project_id UUID NOT NULL REFERENCES delivery_projects(id)`, there is one DDL site, and
 * nothing relaxes it. An AI-domain row could never have been inserted, because it has no
 * `delivery_projects` parent and must not be given one. Dropping that `NOT NULL` would have
 * WEAKENED the gov gate — today every build authorization provably names a delivery project — and
 * weakening an authorization gate is a hard stop for this run.
 *
 * DEFAULT STATE IS REFUSAL, AND THAT IS THE POINT
 * `agent_domain_build_authorizations` is empty. Every domain therefore refuses with
 * `no_authorization` until a named human records a scope AND a resource limit. Removing that
 * refusal is a code change with a review attached, never a flag flip.
 *
 * THIS MODULE CREATES NO BUILD PATH. It answers "is a build authorized?" and nothing executes a
 * build on the strength of the answer. The read surface renders the answer so the refusal is
 * observable in production — the alternative was a gate with no caller, which makes "a build is
 * refused in production" a unit-test fact wearing a production journey's clothes.
 */

import {
  assertBuildAuthorized,
  BuildNotAuthorizedError,
  type BuildAuthorizationLike,
  type BuildAuthReason,
} from '../factory/buildAuthorization';
import { AGENT_DOMAINS, type AgentDomainKey } from './agentDomainRegistry';
import { QueryTypes } from 'sequelize';

/** Re-exported so callers and tests reference ONE gate, not a copy of its vocabulary. */
export { assertBuildAuthorized, BuildNotAuthorizedError };
export type { BuildAuthorizationLike, BuildAuthReason };

/**
 * The current (non-revoked, newest) authorization for an AI-domain project, or null.
 * Mirrors `loadBuildAuthorization`'s shape exactly, against the other table.
 */
export async function loadAgentDomainBuildAuthorization(
  agentDomainProjectId: string,
): Promise<BuildAuthorizationLike | null> {
  const { sequelize } = await import('../../config/database');
  const rows = await sequelize.query(
    `SELECT approver_identity_id, scope, resource_limit, revoked_at
       FROM public.agent_domain_build_authorizations
      WHERE agent_domain_project_id = $id AND revoked_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1`,
    // No cast. Nine sibling `ensure*.ts` files pass an object `bind` uncast (for example
    // `backend/src/db/ensureFactoryTaskSchema.ts:58`), so the `as any` that was here was
    // undocumented -- which CLAUDE.md's Contract Enforcement Layer forbids -- and unnecessary.
    { bind: { id: agentDomainProjectId }, type: QueryTypes.SELECT },
  );
  const row = Array.isArray(rows) ? (rows[0] as BuildAuthorizationLike | undefined) : undefined;
  return row ?? null;
}

/**
 * Every live authorization for a set of anchor ids, in ONE query, keyed by domain.
 *
 * The read surface was issuing ten queries, one per domain, for a table keyed on
 * `agent_domain_project_id` where all ten ids are derived and known up front. This is the shape
 * `resolveAllFromRows` was written for, and the reason it previously had no production caller.
 *
 * A domain with no row maps to `null`, which `assertBuildAuthorized` refuses as
 * `no_authorization` -- so an absent row and an absent domain are the same answer, which is the
 * fail-closed direction.
 */
export async function loadAgentDomainBuildAuthorizationsByDomain(
  anchorIdByDomain: Readonly<Record<string, string>>,
): Promise<Record<string, BuildAuthorizationLike | null>> {
  const { sequelize } = await import('../../config/database');
  const ids = Object.values(anchorIdByDomain);
  const out: Record<string, BuildAuthorizationLike | null> = {};
  for (const k of Object.keys(anchorIdByDomain)) out[k] = null;
  if (ids.length === 0) return out;

  const rows = await sequelize.query(
    `SELECT agent_domain_project_id, approver_identity_id, scope, resource_limit, revoked_at
       FROM public.agent_domain_build_authorizations
      WHERE agent_domain_project_id = ANY($ids) AND revoked_at IS NULL
      ORDER BY created_at DESC`,
    { bind: { ids }, type: QueryTypes.SELECT },
  );

  const byAnchor = new Map<string, BuildAuthorizationLike>();
  for (const r of (Array.isArray(rows) ? rows : []) as Array<Record<string, unknown>>) {
    const anchorId = String(r.agent_domain_project_id);
    // ORDER BY created_at DESC, so the first row seen for an anchor is the newest. Later ones are
    // superseded and are deliberately not overwritten.
    if (!byAnchor.has(anchorId)) byAnchor.set(anchorId, r as unknown as BuildAuthorizationLike);
  }
  for (const [domainKey, anchorId] of Object.entries(anchorIdByDomain)) {
    out[domainKey] = byAnchor.get(anchorId) ?? null;
  }
  return out;
}

/** Throws `BuildNotAuthorizedError` unless a live authorization exists. Delegates to the ONE gate. */
export async function assertAgentDomainBuildAuthorized(agentDomainProjectId: string): Promise<void> {
  assertBuildAuthorized(await loadAgentDomainBuildAuthorization(agentDomainProjectId));
}

export interface AgentDomainAuthorizationState {
  readonly domain_key: AgentDomainKey | string;
  readonly authorized: boolean;
  /** Present only when refused. One of the gate's five reasons — never a free-text message. */
  readonly reason: BuildAuthReason | null;
}

/**
 * The read-surface caller. Renders each project's authorization state WITHOUT creating a build
 * path, by running the real gate and catching its refusal. This is what makes the refusal
 * observable live rather than only in a unit test.
 */
export async function resolveAgentDomainBuildAuthorization(
  agentDomainProjectId: string,
  domainKey: AgentDomainKey | string,
): Promise<AgentDomainAuthorizationState> {
  try {
    await assertAgentDomainBuildAuthorized(agentDomainProjectId);
    return { domain_key: domainKey, authorized: true, reason: null };
  } catch (err) {
    if (err instanceof BuildNotAuthorizedError) {
      return { domain_key: domainKey, authorized: false, reason: err.reason };
    }
    throw err;
  }
}

/**
 * Pure variant for the ten registry domains, used by tests and by the read surface when it already
 * holds the rows. Takes the authorizations it was given; it never invents one.
 */
export function resolveAllFromRows(
  rowsByDomain: Readonly<Record<string, BuildAuthorizationLike | null>>,
): AgentDomainAuthorizationState[] {
  return AGENT_DOMAINS.map((d) => {
    try {
      assertBuildAuthorized(rowsByDomain[d.domain_key] ?? null);
      return { domain_key: d.domain_key, authorized: true, reason: null };
    } catch (err) {
      if (err instanceof BuildNotAuthorizedError) {
        return { domain_key: d.domain_key, authorized: false, reason: err.reason };
      }
      throw err;
    }
  });
}
