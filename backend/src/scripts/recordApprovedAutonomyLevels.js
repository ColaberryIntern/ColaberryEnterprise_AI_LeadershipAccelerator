#!/usr/bin/env node
/**
 * Record the DRI's approval of the only two autonomy levels in the fleet above `observe`.
 *
 * Run: `node backend/src/scripts/recordApprovedAutonomyLevels.js [--apply]`
 *
 * WHY THIS EXISTS. `agentAuthorizationService.resolveLevel` honours `autonomy_level` whenever
 * `autonomy_level_set_at` is stamped, on the documented premise that a stamp means "an operator
 * actually chose it". That held while `agentReactivationService` was the only writer. Two later
 * writers -- `classifyAiAgentAutonomyLevels` and `agentAutonomyReclassificationService` -- stamp
 * the same column with `autonomy_level_source: 'auto'`, and the gate never selects `source`. So a
 * keyword classifier's output has been honoured as a human decision.
 *
 * Measured in production 2026-10-11 across 257 agents: 12 levels set by the classifier, 245 never
 * set, and exactly TWO above `observe` -- Reese and Dara, both `communicate`, both 'auto'. Reese's
 * `communicate` came from `agentCapabilityClassifier` matching the literal string `respond_to_dm`.
 *
 * APPROVED BY ALI, 2026-10-11, in response to the measured blast radius: record a human decision
 * for the two agents above `observe` so the gate honours them for the right reason.
 *
 * WHAT THIS DOES NOT DO. It changes no level -- both agents keep `communicate`, the level they
 * already run at. It records WHO decided, not WHAT was decided, so no agent gains or loses any
 * capability. It touches exactly three columns via `recordHumanAutonomyDecision`, which never
 * writes `enabled`, `status`, `abac_mode_override` or a tool grant. Reese's
 * `abac_mode_override: 'enforce'` -- she is the only enforcing agent in the fleet -- is untouched.
 *
 * It also does NOT tighten the gate. That remains unsafe for a separate reason recorded in
 * `agentAuthorizationService`'s header: the ten `observe`/'auto' agents would RISE to `suggest`,
 * because their tier-derived fallback is higher than their stored level. This script fixes the two
 * agents it can; it does not pretend to fix that.
 *
 * Dry-run by default. Prints the exact rollback before writing anything.
 */

const AGENTS = Object.freeze([
  { agent_name: 'Reese', level: 'communicate' },
  { agent_name: 'Dara', level: 'communicate' },
]);

/** The level each agent must already be at. A mismatch means the fleet moved under us: stop. */
const EXPECTED_CURRENT_LEVEL = 'communicate';

async function main() {
  const apply = process.argv.includes('--apply');
  const log = (o) => console.log(JSON.stringify(o));

  // ts-node/register so this .js script can import the TypeScript service rather than
  // re-implementing its write. One write path, not a copy that could drift.
  require('ts-node/register');
  const { recordHumanAutonomyDecision } = require('../services/workforce/agentReactivationService');
  const AiAgent = require('../models/AiAgent').default;

  log({ event: 'record_approved_autonomy_start', mode: apply ? 'APPLY' : 'DRY_RUN', agents: AGENTS });

  const before = [];
  for (const { agent_name } of AGENTS) {
    const row = await AiAgent.findOne({ where: { agent_name } });
    if (!row) throw new Error(`agent not found: ${agent_name}`);
    before.push({
      agent_name,
      autonomy_level: row.autonomy_level,
      autonomy_level_source: row.autonomy_level_source,
      autonomy_level_set_at: row.autonomy_level_set_at,
      enabled: row.enabled,
      abac_mode_override: row.abac_mode_override ?? null,
    });
  }
  log({ event: 'before', rows: before });

  // Refuse if either agent is not where the approval assumed it was. An approval of `communicate`
  // is not an approval of whatever the level happens to be now.
  for (const b of before) {
    if (b.autonomy_level !== EXPECTED_CURRENT_LEVEL) {
      throw new Error(
        `${b.agent_name} is at '${b.autonomy_level}', not '${EXPECTED_CURRENT_LEVEL}'. `
        + 'The approval covered the measured state; re-measure and re-approve rather than writing.',
      );
    }
  }

  log({
    event: 'rollback_sql',
    note: 'Run these to undo. Restores the exact prior source and timestamp.',
    statements: before.map((b) => (
      `UPDATE public.ai_agents SET autonomy_level_source = ${b.autonomy_level_source === null ? 'NULL' : `'${b.autonomy_level_source}'`}, `
      + `autonomy_level_set_at = '${new Date(b.autonomy_level_set_at).toISOString()}' `
      + `WHERE agent_name = '${b.agent_name}';`
    )),
  });

  if (!apply) {
    log({ event: 'dry_run_plan', would_record: AGENTS.map((a) => a.agent_name), note: 'no write performed; re-run with --apply' });
    return;
  }

  for (const { agent_name, level } of AGENTS) {
    const res = await recordHumanAutonomyDecision(agent_name, level);
    log({ event: 'recorded', ...res });
    if (!res.recorded) throw new Error(`failed to record ${agent_name}: ${res.error}`);
  }

  const after = [];
  for (const { agent_name } of AGENTS) {
    const row = await AiAgent.findOne({ where: { agent_name } });
    after.push({
      agent_name,
      autonomy_level: row.autonomy_level,
      autonomy_level_source: row.autonomy_level_source,
      enabled: row.enabled,
      abac_mode_override: row.abac_mode_override ?? null,
    });
  }
  log({ event: 'after', rows: after });

  // The whole point: the level did not move, only its provenance.
  for (let i = 0; i < after.length; i += 1) {
    if (after[i].autonomy_level !== before[i].autonomy_level) {
      throw new Error(`LEVEL CHANGED for ${after[i].agent_name} -- this script must never do that`);
    }
    if (after[i].enabled !== before[i].enabled) {
      throw new Error(`ENABLED CHANGED for ${after[i].agent_name} -- this script must never do that`);
    }
    if (after[i].abac_mode_override !== before[i].abac_mode_override) {
      throw new Error(`ABAC OVERRIDE CHANGED for ${after[i].agent_name} -- this script must never do that`);
    }
  }
  log({ event: 'invariants_held', note: 'level, enabled and abac_mode_override unchanged for both agents' });
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(JSON.stringify({ event: 'record_approved_autonomy_failed', error_class: err.name, message: err.message }));
      process.exit(1);
    });
}

module.exports = { AGENTS, EXPECTED_CURRENT_LEVEL, main };
