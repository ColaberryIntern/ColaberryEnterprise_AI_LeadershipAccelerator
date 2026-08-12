import { sequelize } from '../config/database';

// Explorer Growth OS EPIC 1 schema — ensured via idempotent raw SQL, same
// pattern as ensureReeseOutreachSchema.ts / ensureWorkLedgerSchema.ts (215-model
// prod graph, sync({alter:true}) hits pre-existing index conflicts — see
// ensureWorkLedgerSchema.ts's header for the full rationale). Every statement is
// CREATE ... IF NOT EXISTS and wrapped in its own try/catch so a partial DB
// self-heals and re-running boot is a no-op.
//
// Columns must match these models EXACTLY:
//   backend/src/models/ExplorerJourneyProfile.ts
//   backend/src/models/ExplorerJourneyDecision.ts
//   backend/src/models/ExplorerScoreSnapshot.ts
//   backend/src/models/ExplorerExperimentAssignment.ts
//   backend/src/models/ExplorerContentAsset.ts
// The model tests pin those attribute sets literally, and this module's own test
// diffs the CREATE TABLE column lists against them — so a column added on one
// side and not the other fails a test rather than a 3am live query.
//
// Additive only: creates 5 new tables, never alters or drops any existing
// column, table, or constraint.
//
// THE UNIQUE INDEX ON (enrollment_id, decision_date) IS THE IDEMPOTENCY
// GUARANTEE for the whole system. A Journey Governor run that fires twice in a
// day cannot write a second decision for the same learner, and therefore cannot
// produce a duplicate communication. It is enforced here, at the database,
// rather than in application code, because an application-level "have we already
// decided today?" check loses to a concurrent run.
export async function ensureExplorerGrowthSchema(): Promise<void> {
  const statements: string[] = [
    // --- T1: one mutable profile per Explorer; PK is enrollment_id itself, so
    // duplicate profiles are structurally impossible.
    `CREATE TABLE IF NOT EXISTS explorer_journey_profiles (
       enrollment_id UUID PRIMARY KEY REFERENCES enrollments(id),
       lead_id INTEGER REFERENCES leads(id),
       email_normalized VARCHAR(255) NOT NULL,
       primary_state VARCHAR(32) NOT NULL DEFAULT 'NEW_EXPLORER',
       overlays TEXT[] NOT NULL DEFAULT '{}',
       e_score SMALLINT NOT NULL DEFAULT 0,
       i_score SMALLINT NOT NULL DEFAULT 0,
       f_score SMALLINT NOT NULL DEFAULT 0,
       contactability JSONB NOT NULL DEFAULT '{}'::jsonb,
       affinities JSONB NOT NULL DEFAULT '[]'::jsonb,
       signal_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
       days_since_last_activity SMALLINT,
       state_entered_at TIMESTAMPTZ,
       last_decision_at TIMESTAMPTZ,
       last_contacted_at TIMESTAMPTZ,
       scores_computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_explorer_profiles_state ON explorer_journey_profiles (primary_state)`,
    `CREATE INDEX IF NOT EXISTS idx_explorer_profiles_lead ON explorer_journey_profiles (lead_id)`,
    `CREATE INDEX IF NOT EXISTS idx_explorer_profiles_email ON explorer_journey_profiles (email_normalized)`,
    `CREATE INDEX IF NOT EXISTS idx_explorer_profiles_stale ON explorer_journey_profiles (scores_computed_at)`,
    `CREATE INDEX IF NOT EXISTS idx_explorer_profiles_overlays ON explorer_journey_profiles USING GIN (overlays)`,

    // --- T2: append-only decision audit.
    `CREATE TABLE IF NOT EXISTS explorer_journey_decisions (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       enrollment_id UUID NOT NULL REFERENCES enrollments(id),
       lead_id INTEGER,
       decision_date DATE NOT NULL,
       mode VARCHAR(24) NOT NULL,
       primary_state VARCHAR(32),
       overlays TEXT[] NOT NULL DEFAULT '{}',
       e_score SMALLINT,
       i_score SMALLINT,
       f_score SMALLINT,
       triggering_signals JSONB NOT NULL DEFAULT '[]'::jsonb,
       candidate_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
       suppressed_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
       selected_action VARCHAR(48),
       selected_campaign_id UUID,
       selected_sequence_step SMALLINT,
       selected_content_assets JSONB NOT NULL DEFAULT '[]'::jsonb,
       channel VARCHAR(16),
       reason TEXT NOT NULL,
       deferred_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
       ai_involved BOOLEAN NOT NULL DEFAULT FALSE,
       ai_rationale TEXT,
       ruleset_version VARCHAR(16) NOT NULL,
       holdout_group VARCHAR(24),
       experiment_key VARCHAR(64),
       executed BOOLEAN NOT NULL DEFAULT FALSE,
       scheduled_email_id UUID,
       outcome VARCHAR(32),
       outcome_at TIMESTAMPTZ,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    // THE idempotency guarantee. See the header comment.
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_explorer_decisions_daily ON explorer_journey_decisions (enrollment_id, decision_date)`,
    `CREATE INDEX IF NOT EXISTS idx_explorer_decisions_date ON explorer_journey_decisions (decision_date)`,
    `CREATE INDEX IF NOT EXISTS idx_explorer_decisions_action ON explorer_journey_decisions (selected_action)`,
    `CREATE INDEX IF NOT EXISTS idx_explorer_decisions_learner ON explorer_journey_decisions (enrollment_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_explorer_decisions_experiment ON explorer_journey_decisions (experiment_key) WHERE experiment_key IS NOT NULL`,

    // --- T3: append-only daily score snapshot; feeds the §24 forecast.
    `CREATE TABLE IF NOT EXISTS explorer_score_snapshots (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       enrollment_id UUID NOT NULL REFERENCES enrollments(id),
       as_of_date DATE NOT NULL,
       e_score SMALLINT NOT NULL,
       i_score SMALLINT NOT NULL,
       f_score SMALLINT NOT NULL,
       primary_state VARCHAR(32) NOT NULL,
       overlays TEXT[] NOT NULL DEFAULT '{}',
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_explorer_snapshots_daily ON explorer_score_snapshots (enrollment_id, as_of_date)`,
    `CREATE INDEX IF NOT EXISTS idx_explorer_snapshots_date ON explorer_score_snapshots (as_of_date)`,

    // --- T4: holdout assignment record (the hash is the source of truth).
    `CREATE TABLE IF NOT EXISTS explorer_experiment_assignments (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       experiment_key VARCHAR(64) NOT NULL,
       enrollment_id UUID NOT NULL REFERENCES enrollments(id),
       variant VARCHAR(24) NOT NULL,
       assignment_hash VARCHAR(64) NOT NULL,
       assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_explorer_assignments_unique ON explorer_experiment_assignments (experiment_key, enrollment_id)`,

    // --- T5: content registry INDEX over authoritative sources.
    `CREATE TABLE IF NOT EXISTS explorer_content_assets (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       asset_type VARCHAR(32) NOT NULL,
       source_system VARCHAR(48) NOT NULL,
       source_id VARCHAR(128),
       title TEXT NOT NULL,
       summary TEXT,
       url TEXT,
       topic_tags TEXT[] NOT NULL DEFAULT '{}',
       affinity_tags TEXT[] NOT NULL DEFAULT '{}',
       journey_stage_tags TEXT[] NOT NULL DEFAULT '{}',
       audience_tags TEXT[] NOT NULL DEFAULT '{}',
       cta_type VARCHAR(32),
       priority SMALLINT NOT NULL DEFAULT 50,
       proof_type VARCHAR(32),
       allowed_channels TEXT[] NOT NULL DEFAULT '{email}',
       published_at TIMESTAMPTZ,
       starts_at TIMESTAMPTZ,
       expires_at TIMESTAMPTZ,
       active BOOLEAN NOT NULL DEFAULT TRUE,
       metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
       synced_at TIMESTAMPTZ,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    // Partial unique: projected rows upsert on (source_system, source_id);
    // human-seeded rows have a null source_id and are exempt.
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_explorer_assets_source ON explorer_content_assets (source_system, source_id) WHERE source_id IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_explorer_assets_type_active ON explorer_content_assets (asset_type, active)`,
    `CREATE INDEX IF NOT EXISTS idx_explorer_assets_affinity ON explorer_content_assets USING GIN (affinity_tags)`,
    `CREATE INDEX IF NOT EXISTS idx_explorer_assets_stage ON explorer_content_assets USING GIN (journey_stage_tags)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] explorer growth schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Explorer Growth OS schema ensured');
}
