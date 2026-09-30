/**
 * Reese Product Phase 1 follow-up (2026-09-18) — Ali, live, looking at the
 * deployed Agent Detail page: "Role charter doesn't match employee facts,
 * but they should be in sync." Fixes the one sentence in Reese's own charter
 * mission (her hand-written prose, unedited since 2026-09-10) that still
 * names the old, pre-Phase-1 manager chain. Surgical: replaces exactly the
 * clause naming the old chain, leaves every other word of Ali's mission
 * untouched, and records the result as charter version 3 (the same
 * versioned-history mechanism `applyReeseCharterV2.ts` established), never a
 * bare SQL edit.
 *
 *   node fixReeseCharterMissionManagerLine20260918.js [--plan]
 *   node fixReeseCharterMissionManagerLine20260918.js --apply
 */
import AiAgent from '../models/AiAgent';
import AgentRoleCharter from '../models/AgentRoleCharter';
import { sequelize } from '../config/database';
import { recordCharterVersion } from '../services/agentRoleCharterService';

const REESE_AGENT_NAME = 'Reese';
const OLD_CLAUSE = 'Reese reports through workforce_intelligence_engine to Kes';
const NEW_CLAUSE = 'Reese reports directly to Ali';

export class ReeseCharterRowMissingError extends Error {
  constructor() {
    super('Reese has no agent_role_charters row -- nothing to fix.');
    this.name = 'ReeseCharterRowMissingError';
  }
}

export class OldClauseNotFoundError extends Error {
  constructor() {
    super(`The expected old clause was not found verbatim in Reese's current mission text -- refusing to guess. Read the live row and re-check before re-running.`);
    this.name = 'OldClauseNotFoundError';
  }
}

async function getReeseAgentId(): Promise<string> {
  const agent = await AiAgent.findOne({ where: { agent_name: REESE_AGENT_NAME }, attributes: ['id'] });
  if (!agent) throw new Error(`No ai_agents row for agent_name='${REESE_AGENT_NAME}'`);
  return agent.id;
}

export interface PlanResult {
  agentId: string;
  currentVersion: number | null;
  oldClausePresent: boolean;
  targetVersion: number;
}

export async function plan(): Promise<PlanResult> {
  const agentId = await getReeseAgentId();
  const row = await AgentRoleCharter.findOne({ where: { agent_id: agentId } });
  if (!row) throw new ReeseCharterRowMissingError();

  const oldClausePresent = row.mission.includes(OLD_CLAUSE);
  const targetVersion = (row.version ?? 1) + 1;

  console.log(
    JSON.stringify({
      event: 'fix_reese_charter_mission_manager_line.planned',
      service: 'fix-reese-charter-mission-manager-line',
      agent_id: agentId,
      current_version: row.version ?? null,
      old_clause_present: oldClausePresent,
      target_version: targetVersion,
    }),
  );

  return { agentId, currentVersion: row.version ?? null, oldClausePresent, targetVersion };
}

export interface ApplyResult {
  status: 'applied' | 'already_correct';
  agentId: string;
  newVersion: number | null;
}

export async function apply(): Promise<ApplyResult> {
  const agentId = await getReeseAgentId();
  const row = await AgentRoleCharter.findOne({ where: { agent_id: agentId } });
  if (!row) throw new ReeseCharterRowMissingError();

  if (!row.mission.includes(OLD_CLAUSE)) {
    // Already fixed (a prior run), or the sentence changed underneath us --
    // either way, never guess at a partial match. Idempotent no-op.
    console.log(
      JSON.stringify({
        event: 'fix_reese_charter_mission_manager_line.already_correct',
        service: 'fix-reese-charter-mission-manager-line',
        agent_id: agentId,
      }),
    );
    return { status: 'already_correct', agentId, newVersion: row.version ?? null };
  }

  const newMission = row.mission.split(OLD_CLAUSE).join(NEW_CLAUSE);
  const newVersion = (row.version ?? 1) + 1;
  const effectiveAt = new Date();

  await sequelize.transaction(async () => {
    await recordCharterVersion(agentId, {
      version: newVersion,
      effectiveAt,
      roleTitle: row.role_title,
      mission: newMission,
      responsibilities: row.responsibilities,
      kpis: row.kpis,
      boundaries: row.boundaries ?? [],
      authorityAutonomous: row.authority_autonomous ?? [],
      authorityApprovalRequired: row.authority_approval_required ?? [],
      authorityForbidden: row.authority_forbidden ?? [],
      escalationPolicy: row.escalation_policy ?? null,
      updatedByEmail: row.updated_by_email,
    });
    await row.update({ mission: newMission, version: newVersion, effective_at: effectiveAt });
  });

  console.log(
    JSON.stringify({
      event: 'fix_reese_charter_mission_manager_line.applied',
      service: 'fix-reese-charter-mission-manager-line',
      agent_id: agentId,
      new_version: newVersion,
    }),
  );

  return { status: 'applied', agentId, newVersion };
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
        event: 'fix_reese_charter_mission_manager_line.failed',
        service: 'fix-reese-charter-mission-manager-line',
        error_class: err?.name || 'Error',
        message: err?.message,
      }),
    );
    process.exit(1);
  });
}
