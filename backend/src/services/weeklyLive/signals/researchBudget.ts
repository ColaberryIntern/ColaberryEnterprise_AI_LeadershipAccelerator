import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';

/**
 * The research cost cap (Basecamp WL3.1; Ali's M0 answer 2026-11-24: $50 a month). Every paid call
 * reserves its worst-case cost BEFORE it runs and settles to the real cost after, so the cap holds
 * even when a call times out and its cost is never reported: an unsettled reservation stays counted.
 *
 * Failure modes: over the cap throws BudgetExceeded (the job stops, nothing is retried). A database
 * error propagates, which also stops the job: if the cap cannot be read, the call does not happen.
 */
export const MONTHLY_CAP_USD = Number(process.env.WEEKLY_LIVE_RESEARCH_CAP_USD || 50);
const LOCK_KEY = 4406001; // serializes reservations, so two runs cannot both take the last dollar

export class BudgetExceeded extends Error {
  readonly errorClass = 'BudgetExceeded';
  constructor(readonly spent: number, readonly needed: number, readonly cap: number) {
    super(`Research stopped: this month's cost cap is $${cap.toFixed(2)}, $${spent.toFixed(2)} is used, and the next step needs up to $${needed.toFixed(2)}.`);
    this.name = 'BudgetExceeded';
  }
}

/** Month spend, by Central calendar month. */
const MONTH_SUM = `SELECT COALESCE(SUM(cost_usd), 0)::float AS spent FROM weekly_live_spend
  WHERE date_trunc('month', created_at AT TIME ZONE 'America/Chicago') = date_trunc('month', NOW() AT TIME ZONE 'America/Chicago')`;

export async function reserve(planId: string | null, purpose: string, estimateUsd: number, cap = MONTHLY_CAP_USD): Promise<string> {
  return sequelize.transaction(async (transaction) => {
    await sequelize.query('SELECT pg_advisory_xact_lock(:k)', { replacements: { k: LOCK_KEY }, transaction });
    const [{ spent }] = await sequelize.query<{ spent: number }>(MONTH_SUM, { type: QueryTypes.SELECT, transaction });
    if (spent + estimateUsd > cap) throw new BudgetExceeded(spent, estimateUsd, cap);
    const [row] = await sequelize.query<{ id: string }>(
      'INSERT INTO weekly_live_spend (plan_id, purpose, cost_usd, settled) VALUES (:planId, :purpose, :est, false) RETURNING id',
      { replacements: { planId, purpose, est: estimateUsd }, type: QueryTypes.SELECT, transaction },
    );
    return row.id;
  });
}

export async function settle(id: string, actualUsd: number): Promise<void> {
  await sequelize.query('UPDATE weekly_live_spend SET cost_usd = :c, settled = true WHERE id = :id', { replacements: { id, c: actualUsd } });
}

/**
 * Run one paid call under the cap. A call the provider REFUSED (an HTTP status came back) cost
 * nothing and settles to zero; anything else that fails keeps its reservation.
 */
export async function withBudget<T>(planId: string | null, purpose: string, estimateUsd: number, call: () => Promise<{ value: T; costUsd: number }>): Promise<T> {
  const id = await reserve(planId, purpose, estimateUsd);
  try {
    const { value, costUsd } = await call();
    await settle(id, costUsd);
    return value;
  } catch (e) {
    if (typeof (e as { status?: unknown }).status === 'number') await settle(id, 0);
    throw e;
  }
}
