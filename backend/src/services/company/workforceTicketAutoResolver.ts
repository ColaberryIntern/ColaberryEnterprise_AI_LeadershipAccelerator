/**
 * Workforce Ticket Auto-Resolver
 *
 * workforceIntelligenceEngine.ts opens a `workforce_decision` ticket whenever an
 * agent's live error rate crosses a real threshold (error_count/run_count > 20% AND
 * error_count >= 10, read from `ai_agents`). Nothing in that file — or anywhere else
 * in the repo, before this — ever re-checks an already-open ticket's condition, so
 * every one of those tickets stays `backlog` forever, even after the real issue is
 * fixed (confirmed live: 438 open workforce_decision tickets, 100% still `backlog`,
 * all for a single agent, as of this file's authoring — see the run's
 * execution-contract.md for the full discovery trail).
 *
 * This module is the missing re-check: for every open workforce_decision ticket, it
 * re-derives the SAME condition the ticket was created under, from live `ai_agents`
 * data, and closes the ticket — with a real, numbers-grounded evidence comment — only
 * when that condition has genuinely stopped being true. It deliberately does NOT touch
 * workforceIntelligenceEngine.ts's ticket-creation/dedup logic (out of scope, already
 * fixed for dedup in a prior run) and does NOT route through cory-engine's
 * IntelligenceDecision/RiskEvaluatorAgent pipeline — that pipeline is for cory-engine's
 * LLM-driven judgment calls; this stays deterministic, matching
 * workforceIntelligenceEngine.ts's own "Deterministic rules (no LLM)" nature. No
 * human-approval step is added on purpose — a metric-threshold check is exactly the
 * kind of finding CLAUDE.md's autonomy model treats as safe to close without escalation.
 *
 * Honesty boundary (by design, not an oversight): closing here means "the metric this
 * ticket was opened on is no longer true right now." It does NOT mean "a human
 * confirmed the root cause was fixed." The evidence comment says so explicitly so a
 * human reading the closed ticket later never mistakes one for the other.
 */
import { Op } from 'sequelize';

// Mirrors workforceIntelligenceEngine.ts:57's literal condition
// (`errorRate > 20 && a.error_count >= 10`) exactly. Deliberately duplicated here
// rather than importing/refactoring that file (out of scope — its ticket-creation
// logic is explicitly not to be touched by this run). A dedicated test
// (workforceTicketAutoResolverThresholdSync.test.ts) reads that file's real source
// text and fails loudly if these ever drift apart.
export const WORKFORCE_HIGH_ERROR_RATE_THRESHOLD_PCT = 20;
export const WORKFORCE_HIGH_ERROR_RATE_MIN_COUNT = 10;

// Safety ceiling only, not a business rule — real volume today is 438. If ever hit,
// the remainder is picked up automatically on the next scheduled pass (every 6h).
const MAX_TICKETS_PER_RUN = 2000;

export type TicketRecheckOutcome =
  | 'closed'
  | 'still_open'
  | 'skipped_no_agent_name'
  | 'skipped_agent_not_found'
  | 'error';

export interface TicketRecheckResult {
  ticket_id: string;
  ticket_number: number | null;
  agent_name: string | null;
  outcome: TicketRecheckOutcome;
  current_error_count?: number;
  current_run_count?: number;
  current_error_rate_pct?: number;
  error_message?: string;
}

export interface AutoResolveReport {
  checked: number;
  closed: number;
  results: TicketRecheckResult[];
  duration_ms: number;
}

/** metadata.agent_name is the real, drift-proof matching key (see file header). Falls
 * back to stripping the legacy ":high_error_rate" suffix from entity_id only when
 * metadata is missing entirely (defensive — every sampled real row has metadata). */
function resolveAgentName(ticket: any): string | null {
  const fromMetadata = ticket.metadata?.agent_name;
  if (typeof fromMetadata === 'string' && fromMetadata.length > 0) return fromMetadata;

  const entityId: string | null = ticket.entity_id || null;
  if (!entityId) return null;
  return entityId.replace(/:high_error_rate$/, '') || null;
}

function computeErrorRatePct(runCount: number, errorCount: number): number {
  return runCount > 0 ? (errorCount / runCount) * 100 : 0;
}

function isStillHighError(runCount: number, errorCount: number): boolean {
  const rate = computeErrorRatePct(runCount, errorCount);
  return rate > WORKFORCE_HIGH_ERROR_RATE_THRESHOLD_PCT && errorCount >= WORKFORCE_HIGH_ERROR_RATE_MIN_COUNT;
}

function buildEvidenceComment(agentName: string, runCount: number, errorCount: number, ratePct: number): string {
  const roundedRate = Math.round(ratePct * 10) / 10;
  return (
    `✅ Auto-resolved: ${agentName}'s error rate is now ${roundedRate}% ` +
    `(${errorCount}/${runCount} runs) — at or below the ${WORKFORCE_HIGH_ERROR_RATE_THRESHOLD_PCT}% ` +
    `threshold this ticket was opened under. This reflects the metric observed right ` +
    `now (${new Date().toISOString()}), not a verified root-cause fix — no human or ` +
    `code review confirmed why the rate recovered. A new ticket will be filed ` +
    `automatically if the error rate rises above threshold again.`
  );
}

/**
 * Re-checks every open workforce_intelligence_engine ticket against live ai_agents
 * data and closes it (status 'done') with a real evidence comment when the condition
 * that opened it has genuinely cleared. Idempotent: a ticket that's already
 * done/cancelled never appears in the query (safe no-op); a still-broken condition
 * produces zero writes (safe to run any number of times); a target agent that no
 * longer exists is skipped, never crashes the batch.
 */
export async function reCheckAndAutoResolveWorkforceTickets(): Promise<AutoResolveReport> {
  const start = Date.now();
  const { Ticket, AiAgent } = await import('../../models');
  const { updateTicketStatus } = await import('./ticketOrchestrator');

  const openTickets = await (Ticket as any).findAll({
    where: {
      type: 'workforce_decision',
      entity_type: 'agent',
      created_by_id: 'workforce_intelligence_engine',
      status: { [Op.notIn]: ['done', 'cancelled'] },
    },
    limit: MAX_TICKETS_PER_RUN,
  });

  if (openTickets.length === MAX_TICKETS_PER_RUN) {
    console.warn(
      `[Workforce AutoResolve] Hit the ${MAX_TICKETS_PER_RUN}-ticket safety ceiling; remainder will be picked up on the next scheduled pass.`,
    );
  }

  const agentNames = Array.from(
    new Set(openTickets.map((t: any) => resolveAgentName(t)).filter((n: any): n is string => !!n)),
  );

  const agentRows = agentNames.length
    ? await (AiAgent as any).findAll({ where: { agent_name: { [Op.in]: agentNames } } })
    : [];
  const agentByName = new Map<string, any>(agentRows.map((a: any) => [a.agent_name, a]));

  const results: TicketRecheckResult[] = [];
  let closed = 0;

  for (const ticket of openTickets) {
    const agentName = resolveAgentName(ticket);
    const base = { ticket_id: ticket.id, ticket_number: ticket.ticket_number ?? null, agent_name: agentName };

    if (!agentName) {
      results.push({ ...base, outcome: 'skipped_no_agent_name' });
      continue;
    }

    const agent = agentByName.get(agentName);
    if (!agent) {
      results.push({ ...base, outcome: 'skipped_agent_not_found' });
      continue;
    }

    const runCount = agent.run_count || 0;
    const errorCount = agent.error_count || 0;
    const ratePct = computeErrorRatePct(runCount, errorCount);

    try {
      if (isStillHighError(runCount, errorCount)) {
        results.push({
          ...base,
          outcome: 'still_open',
          current_error_count: errorCount,
          current_run_count: runCount,
          current_error_rate_pct: ratePct,
        });
        continue;
      }

      const comment = buildEvidenceComment(agentName, runCount, errorCount, ratePct);
      await updateTicketStatus(ticket.id, 'done', 'agent', 'workforce_intelligence_engine', comment);
      closed++;
      results.push({
        ...base,
        outcome: 'closed',
        current_error_count: errorCount,
        current_run_count: runCount,
        current_error_rate_pct: ratePct,
      });
    } catch (err: any) {
      // One bad ticket must never abort the batch (Failure-First Design: no silent
      // swallow — logged with context, batch continues).
      console.error(`[Workforce AutoResolve] Failed to close ticket ${ticket.id} (${agentName}): ${err?.message || err}`);
      results.push({ ...base, outcome: 'error', error_message: err?.message || String(err) });
    }
  }

  return { checked: openTickets.length, closed, results, duration_ms: Date.now() - start };
}
