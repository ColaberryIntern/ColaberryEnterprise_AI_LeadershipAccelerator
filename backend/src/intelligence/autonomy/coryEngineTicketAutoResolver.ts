/**
 * Cory-Engine Ticket Auto-Resolver — I/O recheck + resolve service
 *
 * `autonomousEngine.ts`'s `runAutonomousCycle()` opens a ticket for every problem
 * `discoverProblems()` detects, but never re-checks an already-open one — 6,843 of
 * cory-engine's 9,624 tickets sit in `todo` forever, even after the condition that
 * opened them has genuinely cleared (see this run's execution-contract.md for the full
 * DISCOVER trail, verified directly against production).
 *
 * This module is the missing re-check. For every open cory-engine ticket, it re-derives
 * the SAME condition the ticket was created under — by calling the SAME exported
 * detector functions `autonomousEngine.ts` itself calls every cycle
 * (`detectAgentFailures`/`detectConversionDrops`, T001) — and closes the ticket, with a
 * real evidence comment, only when that condition has genuinely stopped being true.
 * Classification (pure, no I/O) is delegated entirely to
 * `coryEngineTicketResolutionRules.ts` (T002) — this file is the I/O orchestration
 * layer only: fetch live data, classify, write.
 *
 * Mirrors `workforceTicketAutoResolver.ts` (PR #1482)'s proven shape for this same
 * class of problem: deterministic (no LLM), no human-approval step (a mechanically
 * re-checkable metric, not a judgment call), a `MAX_TICKETS_PER_RUN` safety ceiling,
 * per-ticket try/catch so one bad row never aborts the batch, and idempotent by
 * construction (the query's own `status NOT IN (done, cancelled)` filter means an
 * already-closed ticket never reappears as a candidate).
 *
 * `error_spike` tickets are always classified (visible in the report/breakdown) but
 * NEVER auto-closed — see `coryEngineTicketResolutionRules.ts`'s `ERROR_SPIKE_RELIABLE_CHECK`
 * for why (the detector's own SQL is broken against the current schema and its
 * try/catch silently returns `[]` every cycle, so a live re-check can never distinguish
 * "no spike" from "the query threw").
 *
 * Honesty boundary (matches workforceTicketAutoResolver.ts's own, by design): closing
 * here means "the specific condition this ticket was opened under is not true right
 * now." It does NOT mean a human confirmed a root cause was fixed. Every evidence
 * comment says so explicitly.
 */
import { Op } from 'sequelize';
import {
  classifyCoryEngineTicket,
  parseAgentNameFromLiveFailureDescription,
  parseTicketCondition,
  type AgentLiveStatus,
  type ConversionMetrics,
  type CoryEngineConditionType,
  type CoryEngineResolutionOutcome,
} from './coryEngineTicketResolutionRules';

/**
 * Evidence-only: re-runs the EXACT SAME `leads` aggregate query
 * `detectConversionDrops()` uses (`ProblemDiscoveryAgent.ts`) so a closed
 * conversion_drop ticket's comment can state the CURRENT recent/expected numbers, not
 * just "no longer reports a drop." Deliberately duplicated rather than widening
 * `detectConversionDrops()`'s own return shape — T001 already independently passed
 * verification on an export-only, zero-behavior-change diff to that file, and
 * broadening its contract here would invalidate that verified evidence for no safety
 * benefit (this read is evidence-only; it never feeds the close decision — the real
 * `detectConversionDrops()` call, via `conversionDropStillActive`, does that alone).
 * Mirrors `workforceTicketAutoResolver.ts`'s own precedent for this exact trade-off
 * (`WORKFORCE_HIGH_ERROR_RATE_THRESHOLD_PCT` is duplicated there, not re-imported, with
 * a dedicated drift-guard test) — this file's own test suite includes the equivalent
 * drift guard against `ProblemDiscoveryAgent.ts`'s real source text.
 */
async function fetchCurrentConversionMetricsForEvidence(): Promise<ConversionMetrics | null> {
  try {
    const { sequelize } = await import('../../config/database');
    const [results]: any = await sequelize.query(`
      SELECT
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '48 hours') AS recent_count,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') / NULLIF(7, 0) AS daily_avg
      FROM leads
      WHERE created_at >= NOW() - INTERVAL '7 days'
    `);
    if (!results?.[0]) return null;
    const recent = Number(results[0].recent_count) || 0;
    const dailyAvg = Number(results[0].daily_avg) || 0;
    return { recent, dailyAvg, expected48h: Math.round(dailyAvg * 2) };
  } catch {
    // Evidence-only — never throws, never blocks classification. If this fails, the
    // evidence note simply states the figures were unavailable (see
    // coryEngineTicketResolutionRules.ts's conversion_drop_cleared branch).
    return null;
  }
}

/** Safety ceiling only, not a business rule — real backlog today is 6,843. If ever hit,
 * the remainder is picked up automatically on the next scheduled pass (every 6h). */
export const MAX_TICKETS_PER_RUN = 8000;

/** Defensive triple-key — the exact fields `autonomousEngine.ts:207-238`'s `createTicket()`
 * call writes for every cory-engine ticket. Scoping on all three (not just
 * created_by_id) keeps this resolver from ever touching a differently-sourced ticket
 * that happens to share the same creator id. */
const CORY_ENGINE_TICKET_SCOPE = {
  created_by_id: 'cory-engine',
  type: 'agent_action',
  source: 'cory_autonomous_cycle',
} as const;

export interface CoryEngineTicketRecheckResult {
  ticket_id: string;
  ticket_number: number | null;
  condition_type: CoryEngineConditionType;
  outcome: CoryEngineResolutionOutcome;
  should_close: boolean;
  evidence_note: string;
  write_error?: string;
}

export interface CoryEngineAutoResolveReport {
  checked: number;
  closed: number;
  /** Per condition-type counts, for the dry-run report and production observability. */
  breakdown: Record<CoryEngineConditionType, { checked: number; closed: number }>;
  results: CoryEngineTicketRecheckResult[];
  duration_ms: number;
}

function emptyBreakdown(): Record<CoryEngineConditionType, { checked: number; closed: number }> {
  return {
    agent_failure: { checked: 0, closed: 0 },
    conversion_drop: { checked: 0, closed: 0 },
    error_spike: { checked: 0, closed: 0 },
    unclassified: { checked: 0, closed: 0 },
  };
}

/**
 * Read-only. Fetches every live open cory-engine ticket, re-runs the two live-checkable
 * detectors ONCE (not once per ticket), and classifies every ticket. Zero writes.
 */
export async function fetchLiveResolvableCoryEngineTickets(): Promise<CoryEngineTicketRecheckResult[]> {
  const { Ticket, AiAgent } = await import('../../models');
  const { detectAgentFailures, detectConversionDrops } = await import('../agents/ProblemDiscoveryAgent');

  const openTickets = await (Ticket as any).findAll({
    where: {
      ...CORY_ENGINE_TICKET_SCOPE,
      status: { [Op.notIn]: ['done', 'cancelled'] },
    },
    limit: MAX_TICKETS_PER_RUN,
  });

  if (openTickets.length === MAX_TICKETS_PER_RUN) {
    console.warn(
      `[CoryEngine AutoResolve] Hit the ${MAX_TICKETS_PER_RUN}-ticket safety ceiling; remainder will be picked up on the next scheduled pass.`,
    );
  }

  // Re-run the SAME detectors autonomousEngine.ts calls every cycle — once per pass,
  // not once per ticket (matches workforceTicketAutoResolver.ts's batching pattern).
  const [agentFailureProblems, conversionDropProblems, conversionMetrics] = await Promise.all([
    detectAgentFailures(),
    detectConversionDrops(),
    fetchCurrentConversionMetricsForEvidence(),
  ]);

  const failingAgentNames = new Set(
    agentFailureProblems
      .map((p) => parseAgentNameFromLiveFailureDescription(p.description))
      .filter((n): n is string => !!n),
  );
  const conversionDropStillActive = conversionDropProblems.length > 0;

  // Evidence-only enrichment: which agent names does the OPEN TICKET BACKLOG itself
  // reference (not the live-failing set) — so a closed ticket's comment can state the
  // agent's real current status/enabled, not just "no longer failing." This is a
  // second, independent AiAgent read used purely for comment text; it does not feed
  // the close decision (failingAgentNames does that, above).
  const referencedAgentNames = new Set<string>();
  for (const ticket of openTickets) {
    const parsed = parseTicketCondition(ticket.description);
    if (parsed.conditionType === 'agent_failure' && parsed.agentName) referencedAgentNames.add(parsed.agentName);
  }
  const agentLiveStatuses = new Map<string, AgentLiveStatus>();
  if (referencedAgentNames.size > 0) {
    const agentRows = await (AiAgent as any).findAll({
      where: { agent_name: { [Op.in]: Array.from(referencedAgentNames) } },
    });
    for (const row of agentRows) {
      agentLiveStatuses.set(row.agent_name, { status: row.status, enabled: row.enabled });
    }
  }

  return openTickets.map((ticket: any) => {
    const classification = classifyCoryEngineTicket(
      { id: ticket.id, description: ticket.description },
      { failingAgentNames, conversionDropStillActive, agentLiveStatuses, conversionMetrics },
    );
    // parseTicketCondition isn't re-called here directly — classifyCoryEngineTicket's
    // outcome already encodes the condition-type unambiguously (agent_* -> agent_failure,
    // conversion_drop_* -> conversion_drop, error_spike_* -> error_spike, unclassified -> unclassified).
    const conditionType: CoryEngineConditionType = classification.outcome.startsWith('agent_')
      ? 'agent_failure'
      : classification.outcome.startsWith('conversion_drop_')
        ? 'conversion_drop'
        : classification.outcome === 'error_spike_no_reliable_check'
          ? 'error_spike'
          : 'unclassified';

    return {
      ticket_id: ticket.id,
      ticket_number: ticket.ticket_number ?? null,
      condition_type: conditionType,
      outcome: classification.outcome,
      should_close: classification.shouldClose,
      evidence_note: classification.evidenceNote,
    };
  });
}

/**
 * Re-checks every open cory-engine ticket against live data and closes it (status
 * 'done') with a real evidence comment when the condition that opened it has genuinely
 * cleared. Idempotent: an already-done/cancelled ticket never appears in the query
 * (safe no-op); a still-true condition produces zero writes (safe to run any number of
 * times); one bad ticket never aborts the batch.
 */
export async function reCheckAndAutoResolveCoryEngineTickets(): Promise<CoryEngineAutoResolveReport> {
  const start = Date.now();
  const { updateTicketStatus } = await import('../../services/company/ticketOrchestrator');

  const candidates = await fetchLiveResolvableCoryEngineTickets();
  const breakdown = emptyBreakdown();
  let closed = 0;

  for (const candidate of candidates) {
    breakdown[candidate.condition_type].checked++;

    if (!candidate.should_close) continue;

    try {
      await updateTicketStatus(candidate.ticket_id, 'done', 'agent', 'cory-engine', candidate.evidence_note);
      closed++;
      breakdown[candidate.condition_type].closed++;
    } catch (err: any) {
      // One bad ticket must never abort the batch (Failure-First Design: no silent
      // swallow — logged with context, batch continues).
      console.error(
        `[CoryEngine AutoResolve] Failed to close ticket ${candidate.ticket_id} (${candidate.condition_type}): ${err?.message || err}`,
      );
      candidate.write_error = err?.message || String(err);
    }
  }

  return { checked: candidates.length, closed, breakdown, results: candidates, duration_ms: Date.now() - start };
}
