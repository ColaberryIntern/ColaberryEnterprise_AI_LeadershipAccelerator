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
}

export interface RecordEvidenceResult { builder_xp: number; created: boolean; }

/** Low-level, card-agnostic evidence recorder (used by GitHub sync too). */
export async function recordEvidence(input: RecordEvidenceInput): Promise<RecordEvidenceResult> {
  const key = `evidence:${input.enrollmentId}:${input.source}:${input.sourceRef}`;
  const builderXp = (await getTypeXp(input.typeSlug)).builder;

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
