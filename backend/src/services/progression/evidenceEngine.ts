/**
 * Evidence Engine — evidence is the currency of progression. Each validated
 * piece records an EvidenceRecord (idempotency-keyed), awards Builder XP, and
 * contributes weighted competency signal. Only this engine awards significant
 * Builder XP.
 */
import EvidenceRecord, { EvidenceSource } from '../../models/EvidenceRecord';
import XpEvent from '../../models/XpEvent';
import { getTypeXp } from './pointsConfigService';
import { deriveCompetencyWeights, DomainWeight } from './competencyWeights';

export interface RecordEvidenceInput {
  enrollmentId: string;
  source: EvidenceSource;
  /** stable, replay-safe reference (commit sha, submission id, date, ...) */
  sourceRef: string;
  /** card type slug — drives Builder XP via pointsConfig */
  typeSlug: string;
  competencyWeights: DomainWeight[];
  cardId?: string | null;
  /**
   * Pre-resolved Builder XP, bypassing the flat per-type lookup.
   *
   * For award models the type row cannot express as a single number — today
   * that is `budget_per_build`, where the amount depends on how many stories the
   * build decomposed into, which this engine has no way to know. The caller
   * resolves it through pointsConfigService and passes the result.
   *
   * Still config-derived, not a call-site constant: the rule that nothing
   * hardcodes XP holds. Negative and non-finite values are floored to 0.
   */
  builderXpOverride?: number;
}

export interface RecordEvidenceResult { builder_xp: number; created: boolean; }

/**
 * Clamp a caller-supplied XP amount to a non-negative integer.
 *
 * `Infinity` is the case worth naming: it survives both `|| 0` and `Math.trunc`,
 * so a naive coercion would write Infinity straight into the XP ledger. Anything
 * that is not a finite number becomes 0 — this value ends up in a permanent,
 * append-only ledger, so the only safe response to a nonsense amount is to award
 * nothing and leave the evidence trail to record that the story was done.
 */
function safeXp(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.trunc(n);
}

/** Low-level, card-agnostic evidence recorder (used by GitHub sync too). */
export async function recordEvidence(input: RecordEvidenceInput): Promise<RecordEvidenceResult> {
  const key = `evidence:${input.enrollmentId}:${input.source}:${input.sourceRef}`;
  const builderXp = input.builderXpOverride === undefined
    ? (await getTypeXp(input.typeSlug)).builder
    : safeXp(input.builderXpOverride);

  const [, created] = await EvidenceRecord.findOrCreate({
    where: { idempotency_key: key },
    defaults: {
      enrollment_id: input.enrollmentId,
      card_id: input.cardId ?? null,
      source_type: input.source,
      source_ref: input.sourceRef,
      competency_weights: input.competencyWeights,
      builder_xp: builderXp,
      validated: true,
      idempotency_key: key,
    },
  });

  if (created && builderXp > 0) {
    const xpKey = `builder:${key}`;
    await XpEvent.findOrCreate({
      where: { idempotency_key: xpKey },
      defaults: {
        enrollment_id: input.enrollmentId,
        stream: 'builder',
        card_id: input.cardId ?? null,
        amount: builderXp,
        reason: `evidence:${input.source}`,
        idempotency_key: xpKey,
      },
    });
  }
  return { builder_xp: builderXp, created };
}

/** Convenience: record evidence for a completed card. */
export async function recordCardEvidence(
  enrollmentId: string,
  card: { id: string; type: string; competencies?: unknown },
  source: EvidenceSource
): Promise<RecordEvidenceResult> {
  return recordEvidence({
    enrollmentId,
    source,
    sourceRef: card.id,
    typeSlug: card.type,
    competencyWeights: deriveCompetencyWeights(card),
    cardId: card.id,
  });
}
