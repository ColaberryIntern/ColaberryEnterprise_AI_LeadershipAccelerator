import { sequelize } from '../config/database';

/**
 * CAPE (Colaberry Adaptive Path Engine) Phase 0-1 schema — ensured via idempotent
 * raw SQL, same pattern as ensureEvidenceSchema.ts / ensureWorkLedgerSchema.ts
 * (this repo does NOT run global sequelize.sync({alter:true}) at boot — see those
 * files' headers for the full rationale). Every statement is CREATE/ADD ... IF NOT
 * EXISTS and wrapped in its own try/catch so a partial DB self-heals and re-running
 * boot is a no-op.
 *
 * Columns must match backend/src/models/ArchitectureSkillDefinition.ts,
 * ArchitectureSkillEvidenceBandWeights.ts, StudentSkillEvidence.ts,
 * StudentArchitectureSkill.ts EXACTLY.
 *
 * Additive only: creates 4 new tables, never alters or drops any existing column,
 * table, or constraint. Does NOT touch xp_events, evidence_records,
 * competency_domains, student_competencies, points_config, or any other
 * promotion/XP table — CAPE is a parallel, additive ledger (design doc §17 AC 12).
 *
 * Append-only contract: student_skill_evidence has no UPDATE/DELETE code path
 * anywhere in this repo (see capeEvidenceLedgerService.ts) — enforced by code
 * discipline, matching the existing xp_events/evidence_records convention (neither
 * of those tables has a DB-level trigger blocking mutation either).
 */
export async function ensureCapeSchema(): Promise<void> {
  const statements: string[] = [
    // Versioned skill ontology — 10 canonical axes + crosswalk to the 11 existing
    // promotion competencies (stored as a JSONB string array — Assumption 2 in
    // execution-contract.md). Only one row per skill_id may have is_current=true.
    `CREATE TABLE IF NOT EXISTS architecture_skill_definitions (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       skill_id VARCHAR(40) NOT NULL,
       version INTEGER NOT NULL DEFAULT 1,
       name VARCHAR(150) NOT NULL,
       description TEXT,
       axis_order INTEGER NOT NULL DEFAULT 0,
       crosswalk_competencies JSONB NOT NULL DEFAULT '[]'::jsonb,
       is_current BOOLEAN NOT NULL DEFAULT true,
       is_active BOOLEAN NOT NULL DEFAULT true,
       created_by VARCHAR(255),
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_arch_skill_def_skill_version ON architecture_skill_definitions (skill_id, version)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_arch_skill_def_current ON architecture_skill_definitions (skill_id) WHERE is_current`,
    `CREATE INDEX IF NOT EXISTS idx_arch_skill_def_axis_order ON architecture_skill_definitions (axis_order)`,

    // Versioned evidence-band weights (claim/knowledge/application/judgment). Only
    // one row may have is_current=true. Never UPDATEd after insert — a weight change
    // always inserts a new version row (see capeEvidenceBandWeightsService.ts).
    `CREATE TABLE IF NOT EXISTS architecture_skill_evidence_band_weights (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       version INTEGER NOT NULL,
       claim_weight NUMERIC(4,3) NOT NULL,
       knowledge_weight NUMERIC(4,3) NOT NULL,
       application_weight NUMERIC(4,3) NOT NULL,
       judgment_weight NUMERIC(4,3) NOT NULL,
       is_current BOOLEAN NOT NULL DEFAULT true,
       created_by VARCHAR(255),
       reason TEXT,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_arch_skill_weights_version ON architecture_skill_evidence_band_weights (version)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_arch_skill_weights_current ON architecture_skill_evidence_band_weights (is_current) WHERE is_current`,

    // Append-only skill-evidence ledger. idempotency_key formats per design doc §13,
    // e.g. timeline:<enrollment_id>:<card_id>:<skill_id>. INSERT-ONLY.
    `CREATE TABLE IF NOT EXISTS student_skill_evidence (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       enrollment_id UUID NOT NULL REFERENCES enrollments(id),
       skill_id VARCHAR(40) NOT NULL,
       band VARCHAR(20) NOT NULL,
       credit NUMERIC(6,2) NOT NULL,
       source VARCHAR(40) NOT NULL,
       source_ref VARCHAR(255),
       idempotency_key VARCHAR(300) NOT NULL,
       mapping_version INTEGER,
       metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_student_skill_evidence_idem ON student_skill_evidence (idempotency_key)`,
    `CREATE INDEX IF NOT EXISTS idx_student_skill_evidence_enrollment_skill ON student_skill_evidence (enrollment_id, skill_id)`,
    `CREATE INDEX IF NOT EXISTS idx_student_skill_evidence_band ON student_skill_evidence (band)`,

    // Derived per-skill state — a full-replace cache, recomputed from
    // student_skill_evidence. Never incremented in place (capeProficiencyService.ts
    // always reads the entire ledger for (enrollment_id, skill_id) and rewrites this
    // row wholesale). placement_score stays 0 until Phase 2 (resume placement) ships.
    `CREATE TABLE IF NOT EXISTS student_architecture_skill (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       enrollment_id UUID NOT NULL REFERENCES enrollments(id),
       skill_id VARCHAR(40) NOT NULL,
       placement_score NUMERIC(5,2) NOT NULL DEFAULT 0,
       claim_score NUMERIC(5,2) NOT NULL DEFAULT 0,
       knowledge_score NUMERIC(5,2) NOT NULL DEFAULT 0,
       application_score NUMERIC(5,2) NOT NULL DEFAULT 0,
       judgment_score NUMERIC(5,2) NOT NULL DEFAULT 0,
       proficiency NUMERIC(5,2) NOT NULL DEFAULT 0,
       confidence NUMERIC(4,3) NOT NULL DEFAULT 0,
       evidence_count INTEGER NOT NULL DEFAULT 0,
       last_evidence_at TIMESTAMPTZ,
       next_review_at TIMESTAMPTZ,
       weights_version INTEGER,
       computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_student_arch_skill_enrollment_skill ON student_architecture_skill (enrollment_id, skill_id)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] CAPE schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] CAPE (Adaptive Path Engine) Phase 0-1 schema ensured');
}
