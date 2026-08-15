/**
 * pointsConfigService — the ONLY source of XP amounts + readiness weights.
 * Reads the editable `points_config` table; falls back to the type registry
 * seed defaults when no override row exists. Nothing hardcodes XP at a call
 * site — change the economy by editing config, not code.
 *
 * TWO AWARD MODELS live in this table, distinguished by `config.award_model`:
 *
 *   flat (default, and what every curriculum card uses)
 *     `builder_xp` is a per-unit rate. Completing the thing awards that number.
 *
 *   budget_per_build
 *     `builder_xp` is a BUDGET for a whole unit of work, divided across the
 *     pieces that unit decomposed into. Used by the Student Build Pipeline so a
 *     student is not rewarded for their plan happening to split into more
 *     stories: a 20-story build and a 30-story build pay the same in total.
 *
 * A budget is not a rate, and the difference is not visible in the column type.
 * `getTypeXp` therefore reports builder: 0 for a budget row — see the comment on
 * that function. Callers that mean the budget must ask for it by name via
 * `getBudgetPerUnitXp`, which cannot be reached by accident.
 */
import PointsConfig from '../../models/PointsConfig';
import { resolve as resolveType } from '../timeline/typeRegistry';

export interface TypeXp { learning: number; builder: number; community: number; }

/** `config.award_model` value marking a row whose `builder_xp` is a budget. */
export const AWARD_MODEL_BUDGET_PER_BUILD = 'budget_per_build';

function isBudgetRow(cfg: { config?: unknown } | null): boolean {
  const model = (cfg?.config as Record<string, unknown> | undefined)?.award_model;
  return model === AWARD_MODEL_BUDGET_PER_BUILD;
}

/**
 * XP for a card type: config override if present, else registry defaults.
 *
 * Returns builder: 0 for a `budget_per_build` row ON PURPOSE. The stored number
 * is a whole-build budget, and handing it back here would pay the entire budget
 * for every single piece — a 30-story build would award 30x what was intended.
 * Failing closed keeps that mistake impossible for any caller that does not
 * explicitly know it is dealing with a budget.
 */
export async function getTypeXp(typeSlug: string): Promise<TypeXp> {
  const cfg = await PointsConfig.findOne({ where: { scope: 'type_default', key: typeSlug, is_active: true } });
  if (cfg) {
    return {
      learning: cfg.learning_xp ?? 0,
      builder: isBudgetRow(cfg) ? 0 : (cfg.builder_xp ?? 0),
      community: cfg.community_xp ?? 0,
    };
  }
  const def = resolveType(typeSlug);
  return {
    learning: def?.learning_xp ?? 0,
    builder: def?.builder_xp ?? 0,
    community: def?.community_xp ?? 0,
  };
}

export interface BudgetAward {
  /** Builder XP one unit earns. 0 whenever the budget cannot be divided safely. */
  per_unit: number;
  /** The whole-build budget the split came from. Null when the row is not a budget row. */
  budget: number | null;
  /** Why per_unit is 0, for the log line. Null on success. */
  reason: 'not_a_budget_row' | 'no_budget_set' | 'no_units' | null;
}

/**
 * Split a `budget_per_build` row's budget across `unitCount` pieces.
 *
 *   per unit = round(budget / unitCount)
 *
 * so a 20-story build pays 40 each and a 30-story build pays 27 each against an
 * 800 budget. Rounding is per unit rather than distributing a remainder: the
 * arithmetic a student can do in their head from the two numbers they can see
 * has to match what they were paid, and being off by a few XP on the build total
 * matters less than the per-story number being explicable.
 *
 * FAILS CLOSED at 0 in every degenerate case — row missing, not a budget row,
 * budget NULL, zero stories. Awarding nothing is recoverable (the evidence trail
 * is still written, and a re-run after the config is fixed pays correctly);
 * awarding a guessed number is not.
 */
export async function getBudgetPerUnitXp(typeSlug: string, unitCount: number): Promise<BudgetAward> {
  const cfg = await PointsConfig.findOne({ where: { scope: 'type_default', key: typeSlug, is_active: true } });
  if (!cfg || !isBudgetRow(cfg)) return { per_unit: 0, budget: null, reason: 'not_a_budget_row' };

  const budget = cfg.builder_xp;
  if (budget === null || budget === undefined || !Number.isFinite(budget) || budget <= 0) {
    return { per_unit: 0, budget: null, reason: 'no_budget_set' };
  }
  if (!Number.isFinite(unitCount) || unitCount <= 0) {
    return { per_unit: 0, budget, reason: 'no_units' };
  }
  return { per_unit: Math.round(budget / unitCount), budget, reason: null };
}
