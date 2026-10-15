/**
 * Give `DeptCampaignPerformanceAgent` an accountable human.
 *
 * Run `20261007-school-agent-factory` (T16), session CC-20261006-a4k7.
 *
 * ## What is wrong
 *
 * I created that agent earlier in this session and it shipped **enabled, with
 * `reports_to_type` and `reports_to_id` both NULL** — a running agent with nobody accountable for
 * it. T01's baseline snapshot records the row as it stands: `enabled = t`,
 * `autonomy_level = observe`, `tools_granted = []`, both reports-to columns NULL.
 *
 * ## Why this module exists rather than a direct update
 *
 * `setAgentReportsTo` (`workforce/agentReportsToService.ts`) is the real write path, and it is the
 * one used here — it lands the value and its audit fields (`reports_to_set_at`, `reports_to_set_by`)
 * in the SAME update, so the row can never carry a value with no record of who set it.
 *
 * But it does NOT validate that a human target exists. Its dry-run goes through
 * `resolveReportsToChainWithTrail`, which for `type='human'` returns
 * `{ resolvedHumanId: agent.reports_to_id }` with **no `org_members` lookup** — so any truthy
 * string passes and persists. Adding that lookup would mean editing the live ticket-creation gate,
 * which is outside this phase's declared outputs, so the gap is recorded rather than papered over
 * and the check is done HERE, before the service is called. That makes the guarantee real without
 * touching a file this contract does not own.
 *
 * ## What must not change
 *
 * Exactly three columns are asserted unchanged: `enabled`, `autonomy_level`, `tools_granted`.
 *
 * `updated_at`, `last_run_at` and `run_count` are DELIBERATELY excluded, because the row is not
 * static. Measured 2026-10-08 it carried `run_count = 2` and
 * `updated_at = last_run_at = 2026-10-07 23:25:08+00`: the scheduler is running it. A whole-row
 * "unchanged" assertion would fail for a reason that has nothing to do with this correction, and
 * would then be relaxed in a hurry by whoever hit it.
 */

import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { setAgentReportsTo, type AgentReportsToResult } from '../workforce/agentReportsToService';

/** The agent with no accountable human. Resolved by name, not by a hardcoded id. */
export const TARGET_AGENT_NAME = 'DeptCampaignPerformanceAgent';

/**
 * The Marketing manager's `org_members.id`, as re-resolved against production in T03:
 * sohail@colaberry.com, org role `member`, team `Marketing`, with an `admin_users` row so the
 * surface is reachable.
 */
export const MARKETING_MANAGER_ORG_MEMBER_ID = '4e255894-ac0b-4367-ae06-27459ea05f66';

/** The three columns this correction must leave exactly as they were. */
export const PRESERVED_COLUMNS: ReadonlyArray<string> = Object.freeze([
  'enabled', 'autonomy_level', 'tools_granted',
]);

/**
 * Columns excluded from the before/after comparison because the scheduler moves them.
 * Excluding them is what keeps `PRESERVED_COLUMNS` a real assertion rather than a flaky one.
 */
export const EXCLUDED_FROM_COMPARISON: ReadonlyArray<string> = Object.freeze([
  'updated_at', 'last_run_at', 'run_count',
]);

export interface AgentRowSnapshot {
  readonly enabled: boolean;
  readonly autonomy_level: string | null;
  readonly tools_granted: unknown;
  readonly reports_to_type: string | null;
  readonly reports_to_id: string | null;
}

export class OrgMemberNotFoundError extends Error {
  readonly error_class = 'OrgMemberNotFoundError';

  constructor(id: string) {
    super(
      `OrgMemberNotFoundError: no org_members row with id '${id}'. Refusing to set reports_to. `
      + 'This check is here because setAgentReportsTo does not perform it: for a human target its '
      + 'resolver returns the id it was given without looking it up, so any truthy string would '
      + 'persist and the agent would appear to have an accountable human who does not exist.',
    );
    this.name = 'OrgMemberNotFoundError';
  }
}

export class PreservedColumnChangedError extends Error {
  readonly error_class = 'PreservedColumnChangedError';

  constructor(public readonly changed: ReadonlyArray<string>) {
    super(`PreservedColumnChangedError: ${changed.join(', ')} changed and must not have`);
    this.name = 'PreservedColumnChangedError';
  }
}

/** Throws unless the `org_members` row genuinely exists. The check the service skips. */
export async function assertOrgMemberExists(orgMemberId: string): Promise<void> {
  const rows = await sequelize.query<{ id: string }>(
    'SELECT id FROM org_members WHERE id = $1',
    { bind: [orgMemberId], type: QueryTypes.SELECT },
  );
  if (rows.length !== 1) throw new OrgMemberNotFoundError(orgMemberId);
}

/** The row as it stands, limited to the columns this correction reasons about. */
export async function snapshotAgent(agentName: string): Promise<AgentRowSnapshot & { id: string }> {
  const rows = await sequelize.query<AgentRowSnapshot & { id: string }>(
    `SELECT id, enabled, autonomy_level, tools_granted, reports_to_type, reports_to_id
       FROM ai_agents WHERE agent_name = $1`,
    { bind: [agentName], type: QueryTypes.SELECT },
  );
  if (rows.length !== 1) {
    throw new Error(`AgentNotFoundError: expected exactly one '${agentName}', found ${rows.length}`);
  }
  return rows[0];
}

/** Which of the three preserved columns differ. Compared by value, not by whole row. */
export function changedPreservedColumns(
  before: AgentRowSnapshot, after: AgentRowSnapshot,
): string[] {
  return PRESERVED_COLUMNS.filter(
    (c) => JSON.stringify((before as never)[c] ?? null) !== JSON.stringify((after as never)[c] ?? null),
  );
}

export interface CorrectionResult {
  readonly agent_name: string;
  readonly before: AgentRowSnapshot;
  readonly after: AgentRowSnapshot;
  readonly service_result: AgentReportsToResult | null;
  readonly preserved_columns_unchanged: boolean;
  readonly dry_run: boolean;
}

/**
 * Validate, then write through the real service, then verify the three columns held.
 *
 * `dryRun` stops after the validation and the first snapshot, so the production state can be
 * confirmed before anything is written. Idempotent: re-running against an already-corrected row
 * sets the same values and still leaves the three columns alone.
 */
export async function correctDeptCampaignPerformanceReportsTo(opts: {
  readonly setByEmail: string;
  readonly dryRun?: boolean;
  readonly orgMemberId?: string;
}): Promise<CorrectionResult> {
  const orgMemberId = opts.orgMemberId ?? MARKETING_MANAGER_ORG_MEMBER_ID;

  // The validation the service does not do, BEFORE the service is called.
  await assertOrgMemberExists(orgMemberId);

  const before = await snapshotAgent(TARGET_AGENT_NAME);

  if (opts.dryRun) {
    return {
      agent_name: TARGET_AGENT_NAME,
      before,
      after: before,
      service_result: null,
      preserved_columns_unchanged: true,
      dry_run: true,
    };
  }

  const service_result = await setAgentReportsTo(before.id, 'human', orgMemberId, opts.setByEmail);
  const after = await snapshotAgent(TARGET_AGENT_NAME);

  const changed = changedPreservedColumns(before, after);
  if (changed.length > 0) throw new PreservedColumnChangedError(changed);

  return {
    agent_name: TARGET_AGENT_NAME,
    before,
    after,
    service_result,
    preserved_columns_unchanged: true,
    dry_run: false,
  };
}
