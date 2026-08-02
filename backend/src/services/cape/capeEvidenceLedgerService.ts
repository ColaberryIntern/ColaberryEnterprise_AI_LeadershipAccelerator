/**
 * capeEvidenceLedgerService — the ONLY write path onto `student_skill_evidence`
 * (design doc §6, §13). Insert-only: this module exposes no update/delete
 * function, by design, so the ledger stays a genuine append-only record. Every
 * write is idempotency-keyed and goes through `findOrCreate`, matching the
 * existing `XpEvent`/`EvidenceRecord` convention in this repo.
 */
import StudentSkillEvidence, { EvidenceBand } from '../../models/StudentSkillEvidence';
import { skillEvidenceInputSchema, SkillEvidenceInput } from '../../schemas/capeSchema';

export class CapeEvidenceValidationError extends Error {
  error_class = 'ValidationError';
  constructor(message: string) { super(message); this.name = 'CapeEvidenceValidationError'; }
}

/** §13 idempotency-key builders. Only `timeline()` has a real caller in Phase 0-1. */
export const buildIdempotencyKey = {
  timeline: (enrollmentId: string, cardId: string, skillId: string) => `timeline:${enrollmentId}:${cardId}:${skillId}`,
  classroom: (submissionId: string, skillId: string) => `classroom:${submissionId}:${skillId}`,
  diagnostic: (attemptId: string, skillId: string) => `diagnostic:${attemptId}:${skillId}`,
  resume: (profileVersion: string | number, skillId: string) => `resume:${profileVersion}:${skillId}`,
};

export interface RecordSkillEvidenceResult {
  created: boolean;
  id: string;
  band: EvidenceBand;
  skill_id: string;
}

/**
 * Record one skill-evidence event. Validates via Zod BEFORE touching the DB
 * (backend/CLAUDE.md: "Reject malformed input... never let bad input reach a
 * service"), then `findOrCreate`s by `idempotency_key` — a duplicate key returns
 * the existing row and writes nothing new.
 */
export async function recordSkillEvidence(input: SkillEvidenceInput): Promise<RecordSkillEvidenceResult> {
  const parsed = skillEvidenceInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new CapeEvidenceValidationError(parsed.error.issues.map((i) => i.message).join('; '));
  }
  const v = parsed.data;

  const [row, created] = await StudentSkillEvidence.findOrCreate({
    where: { idempotency_key: v.idempotency_key },
    defaults: {
      enrollment_id: v.enrollment_id,
      skill_id: v.skill_id,
      band: v.band,
      credit: v.credit,
      source: v.source,
      source_ref: v.source_ref ?? null,
      idempotency_key: v.idempotency_key,
      mapping_version: v.mapping_version ?? null,
      metadata: v.metadata ?? {},
    },
  });

  return { created, id: row.id, band: row.band, skill_id: row.skill_id };
}
