/**
 * capeTodayPlanFeedbackService — CAPE Phase 5 learner feedback controls
 * (design doc §11, §16 Phase 5). The ONLY write path onto
 * `today_plan_feedback`. Idempotent per interaction: `findOrCreate` keyed on
 * `idempotency_key = today_plan_feedback:<enrollment_id>:<ref>:<action>` —
 * a repeated action on the same card is a no-op, not a duplicate row.
 *
 * CRITICAL invariant (design doc §11 "'Already know this' alone does not
 * award skill credit", §17): this file NEVER imports or calls
 * `capeEvidenceLedgerService.recordSkillEvidence`. Feedback here is a
 * ranking/personalization signal only.
 *
 * "Test out" (§11) reuses the EXISTING Phase 2 diagnostic mechanism directly
 * — `capeDiagnosticService.startDiagnostic(skillId, 'test_out')` — no new
 * diagnostic plumbing. It is intentionally NOT stored on `today_plan_feedback`
 * (see the model's doc comment); its record lives in `diagnostic_attempts`
 * once the learner submits, via the existing
 * POST /api/portal/cape/diagnostic/:skillId/submit route.
 */
import { TodayPlanFeedback } from '../../models';
import type { TodayPlanFeedbackAction } from '../../models/TodayPlanFeedback';
import { resolveMappingForCard, CapeCurriculumSkillMapNotFoundError } from './capeCurriculumSkillMapService';
import { startDiagnostic, CapeDiagnosticError, type StartDiagnosticResult } from './capeDiagnosticService';
import { todayPlanFeedbackInputSchema } from '../../schemas/capeSchema';

export class CapeTodayPlanFeedbackError extends Error {
  error_class = 'ValidationError';
  status = 400;
  constructor(message: string) { super(message); this.name = 'CapeTodayPlanFeedbackError'; }
}

export interface RecordFeedbackInput {
  enrollment_id: string;
  ref: string;
  action: TodayPlanFeedbackAction;
}

export interface RecordFeedbackResult {
  created: boolean;
  id: string;
}

/** `ref:'card:<id>'` -> the card id; any other shape (ambient refs like
 * `blog:<id>` or an evergreen curriculum-type slug ref) -> null, since only
 * real TimelineCard-backed refs have a resolvable skill mapping. */
function cardIdFromRef(ref: string): string | null {
  return ref.startsWith('card:') ? ref.slice('card:'.length) : null;
}

/** Resolve the primary (highest-weight) mapped skill_id for a ref, or `null`
 * when the ref isn't card-backed or has no resolved mapping. Never throws —
 * both callers (recordFeedback, for optional analytics scoping; startTestOut,
 * where a null result is a real 400) treat `null` as "no skill to attach". */
async function primarySkillIdForRef(ref: string): Promise<string | null> {
  const cardId = cardIdFromRef(ref);
  if (!cardId) return null;
  try {
    const resolved = await resolveMappingForCard(cardId);
    const impacts = resolved.contract.skill_impacts;
    if (!impacts.length) return null;
    return impacts.reduce((best, cur) => (cur.weight > best.weight ? cur : best), impacts[0]).skill_id;
  } catch (err) {
    if (err instanceof CapeCurriculumSkillMapNotFoundError) return null;
    throw err;
  }
}

/**
 * Record one feedback interaction. Validates via Zod first, then
 * `findOrCreate`s by idempotency key. A double-click (or a genuinely
 * concurrent duplicate request) resolves to the SAME row — the DB-level
 * UNIQUE constraint on `idempotency_key` is what actually prevents the
 * duplicate, not app-level sequencing (see the concurrency test).
 */
export async function recordFeedback(input: RecordFeedbackInput): Promise<RecordFeedbackResult> {
  const parsed = todayPlanFeedbackInputSchema.safeParse({ ref: input.ref, action: input.action });
  if (!parsed.success) {
    throw new CapeTodayPlanFeedbackError(parsed.error.issues.map((i) => i.message).join('; '));
  }

  const idempotency_key = `today_plan_feedback:${input.enrollment_id}:${input.ref}:${input.action}`;
  const skill_id = await primarySkillIdForRef(input.ref);

  const [row, created] = await TodayPlanFeedback.findOrCreate({
    where: { idempotency_key },
    defaults: {
      enrollment_id: input.enrollment_id,
      ref: input.ref,
      skill_id,
      action: input.action,
      idempotency_key,
    },
  });

  return { created, id: row.id };
}

/**
 * "Test out" (§11) — resolve the ref's primary skill and hand off directly to
 * the existing Phase 2 diagnostic start function. Throws
 * CapeTodayPlanFeedbackError (400-shaped) when the ref has no resolvable
 * skill mapping — there is nothing to test out of.
 */
export async function startTestOut(_enrollmentId: string, ref: string): Promise<StartDiagnosticResult> {
  const skillId = await primarySkillIdForRef(ref);
  if (!skillId) {
    throw new CapeTodayPlanFeedbackError(`ref "${ref}" has no resolvable skill mapping — nothing to test out of`);
  }
  try {
    return startDiagnostic(skillId, 'test_out');
  } catch (err) {
    if (err instanceof CapeDiagnosticError) throw new CapeTodayPlanFeedbackError(err.message);
    throw err;
  }
}
