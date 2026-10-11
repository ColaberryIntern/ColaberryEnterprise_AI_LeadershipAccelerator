/**
 * Marketing department — campaign funnel performance analysis.
 *
 * READ-ONLY BY CONTRACT. This agent issues SELECTs and returns a report. It
 * writes nothing: no campaign is paused, no email is rescheduled, no row is
 * touched. The AiAgent row's run_count/error_count and the one
 * ai_agent_activity_logs row per execution are written by aiOrchestrator's
 * runAgent() wrapper, which is the only caller. The agent therefore has no
 * side effect to make idempotent — two runs over unchanged data return the
 * same numbers and leave the database byte-identical, and the test suite
 * asserts the absence of every write method rather than describing it here.
 *
 * ── WHAT THIS REWRITE FIXED (audit 2026-10-06, verdict REWRITE) ─────────────
 *
 * 1. NO TENANT FILTER — a cross-tenant read. `campaigns.tenant_id` exists
 *    (verified in production: all 6 active campaigns carry one), but the old
 *    scan was `where: { status: 'active' }` and merged every tenant's campaign
 *    NAMES into a single report with a single verdict. Now the scan is
 *    optionally narrowed by config.tenant_id, and the output is PARTITIONED:
 *    one AgentAction per tenant, each carrying only that tenant's campaigns.
 *    Campaigns with a null tenant_id form their own partition and are never
 *    mixed into a real tenant's. No action can ever contain two tenants.
 *
 * 2. `campaigns_processed: 0` WHILE PROCESSING 6 — an impossible number, and
 *    therefore a model bug, not a cosmetic one: it is the field runAgent()
 *    copies into last_result and the Trust Command Center reads. The count is
 *    no longer a separate counter that can drift; it is `reports.length`, the
 *    length of the array the actions are built from, so the number and the
 *    thing it counts cannot disagree.
 *
 * 3. `emailsFailed` WAS COMPUTED, DROVE THE VERDICT, AND WAS NEVER REPORTED —
 *    a reader saw "degraded" with nothing to explain it. Every report now
 *    carries emails_failed and the bounded failure_rate the verdict is made
 *    from.
 *
 * 4. N+1 COUNTS — four COUNT queries per campaign (24 for today's 6, and it
 *    grew linearly). Now three queries total, whatever the campaign count:
 *    one campaign scan plus two GROUP BY aggregates.
 *
 * FAILURE POSTURE. (a) Any query failing: caught once, classified via
 * classifyError(), reported in `errors` so runAgent() logs the run as failed.
 * (b) Every query carries an explicit deadline — an unbounded SELECT on a
 * degraded database would otherwise hold a cron slot open indefinitely.
 * (c) A malformed campaign row (no usable id) is reported in `errors` and
 * skipped, and is NOT counted as processed — a row that could not be analysed
 * must never inflate the number that says how many were. (d) No retry: the
 * scan is read-only and runs on a schedule, so the next tick is the retry.
 * (e) Unhandled failure modes: a stale read inside an open transaction
 * elsewhere, and partial GROUP BY results from a query cancelled server-side
 * (both surface as wrong-but-plausible counts, which no in-process check here
 * can detect).
 */
import { Op, fn, col } from 'sequelize';
import crypto from 'crypto';
import { Campaign, CampaignLead, ScheduledEmail } from '../../../../models';
import { classifyError } from '../../../../utils/errorClassifier';
import type { AgentExecutionResult, AgentAction } from '../../types';

/**
 * The REGISTERED agent_name — the string AiAgent.findOne() looks up, the
 * SCHEDULE_REGISTRY key, and the AGENT_GROUP_MAP member. Exported so the
 * wiring test asserts on this literal instead of a copy of it: a group map
 * listing a source-file name instead of a registered name is the silent no-op
 * that cost the admissions group three members for seven months.
 */
export const AGENT_NAME = 'DeptCampaignPerformanceAgent';

const SERVICE = 'marketing-campaign-performance';
/** Per-query ceiling. Three queries, so the worst case is 3x this. */
const DEFAULT_DEADLINE_MS = 30_000;
/** Share of delivery attempts that may fail before a funnel reads 'degraded'. */
const DEGRADED_FAILURE_RATE = 0.1;
/** Partition key for campaigns with no tenant. Never a tenant id. */
const UNASSIGNED_TENANT = '(unassigned)';

export type FunnelHealth = 'healthy' | 'degraded' | 'empty';

export interface CampaignFunnelReport {
  campaign_id: string;
  name: string;
  /** Carried on the report, not just the partition, so a report copied out of
   *  its action still says which tenant it describes. */
  tenant_id: string | null;
  leads: number;
  emails_sent: number;
  emails_pending: number;
  emails_failed: number;
  /** failed / (sent + failed), rounded to 4dp. 0 when nothing was attempted. */
  failure_rate: number;
  funnel_health: FunnelHealth;
}

interface UsableCampaign {
  id: string;
  name: string;
  tenant_id: string | null;
}

/**
 * The funnel verdict, pure and exported so the boundary cases are tested
 * without a database. Order matters and is the original agent's: an empty
 * audience outranks a delivery problem, because there is no funnel to grade.
 */
export function classifyFunnel(
  leads: number,
  emailsSent: number,
  emailsFailed: number,
): { funnel_health: FunnelHealth; failure_rate: number } {
  const attempts = emailsSent + emailsFailed;
  // Division-safe: the old form compared `failed > sent * 0.1`, which read
  // "degraded" off a zero baseline without ever reporting a rate.
  const failure_rate = attempts === 0 ? 0 : Math.round((emailsFailed / attempts) * 10_000) / 10_000;
  if (leads === 0) return { funnel_health: 'empty', failure_rate };
  if (failure_rate > DEGRADED_FAILURE_RATE) return { funnel_health: 'degraded', failure_rate };
  return { funnel_health: 'healthy', failure_rate };
}

/** Postgres COUNT() comes back as a bigint string. NaN is 0, never NaN. */
function toCount(value: unknown): number {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * Bound one query. Without this a SELECT against a degraded database hangs for
 * as long as the connection lives, holding the cron slot and reporting nothing.
 * The thrown error is named so classifyError() returns TimeoutError from the
 * name rather than from message-substring guesswork.
 */
async function withDeadline<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  // If the deadline wins the race, `work` may still reject afterwards with
  // nobody listening. This attaches the listener; it hides nothing, because the
  // race has already reported the timeout as the outcome of this run.
  void work.catch(() => undefined);
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          const err = new Error(`${label} timed out after ${ms}ms`);
          err.name = 'AbortError';
          reject(err);
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function deadlineFrom(config: Record<string, any>): number {
  const raw = Number(config?.deadline_ms);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_DEADLINE_MS;
}

/** One COUNT per campaign, in one query. */
async function leadCountsByCampaign(ids: string[], deadlineMs: number): Promise<Map<string, number>> {
  const rows = (await withDeadline(
    CampaignLead.findAll({
      attributes: ['campaign_id', [fn('COUNT', col('id')), 'count']],
      where: { campaign_id: { [Op.in]: ids } },
      group: ['campaign_id'],
      raw: true,
    }),
    deadlineMs,
    'campaign lead counts',
  )) as unknown as Array<{ campaign_id: string; count: unknown }>;

  const counts = new Map<string, number>();
  for (const row of rows) counts.set(String(row?.campaign_id), toCount(row?.count));
  return counts;
}

/** One COUNT per (campaign, status) pair, in one query. */
async function emailCountsByCampaignStatus(
  ids: string[],
  deadlineMs: number,
): Promise<Map<string, number>> {
  const rows = (await withDeadline(
    ScheduledEmail.findAll({
      attributes: ['campaign_id', 'status', [fn('COUNT', col('id')), 'count']],
      where: { campaign_id: { [Op.in]: ids } },
      group: ['campaign_id', 'status'],
      raw: true,
    }),
    deadlineMs,
    'campaign email status counts',
  )) as unknown as Array<{ campaign_id: string; status: string; count: unknown }>;

  const counts = new Map<string, number>();
  for (const row of rows) counts.set(`${String(row?.campaign_id)}|${String(row?.status)}`, toCount(row?.count));
  return counts;
}

/** Group reports by tenant so no action can carry two tenants' campaigns. */
function partitionByTenant(reports: CampaignFunnelReport[]): Map<string, CampaignFunnelReport[]> {
  const partitions = new Map<string, CampaignFunnelReport[]>();
  for (const report of reports) {
    const key = report.tenant_id ?? UNASSIGNED_TENANT;
    const existing = partitions.get(key);
    if (existing) existing.push(report);
    else partitions.set(key, [report]);
  }
  return partitions;
}

function buildAction(
  agentId: string,
  tenantKey: string,
  reports: CampaignFunnelReport[],
): AgentAction {
  const underperformers = reports.filter((r) => r.funnel_health !== 'healthy');
  const recommendations = underperformers.length
    ? [
        `${underperformers.length} campaign(s) need attention: ` +
          underperformers.map((r) => `${r.name} (${r.funnel_health})`).join(', '),
      ]
    : [];

  return {
    // null, not '': this action is scoped to a tenant, not to one campaign, and
    // an empty string is a fake foreign key.
    campaign_id: null,
    action: 'campaign_performance_analysis',
    reason: `Analyzed ${reports.length} active campaign(s) for tenant ${tenantKey}`,
    confidence: 0.88,
    before_state: null,
    after_state: {
      tenant_id: tenantKey === UNASSIGNED_TENANT ? null : tenantKey,
      campaigns_analyzed: reports.length,
      underperformers: underperformers.length,
      emails_failed: reports.reduce((sum, r) => sum + r.emails_failed, 0),
      campaign_reports: reports,
      recommendations,
    },
    result: 'success',
    entity_type: 'system',
    entity_id: agentId,
  };
}

export async function runCampaignPerformanceAgent(
  agentId: string,
  config: Record<string, any> = {},
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const correlationId = crypto.randomUUID();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  /** The single source of truth for campaigns_processed. */
  const reports: CampaignFunnelReport[] = [];
  let partitionCount = 0;
  let errorClass: string | null = null;

  try {
    const deadlineMs = deadlineFrom(config);
    const tenantScope = nonEmptyString(config?.tenant_id);

    const rows = (await withDeadline(
      Campaign.findAll({
        attributes: ['id', 'name', 'tenant_id'],
        where: { status: 'active', ...(tenantScope ? { tenant_id: tenantScope } : {}) },
        raw: true,
      }),
      deadlineMs,
      'active campaign scan',
    )) as unknown as Array<{ id?: unknown; name?: unknown; tenant_id?: unknown }>;

    const usable: UsableCampaign[] = [];
    for (const row of rows) {
      const id = nonEmptyString(row?.id);
      if (!id) {
        errors.push('ContractViolation: active campaign row has no usable id — skipped, not counted');
        continue;
      }
      usable.push({
        id,
        name: nonEmptyString(row?.name) ?? id,
        tenant_id: nonEmptyString(row?.tenant_id),
      });
    }

    // Guard the aggregates: with no ids there is nothing to group by, and zero
    // active campaigns is a legitimate state, not a failure.
    if (usable.length > 0) {
      const ids = usable.map((c) => c.id);
      const [leadCounts, emailCounts] = await Promise.all([
        leadCountsByCampaign(ids, deadlineMs),
        emailCountsByCampaignStatus(ids, deadlineMs),
      ]);

      for (const campaign of usable) {
        const leads = leadCounts.get(campaign.id) ?? 0;
        const emailsSent = emailCounts.get(`${campaign.id}|sent`) ?? 0;
        const emailsPending = emailCounts.get(`${campaign.id}|pending`) ?? 0;
        const emailsFailed = emailCounts.get(`${campaign.id}|failed`) ?? 0;
        const { funnel_health, failure_rate } = classifyFunnel(leads, emailsSent, emailsFailed);

        reports.push({
          campaign_id: campaign.id,
          name: campaign.name,
          tenant_id: campaign.tenant_id,
          leads,
          emails_sent: emailsSent,
          emails_pending: emailsPending,
          emails_failed: emailsFailed,
          failure_rate,
          funnel_health,
        });
      }
    }

    const partitions = partitionByTenant(reports);
    partitionCount = partitions.size;
    for (const [tenantKey, tenantReports] of partitions) {
      actions.push(buildAction(agentId, tenantKey, tenantReports));
    }
  } catch (err: unknown) {
    errorClass = classifyError(err);
    const message = err instanceof Error ? err.message : String(err);
    errors.push(`${errorClass}: ${message}`);
  }

  const durationMs = Date.now() - startTime;

  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: errors.length > 0 ? 'error' : 'info',
      service: SERVICE,
      event: 'campaign_performance_scan',
      correlation_id: correlationId,
      duration_ms: durationMs,
      outcome: errors.length === 0 ? 'success' : reports.length > 0 ? 'partial' : 'failure',
      ...(errorClass ? { error_class: errorClass } : {}),
      context: {
        agent_id: agentId,
        campaigns_processed: reports.length,
        tenant_partitions: partitionCount,
        actions: actions.length,
      },
    }),
  );

  return {
    agent_name: AGENT_NAME,
    // Was hardcoded 0 while 6 campaigns were analysed. Derived, so it cannot lie.
    campaigns_processed: reports.length,
    actions_taken: actions,
    errors,
    duration_ms: durationMs,
    entities_processed: reports.length,
  };
}
