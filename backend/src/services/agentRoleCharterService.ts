import AiAgent from '../models/AiAgent';
import AgentRoleCharter from '../models/AgentRoleCharter';
import AgentRoleCharterVersion from '../models/AgentRoleCharterVersion';
import type { AgentRoleCharterInput } from '../schemas/agentRoleCharterSchema';

// AI Workforce Management, Checkpoint B. Generic by construction — works off
// AiAgent.id, not hardcoded to any one agent (Reese or otherwise), per the
// mission's non-negotiable that new capabilities must be generic.
//
// Reese Product Phase 1, R4 adds versioning on top, also generic: the version
// and authority/boundary fields are nullable columns any agent's charter may
// or may not carry. See models/AgentRoleCharter.ts and
// models/AgentRoleCharterVersion.ts for the schema, and
// agentBlueprint/agentContextLayers.ts's buildRoleCharterBlock() for why an
// unversioned charter renders byte-identical to before this phase.

export interface RoleCharterView {
  agentId: string;
  charter: {
    roleTitle: string;
    mission: string;
    responsibilities: string[];
    kpis: string[];
    updatedByEmail: string;
    updatedAt: Date;
    version: number | null;
    effectiveAt: Date | null;
    boundaries: string[] | null;
    authorityAutonomous: string[] | null;
    authorityApprovalRequired: string[] | null;
    authorityForbidden: string[] | null;
    escalationPolicy: string | null;
  } | null;
}

function toView(agentId: string, row: AgentRoleCharter): RoleCharterView {
  return {
    agentId,
    charter: {
      roleTitle: row.role_title,
      mission: row.mission,
      responsibilities: row.responsibilities,
      kpis: row.kpis,
      updatedByEmail: row.updated_by_email,
      updatedAt: row.updated_at,
      version: row.version ?? null,
      effectiveAt: row.effective_at ?? null,
      boundaries: row.boundaries ?? null,
      authorityAutonomous: row.authority_autonomous ?? null,
      authorityApprovalRequired: row.authority_approval_required ?? null,
      authorityForbidden: row.authority_forbidden ?? null,
      escalationPolicy: row.escalation_policy ?? null,
    },
  };
}

/** null return means the agent itself doesn't exist. A real agent with no
 * charter written yet returns { agentId, charter: null } — the honest
 * "not set" state, never a fabricated default title/mission. */
export async function getRoleCharter(agentId: string): Promise<RoleCharterView | null> {
  const agent = await AiAgent.findByPk(agentId, { attributes: ['id'] });
  if (!agent) return null;

  const row = await AgentRoleCharter.findOne({ where: { agent_id: agentId } });
  if (!row) return { agentId, charter: null };

  return toView(agentId, row);
}

export class AgentNotFoundError extends Error {
  readonly error_class = 'AgentNotFoundError' as const;
  readonly status = 404;

  constructor(agentId: string) {
    super(`Agent "${agentId}" does not exist.`);
    this.name = 'AgentNotFoundError';
  }
}

export class CharterVersionNotFoundError extends Error {
  readonly error_class = 'CharterVersionNotFoundError' as const;
  readonly status = 404;

  constructor(agentId: string, version: number) {
    super(`No charter version ${version} exists for agent "${agentId}".`);
    this.name = 'CharterVersionNotFoundError';
  }
}

/** Creates or updates the one charter row for this agent. Authorization
 * (is the caller actually allowed to edit this agent's charter, and — for
 * the Phase 1 version/authority fields specifically — are they a platform
 * admin) is the route layer's job (requireAgentManagerOrAdmin plus the
 * admin-only field check in agentRoleCharterController.ts) — this function
 * trusts that it has already been checked, matching assignTaskToAgent()'s
 * own "auth first, at the route/middleware layer" convention.
 *
 * Only columns actually present in `input` are written. This is deliberate:
 * a caller that omits the new optional fields (every caller before this
 * phase, and any future non-admin PUT) must not silently null out a version
 * or authority list someone else already set. */
export async function upsertRoleCharter(
  agentId: string,
  input: AgentRoleCharterInput,
  updatedByEmail: string,
): Promise<RoleCharterView> {
  const agent = await AiAgent.findByPk(agentId, { attributes: ['id'] });
  if (!agent) throw new AgentNotFoundError(agentId);

  const values: Record<string, unknown> = {
    agent_id: agentId,
    role_title: input.roleTitle,
    mission: input.mission,
    responsibilities: input.responsibilities,
    kpis: input.kpis,
    updated_by_email: updatedByEmail,
  };
  if (input.version !== undefined) values.version = input.version;
  if (input.effectiveAt !== undefined) values.effective_at = new Date(input.effectiveAt);
  if (input.boundaries !== undefined) values.boundaries = input.boundaries;
  if (input.authorityAutonomous !== undefined) values.authority_autonomous = input.authorityAutonomous;
  if (input.authorityApprovalRequired !== undefined) values.authority_approval_required = input.authorityApprovalRequired;
  if (input.authorityForbidden !== undefined) values.authority_forbidden = input.authorityForbidden;
  if (input.escalationPolicy !== undefined) values.escalation_policy = input.escalationPolicy;

  const [row] = await AgentRoleCharter.upsert(values as any);

  return toView(agentId, row);
}

/**
 * Reese Product Phase 1, R4 — writes one immutable snapshot into
 * `agent_role_charter_versions`. Called by `applyReeseCharterV2.ts` before
 * every version it writes (including version 1, Ali's original row,
 * preserved byte for byte before version 2 replaces it as current) so
 * `activateCharterVersion()` always has a real prior version to restore.
 * Idempotent on (agent_id, version): a second call with the same version
 * throws the DB's own unique-constraint error rather than silently
 * overwriting history.
 */
export async function recordCharterVersion(
  agentId: string,
  charter: {
    version: number;
    effectiveAt: Date;
    roleTitle: string;
    mission: string;
    responsibilities: string[];
    kpis: string[];
    boundaries: string[];
    authorityAutonomous: string[];
    authorityApprovalRequired: string[];
    authorityForbidden: string[];
    escalationPolicy: string | null;
    updatedByEmail: string;
  },
): Promise<void> {
  await AgentRoleCharterVersion.create({
    agent_id: agentId,
    version: charter.version,
    effective_at: charter.effectiveAt,
    role_title: charter.roleTitle,
    mission: charter.mission,
    responsibilities: charter.responsibilities,
    kpis: charter.kpis,
    boundaries: charter.boundaries,
    authority_autonomous: charter.authorityAutonomous,
    authority_approval_required: charter.authorityApprovalRequired,
    authority_forbidden: charter.authorityForbidden,
    escalation_policy: charter.escalationPolicy,
    updated_by_email: charter.updatedByEmail,
  });
}

/**
 * Reese Product Phase 1, R4 rollback path — restores `agent_role_charters`
 * to exactly the snapshot recorded for `version` in
 * `agent_role_charter_versions`. Used by `activateCharterVersion(reese, 1)`
 * to undo `applyReeseCharterV2.ts --apply` and get Ali's original row back
 * byte for byte, and equally usable to roll FORWARD to a later version.
 */
export async function activateCharterVersion(agentId: string, version: number): Promise<RoleCharterView> {
  const agent = await AiAgent.findByPk(agentId, { attributes: ['id'] });
  if (!agent) throw new AgentNotFoundError(agentId);

  const snapshot = await AgentRoleCharterVersion.findOne({ where: { agent_id: agentId, version } });
  if (!snapshot) throw new CharterVersionNotFoundError(agentId, version);

  const [row] = await AgentRoleCharter.upsert({
    agent_id: agentId,
    role_title: snapshot.role_title,
    mission: snapshot.mission,
    responsibilities: snapshot.responsibilities,
    kpis: snapshot.kpis,
    updated_by_email: snapshot.updated_by_email,
    version: snapshot.version,
    effective_at: snapshot.effective_at,
    boundaries: snapshot.boundaries,
    authority_autonomous: snapshot.authority_autonomous,
    authority_approval_required: snapshot.authority_approval_required,
    authority_forbidden: snapshot.authority_forbidden,
    escalation_policy: snapshot.escalation_policy,
  });

  return toView(agentId, row);
}
