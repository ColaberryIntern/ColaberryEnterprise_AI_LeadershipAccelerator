import { sequelize } from '../config/database';

// Inbox Intel — Case Resolution Engine schema, ensured via idempotent raw
// SQL rather than sequelize.sync({ alter: true }) — see ensureLiveSessionSchema.ts
// for why (215-model prod graph, alter-sync hits pre-existing index conflicts).
// Every statement is CREATE/ADD ... IF NOT EXISTS and wrapped in its own
// try/catch so a partial DB self-heals and re-running boot is a no-op.
// Columns must match the Sequelize models in backend/src/models/InboxCase*.ts
// and InboxIdentityAlias.ts EXACTLY.
//
// Additive only: this migration creates new tables. It never alters or drops
// the existing Inbox COS tables (inbox_emails, inbox_classifications, etc.).
export async function ensureInboxCaseSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS inbox_cases (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       title VARCHAR(255) NOT NULL,
       mode VARCHAR(10) NOT NULL,
       normalized_query VARCHAR(500) NOT NULL,
       state VARCHAR(30) NOT NULL DEFAULT 'DISCOVERING',
       objective TEXT,
       summary TEXT,
       teaching_brief JSONB,
       assessment JSONB,
       recommendation TEXT,
       confidence INTEGER,
       opened_by VARCHAR(100) NOT NULL DEFAULT 'admin',
       opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       closed_at TIMESTAMPTZ,
       last_verified_at TIMESTAMPTZ,
       reopen_count INTEGER NOT NULL DEFAULT 0,
       source_query JSONB NOT NULL DEFAULT '{}'::jsonb,
       correlation_id UUID NOT NULL,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `ALTER TABLE inbox_cases DROP CONSTRAINT IF EXISTS ck_inbox_cases_mode`,
    `ALTER TABLE inbox_cases ADD CONSTRAINT ck_inbox_cases_mode CHECK (mode IN ('PERSON', 'TOPIC'))`,
    `ALTER TABLE inbox_cases DROP CONSTRAINT IF EXISTS ck_inbox_cases_state`,
    `ALTER TABLE inbox_cases ADD CONSTRAINT ck_inbox_cases_state CHECK (state IN (
       'DISCOVERING','ASSESSING','NEEDS_ALI','READY_TO_PLAN','AWAITING_APPROVAL',
       'EXECUTING','WAITING','DELEGATED','RESOLVED','FAILED','REOPENED'))`,
    `CREATE INDEX IF NOT EXISTS idx_inbox_cases_state ON inbox_cases (state)`,
    `CREATE INDEX IF NOT EXISTS idx_inbox_cases_mode ON inbox_cases (mode)`,
    `CREATE INDEX IF NOT EXISTS idx_inbox_cases_normalized_query ON inbox_cases (normalized_query)`,
    `CREATE INDEX IF NOT EXISTS idx_inbox_cases_correlation_id ON inbox_cases (correlation_id)`,

    `CREATE TABLE IF NOT EXISTS inbox_case_items (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       case_id UUID NOT NULL REFERENCES inbox_cases(id),
       source_type VARCHAR(30) NOT NULL,
       source_id VARCHAR(255) NOT NULL,
       provider VARCHAR(20) NOT NULL,
       source_url VARCHAR(1000),
       title VARCHAR(500) NOT NULL,
       occurred_at TIMESTAMPTZ NOT NULL,
       match_score NUMERIC(4,3) NOT NULL DEFAULT 0,
       match_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
       inclusion_status VARCHAR(15) NOT NULL DEFAULT 'CANDIDATE',
       disposition VARCHAR(15),
       disposition_reason TEXT,
       snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
       source_hash VARCHAR(64) NOT NULL,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `ALTER TABLE inbox_case_items DROP CONSTRAINT IF EXISTS ck_inbox_case_items_source_type`,
    `ALTER TABLE inbox_case_items ADD CONSTRAINT ck_inbox_case_items_source_type CHECK (source_type IN (
       'email','sent_email','basecamp_todo','basecamp_comment','basecamp_message','attachment'))`,
    `ALTER TABLE inbox_case_items DROP CONSTRAINT IF EXISTS ck_inbox_case_items_provider`,
    `ALTER TABLE inbox_case_items ADD CONSTRAINT ck_inbox_case_items_provider CHECK (provider IN (
       'gmail_colaberry','gmail_personal','hotmail','basecamp'))`,
    `ALTER TABLE inbox_case_items DROP CONSTRAINT IF EXISTS ck_inbox_case_items_inclusion_status`,
    `ALTER TABLE inbox_case_items ADD CONSTRAINT ck_inbox_case_items_inclusion_status CHECK (inclusion_status IN (
       'INCLUDED','CANDIDATE','EXCLUDED'))`,
    `ALTER TABLE inbox_case_items DROP CONSTRAINT IF EXISTS ck_inbox_case_items_disposition`,
    `ALTER TABLE inbox_case_items ADD CONSTRAINT ck_inbox_case_items_disposition CHECK (disposition IS NULL OR disposition IN (
       'RESOLVED','WAITING','DELEGATED','NEEDS_ALI','SILENT_HOLD','NO_ACTION','PROTECTED','FAILED'))`,
    `CREATE INDEX IF NOT EXISTS idx_inbox_case_items_case_id ON inbox_case_items (case_id)`,
    `CREATE INDEX IF NOT EXISTS idx_inbox_case_items_inclusion_status ON inbox_case_items (inclusion_status)`,
    `CREATE INDEX IF NOT EXISTS idx_inbox_case_items_disposition ON inbox_case_items (disposition)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_inbox_case_items_case_source_hash ON inbox_case_items (case_id, source_hash)`,

    // Advisory AI recommendation for CANDIDATE items (Run Assessment "deeper
    // look"). Never auto-applied to inclusion_status — Ali's Include/Exclude
    // call is unchanged. Additive, nullable — safe on existing rows.
    `ALTER TABLE inbox_case_items ADD COLUMN IF NOT EXISTS ai_recommendation VARCHAR(10)`,
    `ALTER TABLE inbox_case_items ADD COLUMN IF NOT EXISTS ai_recommendation_reason TEXT`,
    `ALTER TABLE inbox_case_items DROP CONSTRAINT IF EXISTS ck_inbox_case_items_ai_recommendation`,
    `ALTER TABLE inbox_case_items ADD CONSTRAINT ck_inbox_case_items_ai_recommendation CHECK (ai_recommendation IS NULL OR ai_recommendation IN (
       'INCLUDE','EXCLUDE'))`,

    // Advisory "close this Basecamp item after the comment" signal from the
    // same assessment call, for basecamp_todo items only. Read by the
    // action planner to decide whether to also propose a linked
    // BASECAMP_COMPLETE_TODO action alongside a BASECAMP_COMMENT — never
    // executes anything on its own. Additive, nullable — safe on existing rows.
    `ALTER TABLE inbox_case_items ADD COLUMN IF NOT EXISTS basecamp_close_recommended BOOLEAN`,
    `ALTER TABLE inbox_case_items ADD COLUMN IF NOT EXISTS basecamp_close_recommended_reason TEXT`,

    `CREATE TABLE IF NOT EXISTS inbox_identity_aliases (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       canonical_name VARCHAR(200) NOT NULL,
       alias_type VARCHAR(30) NOT NULL,
       alias_value VARCHAR(500) NOT NULL,
       provider VARCHAR(30),
       external_person_id VARCHAR(100),
       confidence INTEGER NOT NULL DEFAULT 100,
       verified_by VARCHAR(100),
       verified_at TIMESTAMPTZ,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `ALTER TABLE inbox_identity_aliases DROP CONSTRAINT IF EXISTS ck_inbox_identity_aliases_alias_type`,
    `ALTER TABLE inbox_identity_aliases ADD CONSTRAINT ck_inbox_identity_aliases_alias_type CHECK (alias_type IN (
       'email','display_name','company_domain','basecamp_person_id','name_variation'))`,
    `CREATE INDEX IF NOT EXISTS idx_inbox_identity_aliases_canonical_name ON inbox_identity_aliases (canonical_name)`,
    `CREATE INDEX IF NOT EXISTS idx_inbox_identity_aliases_type_value ON inbox_identity_aliases (alias_type, alias_value)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_inbox_identity_aliases_type_value ON inbox_identity_aliases (alias_type, alias_value)`,

    `CREATE TABLE IF NOT EXISTS inbox_case_questions (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       case_id UUID NOT NULL REFERENCES inbox_cases(id),
       question TEXT NOT NULL,
       why_required TEXT NOT NULL,
       choices JSONB NOT NULL DEFAULT '[]'::jsonb,
       recommended_answer TEXT,
       blocks_action_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
       status VARCHAR(15) NOT NULL DEFAULT 'OPEN',
       answer TEXT,
       answered_by VARCHAR(100),
       answered_at TIMESTAMPTZ,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `ALTER TABLE inbox_case_questions DROP CONSTRAINT IF EXISTS ck_inbox_case_questions_status`,
    `ALTER TABLE inbox_case_questions ADD CONSTRAINT ck_inbox_case_questions_status CHECK (status IN ('OPEN','ANSWERED','SKIPPED'))`,
    `CREATE INDEX IF NOT EXISTS idx_inbox_case_questions_case_id ON inbox_case_questions (case_id)`,
    `CREATE INDEX IF NOT EXISTS idx_inbox_case_questions_status ON inbox_case_questions (status)`,

    `CREATE TABLE IF NOT EXISTS inbox_case_actions (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       case_id UUID NOT NULL REFERENCES inbox_cases(id),
       item_id UUID REFERENCES inbox_case_items(id),
       action_type VARCHAR(30) NOT NULL,
       target_source VARCHAR(30) NOT NULL,
       target_id VARCHAR(255),
       preview TEXT NOT NULL,
       payload JSONB NOT NULL DEFAULT '{}'::jsonb,
       risk_level VARCHAR(10) NOT NULL DEFAULT 'MEDIUM',
       requires_individual_approval BOOLEAN NOT NULL DEFAULT TRUE,
       status VARCHAR(15) NOT NULL DEFAULT 'PROPOSED',
       depends_on_action_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
       idempotency_key VARCHAR(255) NOT NULL,
       attempt_count INTEGER NOT NULL DEFAULT 0,
       external_receipt JSONB,
       verification_status VARCHAR(20),
       error_class VARCHAR(100),
       error_message TEXT,
       acting_admin VARCHAR(100) NOT NULL,
       correlation_id UUID NOT NULL,
       approved_by VARCHAR(100),
       approved_at TIMESTAMPTZ,
       executed_at TIMESTAMPTZ,
       verified_at TIMESTAMPTZ,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `ALTER TABLE inbox_case_actions DROP CONSTRAINT IF EXISTS ck_inbox_case_actions_type`,
    `ALTER TABLE inbox_case_actions ADD CONSTRAINT ck_inbox_case_actions_type CHECK (action_type IN (
       'EMAIL_DRAFT','EMAIL_SEND','EMAIL_ARCHIVE','EMAIL_LABEL','BASECAMP_COMMENT','BASECAMP_UPDATE_TODO',
       'BASECAMP_COMPLETE_TODO','BASECAMP_CREATE_TODO','BASECAMP_ASSIGN_TODO','CREATE_FOLLOWUP','MARK_WAITING',
       'MARK_DELEGATED','NO_ACTION'))`,
    `ALTER TABLE inbox_case_actions DROP CONSTRAINT IF EXISTS ck_inbox_case_actions_risk`,
    `ALTER TABLE inbox_case_actions ADD CONSTRAINT ck_inbox_case_actions_risk CHECK (risk_level IN ('LOW','MEDIUM','HIGH'))`,
    `ALTER TABLE inbox_case_actions DROP CONSTRAINT IF EXISTS ck_inbox_case_actions_status`,
    `ALTER TABLE inbox_case_actions ADD CONSTRAINT ck_inbox_case_actions_status CHECK (status IN (
       'PROPOSED','APPROVED','REJECTED','EXECUTING','SUCCEEDED','VERIFIED','FAILED','SKIPPED','COMPENSATED'))`,
    `ALTER TABLE inbox_case_actions DROP CONSTRAINT IF EXISTS ck_inbox_case_actions_verification`,
    `ALTER TABLE inbox_case_actions ADD CONSTRAINT ck_inbox_case_actions_verification CHECK (verification_status IS NULL OR verification_status IN (
       'PENDING','VERIFIED','VERIFICATION_FAILED'))`,
    `CREATE INDEX IF NOT EXISTS idx_inbox_case_actions_case_id ON inbox_case_actions (case_id)`,
    `CREATE INDEX IF NOT EXISTS idx_inbox_case_actions_status ON inbox_case_actions (status)`,
    // The idempotency guard: a retried Execute request can never insert or
    // re-run a second row for the same logical side effect.
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_inbox_case_actions_idempotency_key ON inbox_case_actions (idempotency_key)`,

    `CREATE TABLE IF NOT EXISTS inbox_case_events (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       case_id UUID NOT NULL REFERENCES inbox_cases(id),
       item_id UUID,
       action_id UUID,
       event_type VARCHAR(60) NOT NULL,
       actor_type VARCHAR(10) NOT NULL DEFAULT 'system',
       actor_id VARCHAR(100) NOT NULL,
       previous_state VARCHAR(30),
       new_state VARCHAR(30),
       details JSONB NOT NULL DEFAULT '{}'::jsonb,
       correlation_id UUID NOT NULL,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `ALTER TABLE inbox_case_events DROP CONSTRAINT IF EXISTS ck_inbox_case_events_actor_type`,
    `ALTER TABLE inbox_case_events ADD CONSTRAINT ck_inbox_case_events_actor_type CHECK (actor_type IN ('admin','system','ai'))`,
    `CREATE INDEX IF NOT EXISTS idx_inbox_case_events_case_created ON inbox_case_events (case_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_inbox_case_events_action_id ON inbox_case_events (action_id)`,
    `CREATE INDEX IF NOT EXISTS idx_inbox_case_events_correlation_id ON inbox_case_events (correlation_id)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] inbox-case schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Inbox Intel case-resolution schema ensured');
}
