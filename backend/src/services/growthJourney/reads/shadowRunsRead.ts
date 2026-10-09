import { Op } from 'sequelize';
import { AiAgentActivityLog } from '../../../models';
import { GROWTH_JOURNEY_AGENT_ENTRIES } from '../../agentRegistry/growthJourneyAgents';
import { DEFAULT_PAGE, MAX_PAGE, paging } from './readPaging';

/**
 * The journey crons' own run history, from `ai_agent_activity_logs` (Phase 6, T607).
 *
 * ─── WHAT THE TABLE ACTUALLY HOLDS ──────────────────────────────────────────
 *
 * The plan described this read as "counts from `details` numeric keys only".
 * There are none in the rows this read can return: `instrumentCronJob` — the
 * only writer that logs under a journey agent's name — sets `details: null` on
 * every row, and the only number it records is `duration_ms`. So this read
 * reports what exists (when a run started, how long it took, whether it
 * succeeded) and no counts, rather than inventing a field to fill a column.
 *
 * `counts_available: false` is therefore a statement about THIS FILTERED SET,
 * not about the table: `aiEventService.logAgentActivity` and
 * `agentBlueprint/agentActivityLogService` also insert here and can set
 * `details`, and neither writes an `action` equal to any of the three journey
 * names today. If one ever does, this literal has to become a real check —
 * flagged here because a hard-coded `false` cannot learn that on its own.
 * (T607's first pass said "the one writer", which was true of these rows and
 * false of the table; the verifier caught the overstatement.)
 *
 * The table also has no `agent_name`: that lives on `ai_agents`. What it has is
 * `action`, and `instrumentCronJob` writes the agent's name into it verbatim,
 * so `action IN (the three journey agents)` is the filter — no join needed. The
 * names come from `GROWTH_JOURNEY_AGENT_ENTRIES`, the registry that declares
 * them, so a fourth journey cron appears here the day it is registered and
 * nothing else ever does. In particular `GrowthJourneyHandoffs` — the on-demand
 * ticket-creator identity, not a scheduled agent — is not in that registry and
 * so is never in this list, despite the name.
 *
 * ─── NEVER `stack_trace`, AND NOT `reason` EITHER ───────────────────────────
 *
 * `stack_trace` is `TEXT` written from a thrown error and is the one column on
 * this table that can carry anything at all; the plan forbids projecting it and
 * it is never requested. `reason` is refused on the same ground and is a step
 * further than the plan asked: on a failed run the writer puts the error
 * message there, and an error message out of a mailer or an HTTP client can
 * carry an address. The failure is reported as `result: 'failed'` with the
 * `trace_id`, which is enough to find the row in the existing generic activity
 * reader (`aiOpsService.getActivityLog`) where an operator who needs the text
 * can see it under that route's own rules.
 *
 * ─── NOT BRAND-SCOPED, DELIBERATELY ────────────────────────────────────────
 *
 * `ai_agent_activity_logs` has no `brand_id`: a cron run is one process across
 * every brand, so there is nothing to scope and a brand filter would be a lie.
 * This read therefore takes no `brandIds` at all — rather than accepting one
 * and ignoring it — and the row it returns carries no brand, no subject and no
 * person: an agent name, a result, a duration and two ids. The route is
 * `requireAdmin` plus the master flag like its siblings; what it does NOT do is
 * answer an empty page for an admin with no brand membership, because that
 * would make the one read an operator needs BEFORE launch useless exactly when
 * `tenant_memberships` is still empty. That asymmetry is the point, and a cell
 * pins it.
 */

/** The three names the registry declares — the filter, and the only rows this read can return. */
export const JOURNEY_CRON_AGENTS: readonly string[] = Object.freeze(
  GROWTH_JOURNEY_AGENT_ENTRIES.map((entry) => entry.agent_name),
);

export const DEFAULT_RUN_WINDOW_DAYS = 7;
export const MAX_RUN_WINDOW_DAYS = 365;

export interface ShadowRunRow {
  id: string;
  /** The agent's own name, out of `action`. Never a free-text reason. */
  agent: string;
  result: string;
  duration_ms: number | null;
  trace_id: string | null;
  started_at: string;
}

export interface ShadowRunsResult {
  rows: ShadowRunRow[];
  total: number;
  limit: number;
  offset: number;
  window_days: number;
  agents: readonly string[];
  /** `details` is `null` on every row this table holds, so there are no per-run counts to report. */
  counts_available: false;
}

export interface ShadowRunFilters {
  limit?: number;
  offset?: number;
  windowDays?: number;
  agent?: string;
  result?: string;
  asOf?: Date;
}

export async function readShadowRuns(filters: ShadowRunFilters = {}): Promise<ShadowRunsResult> {
  const { limit, offset } = paging({ brandIds: [], limit: filters.limit, offset: filters.offset });
  const windowDays = Math.min(Math.max(1, Math.floor(filters.windowDays ?? DEFAULT_RUN_WINDOW_DAYS)), MAX_RUN_WINDOW_DAYS);
  const to = filters.asOf ?? new Date();
  const from = new Date(to.getTime() - windowDays * 86_400_000);

  // An `agent` filter may only ever narrow the registry's three, never widen past them.
  const agents = filters.agent && JOURNEY_CRON_AGENTS.includes(filters.agent) ? [filters.agent] : JOURNEY_CRON_AGENTS;
  const where: Record<string, unknown> = {
    action: { [Op.in]: [...agents] },
    created_at: { [Op.gte]: from, [Op.lte]: to },
  };
  if (filters.result) where.result = filters.result;

  const { rows, count } = await AiAgentActivityLog.findAndCountAll({
    where,
    attributes: ['id', 'action', 'result', 'duration_ms', 'trace_id', 'created_at'],
    order: [['created_at', 'DESC'], ['id', 'ASC']],
    limit,
    offset,
  });
  return {
    rows: rows.map((r) => ({
      id: String(r.get('id')),
      agent: String(r.get('action')),
      result: String(r.get('result')),
      duration_ms: (r.get('duration_ms') as number | null) ?? null,
      trace_id: (r.get('trace_id') as string | null) ?? null,
      started_at: new Date(r.get('created_at') as Date).toISOString(),
    })),
    total: count,
    limit,
    offset,
    window_days: windowDays,
    agents: JOURNEY_CRON_AGENTS,
    counts_available: false,
  };
}

/** Re-exported so a caller can state the page bounds without importing two modules. */
export { DEFAULT_PAGE, MAX_PAGE };
