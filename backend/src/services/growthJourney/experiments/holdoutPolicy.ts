import { z } from 'zod';
import { GrowthJourneyPolicy } from '../../../models';
import { classifyError } from '../../../utils/errorClassifier';

/**
 * The holdout policy for one brand, or nothing (Phase 6, T608).
 *
 * ─── NO POLICY IS THE NORMAL CASE, AND IT MUST COST NOTHING ─────────────────
 *
 * There is no holdout policy row anywhere today, and there will not be one
 * until an operator writes it deliberately. So this read answers `null` for
 * every brand, and the governor's hook is an OPTIONAL dependency it never
 * receives - which is what makes "no policy => no change" structural rather
 * than merely tested. A caller that does not wire the dependency runs exactly
 * the decision path that shipped in Phase 3.
 *
 * ─── `settings` IS THE FIRST JSONB IN THIS TABLE ANYONE READS ───────────────
 *
 * `growth_journey_policies.settings` is `{}` on every row in the database: the
 * seed writes `{}` and nothing has ever updated it (T607 established that while
 * building the policy read). This is the first reader, so the shape is defined
 * here and validated with Zod rather than trusted - an operator hand-writing a
 * JSONB by hand is exactly the input that deserves a schema. A row whose
 * settings do not parse is treated as ABSENT, not as a default: a malformed
 * experiment must not silently become a live one with a guessed control share.
 *
 * ─── `status` IS THE ROW'S COLUMN, NOT A FIELD IN `settings` ────────────────
 *
 * The plan put `status` inside `settings`. The table already has a `status`
 * column with `'active'` as its default, and this task's rollback story is "a
 * policy row's `status:'paused'` stops assignment without code" - which only
 * works if the column is what is read. Two places to say paused would be one
 * place to forget. So `settings` carries the experiment's definition and the
 * column carries its state.
 *
 * ─── ONE EXPERIMENT PER BRAND, BY THE INDEX ─────────────────────────────────
 *
 * The DDL's unique index is `(brand_id, policy_type, COALESCE(owner_queue,''))`,
 * so a brand-wide row (`owner_queue` NULL) means exactly one holdout experiment
 * per brand at a time. That is a real limit and it is the table's, not this
 * file's; running two at once would need a second `owner_queue` value or a
 * different key, and neither is invented here.
 */

export const HOLDOUT_POLICY_TYPE = 'holdout_experiment';

/**
 * `control_share` is capped at 0.5 by the schema, as Explorer's is: a holdout
 * bigger than half the population is not a holdout, and a typo of `0.9` would
 * withhold from nearly everyone. `positive` excludes 0, which would create an
 * experiment with an empty control arm that still stamped every decision.
 */
export const holdoutSettingsSchema = z.object({
  experiment_key: z.string().min(1).max(64).regex(/^[a-z0-9_]+$/),
  control_share: z.number().positive().max(0.5),
  candidate_types: z.array(z.string().min(1).max(48)).max(12).optional(),
});

export type HoldoutSettings = z.infer<typeof holdoutSettingsSchema>;

export interface HoldoutPolicy extends HoldoutSettings {
  brand_id: string;
}

/**
 * Why a brand has no live experiment, for the admin read. Never surfaced to a
 * decision - the governor only ever sees a policy or `null`.
 */
export type HoldoutAbsence = 'no_policy' | 'not_active' | 'settings_invalid' | 'lookup_failed';

export interface HoldoutLookup {
  policy: HoldoutPolicy | null;
  reason: HoldoutAbsence | 'active';
}

/**
 * The lookup with its reason, for `/experiments`.
 *
 * FAILS CLOSED, and that is the important property: a lookup that throws answers
 * `no policy`, which means no arm is assigned and the decision is the one that
 * would have been made without any experiment. The alternative - letting the
 * error escape - would take a database hiccup and turn it into a refusal to
 * decide at all, for a feature that is switched off. The reason is reported so
 * `/experiments` can show that the lookup failed rather than that no policy
 * exists; the governor only ever sees `null`.
 *
 * Failing closed SILENTLY would be a different thing, and the first version of
 * this file did that. On the governor's path the reason is discarded, so a
 * genuine programming error - a bad `where`, a renamed column, a persistently
 * dead connection - was indistinguishable from "this brand has no experiment"
 * and produced no log line and no `error_class` anywhere. It is logged with its
 * class now, which is the repo's rule for every caught exception and the shape
 * `decisionService` already uses 250 lines from where it wires this in.
 */
export async function lookupHoldoutPolicy(brandId: string): Promise<HoldoutLookup> {
  let row;
  try {
    row = await GrowthJourneyPolicy.findOne({
      where: { brand_id: brandId, policy_type: HOLDOUT_POLICY_TYPE },
      attributes: ['brand_id', 'status', 'settings'],
    });
  } catch (err: unknown) {
    console.warn(JSON.stringify({
      service: 'growth-journey',
      level: 'warn',
      event: 'growth_journey.holdout.lookup_failed',
      outcome: 'failure',
      error_class: classifyError(err),
      brand_id: brandId,
    }));
    return { policy: null, reason: 'lookup_failed' };
  }
  if (!row) return { policy: null, reason: 'no_policy' };
  if (String(row.get('status')) !== 'active') return { policy: null, reason: 'not_active' };
  const parsed = holdoutSettingsSchema.safeParse(row.get('settings'));
  if (!parsed.success) return { policy: null, reason: 'settings_invalid' };
  return { policy: { brand_id: String(row.get('brand_id')), ...parsed.data }, reason: 'active' };
}

/**
 * The governor's seam: the policy or `null`, nothing else.
 *
 * The governor is handed this as an optional dependency and never imports a
 * model itself - the same rule every other read in the decision path follows.
 */
export async function holdoutPolicyFor(brandId: string): Promise<HoldoutPolicy | null> {
  return (await lookupHoldoutPolicy(brandId)).policy;
}
