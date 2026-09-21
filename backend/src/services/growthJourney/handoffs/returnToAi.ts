import { Op } from 'sequelize';
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
 *
 * ─── `qualified` HOLDS THE AI OFF TOO (Phase 5 T502, the packet's 6A) ──────────
 *
 * The disposition option always said "a human continues; the AI pauses", but
 * every disposition clears the conversation-ownership row, so the pause lifted
 * the moment sales recorded `qualified`; the subject stayed in a commercial
 * state and T414's fixtures watched the next changed input open a SECOND sales
 * handoff for someone sales had already qualified. `qualified` now writes the
 * same `return_to_ai` record on its (still `dispositioned`) row, with its own,
 * longer default - 30 days, or the body's `cooldown_days` - and the brand's
 * `cooldown` policy is NOT applied to it: that row sizes a "not yet", and a
 * brand that sets it short must not shorten the hold on a person sales is
 * already working. The resolver therefore reads any row that CARRIES the
 * record, not only `returned_to_ai` ones.
 *
 * ─── ONE PERSON, TWO REFS ───────────────────────────────────────────────────
 *
 * A learner is `enrollment:<id>` to a decision and `lead:<id>` to the reply
 * hook, so the record is found by either the subject ref or the lead - the
 * same split T501's per-person index closed for open handoffs.
 */

export const DEFAULT_QUALIFIED_COOLDOWN_DAYS = 30;

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

/**
 * Whether a return-to-AI cooldown is open for the subject in this brand at `asOf`: the newest row
 * carrying the record, found by the subject ref or, when there is one, the lead - the latest human
 * verdict governs.
 */
export async function resolveReturnToAi(args: { subjectRef: string; brandId: string; asOf: Date; leadId?: number | null }): Promise<ReturnToAiState> {
  const who: Array<Record<string, unknown>> = [{ subject_ref: args.subjectRef }];
  if (typeof args.leadId === 'number') who.push({ lead_id: args.leadId });
  const row = await GrowthJourneyHandoff.findOne({
    where: { brand_id: args.brandId, return_to_ai: { [Op.ne]: null }, [Op.or]: who },
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

/** The hold a `qualified` disposition puts on the AI: the body's days, else 30. Pure - no policy row is read (see the header). */
export function qualifiedCooldownDays(requested: number | undefined): { days: number; source: 'body' | 'default' } {
  if (typeof requested === 'number' && requested > 0) return { days: requested, source: 'body' };
  return { days: DEFAULT_QUALIFIED_COOLDOWN_DAYS, source: 'default' };
}

export function cooldownUntil(asOf: Date, days: number): Date {
  return new Date(asOf.getTime() + days * 86_400_000);
}
