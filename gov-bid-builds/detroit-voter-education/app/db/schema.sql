CREATE TABLE IF NOT EXISTS user_preferences (
  id          SERIAL PRIMARY KEY,
  session_id  UUID        NOT NULL UNIQUE,
  zip_code_enc TEXT       NOT NULL,
  zip_iv      TEXT        NOT NULL,
  issues_enc  TEXT        NOT NULL,
  issues_iv   TEXT        NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id          SERIAL PRIMARY KEY,
  session_id  UUID,
  action      VARCHAR(100) NOT NULL,
  metadata    JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- session_id is nullable for system/admin-initiated events (no citizen session),
-- e.g. jurisdiction refresh, admin reads, summary generation. Fixes a pre-existing
-- NOT NULL violation hit by feedback.js, requireAdminKey.js, and jurisdictions.js.
ALTER TABLE audit_log ALTER COLUMN session_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS feedback (
  id          SERIAL PRIMARY KEY,
  session_id  UUID,
  type        VARCHAR(50)  NOT NULL DEFAULT 'general',
  message     TEXT         NOT NULL,
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);
-- STORY-022: review tracking so a City content admin can mark feedback
-- reviewed, same reviewed_by/reviewed_at/review_notes shape already used by
-- summaries (STORY-011) and export_requests (STORY-018) elsewhere in this app.
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS reviewed_by   TEXT;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS reviewed_at   TIMESTAMPTZ;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS review_notes  TEXT;

CREATE TABLE IF NOT EXISTS jurisdictions (
  id              SERIAL PRIMARY KEY,
  zip_code        VARCHAR(5)   NOT NULL UNIQUE,
  city            TEXT,
  county          TEXT,
  state_name      TEXT,
  state_abbr      CHAR(2),
  congressional_district TEXT,
  raw             JSONB,
  resolved_at     TIMESTAMPTZ  DEFAULT NOW(),
  expires_at      TIMESTAMPTZ  DEFAULT NOW() + INTERVAL '24 hours'
);

-- STORY-010 scaffolding: officeholder/candidate summaries.
-- issue_positions is human/steward-entered source material (verified, citable),
-- NOT AI-fabricated content — see app/services/summaryGenerationAgent.js.
CREATE TABLE IF NOT EXISTS officeholders_candidates (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  office          TEXT NOT NULL,
  jurisdiction    TEXT,
  issue_positions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS summaries (
  id              SERIAL PRIMARY KEY,
  subject_id      INTEGER NOT NULL UNIQUE REFERENCES officeholders_candidates(id),
  issues_covered  JSONB NOT NULL DEFAULT '[]'::jsonb,
  coverage_pct    NUMERIC(5,4) NOT NULL,
  summary_text    TEXT,
  status          VARCHAR(30) NOT NULL DEFAULT 'pending_content',
  generated_by    TEXT NOT NULL,
  source_data_ref JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- STORY-011: hold-for-review workflow. status progresses pending_content ->
-- pending_review (human submits authored summary_text) -> published (admin
-- approves) or rejected (admin rejects, may be resubmitted). Nothing else in
-- the codebase sets status='published' -- this is the whole approval gate.
ALTER TABLE summaries ADD COLUMN IF NOT EXISTS authored_by  TEXT;
ALTER TABLE summaries ADD COLUMN IF NOT EXISTS reviewed_by  TEXT;
ALTER TABLE summaries ADD COLUMN IF NOT EXISTS reviewed_at  TIMESTAMPTZ;
ALTER TABLE summaries ADD COLUMN IF NOT EXISTS review_notes TEXT;

-- STORY-012: publication timestamp. In this build, approval and publication
-- happen in the same transaction (no separate scheduler -- see coordinatorAgent.js
-- reviewSummary()), so published_at == reviewed_at for every published row.
-- Kept as its own column/audit event because Trust (TBI) requires a distinct
-- "publication time" and the two are conceptually separate steps even though
-- they're temporally instantaneous here.
ALTER TABLE summaries ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- STORY-015: set when a PUBLISHED summary's underlying source data changes
-- after approval. Deliberately does NOT trigger an automatic rewrite of
-- summary_text/source_data_ref on the published row -- that would let
-- approved public content change without admin re-review, undermining the
-- STORY-011 approval gate. pending_content/rejected summaries need no flag:
-- they already pull fresh officeholders_candidates.issue_positions the next
-- time they're composed (see demoPipeline.js).
ALTER TABLE summaries ADD COLUMN IF NOT EXISTS provenance_stale BOOLEAN NOT NULL DEFAULT false;

-- STORY-011: proof that an admin notification fired when a summary entered
-- pending_review. channel is 'log_stub' in this build -- no real email/SMS
-- provider is wired up (would need a new external dependency + real admin
-- contact info, which is a decision for a human, not something to assume).
CREATE TABLE IF NOT EXISTS admin_notifications (
  id           SERIAL PRIMARY KEY,
  summary_id   INTEGER NOT NULL REFERENCES summaries(id),
  notified_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  channel      VARCHAR(30) NOT NULL DEFAULT 'log_stub',
  payload      JSONB
);

-- STORY-016: resident "notify me" subscriptions, keyed on the existing
-- ephemeral per-tab session_id (crypto.randomUUID() in App.jsx) -- there is
-- no durable resident identity system, so a subscription only lasts as long
-- as the browser tab. In-app only: no email column/provider here by design.
-- Integrating a real email provider (SendGrid etc.) is a deliberately
-- deferred, separate decision -- see decision-record-STORY-016.md.
CREATE TABLE IF NOT EXISTS subscriptions (
  id          SERIAL PRIMARY KEY,
  session_id  UUID NOT NULL,
  subject_id  INTEGER NOT NULL REFERENCES officeholders_candidates(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, subject_id)
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_session ON subscriptions(session_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_subject ON subscriptions(subject_id);

-- STORY-017: real government-API ingestion pipeline infrastructure (client,
-- retry/backoff, circuit breaker, validation, storage, admin alerting).
-- Pointed at the Federal Register API (federalregister.gov, official U.S.
-- government, no key required) for legislation/regulation documents --
-- deliberately NOT a real candidate/officeholder data source. Which source
-- to use for candidate positions is a separate decision (same reasoning as
-- STORY-010's content-generation deferral) -- see decision context in
-- PROGRESS.md for this story.
CREATE TABLE IF NOT EXISTS government_data_ingestions (
  id               SERIAL PRIMARY KEY,
  source           VARCHAR(100) NOT NULL,
  endpoint         TEXT NOT NULL,
  status           VARCHAR(20) NOT NULL, -- 'success' | 'failed'
  attempt_count    INTEGER NOT NULL,
  result_count     INTEGER,
  response_summary JSONB,
  error_message    TEXT,
  ingested_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Admin alert on ingestion failure. channel='log_stub' -- no real Twilio/
-- SendGrid wired up, same precedent as STORY-011/016 (new external
-- dependency + real admin contact info is a decision for a human).
CREATE TABLE IF NOT EXISTS ingestion_alerts (
  id           SERIAL PRIMARY KEY,
  ingestion_id INTEGER NOT NULL REFERENCES government_data_ingestions(id),
  channel      VARCHAR(30) NOT NULL DEFAULT 'log_stub',
  message      TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_government_data_ingestions_source ON government_data_ingestions(source);
CREATE INDEX IF NOT EXISTS idx_ingestion_alerts_ingestion ON ingestion_alerts(ingestion_id);

-- STORY-019: distinguishes a routine single-failure alert ('admin') from an
-- escalation on repeated/circuit-open failure ('senior_admin'). `channel`
-- stays 'log_stub' regardless of tier -- channel is the delivery mechanism
-- (still no real Twilio/SendGrid), tier is who it's addressed to.
ALTER TABLE ingestion_alerts ADD COLUMN IF NOT EXISTS tier VARCHAR(20) NOT NULL DEFAULT 'admin';

-- STORY-013: bias/accuracy governance evaluation. method='heuristic_demo_v1' is
-- a deterministic, explainable stand-in (word-overlap grounding + a loaded-word
-- stoplist) documented as a heuristic, not a validated bias/accuracy measurement
-- methodology -- see decision-record-STORY-013.md. Safe to run against demo data
-- (fictional officeholders/candidates only -- see seeds/index.js).
CREATE TABLE IF NOT EXISTS governance_evaluations (
  id              SERIAL PRIMARY KEY,
  summary_id      INTEGER NOT NULL REFERENCES summaries(id),
  accuracy_score  NUMERIC(5,4) NOT NULL,
  bias_score      NUMERIC(5,4) NOT NULL,
  meets_threshold BOOLEAN NOT NULL,
  method          VARCHAR(50) NOT NULL DEFAULT 'heuristic_demo_v1',
  details         JSONB,
  evaluated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- STORY-018: data export with an approval gate. The actual export payload is
-- generated ONLY on approval, never before -- same gate pattern as STORY-011
-- (nothing is exported until a human approves the request). scope is always
-- 'published_summaries' in this build: the export can only ever contain the
-- same fields already safe to show a resident publicly (reuses
-- coordinatorAgent.listPublishedSummaries(), which never selects admin-only
-- columns like reviewed_by/review_notes) -- deliberately not a raw table dump.
CREATE TABLE IF NOT EXISTS export_requests (
  id             SERIAL PRIMARY KEY,
  format         VARCHAR(10) NOT NULL, -- 'json' | 'csv' | 'xml' | 'odbc'
  scope          VARCHAR(30) NOT NULL DEFAULT 'published_summaries',
  requested_by   TEXT NOT NULL,
  status         VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | approved | rejected | exported
  reviewed_by    TEXT,
  reviewed_at    TIMESTAMPTZ,
  review_notes   TEXT,
  export_payload TEXT,
  row_count      INTEGER,
  requested_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_export_requests_status ON export_requests(status);

-- STORY-018 / STD-001 (RFP compliance matrix): "ODBC" is a database
-- connectivity protocol, not a file format -- there is no such thing as
-- generating an "ODBC file" the way there is a JSON/CSV/XML file. What
-- STD-001 actually asked for was "direct database access, or access to a
-- reporting database (ODBC-compatible)". This read-only view is that: any
-- standard PostgreSQL ODBC driver can connect and query it directly. It is
-- the real deliverable for the 'odbc' export format, not a generated file.
CREATE OR REPLACE VIEW published_summaries_report AS
  SELECT s.subject_id, o.name, o.office, o.jurisdiction, s.summary_text,
         s.issues_covered, s.coverage_pct, s.published_at
  FROM summaries s
  JOIN officeholders_candidates o ON o.id = s.subject_id
  WHERE s.status = 'published';

-- STORY-021: persisted history of quarterly accessibility audit runs. Each
-- row is one manually-triggered run of the STORY-020 axe-core suite
-- (app/client/src/__tests__/accessibility.test.js), plus a snapshot of how
-- much accessibility-tagged resident feedback (feedback.type='accessibility',
-- STORY-005) arrived since the previous audit. components_passed reflects
-- exactly what the suite's own "ok - ..." lines report -- the suite aborts
-- at the first failure, so on a failed run this is "how many completed
-- cleanly before the abort," not "N of a known total," which is the honest
-- number this repo can actually produce (see STORY-020's decision record for
-- the same honesty-over-completeness reasoning re: contrast checking).
CREATE TABLE IF NOT EXISTS accessibility_audits (
  id                            SERIAL PRIMARY KEY,
  run_at                        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  triggered_by                  TEXT NOT NULL,
  status                        VARCHAR(10) NOT NULL, -- 'pass' | 'fail'
  components_passed             INTEGER NOT NULL,
  accessibility_feedback_count  INTEGER NOT NULL,
  raw_output                    TEXT,
  notes                         TEXT
);
CREATE INDEX IF NOT EXISTS idx_accessibility_audits_run_at ON accessibility_audits(run_at);

CREATE INDEX IF NOT EXISTS idx_jurisdictions_zip ON jurisdictions(zip_code);
CREATE INDEX IF NOT EXISTS idx_user_preferences_session ON user_preferences(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_session        ON audit_log(session_id);
CREATE INDEX IF NOT EXISTS idx_feedback_session         ON feedback(session_id);
CREATE INDEX IF NOT EXISTS idx_summaries_subject         ON summaries(subject_id);
CREATE INDEX IF NOT EXISTS idx_summaries_status          ON summaries(status);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_summary ON admin_notifications(summary_id);
CREATE INDEX IF NOT EXISTS idx_governance_evaluations_summary ON governance_evaluations(summary_id);
