import { sequelize } from '../config/database';

/**
 * CAPE (Colaberry Adaptive Path Engine) Phase 3 schema — curriculum-to-skill mapping
 * (design doc §7, §8, §13, §16 Phase 3). Same idempotent-raw-SQL pattern as
 * ensureCapeSchema.ts (Phase 0-1) / ensureCapePlacementSchema.ts (Phase 2) — every
 * statement is CREATE/ADD ... IF NOT EXISTS, wrapped in its own try/catch so a partial
 * DB self-heals and re-running boot is a no-op. This repo does NOT run global
 * sequelize.sync({alter:true}) at boot.
 *
 * Columns must match backend/src/models/CurriculumSkillMap.ts,
 * ArchitectureSkillPrerequisite.ts, and the 5 new attributes added to
 * backend/src/models/TimelineCard.ts EXACTLY.
 *
 * Additive only:
 *   - 2 new tables: curriculum_skill_maps, architecture_skill_prerequisites.
 *   - 5 new nullable columns on the existing timeline_cards table (the resolved-mapping
 *     stamp — design doc §7 "at publish time, stamp the resolved mapping and version
 *     onto the Timeline Card").
 * MUST run AFTER ensureTimelineEngineSchema() in server.ts so timeline_cards already
 * exists before the ALTER TABLE statements run.
 * Never touches student_skill_evidence, student_architecture_skill,
 * architecture_skill_definitions, resume_skill_claims, diagnostic_attempts, xp_events,
 * evidence_records, competency_domains, student_competencies, or points_config — Phase 3
 * is a parallel, additive mapping contract (design doc §17 AC 12).
 *
 * Versioning contract: curriculum_skill_maps rows are never UPDATEd in place once
 * created — editing a mapping inserts a new row with version+1 and flips the prior row's
 * is_current to false (see capeCurriculumSkillMapService.ts). This is what "mapping
 * edits create a new version and never silently rewrite historical evidence" means
 * operationally, mirroring architecture_skill_definitions' own versioning convention
 * from Phase 0-1.
 */
export async function ensureCapeCurriculumMapSchema(): Promise<void> {
  const statements: string[] = [
    // curriculum_skill_maps — the resolution hierarchy's storage: one row per
    // (scope_type, scope key, version). scope_type='type' keys on type_slug,
    // 'week' keys on week_number, 'card' keys on card_id. Only one row per scope key
    // may have is_current=true at a time (partial unique indexes below).
    `CREATE TABLE IF NOT EXISTS curriculum_skill_maps (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       scope_type VARCHAR(10) NOT NULL,
       type_slug VARCHAR(100),
       week_number INTEGER,
       card_id UUID REFERENCES timeline_cards(id),
       skill_impacts JSONB NOT NULL DEFAULT '[]'::jsonb,
       prerequisite_skills JSONB NOT NULL DEFAULT '[]'::jsonb,
       recommended_range JSONB NOT NULL DEFAULT '{}'::jsonb,
       freshness_days INTEGER,
       reviewable BOOLEAN NOT NULL DEFAULT true,
       source VARCHAR(20) NOT NULL DEFAULT 'human',
       approved BOOLEAN NOT NULL DEFAULT true,
       version INTEGER NOT NULL DEFAULT 1,
       is_current BOOLEAN NOT NULL DEFAULT true,
       created_by VARCHAR(255),
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_curriculum_skill_maps_type_current ON curriculum_skill_maps (type_slug) WHERE scope_type = 'type' AND is_current`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_curriculum_skill_maps_week_current ON curriculum_skill_maps (week_number) WHERE scope_type = 'week' AND is_current`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_curriculum_skill_maps_card_current ON curriculum_skill_maps (card_id) WHERE scope_type = 'card' AND is_current`,
    `CREATE INDEX IF NOT EXISTS idx_curriculum_skill_maps_scope_type ON curriculum_skill_maps (scope_type)`,
    `CREATE INDEX IF NOT EXISTS idx_curriculum_skill_maps_approved ON curriculum_skill_maps (approved)`,

    // architecture_skill_prerequisites — the skill graph (design doc §13). Plain CRUD
    // config table (Assumption 1, execution-contract.md) — a graph edge is
    // deactivated (is_active=false), never deleted, so it stays reversible/auditable
    // without the append-only ledger machinery a true evidence stream needs.
    `CREATE TABLE IF NOT EXISTS architecture_skill_prerequisites (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       skill_id VARCHAR(40) NOT NULL,
       prerequisite_skill_id VARCHAR(40) NOT NULL,
       min_placement NUMERIC(5,2) NOT NULL DEFAULT 0,
       is_active BOOLEAN NOT NULL DEFAULT true,
       created_by VARCHAR(255),
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_arch_skill_prereq_pair ON architecture_skill_prerequisites (skill_id, prerequisite_skill_id)`,

    // timeline_cards stamp columns (design doc §7 "at publish time, stamp the resolved
    // mapping and version onto the Timeline Card"). All nullable — a card that has
    // never been published (or predates this phase's backfill) simply has nulls here.
    `ALTER TABLE timeline_cards ADD COLUMN IF NOT EXISTS skill_mapping JSONB`,
    `ALTER TABLE timeline_cards ADD COLUMN IF NOT EXISTS skill_mapping_source VARCHAR(20)`,
    `ALTER TABLE timeline_cards ADD COLUMN IF NOT EXISTS skill_mapping_map_id UUID`,
    `ALTER TABLE timeline_cards ADD COLUMN IF NOT EXISTS skill_mapping_version INTEGER`,
    `ALTER TABLE timeline_cards ADD COLUMN IF NOT EXISTS skill_mapping_resolved_at TIMESTAMPTZ`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] CAPE curriculum-map schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] CAPE (Adaptive Path Engine) Phase 3 curriculum-skill-map schema ensured');
}
