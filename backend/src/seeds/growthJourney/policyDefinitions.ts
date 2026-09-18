import { OWNER_QUEUES, type GrowthJourneyOwnerQueue } from '../../models/GrowthJourneyHandoff';
import { JOURNEY_PROGRAMS } from './journeyProgramDefinitions';

/**
 * The queue policy rows every brand starts with (§11; Phase 4 T403).
 *
 * ─── SIX QUEUES × FOUR BRANDS, EVERY NUMBER AN OPERATOR'S ───────────────────
 *
 * One `queue_capacity` row per brand × owner queue, 24 in all, each seeded with
 * `daily_capacity: null` — "nobody has said" — which the capacity reader reports
 * as `unknown`, never as zero and never as unlimited. `sla_hours` carries a
 * default per queue so the SLA sweep (T409) has something to measure against
 * from day one; it is a starting point, not a policy decision, and the seed
 * never writes it again. No assignee is seeded: a queue with no
 * `queue_assignee` row leaves its handoffs `queued`, visible and unassigned,
 * which is the honest state until Ali names someone.
 *
 * The brands are the four programme brands from `journeyProgramDefinitions`
 * — the seed does not carry a second brand list.
 */

export const QUEUE_CAPACITY_POLICY_TYPE = 'queue_capacity' as const;

/**
 * Set at creation and owned by a human thereafter — never written on update.
 * `daily_capacity` in particular: NULL is the honest seed value, and the only
 * way it becomes a number is an operator writing one.
 */
export const INERT_ON_CREATE = {
  daily_capacity: null as number | null,
  assigned_to_type: null as string | null,
  assigned_to_id: null as string | null,
  cooldown_days: null as number | null,
  settings: {} as Record<string, unknown>,
  status: 'active',
} as const;

/** Default SLA per queue, in hours. A starting point the operator owns after the first boot. */
export const DEFAULT_SLA_HOURS: Readonly<Record<GrowthJourneyOwnerQueue, number>> = Object.freeze({
  admissions: 24,
  sales: 24,
  solution_architect: 48,
  support: 8,
  ali: 72,
  human_review: 48,
});

export interface QueuePolicyDefinition {
  tenant_slug: string;
  brand_slug: string;
  owner_queue: GrowthJourneyOwnerQueue;
  sla_hours: number;
}

/** The four programme brands, once each, in programme order. */
export const POLICY_BRANDS: ReadonlyArray<{ tenant_slug: string; brand_slug: string }> = Object.freeze(
  JOURNEY_PROGRAMS.map((p) => ({ tenant_slug: p.tenant_slug, brand_slug: p.brand_slug })).filter(
    (b, i, all) => all.findIndex((x) => x.tenant_slug === b.tenant_slug && x.brand_slug === b.brand_slug) === i,
  ),
);

export const QUEUE_POLICY_DEFINITIONS: readonly QueuePolicyDefinition[] = Object.freeze(
  POLICY_BRANDS.flatMap((b) =>
    OWNER_QUEUES.map((owner_queue) => ({ ...b, owner_queue, sla_hours: DEFAULT_SLA_HOURS[owner_queue] })),
  ),
);
