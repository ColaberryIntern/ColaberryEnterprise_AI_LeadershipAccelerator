import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * Cert Prep (Claude Certified Architect readiness) schema — ensured via idempotent
 * raw SQL, same pattern as ensureCapeSchema.ts / ensureEvidenceSchema.ts (this repo
 * does NOT run global sequelize.sync({alter:true}) at boot — see those files' headers
 * for the full rationale). Every statement is CREATE ... IF NOT EXISTS and wrapped in
 * its own try/catch so a partial DB self-heals and re-running boot is a no-op.
 *
 * Additive only: creates 8 new tables, never alters or drops any existing column,
 * table, or constraint. It does NOT touch assessment_attempts, diagnostic_attempts,
 * week_item_visibility, timeline_card_progress, student_points_events,
 * evidence_records or any other progression table — Cert Prep is a parallel,
 * additive layer that REFERENCES canonical records rather than copying them.
 *
 * Two deliberate design decisions worth reading before changing anything here:
 *
 * 1. UNVERIFIED BLUEPRINT FACTS ARE NULLABLE, NOT GUESSED. Anthropic's official
 *    CCAR-F exam guide lives behind the Partner Academy login and has not been read
 *    yet. Everything we currently believe about domain weights, item counts and the
 *    passing score comes from third-party community guides, and this repo has
 *    already been burned twice by trusting secondary sources on this program.
 *    So `cert_domains.weight_pct` is NULLABLE, every exam-fact column on
 *    `cert_tracks` is NULLABLE, and both carry a `*_source` column defaulting to
 *    'unverified'. Readiness scoring must degrade honestly when weights are absent
 *    rather than silently substituting a community number. Do not add NOT NULL or a
 *    DEFAULT weight to those columns.
 *
 * 2. QUESTION IDENTITY IS SPLIT FROM QUESTION CONTENT. `cert_questions` holds the
 *    stable key; `cert_question_revisions` holds the content. Editing an approved
 *    question inserts a new revision rather than rewriting the old one, so an
 *    attempt answered last month still resolves to the exact wording and answer key
 *    the student actually saw. `cert_responses` therefore stores the revision it was
 *    served, never just the question key.
 *
 * Answer keys live ONLY in cert_question_revisions.correct_keys and must never be
 * selected into any pre-submission API payload (see certPrepService serving path).
 */
export async function ensureCertPrepSchema(): Promise<void> {
  const statements: string[] = [
    // ---------------------------------------------------------------- tracks
    // Versioned certification definition. One row per (track_id, version); only one
    // row per track may have is_current=true. Exam facts are nullable on purpose —
    // see decision 1 in the header. `availability_start_week` is the server-side
    // source of truth for the Week 7 fence (never a frontend constant).
    `CREATE TABLE IF NOT EXISTS cert_tracks (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       track_id VARCHAR(40) NOT NULL,
       version INTEGER NOT NULL DEFAULT 1,
       display_name VARCHAR(150) NOT NULL,
       issuer VARCHAR(100) NOT NULL,
       blueprint_version VARCHAR(40) NOT NULL,
       blueprint_source VARCHAR(20) NOT NULL DEFAULT 'unverified',
       source_url TEXT,
       source_note TEXT,
       exam_item_count INTEGER,
       exam_duration_minutes INTEGER,
       scaled_score_min INTEGER,
       scaled_score_max INTEGER,
       passing_scaled_score INTEGER,
       availability_start_week INTEGER NOT NULL DEFAULT 7,
       readiness_policy_version VARCHAR(40) NOT NULL DEFAULT 'v1',
       effective_from TIMESTAMPTZ,
       effective_to TIMESTAMPTZ,
       is_current BOOLEAN NOT NULL DEFAULT true,
       is_active BOOLEAN NOT NULL DEFAULT true,
       created_by VARCHAR(255),
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_cert_tracks_track_version ON cert_tracks (track_id, version)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_cert_tracks_current ON cert_tracks (track_id) WHERE is_current`,

    // --------------------------------------------------------------- domains
    // Blueprint domains for a track version. weight_pct NULL means "we do not yet
    // know the official weight" and readiness must say so rather than assume even
    // weighting. objectives is a JSONB array of {objective_id, label}.
    `CREATE TABLE IF NOT EXISTS cert_domains (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       track_id VARCHAR(40) NOT NULL,
       blueprint_version VARCHAR(40) NOT NULL,
       domain_id VARCHAR(40) NOT NULL,
       label VARCHAR(200) NOT NULL,
       description TEXT,
       weight_pct NUMERIC(5,2),
       weight_source VARCHAR(20) NOT NULL DEFAULT 'unverified',
       display_order INTEGER NOT NULL DEFAULT 0,
       objectives JSONB NOT NULL DEFAULT '[]'::jsonb,
       is_active BOOLEAN NOT NULL DEFAULT true,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_cert_domains_track_bp_domain ON cert_domains (track_id, blueprint_version, domain_id)`,
    `CREATE INDEX IF NOT EXISTS idx_cert_domains_order ON cert_domains (track_id, blueprint_version, display_order)`,

    // ------------------------------------------------------------- questions
    // Stable question identity. Content lives in cert_question_revisions.
    // provenance records where an item came from so a Colaberry-authored bank can
    // always be told apart from anything else; 'colaberry_authored' is the only
    // value that may be served (third-party question content is never imported).
    `CREATE TABLE IF NOT EXISTS cert_questions (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       question_key VARCHAR(60) NOT NULL,
       track_id VARCHAR(40) NOT NULL,
       scenario_family VARCHAR(80),
       provenance VARCHAR(40) NOT NULL DEFAULT 'colaberry_authored',
       provenance_note TEXT,
       created_by VARCHAR(255),
       is_retired BOOLEAN NOT NULL DEFAULT false,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_cert_questions_key ON cert_questions (question_key)`,
    `CREATE INDEX IF NOT EXISTS idx_cert_questions_track_scenario ON cert_questions (track_id, scenario_family)`,

    // ---------------------------------------------------- question revisions
    // Immutable-after-approval content. review_status is the publication gate:
    // ONLY 'approved' revisions may ever be served to a student. correct_keys and
    // distractor_rationales are answer data — never selected into a pre-submit
    // payload. select_count states how many options to pick (multi-response items).
    `CREATE TABLE IF NOT EXISTS cert_question_revisions (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       question_key VARCHAR(60) NOT NULL,
       revision INTEGER NOT NULL,
       blueprint_version VARCHAR(40) NOT NULL,
       domain_id VARCHAR(40) NOT NULL,
       objective_id VARCHAR(60),
       stem TEXT NOT NULL,
       options JSONB NOT NULL DEFAULT '[]'::jsonb,
       correct_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
       select_count INTEGER NOT NULL DEFAULT 1,
       rationale TEXT NOT NULL,
       distractor_rationales JSONB NOT NULL DEFAULT '{}'::jsonb,
       difficulty VARCHAR(20) NOT NULL DEFAULT 'medium',
       variant_template JSONB,
       author VARCHAR(255),
       reviewer VARCHAR(255),
       review_status VARCHAR(20) NOT NULL DEFAULT 'draft',
       reviewed_at TIMESTAMPTZ,
       active_from TIMESTAMPTZ,
       active_to TIMESTAMPTZ,
       exposure_count INTEGER NOT NULL DEFAULT 0,
       correct_count INTEGER NOT NULL DEFAULT 0,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_cert_qrev_key_revision ON cert_question_revisions (question_key, revision)`,
    `CREATE INDEX IF NOT EXISTS idx_cert_qrev_servable ON cert_question_revisions (blueprint_version, domain_id, review_status)`,
    `CREATE INDEX IF NOT EXISTS idx_cert_qrev_status ON cert_question_revisions (review_status)`,

    // -------------------------------------------------------------- sessions
    // One diagnostic / practice / mock sitting. question_keys stores the ordered
    // served form as [{question_key, revision}] so a resumed or re-scored session
    // always resolves to the exact items the student saw. idempotency_key makes a
    // retried "start" return the existing session instead of minting a second one.
    `CREATE TABLE IF NOT EXISTS cert_sessions (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       enrollment_id UUID NOT NULL REFERENCES enrollments(id),
       cohort_id UUID,
       track_id VARCHAR(40) NOT NULL,
       mode VARCHAR(20) NOT NULL,
       form_version VARCHAR(60) NOT NULL,
       blueprint_version VARCHAR(40) NOT NULL,
       scoring_policy_version VARCHAR(40) NOT NULL DEFAULT 'v1',
       question_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
       status VARCHAR(20) NOT NULL DEFAULT 'in_progress',
       time_limit_seconds INTEGER,
       started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       expires_at TIMESTAMPTZ,
       completed_at TIMESTAMPTZ,
       scaled_score INTEGER,
       correct_count INTEGER,
       total_count INTEGER,
       domain_results JSONB,
       idempotency_key VARCHAR(160),
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_cert_sessions_idempotency ON cert_sessions (idempotency_key) WHERE idempotency_key IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_cert_sessions_enrollment ON cert_sessions (enrollment_id, started_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_cert_sessions_open ON cert_sessions (enrollment_id, status) WHERE status = 'in_progress'`,

    // ------------------------------------------------------------- responses
    // One row per answered item. is_correct is computed SERVER-SIDE only; the
    // client never supplies it. The unique (session_id, question_key) index makes a
    // duplicate or retried submit idempotent rather than double-recording.
    `CREATE TABLE IF NOT EXISTS cert_responses (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       session_id UUID NOT NULL REFERENCES cert_sessions(id) ON DELETE CASCADE,
       enrollment_id UUID NOT NULL REFERENCES enrollments(id),
       question_key VARCHAR(60) NOT NULL,
       question_revision INTEGER NOT NULL,
       domain_id VARCHAR(40) NOT NULL,
       selected_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
       is_correct BOOLEAN,
       time_ms INTEGER,
       rationale_viewed BOOLEAN NOT NULL DEFAULT false,
       answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_cert_responses_session_question ON cert_responses (session_id, question_key)`,
    `CREATE INDEX IF NOT EXISTS idx_cert_responses_enrollment_domain ON cert_responses (enrollment_id, domain_id)`,

    // --------------------------------------------------- readiness snapshots
    // Append-only history. A scoring-policy change inserts new snapshots and never
    // rewrites old ones, so an instructor can see genuine progress over time rather
    // than a retroactively restated curve. knowledge/evidence/confidence are kept
    // SEPARATE from the headline number so the score stays explainable.
    `CREATE TABLE IF NOT EXISTS cert_readiness_snapshots (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       enrollment_id UUID NOT NULL REFERENCES enrollments(id),
       track_id VARCHAR(40) NOT NULL,
       blueprint_version VARCHAR(40) NOT NULL,
       readiness_policy_version VARCHAR(40) NOT NULL,
       knowledge_scaled INTEGER,
       evidence_coverage_pct NUMERIC(5,2),
       sample_confidence NUMERIC(4,3),
       overall_scaled INTEGER,
       overall_state VARCHAR(30) NOT NULL DEFAULT 'not_measured',
       weights_available BOOLEAN NOT NULL DEFAULT false,
       domain_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
       computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_cert_readiness_enrollment ON cert_readiness_snapshots (enrollment_id, computed_at DESC)`,

    // ---------------------------------------------------- evidence mappings
    // Cert-specific metadata ONLY. The artifact itself stays in its canonical table
    // (evidence_records / portfolio_artifacts / project_artifacts / timeline cards);
    // this row records which blueprint objective it satisfies and who verified that.
    // A student can never self-verify: mapping_state moves to 'verified' through the
    // instructor path only (auto_matched candidates land as 'pending').
    `CREATE TABLE IF NOT EXISTS cert_evidence_mappings (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       enrollment_id UUID NOT NULL REFERENCES enrollments(id),
       track_id VARCHAR(40) NOT NULL,
       blueprint_version VARCHAR(40) NOT NULL,
       domain_id VARCHAR(40) NOT NULL,
       objective_id VARCHAR(60),
       source_type VARCHAR(40) NOT NULL,
       source_id VARCHAR(64) NOT NULL,
       mapping_state VARCHAR(20) NOT NULL DEFAULT 'pending',
       mapping_rationale TEXT,
       auto_matched BOOLEAN NOT NULL DEFAULT false,
       verified_by VARCHAR(255),
       verified_at TIMESTAMPTZ,
       rejected_reason TEXT,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_cert_evmap_unique ON cert_evidence_mappings (enrollment_id, domain_id, source_type, source_id)`,
    `CREATE INDEX IF NOT EXISTS idx_cert_evmap_state ON cert_evidence_mappings (enrollment_id, mapping_state)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] Cert Prep schema stmt skipped:', err?.message);
    }
  }

  // POST-CONDITION CHECK — do not remove.
  //
  // The per-statement try/catch above is the repo's convention (see
  // ensureCapeSchema) and it is right: a partial DB should self-heal and a
  // re-run should be a no-op. But on its own it also means a FAILING statement
  // logs one warning among hundreds of boot lines and the function still
  // announces success. That is not hypothetical — the first real run of this
  // file created 4 of 8 tables (the four without a foreign key to `enrollments`,
  // which did not exist on that database) and reported "schema ensured".
  //
  // Four of these tables REFERENCE enrollments(id), so this schema cannot stand
  // up on a database that has not already been through the app's own schema.
  // That dependency is correct and intended — cert data belongs to an enrollment
  // — but it has to fail loudly rather than silently leave half a feature.
  const missing = await missingCertTables();
  if (missing.length > 0) {
    console.error(
      `[DB] Cert Prep schema INCOMPLETE — ${missing.length} of ${CERT_TABLES.length} tables missing: ${missing.join(', ')}. ` +
      'The four session/response/readiness/evidence tables REFERENCE enrollments(id); if that table does not exist yet, ' +
      'this schema must run AFTER the core app schema. Cert Prep will not function until this is resolved.',
    );
    return;
  }
  console.log(`[DB] Cert Prep (Claude Architect readiness) schema ensured — all ${CERT_TABLES.length} tables present`);
}

/** Every table this module is responsible for. */
export const CERT_TABLES = [
  'cert_tracks',
  'cert_domains',
  'cert_questions',
  'cert_question_revisions',
  'cert_sessions',
  'cert_responses',
  'cert_readiness_snapshots',
  'cert_evidence_mappings',
] as const;

/**
 * Which of the Cert Prep tables are absent. Exported so a health check or a
 * deployment gate can ask the same question the boot path asks.
 */
export async function missingCertTables(): Promise<string[]> {
  try {
    // `IN (:names)`, not `ANY(:names)` — Sequelize expands an array replacement
    // into a comma-separated list, which is valid inside IN(...) and a syntax
    // error inside ANY(...). QueryTypes.SELECT returns the rows directly rather
    // than the [results, metadata] tuple, which is the other half of the same
    // trap: destructuring the tuple for a SELECT silently yields metadata.
    const rows = await sequelize.query<{ table_name: string }>(
      `SELECT table_name::text AS table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name IN (:names)`,
      { replacements: { names: [...CERT_TABLES] }, type: QueryTypes.SELECT },
    );
    const present = new Set(rows.map((r) => r.table_name));
    return CERT_TABLES.filter((t) => !present.has(t));
  } catch (err: any) {
    // If we cannot even ask, say so rather than reporting a clean bill of health.
    console.warn('[DB] Cert Prep table check failed:', err?.message);
    return [...CERT_TABLES];
  }
}
