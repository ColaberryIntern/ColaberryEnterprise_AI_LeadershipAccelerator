/**
 * capeResumeClaimService — the ONLY write path onto `resume_skill_claims`
 * (design doc §5, §13, §17 AC 2/3). Versions the caller's `OnboardingProfile`
 * (`resume_version` + `extractor_version`) and writes one merged, scored claim
 * row per touched skill, idempotency-keyed on `resume:<resume_version>:<skill_id>`
 * via `findOrCreate` — a retried call with the same version can never
 * double-insert, and a genuine re-upload always gets a NEW version (never an
 * in-place mutation of a prior version's rows).
 *
 * This module NEVER imports `capeEvidenceLedgerService` or
 * `StudentSkillEvidence` — resume claims must never reach the verified ledger
 * (design doc §5 "resume-only contribution to any displayed verified skill is
 * capped at zero"; §17 AC 2). See capePlacementService.ts for the read side.
 */
import { OnboardingProfile, ResumeSkillClaim } from '../../models';
import { mergeClaims, validateSkillClaims } from './capeResumeClaimExtraction';

export const RESUME_EXTRACTOR_VERSION = 'resume-skill-claims-v1';

export interface PersistResumeSkillClaimsResult {
  resume_version: number;
  touched_skill_ids: string[];
  claims_written: number;
}

function logEvent(outcome: 'success' | 'failure', context: Record<string, unknown>) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'success' ? 'info' : 'warn',
    service: 'backend',
    event: 'cape_resume_claims_persisted',
    outcome,
    context,
  }));
}

/**
 * Bumps the enrollment's resume_version, then persists one merged claim row
 * per skill_id at that version. `rawClaims` is untrusted (LLM output over
 * untrusted resume text, §15) — validated via Zod inside `validateSkillClaims`
 * before anything is merged/scored/written. Always bumps the version when
 * called (a real extraction happened, even if it yielded zero usable claims)
 * so `resume_version` accurately reflects "how many times has this learner's
 * resume been ingested," independent of extraction quality.
 */
export async function persistResumeSkillClaims(
  enrollmentId: string,
  rawClaims: unknown,
  extractorVersion: string = RESUME_EXTRACTOR_VERSION,
): Promise<PersistResumeSkillClaimsResult> {
  const [profile] = await OnboardingProfile.findOrCreate({
    where: { enrollment_id: enrollmentId },
    defaults: { enrollment_id: enrollmentId },
  });
  const nextVersion = (Number((profile as any).resume_version) || 0) + 1;
  await (profile as any).update({ resume_version: nextVersion, extractor_version: extractorVersion });

  const validated = validateSkillClaims(rawClaims);
  if (validated.length === 0) {
    logEvent('success', { enrollment_id: enrollmentId, resume_version: nextVersion, claims_written: 0, reason: 'no_usable_claims' });
    return { resume_version: nextVersion, touched_skill_ids: [], claims_written: 0 };
  }

  const merged = mergeClaims(validated);
  const touched: string[] = [];
  for (const [skillId, scored] of merged.entries()) {
    const idempotency_key = `resume:${nextVersion}:${skillId}`;
    // eslint-disable-next-line no-await-in-loop -- small (<=10) per-upload set; sequential keeps idempotency ordering obvious
    await ResumeSkillClaim.findOrCreate({
      where: { idempotency_key },
      defaults: {
        enrollment_id: enrollmentId,
        resume_version: nextVersion,
        skill_id: skillId,
        subskills: scored.subskills,
        evidence_text: scored.evidence_text,
        evidence_kind: scored.evidence_kind,
        recency_years: scored.recency_years,
        ownership: scored.ownership,
        scope: scored.scope,
        confidence: scored.confidence,
        credit_weight: scored.credit_weight,
        source_count: scored.source_count,
        extractor_version: extractorVersion,
        idempotency_key,
      },
    });
    touched.push(skillId);
  }

  logEvent('success', { enrollment_id: enrollmentId, resume_version: nextVersion, claims_written: touched.length });
  return { resume_version: nextVersion, touched_skill_ids: touched, claims_written: touched.length };
}

/** Current-version claims for an enrollment (used by capePlacementService and
 * for admin/debug explainability — §5 "so an admin can explain or correct
 * it"). "Current" = resume_version equals the profile's resume_version;
 * there is no separate is_current flag. */
export async function getCurrentResumeSkillClaims(enrollmentId: string, skillId?: string) {
  const profile = await OnboardingProfile.findOne({ where: { enrollment_id: enrollmentId } });
  const currentVersion = Number((profile as any)?.resume_version) || 0;
  if (currentVersion === 0) return [];
  const where: Record<string, unknown> = { enrollment_id: enrollmentId, resume_version: currentVersion };
  if (skillId) where.skill_id = skillId;
  return ResumeSkillClaim.findAll({ where });
}
