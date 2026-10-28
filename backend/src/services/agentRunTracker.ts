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
import { agentControlDecision, logControlSkip } from './agents/agentControlGate';

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
  // Pause used to be invisible here. This checked `enabled` only, and Pause writes `status`
  // while leaving `enabled` true, so pausing AutonomousEngine, AICOOStrategicCycle,
  // MetaAgentLoop or CoryEvolutionCycle did nothing at all. Shared predicate now, so the four
  // wrappers cannot drift apart again.
  const decision = agentControlDecision(agent);
  if (!decision.run) {
    logControlSkip(agentName, agent, decision);
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
    /**
     * `error_count` is the field every health computation in the product actually divides by,
     * and this path used to leave it alone.
     *
     * Reported by Quincy on 2026-10-28, verified here: the failure branch wrote `last_run_at`
     * and `run_count + 1` exactly as the success branch does, and `error_count` appeared
     * nowhere in this file. aiOpsService.ts:472 scores an agent
     * `100 - error_count / max(run_count, 1) * 200`, so with the numerator frozen at 0 a timer
     * that failed every single run rendered a green 100 beside a fresh timestamp and a
     * climbing run count. It read as healthy AND busy, which is worse than reading as broken,
     * because nothing invites anyone to look. The four wrappers on this path are
     * AutonomousEngine, AICOOStrategicCycle, MetaAgentLoop and CoryEvolutionCycle.
     *
     * Two things here are deliberately NOT changed.
     *
     * `last_run_at` still moves on failure. A failing job is still firing, and the cron health
     * check detects a job that STOPPED by the gap between fires. Withholding the timestamp
     * would trade a false "healthy" for a false "stopped".
     *
     * No `status` is written, on either path. `status: 'error'` would make this file a
     * completion writer able to erase an operator's mid-run pause, and the gate that prevents
     * that (`completeRunPreservingControls`) is only reached by callers that CLAIM the run by
     * writing `status: 'running'`. This function never claims one, which is precisely why it
     * needs no gate. The first assertion in agentControlWritesGoThroughGate.test.ts pins that
     * invariant, so adding a status write here has to come past it.
     */
    await agent.update({
      last_run_at: new Date(),
      run_count: agent.run_count + 1,
      error_count: agent.error_count + 1,
      avg_duration_ms: newAvg,
      last_error: err?.message ? String(err.message).slice(0, 2000) : 'Unknown error',
      last_error_at: new Date(),
      updated_at: new Date(),
    });
    throw err;
  }
}
