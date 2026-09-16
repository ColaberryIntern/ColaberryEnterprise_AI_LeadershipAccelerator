import type { Brand } from '../../models';
import { GrowthJourneyPolicy } from '../../models';
import { resolveBrandBySlug } from '../../modules/tenancy/tenantResolver';
import {
  INERT_ON_CREATE,
  QUEUE_CAPACITY_POLICY_TYPE,
  QUEUE_POLICY_DEFINITIONS,
  type QueuePolicyDefinition,
} from './policyDefinitions';

/**
 * Seed the 24 queue policy rows (§11; Phase 4 T403).
 *
 * ─── CREATED ONCE, NEVER TOUCHED AGAIN ──────────────────────────────────────
 *
 * `seedBrandOfferPolicy` re-asserts a `deny` on every boot because a deny is a
 * safety property. Nothing here is: `daily_capacity`, `sla_hours`, the
 * assignee and `status` are all the operator's from the moment the row exists,
 * and a boot that put a default back over a number a human typed would be the
 * override every seed in this run is forbidden from doing. So the update path
 * is EMPTY — an existing row is counted and left alone, whatever it holds.
 *
 * ─── FAILURE ISOLATION ──────────────────────────────────────────────────────
 *
 * Per-row try/catch and per-brand skip, as the offer seed: a brand absent from
 * this database (a preview stack) is `skipped`, not `failed`, and one row
 * failing does not stop the other 23. Nothing here sends, notifies or assigns:
 * a row with `daily_capacity` NULL and no assignee changes no decision — the
 * capacity reader answers `unknown` until an operator writes a number.
 */

export interface SeedPoliciesResult {
  created: number;
  existing: number;
  skipped_brands: string[];
  failed: { target: string; error: string }[];
}

async function seedOne(brand: Brand, def: QueuePolicyDefinition, result: SeedPoliciesResult): Promise<void> {
  const existing = await GrowthJourneyPolicy.findOne({
    where: { brand_id: brand.id, policy_type: QUEUE_CAPACITY_POLICY_TYPE, owner_queue: def.owner_queue },
  });
  if (existing) {
    result.existing += 1;
    return;
  }
  await GrowthJourneyPolicy.create({
    tenant_id: brand.tenant_id,
    brand_id: brand.id,
    policy_type: QUEUE_CAPACITY_POLICY_TYPE,
    owner_queue: def.owner_queue,
    sla_hours: def.sla_hours,
    ...INERT_ON_CREATE,
  });
  result.created += 1;
}

export async function seedGrowthJourneyPolicies(): Promise<SeedPoliciesResult> {
  const result: SeedPoliciesResult = { created: 0, existing: 0, skipped_brands: [], failed: [] };
  const brands = new Map<string, Brand | null>();

  for (const def of QUEUE_POLICY_DEFINITIONS) {
    const key = `${def.tenant_slug}/${def.brand_slug}`;
    const target = `${key}:${def.owner_queue}`;
    try {
      if (!brands.has(key)) brands.set(key, await resolveBrandBySlug(def.tenant_slug, def.brand_slug));
      const brand = brands.get(key) ?? null;
      if (!brand) {
        if (!result.skipped_brands.includes(key)) result.skipped_brands.push(key);
        continue;
      }
      await seedOne(brand, def, result);
    } catch (err: unknown) {
      result.failed.push({ target, error: (err as { message?: string })?.message ?? 'unknown' });
    }
  }
  return result;
}
