import { v4 as uuidv4 } from 'uuid';
import AiAgentActivityLog, { AgentActivityResult } from '../../models/AiAgentActivityLog';

// AI Agent Dashboard redesign — Ali: "What can we do to improve the 3.8/5
// Trust score for Reese?" Root cause: agentGoalsDimensionsService.ts's
// observability/availability/solid dimensions compute entirely from
// AiAgentActivityLog rows keyed on the agent's OWN AiAgent.id, and Reese's
// real work never wrote there — her outreach sweep is instrumented under a
// SIBLING cron-job AiAgent row ('ReeseAutonomousOutreachSweep', via
// cronInstrumentation.ts), and her DM replies log to Ticket activity /
// ai_events, neither of which is this table. Those three dimensions were
// permanently pinned to their zero-data fallback constants (3/2/5) no
// matter how much real work she did.
//
// This is the generic, reusable write path any agent's real action can call
// to close that gap — Reese is its first caller, matching this codebase's
// established agentBlueprint/ pattern (agentIdentitySeed.ts,
// agentTicketLinkService.ts) of building the first integration as a thin
// wrapper over a shared, reusable core. Fail-open and logged, same posture
// as every other non-critical side-effect in the Reese call chain (ticket
// linking, checklist instances, assessment refresh) — a logging failure
// must never break the real action it's describing.
export interface LogAgentActivityInput {
  agentId: string;
  action: string;
  result: AgentActivityResult;
  reason?: string;
  traceId?: string;
  details?: Record<string, any>;
}

export async function logAgentActivity(input: LogAgentActivityInput): Promise<void> {
  try {
    await AiAgentActivityLog.create({
      id: uuidv4(),
      agent_id: input.agentId,
      action: input.action,
      result: input.result,
      reason: input.reason ?? null,
      trace_id: input.traceId ?? null,
      details: input.details ?? null,
      created_at: new Date(),
    } as any);
  } catch (e: any) {
    console.warn(JSON.stringify({
      level: 'warn', service: 'agentBlueprint', event: 'agent_activity_log_failed',
      agent_id: input.agentId, action: input.action,
      error_class: e?.name || 'Error', message: String(e?.message || e),
    }));
  }
}
