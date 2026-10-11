/**
 * Shared IO shell for department super agents.
 *
 * Each super agent aggregates signals from subordinate agents in its group,
 * asks superAgentHealth for a verdict, and persists a DepartmentReport.
 *
 * All decision logic lives in ./superAgentHealth (pure, no IO). This file is
 * deliberately only the parts that touch the database or the event log, so the
 * rules can be tested without a Postgres connection - the same split as
 * openclaw/openclawCircuitBreaker.ts.
 */

import AiAgent from '../../../../models/AiAgent';
import DepartmentReport from '../../../../models/DepartmentReport';
import { logAiEvent } from '../../../aiEventService';
import { classifyError } from '../../../../utils/errorClassifier';
import { evaluateGroupHealth } from './superAgentHealth';
import { isRunnableStatus } from './superAgentSubordinateRows';
import type {
  GroupHealth,
  DepartmentReportType,
  StatusCollection,
  SubordinateStatus,
} from './superAgentHealth';

// The types describing SuperAgentResult's own fields, re-exported for callers
// that annotate it. The two legacy value re-exports that used to sit here -
// detectAnomalies and generateRecommendations, two-argument wrappers around the
// pure module - are gone. Their doc comments claimed they were "kept for any
// out-of-tree caller", no caller existed (grepped 2026-10-06: nothing in
// backend/src, /scripts or /tests imports either symbol from this file, and
// only runSuperAgentCycle and collectGroupStatus are imported from it at all),
// and no test held the claim: the audit reverted the wrapper's health
// derivation to the pre-fix `anomalies.length === 0 ? 'healthy' : 'degraded'`
// and all 120 tests still passed. Untested code carrying a false claim about
// the one thing this subtree exists to prevent is worse than no code.
export type { GroupHealth, DepartmentReportType, StatusCollection, SubordinateStatus } from './superAgentHealth';

export interface SuperAgentResult {
  department: string;
  subordinates: SubordinateStatus[];
  healthy: number;
  errored: number;
  paused: number;
  total: number;
  anomalies: string[];
  recommendations: string[];
  /**
   * ADDITIVE (2026-10-06). Every existing field above is unchanged and every
   * caller - the 8 super agents, coryProductionBoot, finalActivation,
   * goLiveOrchestration and launchSafety - reads only department / anomalies /
   * healthy / errored / total, so nothing had to be retyped.
   *
   * `health` is the field that matters: `healthy === 0 && total === 0` used to
   * be the signature of both an empty department and a failed query, and a
   * caller could not tell either from a genuinely idle one.
   */
  health: GroupHealth;
  report_type: DepartmentReportType;
  /** error_class of the failed status query, or null when the read succeeded. */
  collection_error: string | null;
}

/**
 * Collect status of all agents in a given agent_group.
 *
 * Returns a discriminated result. It used to return [] on a DB throw, which
 * made a failed read indistinguishable from an empty department and let a
 * blind cycle report 'periodic'/'healthy'. The signature change is safe:
 * grepped on 2026-10-06, the only caller in the repo is runSuperAgentCycle
 * below.
 */
export async function collectGroupStatus(agentGroup: string): Promise<StatusCollection> {
  try {
    const agents = await AiAgent.findAll({
      where: { agent_group: agentGroup },
      attributes: ['agent_name', 'status', 'enabled', 'last_run_at', 'error_count', 'run_count', 'avg_duration_ms', 'last_error'],
      order: [['agent_name', 'ASC']],
    });

    return {
      ok: true,
      subordinates: agents.map(a => ({
        agent_name: a.agent_name,
        status: a.status,
        enabled: a.enabled,
        last_run_at: a.last_run_at,
        error_count: a.error_count,
        run_count: a.run_count,
        avg_duration_ms: a.avg_duration_ms,
        last_error: a.last_error,
      })),
    };
  } catch (err) {
    const errorClass = classifyError(err);
    const message = (err as Error)?.message || 'unknown error';

    await logAiEvent('SuperAgentBase', 'SUPER_AGENT_ERROR', 'ai_agents', agentGroup, {
      error: message,
      error_class: errorClass,
      phase: 'collectGroupStatus',
      outcome: 'failure',
    }).catch(() => {});
    console.error(`[SuperAgent] Failed to collect group status for ${agentGroup}: ${errorClass}: ${message}`);

    return { ok: false, errorClass, message };
  }
}

/**
 * Run a standard super agent cycle: collect, evaluate, persist report.
 */
export async function runSuperAgentCycle(
  agentGroup: string,
  department: string,
  superAgentName: string,
): Promise<SuperAgentResult> {
  const collection = await collectGroupStatus(agentGroup);
  const subordinates = collection.ok ? collection.subordinates : [];

  const { health, anomalies, recommendations, report_type } = evaluateGroupHealth(collection);

  // isRunnableStatus is the SAME definition the anomaly rules use. While this
  // line held its own copy of the status literals, the counter and the verdict
  // could disagree, and they did: one enabled, paused agent wrote
  // "Finance: health HEALTHY - 0/1 healthy, 0 errored, 1 paused." A summary
  // that contradicts its own arithmetic is now a test failure, not a release.
  const healthy = subordinates.filter(s => s.enabled && isRunnableStatus(s.status)).length;
  const errored = subordinates.filter(s => s.status === 'error').length;
  const paused = subordinates.filter(s => s.status === 'paused' || !s.enabled).length;

  const summary = collection.ok
    ? `${department}: health ${health.toUpperCase()} — ${healthy}/${subordinates.length} healthy, ${errored} errored, ${paused} paused. ${anomalies.length} anomalies detected.`
    : `${department}: health UNKNOWN — agent status could not be read (${collection.errorClass}). No health claim can be made for this cycle.`;

  // superAgentBase owns this entire metrics object, so adding keys cannot
  // clobber another writer's state.
  await DepartmentReport.create({
    department,
    report_type,
    summary,
    metrics: {
      total: subordinates.length,
      healthy,
      errored,
      paused,
      avg_duration_ms: subordinates.reduce((sum, s) => sum + (s.avg_duration_ms || 0), 0) / (subordinates.length || 1),
      // Read by the executive briefing so a 0-agent or failed-read cycle is
      // never rendered as 'healthy'. metrics is present on 100% of historical
      // rows, so a reader can treat a missing `health` as pre-fix data.
      health,
      collection_ok: collection.ok,
      error_class: collection.ok ? null : collection.errorClass,
    },
    anomalies: anomalies.length > 0 ? anomalies : null,
    recommendations: recommendations.length > 0 ? recommendations : null,
    source_agent: superAgentName,
  });

  await logAiEvent(superAgentName, 'department_report', 'department_reports', department, {
    total: subordinates.length,
    healthy,
    errored,
    anomalies_count: anomalies.length,
    health,
    report_type,
    outcome: collection.ok ? 'success' : 'partial',
    error_class: collection.ok ? undefined : collection.errorClass,
  }).catch(() => {});

  return {
    department,
    subordinates,
    healthy,
    errored,
    paused,
    total: subordinates.length,
    anomalies,
    recommendations,
    health,
    report_type,
    collection_error: collection.ok ? null : collection.errorClass,
  };
}
