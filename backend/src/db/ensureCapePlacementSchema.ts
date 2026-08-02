import { sequelize } from '../config/database';

/**
 * CAPE (Colaberry Adaptive Path Engine) Phase 2 schema — resume/LinkedIn
 * placement + adaptive diagnostic (design doc §5, §13, §16 Phase 2). Same
 * idempotent-raw-SQL pattern as ensureCapeSchema.ts (Phase 0-1) — every
 * statement is CREATE/ADD ... IF NOT EXISTS, wrapped in its own try/catch so a
 * partial DB self-heals and re-running boot is a no-op. This repo does NOT run
 * global sequelize.sync({alter:true}) at boot.
 *
 * Columns must match backend/src/models/ResumeSkillClaim.ts and
 * DiagnosticAttempt.ts EXACTLY, and the 2 onboarding_profiles columns must
 * match the additions to backend/src/models/OnboardingProfile.ts.
 *
 * Additive only:
 *   - 2 new nullable/defaulted columns on the existing onboarding_profiles
 *     table (resume_version, extractor_version) — run AFTER
 *     ensureOnboardingProfileSchema()/ensurePortalSettingsSchema() in
 *     server.ts so the table already exists.
 *   - 2 new tables: resume_skill_claims, diagnostic_attempts.
 * Never touches student_skill_evidence, student_architecture_skill,
 * architecture_skill_definitions, xp_events, evidence_records,
 * competency_domains, student_competencies, or points_config — CAPE Phase 2
 * placement is a parallel score path from the verified ledger (design doc §4,
 * §17 AC 2/12). See capePlacementService.ts / capeResumeClaimService.ts for
 * the code-level enforcement of that boundary.
 *
 * Append-only contract: resume_skill_claims and diagnostic_attempts have no
 * UPDATE/DELETE code path anywhere in this repo (see capeResumeClaimService.ts
 * / capeDiagnosticService.ts, both insert-only via findOrCreate) — same
 * code-discipline convention as student_skill_evidence.
 */
export async function ensureCapePlacementSchema(): Promise<void> {
  const statements: string[] = [
    // onboarding_profiles extension (§13 "Extensions to existing structures"):
    // which resume upload + which extractor version produced the learner's
    // current provisional claims. resume_version is bumped by
    // capeResumeClaimService.persistResumeSkillClaims on every successful
    // extraction (never on a failed/empty extraction), starting at 0 for a
    // learner who has never uploaded a resume.
    `ALTER TABLE onboarding_profiles ADD COLUMN IF NOT EXISTS resume_version INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE onboarding_profiles ADD COLUMN IF NOT EXISTS extractor_version VARCHAR(60)`,

    // Versioned, provisional, resume/LinkedIn-derived skill claims (§5, §13).
    // One row per (enrollment_id, resume_version, skill_id) — if the extractor
    // returns multiple evidence bullets for the same skill, they are merged
    // into one row before persistence (see capeResumeClaimExtraction.ts
    // mergeClaims()). "Current" claims for an enrollment are simply the rows
    // whose resume_version equals that enrollment's onboarding_profiles.
    // resume_version — no separate is_current flag, avoiding a second source
    // of truth. A resume re-upload writes NEW rows at a NEW resume_version;
    // it never updates or deletes a prior version's rows (append-only/
    // versioned — design doc §17 AC 3).
    `CREATE TABLE IF NOT EXISTS resume_skill_claims (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       enrollment_id UUID NOT NULL REFERENCES enrollments(id),
       resume_version INTEGER NOT NULL,
       skill_id VARCHAR(40) NOT NULL,
       subskills JSONB NOT NULL DEFAULT '[]'::jsonb,
       evidence_text TEXT,
       evidence_kind VARCHAR(30) NOT NULL,
       recency_years NUMERIC(4,1),
       ownership VARCHAR(20),
       scope VARCHAR(20),
       confidence NUMERIC(4,3) NOT NULL DEFAULT 0,
       credit_weight NUMERIC(5,2) NOT NULL DEFAULT 0,
       source_count INTEGER NOT NULL DEFAULT 1,
       extractor_version VARCHAR(60),
       idempotency_key VARCHAR(300) NOT NULL,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_resume_skill_claims_idem ON resume_skill_claims (idempotency_key)`,
    `CREATE INDEX IF NOT EXISTS idx_resume_skill_claims_enrollment_skill ON resume_skill_claims (enrollment_id, skill_id)`,
    `CREATE INDEX IF NOT EXISTS idx_resume_skill_claims_enrollment_version ON resume_skill_claims (enrollment_id, resume_version)`,

    // Append-only adaptive-diagnostic / "test out" attempts (§5 "Adaptive
    // confirmation", §11 "Test out"). One row per completed attempt — a
    // "start" never writes a row (items are deterministic given skill_id, see
    // capeDiagnosticService.ts); only submitDiagnosticAttempt() inserts, keyed
    // on idempotency_key so a retried submit with the same attempt_id can
    // never double-insert or re-score. trigger distinguishes a
    // system-prompted diagnostic from a learner-initiated "test out" — both
    // flow through the exact same scoring/outcome code path (not a separate
    // mechanism).
    `CREATE TABLE IF NOT EXISTS diagnostic_attempts (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       enrollment_id UUID NOT NULL REFERENCES enrollments(id),
       skill_id VARCHAR(40) NOT NULL,
       trigger VARCHAR(20) NOT NULL DEFAULT 'diagnostic_prompt',
       items JSONB NOT NULL DEFAULT '[]'::jsonb,
       outcome VARCHAR(20) NOT NULL,
       idempotency_key VARCHAR(300) NOT NULL,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_diagnostic_attempts_idem ON diagnostic_attempts (idempotency_key)`,
    `CREATE INDEX IF NOT EXISTS idx_diagnostic_attempts_enrollment_skill ON diagnostic_attempts (enrollment_id, skill_id)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] CAPE placement schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] CAPE (Adaptive Path Engine) Phase 2 placement schema ensured');
}
