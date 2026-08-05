/**
 * capeGovernancePolicyService — CAPE Phase 6 (design doc §12 "Pacing controls",
 * §16 Phase 6) admin CRUD over the single global versioned governance-policy row.
 * Same "insert-new-version" contract as capeSkillDefinitionsService.ts: an edit
 * never mutates the current row in place, it diffs the patch against the current
 * row, and only if the patch actually changes something does it insert a NEW
 * version row and flip the prior row's `is_current` to false. An identical-value
 * PUT is a no-op — idempotent, no phantom version bump.
 *
 * `getCurrentGovernancePolicy()` is the ONLY read path
 * capeLearningValueRanker.ts / capeTodayPlanService.ts should use to answer
 * "what are the live rerank caps / pacing knobs right now" — it always returns a
 * real row (the schema-init seed guarantees one exists) and never throws, so a
 * transient DB hiccup degrades to the last successfully-read policy shape rather
 * than crashing the ranker (mirrors feedConfigService.getFeedPolicy()'s own
 * fail-soft contract).
 */
import { Transaction } from 'sequelize';
import { sequelize } from '../../config/database';
import CapeGovernancePolicy from '../../models/CapeGovernancePolicy';
import { UpdateGovernancePolicyInput } from '../../schemas/capeSchema';

export class GovernancePolicyNotFoundError extends Error {
  status = 404;
  constructor() { super('no current CAPE governance policy row — schema init has not run'); this.name = 'GovernancePolicyNotFoundError'; }
}

/** Plain-object shape (no Sequelize instance) — what capeLearningValuePolicy.ts's
 * RerankCaps and capeTodayPlanService.ts's pacing checks actually consume. */
export interface GovernancePolicyValues {
  same_type_max_streak: number;
  passive_max_streak: number;
  crowd_out_max_per_skill: number;
  crowd_out_window: number;
  stretch_cap_first_five: number;
  daily_plan_target_minutes: number;
  review_slot_share: number;
  ai_pulse_slot_share: number;
}

/** Canonical fallback — byte-identical to the hardcoded constants this table
 * replaces. Used both by `getCurrentGovernancePolicy()`'s catch branch AND
 * per-field by `toValues()` below, so a partially-malformed row (e.g. a
 * column read back as `undefined`/`NaN` from an unexpected query shape, not
 * just an outright thrown error) can never silently produce a falsy/zero
 * value for a field that should default to a safe non-zero cap — a 0 for
 * `review_slot_share`/`ai_pulse_slot_share` has real behavioral meaning
 * ("never show this slot"), so this field must never come from a corrupted
 * read by accident. */
const SAFE_DEFAULTS: GovernancePolicyValues = {
  same_type_max_streak: 2,
  passive_max_streak: 2,
  crowd_out_max_per_skill: 2,
  crowd_out_window: 5,
  stretch_cap_first_five: 1,
  daily_plan_target_minutes: 999,
  review_slot_share: 1,
  ai_pulse_slot_share: 1,
};

function safeNumber(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toValues(row: CapeGovernancePolicy): GovernancePolicyValues {
  return {
    same_type_max_streak: safeNumber(row.same_type_max_streak, SAFE_DEFAULTS.same_type_max_streak),
    passive_max_streak: safeNumber(row.passive_max_streak, SAFE_DEFAULTS.passive_max_streak),
    crowd_out_max_per_skill: safeNumber(row.crowd_out_max_per_skill, SAFE_DEFAULTS.crowd_out_max_per_skill),
    crowd_out_window: safeNumber(row.crowd_out_window, SAFE_DEFAULTS.crowd_out_window),
    stretch_cap_first_five: safeNumber(row.stretch_cap_first_five, SAFE_DEFAULTS.stretch_cap_first_five),
    daily_plan_target_minutes: safeNumber(row.daily_plan_target_minutes, SAFE_DEFAULTS.daily_plan_target_minutes),
    review_slot_share: safeNumber(row.review_slot_share, SAFE_DEFAULTS.review_slot_share),
    ai_pulse_slot_share: safeNumber(row.ai_pulse_slot_share, SAFE_DEFAULTS.ai_pulse_slot_share),
  };
}

/** Full admin-facing row (includes version/reason/audit fields), for the settings panel. */
export async function getCurrentGovernancePolicyRow(): Promise<CapeGovernancePolicy> {
  const row = await CapeGovernancePolicy.findOne({ where: { is_current: true }, order: [['version', 'DESC']] });
  if (!row) throw new GovernancePolicyNotFoundError();
  return row;
}

/** Plain-values read for ranker/Today-Plan consumption — never throws (fail-soft
 * to the documented defaults if the schema hasn't been initialized yet, matching
 * the "shipping this table changes nothing until an admin edits it" contract even
 * in a not-yet-migrated environment). */
export async function getCurrentGovernancePolicy(): Promise<GovernancePolicyValues> {
  try {
    const row = await getCurrentGovernancePolicyRow();
    return toValues(row);
  } catch {
    return { ...SAFE_DEFAULTS };
  }
}

export async function getGovernancePolicyHistory(): Promise<CapeGovernancePolicy[]> {
  return CapeGovernancePolicy.findAll({ order: [['version', 'ASC']] });
}

function isUnchanged(current: CapeGovernancePolicy, patch: UpdateGovernancePolicyInput): boolean {
  const fields: Array<keyof GovernancePolicyValues> = [
    'same_type_max_streak', 'passive_max_streak', 'crowd_out_max_per_skill', 'crowd_out_window',
    'stretch_cap_first_five', 'daily_plan_target_minutes', 'review_slot_share', 'ai_pulse_slot_share',
  ];
  return fields.every((f) => patch[f] === undefined || patch[f] === current[f]);
}

/**
 * Update the governance policy. No-op (returns the unchanged current row,
 * `versioned: false`) if the patch is identical to current values; otherwise
 * inserts version+1 and flips the prior row's is_current, in a single transaction.
 */
export async function updateGovernancePolicy(
  patch: UpdateGovernancePolicyInput,
  adminId?: string,
): Promise<{ policy: CapeGovernancePolicy; versioned: boolean }> {
  const current = await getCurrentGovernancePolicyRow();

  if (isUnchanged(current, patch)) {
    return { policy: current, versioned: false };
  }

  return sequelize.transaction(async (t: Transaction) => {
    await current.update({ is_current: false }, { transaction: t });
    const next = await CapeGovernancePolicy.create({
      version: current.version + 1,
      is_current: true,
      same_type_max_streak: patch.same_type_max_streak ?? current.same_type_max_streak,
      passive_max_streak: patch.passive_max_streak ?? current.passive_max_streak,
      crowd_out_max_per_skill: patch.crowd_out_max_per_skill ?? current.crowd_out_max_per_skill,
      crowd_out_window: patch.crowd_out_window ?? current.crowd_out_window,
      stretch_cap_first_five: patch.stretch_cap_first_five ?? current.stretch_cap_first_five,
      daily_plan_target_minutes: patch.daily_plan_target_minutes ?? current.daily_plan_target_minutes,
      review_slot_share: patch.review_slot_share ?? current.review_slot_share,
      ai_pulse_slot_share: patch.ai_pulse_slot_share ?? current.ai_pulse_slot_share,
      reason: patch.reason !== undefined ? patch.reason : current.reason,
      created_by: adminId ?? null,
    }, { transaction: t });
    return { policy: next, versioned: true };
  });
}
