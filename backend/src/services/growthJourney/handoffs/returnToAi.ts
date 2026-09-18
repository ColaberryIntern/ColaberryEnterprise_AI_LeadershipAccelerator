import { GrowthJourneyHandoff, GrowthJourneyPolicy } from '../../../models';
import type { GrowthJourneyReturnToAi } from '../../../models/GrowthJourneyHandoff';

/**
 * Return-to-AI: the cooldown a human's `not_ready` / `nurture` disposition
 * puts on a subject (§11; Phase 4 T405).
 *
 * ─── ONE RECORD, ON THE HANDOFF ROW ─────────────────────────────────────────
 *
 * The disposition writes `return_to_ai { program_slug, cooldown_until, reason }`
 * on the handoff and moves it to `returned_to_ai`. That row IS the record: no
 * second table, no second cooldown mechanism (the per-lead contact cap and the
 * contact-frequency rules keep their own homes). The decision loader asks
 * `resolveReturnToAi` and, while `cooldown_until` is ahead of the clock, puts
 * the `RETURNED_TO_AI` overlay on the subject's context; every generator
 * declines `returned_to_ai_cooldown` while it is on, and the decision's
 * `not_emitted` says so. After `cooldown_until` the overlay is simply gone -
 * nothing clears it, time does.
 *
 * The cooldown's length: the disposition body's `cooldown_days`, else the
 * brand's `cooldown` policy row, else 14 days.
 */

export const RETURNED_TO_AI_OVERLAY = 'RETURNED_TO_AI';
export const RETURNED_TO_AI_REASON = 'returned_to_ai_cooldown';
export const DEFAULT_RETURN_COOLDOWN_DAYS = 14;

export interface ReturnToAiState {
  active: boolean;
  handoff_id: string | null;
  cooldown_until: Date | null;
  reason: string | null;
}

export const NO_RETURN: ReturnToAiState = Object.freeze({ active: false, handoff_id: null, cooldown_until: null, reason: null });

/** The record as stored, or null when the row carries none it can be read from. */
export function readReturnToAi(row: { return_to_ai: GrowthJourneyReturnToAi | null }): { cooldown_until: Date; reason: string } | null {
  const r = row.return_to_ai;
  if (!r || typeof r.cooldown_until !== 'string') return null;
  const until = new Date(r.cooldown_until);
  if (Number.isNaN(until.getTime())) return null;
  return { cooldown_until: until, reason: typeof r.reason === 'string' ? r.reason : '' };
}

/** Whether a return-to-AI cooldown is open for the subject in this brand at `asOf`. */
export async function resolveReturnToAi(args: { subjectRef: string; brandId: string; asOf: Date }): Promise<ReturnToAiState> {
  const row = await GrowthJourneyHandoff.findOne({
    where: { subject_ref: args.subjectRef, brand_id: args.brandId, status: 'returned_to_ai' },
    order: [['updated_at', 'DESC']],
  });
  if (!row) return NO_RETURN;
  const rec = readReturnToAi(row);
  if (!rec || rec.cooldown_until.getTime() <= args.asOf.getTime()) return NO_RETURN;
  return { active: true, handoff_id: row.id, cooldown_until: rec.cooldown_until, reason: rec.reason };
}

/** The cooldown length for a brand: the body's days, else the brand-wide `cooldown` policy, else the default. */
export async function cooldownDaysFor(brandId: string, requested: number | undefined): Promise<{ days: number; source: 'body' | 'policy' | 'default' }> {
  if (typeof requested === 'number' && requested > 0) return { days: requested, source: 'body' };
  const policy = await GrowthJourneyPolicy.findOne({ where: { brand_id: brandId, policy_type: 'cooldown', owner_queue: null, status: 'active' } });
  if (typeof policy?.cooldown_days === 'number' && policy.cooldown_days > 0) return { days: policy.cooldown_days, source: 'policy' };
  return { days: DEFAULT_RETURN_COOLDOWN_DAYS, source: 'default' };
}

export function cooldownUntil(asOf: Date, days: number): Date {
  return new Date(asOf.getTime() + days * 86_400_000);
}
