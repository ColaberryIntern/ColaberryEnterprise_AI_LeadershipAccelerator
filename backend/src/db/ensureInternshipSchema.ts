import { sequelize } from '../config/database';

/**
 * AI Internship schema — application lifecycle, two-channel interview, decisions,
 * documents, and the secondary cohort membership that activation grants.
 *
 * Ensured via idempotent raw SQL, matching ensureCapstoneSchema.ts /
 * ensureEmailSendLedgerSchema.ts: this ~380-model graph runs NO global
 * `sequelize.sync({ alter: true })` at boot (config/schemaReconcile.ts), so every
 * statement is CREATE/ALTER ... IF NOT EXISTS in its own try/catch and a partial
 * database self-heals on the next boot. Additive only — nothing here alters or
 * drops an existing column, and no existing table is touched.
 *
 * ── WHY `cohort_memberships` AND NOT A SECOND `enrollments` ROW ─────────────
 *
 * This is the single most consequential decision in the feature, and it reverses
 * the mechanism named in AI_INTERNSHIP_SPEC.md decision 3 while preserving its
 * intent. The reasoning is set out in full in docs/AI_INTERNSHIP_DISCOVERY.md
 * §3.2; the short version is that INTERNSHIP_ENROLLMENT_AUDIT.md costed the
 * two-active-enrollments mechanism and found it breaks, among others:
 *
 *   - duplicateAccountSweepService.findCrossCohortDuplicates, which every intern
 *     trips BY DEFINITION (their internship cohort differs from their class
 *     cohort) and whose merge path then withdraws a legitimate row and moves its
 *     points events and unapplied account credits. It destroys data.
 *   - comp entitlement, which is written per-enrollment and read per-enrollment
 *     (contentEntitlement.ts:118/151), so comping the internship row answers 402
 *     to a student who was explicitly granted free access.
 *   - participantService.pickBestEnrollment (29 references), whose rank tiers 2
 *     and 3 are exactly the axes an internship row differs on, and whose choice
 *     is stamped into the session JWT — so the student gets "a complete,
 *     coherent, wrong portal. No 403, no 404, nothing logged."
 *
 * Hanging the internship off the EXISTING enrollment keeps "one enrollment per
 * person" true, so none of that machinery has to learn a new case. The student
 * keeps their class cohort in `enrollments.cohort_id` untouched — which is
 * precisely decision 3's stated outcome, "moving from a class KEEPS the class
 * enrollment and adds the internship on top."
 *
 * ── ORDERING ────────────────────────────────────────────────────────────────
 *
 * Must run AFTER `enrollments` and `cohorts` exist (both are core models created
 * by the model layer). The FK-shaped columns are declared as plain UUIDs without
 * REFERENCES, matching this repo's other ensure* modules: a hard FK here would
 * make boot order load-bearing on a fresh database and turn a missing parent into
 * a failed boot rather than a self-healing retry.
 */
export async function ensureInternshipSchema(): Promise<void> {
  const statements: string[] = [
    // ── The secondary membership ───────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS cohort_memberships (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       enrollment_id UUID NOT NULL,
       cohort_id UUID NOT NULL,
       membership_type VARCHAR(40) NOT NULL DEFAULT 'internship',
       status VARCHAR(20) NOT NULL DEFAULT 'active',
       joined_at TIMESTAMPTZ,
       completed_at TIMESTAMPTZ,
       approved_by VARCHAR(255),
       source_application_id UUID,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    // THE idempotency constraint for the whole feature. "Webhook retries do not
    // duplicate ... cohort memberships" is a requirement, and the only way to
    // make it true under concurrency is to have the storage engine refuse the
    // second row. A SELECT-then-INSERT is a race with a comfortable name.
    //
    // PARTIAL on status='active' so a student who completes the internship and
    // rejoins later gets a genuinely new row rather than colliding with their
    // own history.
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_cohort_memberships_active
       ON cohort_memberships (enrollment_id, cohort_id, membership_type)
       WHERE status = 'active'`,
    `CREATE INDEX IF NOT EXISTS idx_cohort_memberships_enrollment ON cohort_memberships (enrollment_id)`,
    `CREATE INDEX IF NOT EXISTS idx_cohort_memberships_cohort ON cohort_memberships (cohort_id, status)`,

    // ── The application ────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS internship_applications (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       enrollment_id UUID NOT NULL,
       cohort_id UUID,
       state VARCHAR(40) NOT NULL DEFAULT 'started',
       question_set_version INTEGER,
       interview_channel VARCHAR(20),
       submitted_at TIMESTAMPTZ,
       decided_at TIMESTAMPTZ,
       activated_at TIMESTAMPTZ,
       -- AI_INTERNSHIP_SPEC.md: the two things the email intake actually collects.
       -- "A form that drops them collects less than the email it replaces."
       attests_not_employed_fulltime BOOLEAN NOT NULL DEFAULT FALSE,
       commitment_acknowledged_at TIMESTAMPTZ,
       -- Rolling weekly starts: the concrete start is the Monday FOLLOWING the
       -- application, computed per applicant, never read off a fixed cohort field.
       desired_start_on DATE,
       -- Set when conversion imported an existing intern rather than the person
       -- walking the flow. Keeps "grandfathered" auditable instead of invisible.
       converted_from_existing_intern BOOLEAN NOT NULL DEFAULT FALSE,
       correlation_id UUID,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    // One live application per person. Without this, a double-submit or a
    // retried signup opens a second application and the reviewer queue shows the
    // same person twice with divergent answers. Terminal states are excluded so
    // a rejected applicant can genuinely reapply later.
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_internship_applications_open
       ON internship_applications (enrollment_id)
       WHERE state NOT IN ('rejected', 'withdrawn', 'removed', 'completed')`,
    `CREATE INDEX IF NOT EXISTS idx_internship_applications_state ON internship_applications (state, created_at)`,

    // ── The audit trail ────────────────────────────────────────────────────
    // "Every transition must record previous state, new state, actor, reason,
    // evidence/source, timestamp, and correlation ID."
    `CREATE TABLE IF NOT EXISTS internship_status_events (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       application_id UUID NOT NULL,
       from_state VARCHAR(40),
       to_state VARCHAR(40) NOT NULL,
       actor_type VARCHAR(20) NOT NULL,
       actor_id VARCHAR(255),
       reason TEXT,
       evidence_source VARCHAR(120),
       correlation_id UUID,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_internship_status_events_app ON internship_status_events (application_id, created_at)`,

    // ── Group A: administrative intake ─────────────────────────────────────
    // Its own table rather than columns on the application: this is the only
    // place the applicant's phone, resume and profile links live, so keeping it
    // separable makes redaction and retention a DELETE rather than a careful
    // column-by-column audit of a wide table.
    //
    // There is deliberately NO api_key / password / token column anywhere in
    // this schema. See the contract: "Never accept an API-key field."
    `CREATE TABLE IF NOT EXISTS internship_administrative_intakes (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       application_id UUID NOT NULL,
       legal_name VARCHAR(255),
       preferred_name VARCHAR(255),
       phone VARCHAR(50),
       time_zone VARCHAR(64),
       country VARCHAR(80),
       state_region VARCHAR(80),
       preferred_language VARCHAR(40),
       resume_document_id UUID,
       linkedin_url TEXT,
       github_url TEXT,
       portfolio_url TEXT,
       work_auth_category VARCHAR(40),
       permission_to_call BOOLEAN NOT NULL DEFAULT FALSE,
       permission_ai_interviewer BOOLEAN NOT NULL DEFAULT FALSE,
       -- Separate from permission_ai_interviewer on purpose: consenting to be
       -- interviewed by an AI is not consenting to be recorded.
       consent_recording BOOLEAN NOT NULL DEFAULT FALSE,
       accommodation_request TEXT,
       preferred_interview_at TIMESTAMPTZ,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_internship_intake_application
       ON internship_administrative_intakes (application_id)`,

    // ── Group B: the ONE versioned question bank ───────────────────────────
    `CREATE TABLE IF NOT EXISTS internship_interview_question_sets (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       version INTEGER NOT NULL,
       status VARCHAR(20) NOT NULL DEFAULT 'draft',
       activated_at TIMESTAMPTZ,
       notes TEXT,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_internship_question_set_version
       ON internship_interview_question_sets (version)`,
    // Exactly one active bank at a time — otherwise the two channels can drift
    // onto different versions, which is the precise failure "both channels must
    // use the same active question-bank version" forbids.
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_internship_question_set_one_active
       ON internship_interview_question_sets ((status)) WHERE status = 'active'`,

    `CREATE TABLE IF NOT EXISTS internship_interview_questions (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       question_set_id UUID NOT NULL,
       question_key VARCHAR(80) NOT NULL,
       section VARCHAR(60) NOT NULL,
       display_order INTEGER NOT NULL DEFAULT 0,
       prompt_form TEXT NOT NULL,
       prompt_voice TEXT NOT NULL,
       answer_type VARCHAR(30) NOT NULL DEFAULT 'text',
       required BOOLEAN NOT NULL DEFAULT TRUE,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_internship_question_key_per_set
       ON internship_interview_questions (question_set_id, question_key)`,

    // ── The interview session (one per channel attempt) ────────────────────
    `CREATE TABLE IF NOT EXISTS internship_interview_sessions (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       application_id UUID NOT NULL,
       channel VARCHAR(20) NOT NULL,
       status VARCHAR(30) NOT NULL DEFAULT 'in_progress',
       question_set_id UUID NOT NULL,
       scheduled_for TIMESTAMPTZ,
       started_at TIMESTAMPTZ,
       completed_at TIMESTAMPTZ,
       -- Synthflow's own call id. UNIQUE so a replayed completion webhook
       -- resolves to the session it already wrote instead of opening a second.
       provider_call_id VARCHAR(120),
       provider_payload JSONB,
       transcript TEXT,
       summary TEXT,
       failure_reason VARCHAR(120),
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_internship_session_provider_call
       ON internship_interview_sessions (provider_call_id)
       WHERE provider_call_id IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_internship_sessions_app ON internship_interview_sessions (application_id, created_at)`,

    // ── The normalized answer — where "ask once" is actually enforced ──────
    //
    // Keyed on (application_id, question_key), NOT on session. That is the whole
    // design: the guided form and the phone call write to the SAME row for the
    // same question, so "answered questions are not repeated when switching
    // channels" is a property of the schema rather than of the resume logic
    // remembering to check. `answered_via` records which channel got there
    // first, satisfying "preserve which channel collected each answer" without
    // letting the second channel create a duplicate.
    `CREATE TABLE IF NOT EXISTS internship_interview_responses (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       application_id UUID NOT NULL,
       session_id UUID,
       question_key VARCHAR(80) NOT NULL,
       question_set_version INTEGER NOT NULL,
       answer_text TEXT,
       answer_value JSONB,
       state VARCHAR(20) NOT NULL DEFAULT 'answered',
       answered_via VARCHAR(20),
       answered_at TIMESTAMPTZ,
       corrected_at TIMESTAMPTZ,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_internship_response_per_question
       ON internship_interview_responses (application_id, question_key)`,

    // ── The human decision ─────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS internship_decisions (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       application_id UUID NOT NULL,
       decision VARCHAR(40) NOT NULL,
       -- NOT NULL: "Rejection requires a student-safe reason code and message."
       -- Enforced at the column so a rejection cannot be written without one.
       reason_code VARCHAR(60) NOT NULL,
       student_message TEXT,
       reviewer_notes TEXT,
       conditions TEXT,
       reapply_after DATE,
       decided_by VARCHAR(255) NOT NULL,
       decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       -- What the AI suggested, kept BESIDE the human decision so the two can be
       -- compared later. It is never the decision itself.
       ai_recommendation VARCHAR(40),
       ai_factors JSONB,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_internship_decisions_app ON internship_decisions (application_id, decided_at)`,

    // ── Tool-readiness acknowledgements ────────────────────────────────────
    // Three states, per the contract: acknowledged_requirement,
    // self_attested_ready, setup_verified_without_secret_collection. Note what is
    // absent: any column that could hold the key itself.
    `CREATE TABLE IF NOT EXISTS internship_requirement_acknowledgements (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       application_id UUID NOT NULL,
       requirement_key VARCHAR(60) NOT NULL,
       state VARCHAR(50) NOT NULL,
       acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       verified_at TIMESTAMPTZ,
       verification_method VARCHAR(80),
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_internship_requirement_ack
       ON internship_requirement_acknowledgements (application_id, requirement_key)`,

    // ── Offer-letter templates and documents ───────────────────────────────
    `CREATE TABLE IF NOT EXISTS internship_document_templates (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       template_key VARCHAR(60) NOT NULL,
       version INTEGER NOT NULL,
       title VARCHAR(200) NOT NULL,
       body_markdown TEXT NOT NULL,
       status VARCHAR(20) NOT NULL DEFAULT 'draft',
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_internship_doc_template_version
       ON internship_document_templates (template_key, version)`,

    `CREATE TABLE IF NOT EXISTS internship_documents (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       application_id UUID NOT NULL,
       document_type VARCHAR(60) NOT NULL,
       -- 'generated' (ours, locked) or 'signed_upload' (theirs). Stored as
       -- separate rows, never as one row mutated in place: the contract requires
       -- the original generated PDF and the uploaded signed copy to be kept
       -- separately and every revision preserved.
       kind VARCHAR(20) NOT NULL,
       revision INTEGER NOT NULL DEFAULT 1,
       template_id UUID,
       template_version INTEGER,
       -- Opaque UUID filename on the persistent uploads volume, matching
       -- config/upload.ts. Never a predictable public path.
       storage_key VARCHAR(255),
       original_filename VARCHAR(255),
       mime_type VARCHAR(100),
       byte_size INTEGER,
       checksum_sha256 VARCHAR(64),
       document_public_id VARCHAR(40),
       status VARCHAR(30) NOT NULL DEFAULT 'pending',
       required BOOLEAN NOT NULL DEFAULT TRUE,
       verified_by VARCHAR(255),
       verified_at TIMESTAMPTZ,
       rejection_reason TEXT,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    // "Preserve every revision; never overwrite a previously signed file." A
    // re-upload MUST allocate revision N+1; this index makes reusing N impossible
    // rather than merely discouraged.
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_internship_document_revision
       ON internship_documents (application_id, document_type, kind, revision)`,
    `CREATE INDEX IF NOT EXISTS idx_internship_documents_app ON internship_documents (application_id, document_type)`,

    // ── Today-card dismissal ───────────────────────────────────────────────
    // "Allow temporary dismissal with a server-stored reappearance date."
    //
    // SERVER-stored, not localStorage, and that is the point: a student who
    // dismisses the card on their laptop should not be pestered by it on their
    // phone ten minutes later. Storing it per-device would make "not now" mean
    // "not now, on this browser", which is not what the student said.
    //
    // One row per enrollment, upserted — a dismissal replaces the previous one
    // rather than accumulating a history nobody reads.
    `CREATE TABLE IF NOT EXISTS internship_card_dismissals (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       enrollment_id UUID NOT NULL,
       dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       reappear_at TIMESTAMPTZ NOT NULL,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_internship_card_dismissal_enrollment
       ON internship_card_dismissals (enrollment_id)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      // Best-effort, exactly as the sibling ensure* modules: a partial database
      // self-heals on the next boot rather than refusing to start.
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        service: 'backend',
        event: 'ensure_internship_schema_statement_failed',
        outcome: 'failure',
        error_class: err?.constructor?.name ?? 'Error',
        context: { message: err?.message, sql: sql.slice(0, 120) },
      }));
    }
  }

  await assertInternshipSchema();
}

/**
 * Post-condition check.
 *
 * Every statement above only warns on failure, so "it didn't throw" is NOT
 * evidence the schema landed — the same reasoning ensureEmailSendLedgerSchema
 * documents. This verifies the two constraints the feature's correctness
 * actually rests on, and verifies they are UNIQUE: a non-unique index of the
 * right name would satisfy a name lookup while protecting nobody.
 */
export const CRITICAL_UNIQUE_INDEXES = [
  'uq_cohort_memberships_active',        // duplicate cohort membership
  'uq_internship_response_per_question', // the "ask once" guarantee
  'uq_internship_document_revision',     // never overwrite a signed file
  'uq_internship_applications_open',     // one live application per person
] as const;

/** Every table this module creates. Exported so a test can pin the set. */
export const REQUIRED_TABLES = [
  'cohort_memberships',
  'internship_applications',
  'internship_status_events',
  'internship_administrative_intakes',
  'internship_interview_question_sets',
  'internship_interview_questions',
  'internship_interview_sessions',
  'internship_interview_responses',
  'internship_decisions',
  'internship_requirement_acknowledgements',
  'internship_document_templates',
  'internship_documents',
  'internship_card_dismissals',
] as const;

export async function assertInternshipSchema(): Promise<void> {
  try {
    const [rows] = await sequelize.query(
      `SELECT indexname FROM pg_indexes
         WHERE indexname = ANY(ARRAY[:names]::text[])
           AND indexdef ILIKE 'CREATE UNIQUE%'`,
      { replacements: { names: [...CRITICAL_UNIQUE_INDEXES] } },
    );
    const found = new Set((rows as Array<{ indexname: string }>).map((r) => r.indexname));
    const missing = CRITICAL_UNIQUE_INDEXES.filter((n) => !found.has(n));
    if (missing.length) {
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        service: 'backend',
        event: 'internship_schema_missing_unique_index',
        outcome: 'partial',
        context: {
          missing,
          impact: 'idempotency for these operations is NOT enforced by the database',
        },
      }));
    }
  } catch (err: any) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      service: 'backend',
      event: 'internship_schema_assert_failed',
      outcome: 'failure',
      error_class: err?.constructor?.name ?? 'Error',
      context: { message: err?.message },
    }));
  }
}
