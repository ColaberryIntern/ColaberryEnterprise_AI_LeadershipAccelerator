/**
 * aiValueService — AI value / time-saved attribution (TBI Business Impact, P-2-1 ROI side), v1.
 *
 * The Trust Center already shows what AI COSTS (cost_usd on ai_events). This estimates what it is
 * WORTH: each AI action stands in for a few minutes of human work, so we sum a conservative
 * minutes-saved estimate per event over 30 days, price it at a blended hourly rate, and compare to
 * spend (ROI multiple). v1 is deliberately conservative — it UNDER-claims rather than inflate the
 * exec number (an inflated ROI on a Trust dashboard would defeat the point). Rates are estimates to
 * be tuned / made configurable in v2; revenue (vs. time-saved) attribution is also v2.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';

/** Blended human hourly rate (USD) for the time AI stands in for. Conservative ops/analyst blend. */
export const AI_VALUE_RATE_USD = 50;

/** Minutes of human time each AI action stands in for, by event_type. Source of truth for both the
 * detailed breakdown here and the rubric's headline figure (imported as a SQL fragment to avoid drift). */
export const MINUTES_SAVED_SQL =
  `(CASE event_type WHEN 'llm.call' THEN 3 WHEN 'tool.call' THEN 4 WHEN 'retrieval' THEN 1 ELSE 2 END)`;

export function valueUsd(minutes: number): number {
  return Math.round((minutes / 60) * AI_VALUE_RATE_USD * 100) / 100;
}

export interface AiValueRow {
  workflowId: string;
  events: number;
  minutes: number;
  valueUsd: number;
}

export interface AiValue {
  windowDays: number;
  hourlyRateUsd: number;
  hoursSaved: number;
  valueUsd: number;
  costUsd: number;
  netUsd: number;
  roiMultiple: number | null;
  estimate: true;
  rows: AiValueRow[];
}

/** Time-saved value over the last 30 days, grouped by workflow (from ai_events). */
export async function getAiValue(): Promise<AiValue> {
  let raw: Array<{ workflowId: string; events: number; minutes: number; costUsd: number }> = [];
  try {
    raw = (await sequelize.query(
      `SELECT COALESCE(workflow_id, '(unattributed)') AS "workflowId",
              COUNT(*)::int AS events,
              SUM(${MINUTES_SAVED_SQL})::int AS minutes,
              ROUND(COALESCE(SUM(cost_usd), 0)::numeric, 4)::float AS "costUsd"
       FROM ai_events
       WHERE created_at >= NOW() - INTERVAL '30 days'
       GROUP BY 1
       ORDER BY 3 DESC NULLS LAST
       LIMIT 50`,
      { type: QueryTypes.SELECT }
    )) as Array<{ workflowId: string; events: number; minutes: number; costUsd: number }>;
  } catch {
    raw = [];
  }

  const totalMinutes = raw.reduce((s, r) => s + Number(r.minutes || 0), 0);
  const hoursSaved = Math.round((totalMinutes / 60) * 10) / 10;
  const valueTotal = valueUsd(totalMinutes);
  const costUsd = Math.round(raw.reduce((s, r) => s + Number(r.costUsd || 0), 0) * 100) / 100;
  const netUsd = Math.round((valueTotal - costUsd) * 100) / 100;
  const roiMultiple = costUsd > 0 ? Math.round((valueTotal / costUsd) * 10) / 10 : null;

  const rows: AiValueRow[] = raw.map((r) => ({
    workflowId: r.workflowId,
    events: Number(r.events),
    minutes: Number(r.minutes),
    valueUsd: valueUsd(Number(r.minutes)),
  }));

  return { windowDays: 30, hourlyRateUsd: AI_VALUE_RATE_USD, hoursSaved, valueUsd: valueTotal, costUsd, netUsd, roiMultiple, estimate: true, rows };
}
