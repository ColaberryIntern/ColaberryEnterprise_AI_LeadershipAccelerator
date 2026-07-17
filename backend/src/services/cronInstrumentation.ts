/**
 * Shared cron instrumentation wrapper — BC #10099862873 (P1, item 1).
 *
 * Extracted from schedulerService.ts (previously private, only usable inside
 * that file) so aiOpsScheduler.ts and any other cron registration site can
 * report run/error data to the same AiAgent registry that
 * cronHealthAlertService.ts's error-rate/missed-run alerting reads from.
 * Un-instrumented jobs are invisible to that alerting, not just unmonitored —
 * they never populate `run_count`/`error_count`/`AiAgentActivityLog` at all.
 */
import { v4 as uuidv4 } from 'uuid';
import { AiAgent, AiAgentActivityLog } from '../models';
import { runWithRequestContext } from '../utils/requestContext';

/**
 * Checks the agent registry for enabled/paused status, generates a trace_id,
 * measures duration, logs to ai_agent_activity_logs, and updates agent metrics.
 */
export async function instrumentCronJob(agentName: string, fn: () => Promise<void>): Promise<void> {
  // Trace propagation: seed a trace_id into AsyncLocalStorage so every downstream AI call this
  // job makes (getInstrumentedOpenAI / emitAiEvent) correlates to THIS run instead of emitting null.
  const traceId = uuidv4();
  const traced = () => runWithRequestContext({ traceId }, fn);

  let agent: InstanceType<typeof AiAgent> | null = null;
  try {
    agent = await AiAgent.findOne({ where: { agent_name: agentName } });
  } catch {
    // If registry lookup fails, run the job anyway (don't break existing behavior)
    await traced();
    return;
  }

  // If agent not in registry, run untracked
  if (!agent) {
    await traced();
    return;
  }

  // Check enabled and paused status
  if (!agent.enabled || agent.status === 'paused') return;

  const start = Date.now();
  let result: 'success' | 'failed' = 'success';
  let errorMsg: string | null = null;
  let stackTrace: string | null = null;

  try {
    await agent.update({ status: 'running' });
    await traced();
  } catch (err: any) {
    result = 'failed';
    errorMsg = err.message || String(err);
    stackTrace = err.stack || null;
  }

  const duration = Date.now() - start;
  const newRunCount = (agent.run_count || 0) + 1;
  const newAvgDuration = agent.avg_duration_ms
    ? Math.round((agent.avg_duration_ms * (newRunCount - 1) + duration) / newRunCount)
    : duration;

  const updateFields: Record<string, any> = {
    status: 'idle',
    run_count: newRunCount,
    avg_duration_ms: newAvgDuration,
    last_run_at: new Date(),
  };
  if (result === 'failed') {
    updateFields.error_count = (agent.error_count || 0) + 1;
    updateFields.last_error = errorMsg;
    updateFields.last_error_at = new Date();
  }

  try {
    await agent.update(updateFields);
    await AiAgentActivityLog.create({
      id: uuidv4(),
      agent_id: agent.id,
      action: agentName,
      result,
      confidence: null,
      reason: result === 'failed' ? errorMsg : `Completed in ${duration}ms`,
      details: null,
      trace_id: traceId,
      duration_ms: duration,
      stack_trace: stackTrace,
      created_at: new Date(),
    } as any);
  } catch (logErr: any) {
    console.error(`[CronInstrumentation] Failed to log instrumentation for ${agentName}:`, logErr.message);
  }
}
