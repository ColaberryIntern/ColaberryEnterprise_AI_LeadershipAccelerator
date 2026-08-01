/**
 * agentRunTracker — shared AiAgent bookkeeping for scheduler entries whose runner
 * doesn't already self-report (unlike most of aiOrchestrator.ts's exported runners,
 * which update AiAgent internally via runAgent()). Extracted so aiOpsScheduler.ts can
 * wrap a bare runner without duplicating that update logic.
 *
 * Root cause this fixes: MetaAgentLoop/AutonomousEngine/AICOOStrategicCycle/
 * CoryEvolutionCycle are genuinely scheduled and enabled (cron_schedule_configs), and
 * MetaAgentLoop is proven executing (515 real intelligence_memory rows, hourly), but
 * none of them ever touch the AiAgent row the Trust Command Center reads from.
 */
import AiAgent from '../models/AiAgent';

/**
 * Runs `fn`, then records the attempt on the named AiAgent row — on success AND on
 * failure, since a failed-but-executed run is not "never ran." Only skips EXECUTION
 * when the row exists and is explicitly `enabled: false` — a deliberate admin action,
 * matching aiOrchestrator.ts's runAgent() skip semantics for that case. If no row
 * exists at all, `fn()` still runs (real business logic must never be gated on a
 * dashboard-bookkeeping lookup — see CLAUDE.md Failure-First Design); only the
 * bookkeeping update is skipped, with a loud warning so the missing registration is
 * visible and fixable. (Regression found in production verification 2026-08-01:
 * CoryEvolutionCycle has no ai_agents row, and the original fail-closed version of
 * this function silently stopped its real self-evolution cycle from ever running.)
 * Rethrows on failure so the caller's own .catch() (aiOpsScheduler.ts) still logs it.
 */
export async function trackAgentRun<T>(agentName: string, fn: () => Promise<T>): Promise<T | null> {
  const agent = await AiAgent.findOne({ where: { agent_name: agentName } });
  if (!agent) {
    console.warn(`[AgentRunTracker] No AiAgent row for "${agentName}" — running anyway (bookkeeping only is skipped). Register this agent so its activity shows on the Trust dashboard.`);
    return fn();
  }
  if (!agent.enabled) {
    console.log(`[AgentRunTracker] Agent ${agentName} is disabled, skipping`);
    return null;
  }

  const startTime = Date.now();
  try {
    const result = await fn();
    const durationMs = Date.now() - startTime;
    const newAvg = agent.avg_duration_ms
      ? Math.round((agent.avg_duration_ms * agent.run_count + durationMs) / (agent.run_count + 1))
      : durationMs;
    await agent.update({
      last_run_at: new Date(),
      run_count: agent.run_count + 1,
      avg_duration_ms: newAvg,
      updated_at: new Date(),
    });
    return result;
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    const newAvg = agent.avg_duration_ms
      ? Math.round((agent.avg_duration_ms * agent.run_count + durationMs) / (agent.run_count + 1))
      : durationMs;
    await agent.update({
      last_run_at: new Date(),
      run_count: agent.run_count + 1,
      avg_duration_ms: newAvg,
      last_error: err?.message ? String(err.message).slice(0, 2000) : 'Unknown error',
      last_error_at: new Date(),
      updated_at: new Date(),
    });
    throw err;
  }
}
