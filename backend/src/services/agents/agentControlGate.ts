import { AiAgent } from '../../models';

/**
 * The one place that decides whether an operator's controls contain an agent.
 *
 * ## Why this is shared rather than written per wrapper
 *
 * Four wrappers start agent runs in this codebase and each had its own hand-written copy of
 * the gate. Audited 2026-10-27, they did not agree:
 *
 *   - `cronInstrumentation` checked `enabled` AND `status === 'paused'`  (correct)
 *   - `aiOrchestrator.runAgent` checked both, in two separate ifs        (correct)
 *   - `agentRunTracker` checked `enabled` only                           (pause ignored)
 *   - `aiOrchestrator.runHealthScans` checked `enabled` only             (pause ignored)
 *
 * The two that were wrong matter more than the count suggests, because of what Pause does:
 * `aiOpsService` writes `status: 'paused'` and leaves `enabled` TRUE. So an agent whose gate
 * reads only `enabled` cannot see a pause at all. Pause is the control an operator reaches for
 * first, and for AutonomousEngine (six runs an hour), AICOOStrategicCycle, MetaAgentLoop (the
 * self-modification loop), CoryEvolutionCycle and CampaignHealthScanner it did nothing.
 *
 * Disable and the kill switch still contained them, because both write `enabled: false`. The
 * hole was pause specifically.
 *
 * Every new wrapper is another chance to miss one, so the predicate lives here now and the
 * wrappers call it.
 */

export type ControlDecision =
  | { run: true }
  | { run: false; reason: 'disabled' | 'paused' };

/** What an operator's controls say about running this agent right now. */
export function agentControlDecision(
  agent: { enabled: boolean; status?: string | null },
): ControlDecision {
  if (!agent.enabled) return { run: false, reason: 'disabled' };
  if (agent.status === 'paused') return { run: false, reason: 'paused' };
  return { run: true };
}

/**
 * The structured skip line. One shape for all four wrappers.
 *
 * A skip must never be silent: the missed-run detector only evaluates `enabled: true` agents,
 * so a disabled or mis-seeded row otherwise produces no signal anywhere, and an accidental
 * disable becomes indistinguishable from a deliberate one. Before this was shared, only
 * `cronInstrumentation` logged structured JSON; two wrappers logged a plain line and one
 * logged nothing at all.
 */
export function logControlSkip(
  agentName: string,
  agent: { enabled: boolean; status?: string | null },
  decision: Extract<ControlDecision, { run: false }>,
): void {
  console.warn(JSON.stringify({
    level: 'warn',
    service: 'backend',
    // Deliberately keeps the name `cronInstrumentation` already emitted, even though three of
    // the four callers are not cron jobs. It is a published contract, not an internal string:
    // `agentDomain/capabilities/platform.json` asserts this exact event in three places as a
    // platform capability. Sharing the predicate was the point; renaming the event would have
    // broken a consumer to make a log line tidier.
    event: 'cron_job_skipped_disabled',
    outcome: 'partial',
    context: {
      agent_name: agentName,
      enabled: agent.enabled,
      status: agent.status ?? null,
      reason: decision.reason,
    },
  }));
}

/**
 * Write the end-of-run bookkeeping WITHOUT letting it erase a pause set during the run.
 *
 * Every wrapper used to finish with an unconditional `status: 'idle'` (or `'error'`). Nothing
 * re-read the row first, so a pause issued while the job was running was silently overwritten
 * the moment it ended. Both wrappers check for `paused` at the START of a run and return before
 * writing anything, so a pause set while the agent is idle survives fine. The lost window is
 * exactly a pause issued mid-run, which is when an operator is most likely to reach for it: a
 * cleanup job closes in milliseconds, but a recording ingest or a catalog scrape runs for
 * minutes.
 *
 * So the status write is conditioned on the row still being `running`. If it is not, somebody
 * changed it underneath us and their change wins. The run's own bookkeeping (counts, timings,
 * errors) is still recorded either way, because the run did happen and losing that would trade
 * one false reading for another.
 *
 * This is necessary for the gate above to hold under load, not merely tidy: honoring a pause at
 * tick start is worthless if the previous tick's closing write just erased it.
 */
export async function completeRunPreservingControls(
  agentId: string,
  fields: Record<string, any>,
): Promise<{ statusWritten: boolean }> {
  const { status, ...bookkeeping } = fields;

  if (status === undefined) {
    await AiAgent.update(bookkeeping, { where: { id: agentId } as any });
    return { statusWritten: false };
  }

  const [claimed] = await AiAgent.update(
    { status, ...bookkeeping } as any,
    { where: { id: agentId, status: 'running' } as any },
  );
  if (claimed > 0) return { statusWritten: true };

  // Someone moved the row while we ran. Keep their status, record ours.
  await AiAgent.update(bookkeeping as any, { where: { id: agentId } as any });
  return { statusWritten: false };
}
