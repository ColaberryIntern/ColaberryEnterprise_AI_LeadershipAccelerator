/**
 * Reese Product Phase 1, R4 — applies the versioned charter. Reese-only:
 * touches exactly one agent's `agent_role_charters` row and its own
 * `agent_role_charter_versions` history, through the same generic
 * `agentRoleCharterService.ts` every other agent's charter already uses (no
 * Reese-only schema, no Reese-only table).
 *
 * Dry run by default. `--apply` is the only mode that writes:
 *   1. Reads Reese's CURRENT `agent_role_charters` row (Ali's live
 *      2026-09-10 write) and records it, completely unchanged, as version 1
 *      in `agent_role_charter_versions` -- a real, immutable snapshot of
 *      what was there before this script ever ran.
 *   2. Writes version 2 onto the current row: role_title/mission/
 *      responsibilities/kpis carried over BYTE FOR BYTE from version 1 (see
 *      reeseCharterV2Content.ts's own header -- this phase does not rewrite
 *      Ali's prose); boundaries/authority/escalation_policy from
 *      reeseCharterV2Content.ts (the structured form of
 *      docs/architecture/ai-workforce-management/employees/learner-success/
 *      ROLE_CHARTER_v2.md); version: 2; effective_at: now.
 *   3. Records that same version-2 content as its own snapshot in
 *      `agent_role_charter_versions`, so a later rollback FORWARD is just as
 *      real as the rollback back to version 1.
 *
 * Idempotent: if Reese's current row is already at version >= 2, --apply
 * makes no write and reports "already applied".
 *
 * Rollback: `activateCharterVersion('<reese agent id>', 1)`
 * (agentRoleCharterService.ts) restores Ali's row exactly -- not this
 * script's own job, since the version-1 snapshot IS the undo log.
 *
 *   node applyReeseCharterV2.js [--plan]
 *   node applyReeseCharterV2.js --apply
 */
import AiAgent from '../models/AiAgent';
import AgentRoleCharter from '../models/AgentRoleCharter';
import { sequelize } from '../config/database';
import { recordCharterVersion } from '../services/agentRoleCharterService';
import { checkReeseAuthorityLive } from '../services/reese/reeseCharterAuthority';
import {
  REESE_CHARTER_V2_BOUNDARIES,
  REESE_CHARTER_V2_AUTHORITY_AUTONOMOUS,
  REESE_CHARTER_V2_AUTHORITY_APPROVAL_REQUIRED,
  REESE_CHARTER_V2_AUTHORITY_FORBIDDEN,
  REESE_CHARTER_V2_ESCALATION_POLICY,
} from './lib/reeseCharterV2Content';

const REESE_AGENT_NAME = 'Reese';

export class ReeseCharterRowMissingError extends Error {
  constructor() {
    super('Reese has no agent_role_charters row yet -- nothing to version. Write version 1 through the PUT route first.');
    this.name = 'ReeseCharterRowMissingError';
  }
}

export interface ApplyResult {
  status: 'already_applied' | 'applied' | 'planned';
  agentId: string;
  currentVersion: number | null;
  targetVersion: 2;
}

async function getReeseAgentId(): Promise<string> {
  const agent = await AiAgent.findOne({ where: { agent_name: REESE_AGENT_NAME }, attributes: ['id'] });
  if (!agent) throw new Error(`No ai_agents row for agent_name='${REESE_AGENT_NAME}'`);
  return agent.id;
}

export async function plan(): Promise<ApplyResult> {
  const agentId = await getReeseAgentId();
  const row = await AgentRoleCharter.findOne({ where: { agent_id: agentId } });
  if (!row) throw new ReeseCharterRowMissingError();

  console.log(
    JSON.stringify({
      event: 'apply_reese_charter_v2.planned',
      service: 'apply-reese-charter-v2',
      agent_id: agentId,
      current_version: row.version ?? null,
      would_apply: (row.version ?? 0) < 2,
    }),
  );

  return { status: 'planned', agentId, currentVersion: row.version ?? null, targetVersion: 2 };
}

export async function apply(): Promise<ApplyResult> {
  const agentId = await getReeseAgentId();
  const row = await AgentRoleCharter.findOne({ where: { agent_id: agentId } });
  if (!row) throw new ReeseCharterRowMissingError();

  if ((row.version ?? 0) >= 2) {
    console.log(
      JSON.stringify({
        event: 'apply_reese_charter_v2.already_applied',
        service: 'apply-reese-charter-v2',
        agent_id: agentId,
        current_version: row.version,
      }),
    );
    return { status: 'already_applied', agentId, currentVersion: row.version ?? null, targetVersion: 2 };
  }

  const version1EffectiveAt = row.created_at;
  const version1Snapshot = {
    version: 1,
    effectiveAt: version1EffectiveAt,
    roleTitle: row.role_title,
    mission: row.mission,
    responsibilities: row.responsibilities,
    kpis: row.kpis,
    boundaries: [],
    authorityAutonomous: [],
    authorityApprovalRequired: [],
    authorityForbidden: [],
    escalationPolicy: null,
    updatedByEmail: row.updated_by_email,
  };

  const version2EffectiveAt = new Date();
  const version2Snapshot = {
    version: 2,
    effectiveAt: version2EffectiveAt,
    roleTitle: row.role_title,
    mission: row.mission,
    responsibilities: row.responsibilities,
    kpis: row.kpis,
    boundaries: REESE_CHARTER_V2_BOUNDARIES,
    authorityAutonomous: REESE_CHARTER_V2_AUTHORITY_AUTONOMOUS,
    authorityApprovalRequired: REESE_CHARTER_V2_AUTHORITY_APPROVAL_REQUIRED,
    authorityForbidden: REESE_CHARTER_V2_AUTHORITY_FORBIDDEN,
    escalationPolicy: REESE_CHARTER_V2_ESCALATION_POLICY,
    updatedByEmail: row.updated_by_email,
  };

  await sequelize.transaction(async () => {
    await recordCharterVersion(agentId, version1Snapshot);
    await recordCharterVersion(agentId, version2Snapshot);
    await row.update({
      version: 2,
      effective_at: version2EffectiveAt,
      boundaries: REESE_CHARTER_V2_BOUNDARIES,
      authority_autonomous: REESE_CHARTER_V2_AUTHORITY_AUTONOMOUS,
      authority_approval_required: REESE_CHARTER_V2_AUTHORITY_APPROVAL_REQUIRED,
      authority_forbidden: REESE_CHARTER_V2_AUTHORITY_FORBIDDEN,
      escalation_policy: REESE_CHARTER_V2_ESCALATION_POLICY,
    });
  });

  console.log(
    JSON.stringify({
      event: 'apply_reese_charter_v2.applied',
      service: 'apply-reese-charter-v2',
      agent_id: agentId,
      version1_recorded: true,
      version2_active: true,
    }),
  );

  // R5 — the authority check runs explicitly here, once, right after the
  // apply that could have introduced a mismatch. Never at boot, never on a
  // schedule. Printed, not thrown: a mismatch is real information for the
  // checkpoint, not a reason to leave the charter half-applied.
  const authorityCheck = await checkReeseAuthorityLive();
  console.log(
    JSON.stringify({
      event: 'apply_reese_charter_v2.authority_check',
      service: 'apply-reese-charter-v2',
      ok: authorityCheck.ok,
      mismatches: authorityCheck.mismatches,
    }),
  );

  return { status: 'applied', agentId, currentVersion: 2, targetVersion: 2 };
}

/* istanbul ignore next — CLI entry point, exercised operationally not in unit tests */
if (require.main === module) {
  const shouldApply = process.argv.includes('--apply');
  (async () => {
    await sequelize.authenticate();
    if (shouldApply) await apply();
    else await plan();
    process.exit(0);
  })().catch((err: any) => {
    console.error(
      JSON.stringify({
        event: 'apply_reese_charter_v2.failed',
        service: 'apply-reese-charter-v2',
        error_class: err?.name || 'Error',
        message: err?.message,
      }),
    );
    process.exit(1);
  });
}
