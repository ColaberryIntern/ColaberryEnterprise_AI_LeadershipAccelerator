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
 * failure, since a failed-but-executed run is not "never ran." Skips execution (and
 * returns null without touching the row) if the agent isn't registered or is disabled,
 * matching aiOrchestrator.ts's runAgent() skip semantics. Rethrows on failure so the
 * caller's own .catch() (aiOpsScheduler.ts) still logs it exactly as before.
 */
export async function trackAgentRun<T>(agentName: string, fn: () => Promise<T>): Promise<T | null> {
  const agent = await AiAgent.findOne({ where: { agent_name: agentName } });
  if (!agent) {
    console.error(`[AgentRunTracker] Agent not found: ${agentName}`);
    return null;
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
