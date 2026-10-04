/**
 * Project Presentation Studio — storage schema.
 *
 * The Studio is the workspace a student opens from a demo-prep card (PREP-1..PREP-6)
 * to learn a presentation format, prepare a story, build a deck, rehearse in a
 * recorded room, present, and submit an approved take to the community.
 *
 * WHAT THIS MODULE DELIBERATELY DOES NOT DO.
 *
 * It does not own task completion. `markTaskVerifiedComplete`
 * (services/projects/projectWriteService.ts) remains THE ONLY writer that may set a
 * student_tasks row to 'complete', and nothing here may mint one. These tables record
 * what a student DID; whether that satisfies a task is still decided by the canonical
 * writer, and points are still gated by the unique index student_points_events_unique.
 * Keeping the two apart is what stops "a recording exists" from silently becoming
 * "the task is done" — PREP-6 in particular stays staff-verified.
 *
 * It also does not re-model what already exists. room_bookings ALREADY carries
 * related_project_id, agenda, outcome, artifact_prompt, reflection_prompt,
 * idempotency_key, recording_policy and a legal variant of 'demo'. Those columns are
 * written today and never read back, so the Studio projects them rather than
 * duplicating them. The only booking-shaped thing stored here is the attempt's
 * reference to a booking.
 *
 * FIVE INDEPENDENT STATE MACHINES, NOT ONE "complete" FLAG. Preparation status,
 * session status, recording status, evaluation result and publication status are
 * genuinely different facts about an attempt, and collapsing them into one badge is
 * how a student ends up told their demo is finished because a webhook fired. Each
 * has its own column and its own vocabulary.
 *
 * CONVENTIONS FOLLOWED FROM THE EXISTING ensure* MODULES:
 *   - bare-UUID references, not real FKs across domain boundaries
 *   - every write-facing flag defaults to the CLOSED state (nothing is public,
 *     approved or required until something explicitly says so)
 *   - partial unique indexes where a row may legitimately recur after withdrawal
 *   - every statement idempotent and safe to re-run; each is individually
 *     try/caught by the ensure function so one failure self-heals on next boot
 *
 * THE ADD COLUMN TRAP, HONOURED EXPLICITLY. `CREATE TABLE IF NOT EXISTS` is a no-op
 * against a table that already exists, so a column added to the CREATE body later is
 * never applied to a database that already ran this module — and Sequelize then
 * silently drops every write to it, forever. Unlike the older modules that only warn
 * about this, every column below ALSO appears as an explicit
 * `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. The CREATE is for a fresh database; the
 * ALTERs are what actually keep an existing one correct. Add a column in BOTH places
 * or it does not exist in production.
 */

import { sequelize } from '../config/database';

/** Tables this module owns. Order matters: parents before children. */
export const PRESENTATION_STUDIO_TABLES = [
  'presentation_assignments',
  'presentation_attempts',
  'presentation_recordings',
  'presentation_feedback',
  'presentation_showcases',
] as const;

/**
 * Columns added to an EXISTING table rather than created with a new one. Kept in its
 * own export so the parity suite can tell "we created this" apart from "we extended
 * someone else's table", which carries a different blast radius.
 */
export const PRESENTATION_STUDIO_FOREIGN_TABLE_COLUMNS = [
  'projects.external_url',
  'projects.external_owner',
  'projects.evidence_provenance',
  'projects.external_verified',
] as const;

export const PRESENTATION_STUDIO_STATEMENTS: string[] = [
  // ---------------------------------------------------------------------------
  // presentation_assignments — "this student owes this presentation for this task"
  //
  // One row per (project, prep task). story_id is the PREP-n string, NOT a uuid:
  // it matches student_tasks.story_id, which is the identity the whole prep
  // subsystem already keys on (unique index student_tasks_unique_story). Using the
  // same key is what lets an assignment find its task without inventing a mapping
  // table that could drift.
  //
  // template_version is stored as a value, not a pointer. An instructor editing a
  // template must not retroactively change what a student was asked to do, so the
  // version in force at assignment time is frozen here.
  // ---------------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS presentation_assignments (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     project_id UUID NOT NULL,
     story_id VARCHAR(60) NOT NULL,
     enrollment_id UUID,
     cohort_id UUID,
     template_slug VARCHAR(80) NOT NULL,
     template_version INTEGER NOT NULL DEFAULT 1,
     audience VARCHAR(60),
     duration_seconds INTEGER,
     due_on DATE,
     required BOOLEAN NOT NULL DEFAULT FALSE,
     prep_state VARCHAR(30) NOT NULL DEFAULT 'not_started',
     checklist_json JSONB NOT NULL DEFAULT '{}'::jsonb,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `ALTER TABLE presentation_assignments ADD COLUMN IF NOT EXISTS project_id UUID`,
  `ALTER TABLE presentation_assignments ADD COLUMN IF NOT EXISTS story_id VARCHAR(60)`,
  `ALTER TABLE presentation_assignments ADD COLUMN IF NOT EXISTS enrollment_id UUID`,
  `ALTER TABLE presentation_assignments ADD COLUMN IF NOT EXISTS cohort_id UUID`,
  `ALTER TABLE presentation_assignments ADD COLUMN IF NOT EXISTS template_slug VARCHAR(80)`,
  `ALTER TABLE presentation_assignments ADD COLUMN IF NOT EXISTS template_version INTEGER DEFAULT 1`,
  `ALTER TABLE presentation_assignments ADD COLUMN IF NOT EXISTS audience VARCHAR(60)`,
  `ALTER TABLE presentation_assignments ADD COLUMN IF NOT EXISTS duration_seconds INTEGER`,
  `ALTER TABLE presentation_assignments ADD COLUMN IF NOT EXISTS due_on DATE`,
  `ALTER TABLE presentation_assignments ADD COLUMN IF NOT EXISTS required BOOLEAN DEFAULT FALSE`,
  `ALTER TABLE presentation_assignments ADD COLUMN IF NOT EXISTS prep_state VARCHAR(30) DEFAULT 'not_started'`,
  `ALTER TABLE presentation_assignments ADD COLUMN IF NOT EXISTS checklist_json JSONB DEFAULT '{}'::jsonb`,
  `ALTER TABLE presentation_assignments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`,
  `ALTER TABLE presentation_assignments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
  // One assignment per task. This is the constraint that makes a double-submitted
  // "start preparing" click produce one row instead of two competing assignments.
  `CREATE UNIQUE INDEX IF NOT EXISTS presentation_assignments_unique_task
     ON presentation_assignments (project_id, story_id)`,
  `CREATE INDEX IF NOT EXISTS presentation_assignments_enrollment
     ON presentation_assignments (enrollment_id)`,
  `CREATE INDEX IF NOT EXISTS presentation_assignments_cohort
     ON presentation_assignments (cohort_id)`,

  // ---------------------------------------------------------------------------
  // presentation_attempts — one try at delivering the assignment
  //
  // A student may rehearse many times; each attempt is its own row with its own
  // booking, its own recording and its own feedback. Retrying must never overwrite
  // the evidence of the previous try, which is why attempt_no is part of the key
  // rather than a mutable "latest" pointer.
  //
  // occurrence_uuid is the PROVIDER's immutable id for a specific meeting
  // occurrence. A Zoom meeting id is reused across recurrences, so matching a
  // recording on meeting id alone attaches part of Tuesday's session to Thursday's
  // attempt. The occurrence uuid is the only id that distinguishes them.
  //
  // checklist_snapshot_json is a SNAPSHOT, not a live reference: the audience and
  // recording acknowledgement a student confirmed for THIS attempt, frozen, so a
  // later edit to the checklist cannot rewrite what they agreed to.
  // ---------------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS presentation_attempts (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     assignment_id UUID NOT NULL,
     attempt_no INTEGER NOT NULL,
     mode VARCHAR(30) NOT NULL DEFAULT 'practice_solo',
     booking_id UUID,
     room_id UUID,
     occurrence_uuid VARCHAR(120),
     audience VARCHAR(60),
     checklist_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
     selected_material_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
     attempt_state VARCHAR(30) NOT NULL DEFAULT 'draft',
     recording_state VARCHAR(30) NOT NULL DEFAULT 'expected',
     is_final_take BOOLEAN NOT NULL DEFAULT FALSE,
     join_intent_at TIMESTAMPTZ,
     started_at TIMESTAMPTZ,
     ended_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `ALTER TABLE presentation_attempts ADD COLUMN IF NOT EXISTS assignment_id UUID`,
  `ALTER TABLE presentation_attempts ADD COLUMN IF NOT EXISTS attempt_no INTEGER`,
  `ALTER TABLE presentation_attempts ADD COLUMN IF NOT EXISTS mode VARCHAR(30) DEFAULT 'practice_solo'`,
  `ALTER TABLE presentation_attempts ADD COLUMN IF NOT EXISTS booking_id UUID`,
  `ALTER TABLE presentation_attempts ADD COLUMN IF NOT EXISTS room_id UUID`,
  `ALTER TABLE presentation_attempts ADD COLUMN IF NOT EXISTS occurrence_uuid VARCHAR(120)`,
  `ALTER TABLE presentation_attempts ADD COLUMN IF NOT EXISTS audience VARCHAR(60)`,
  `ALTER TABLE presentation_attempts ADD COLUMN IF NOT EXISTS checklist_snapshot_json JSONB DEFAULT '{}'::jsonb`,
  `ALTER TABLE presentation_attempts ADD COLUMN IF NOT EXISTS selected_material_ids JSONB DEFAULT '[]'::jsonb`,
  `ALTER TABLE presentation_attempts ADD COLUMN IF NOT EXISTS attempt_state VARCHAR(30) DEFAULT 'draft'`,
  `ALTER TABLE presentation_attempts ADD COLUMN IF NOT EXISTS recording_state VARCHAR(30) DEFAULT 'expected'`,
  `ALTER TABLE presentation_attempts ADD COLUMN IF NOT EXISTS is_final_take BOOLEAN DEFAULT FALSE`,
  `ALTER TABLE presentation_attempts ADD COLUMN IF NOT EXISTS join_intent_at TIMESTAMPTZ`,
  `ALTER TABLE presentation_attempts ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ`,
  `ALTER TABLE presentation_attempts ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ`,
  `ALTER TABLE presentation_attempts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`,
  `ALTER TABLE presentation_attempts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
  // A double-clicked "practice now" must produce ONE attempt. A deliberate retry
  // increments attempt_no and is therefore a different row.
  `CREATE UNIQUE INDEX IF NOT EXISTS presentation_attempts_unique_try
     ON presentation_attempts (assignment_id, attempt_no)`,
  `CREATE INDEX IF NOT EXISTS presentation_attempts_booking
     ON presentation_attempts (booking_id)`,
  // Recording ingestion matches on this. room_bookings.google_event_id and
  // live_sessions.zoom_meeting_id are both unindexed today despite being webhook
  // lookup keys; this one is indexed from the start.
  `CREATE INDEX IF NOT EXISTS presentation_attempts_occurrence
     ON presentation_attempts (occurrence_uuid)`,
  // At most one final take per assignment. Partial, because an attempt that is not
  // the final take must be free to recur.
  `CREATE UNIQUE INDEX IF NOT EXISTS presentation_attempts_one_final_take
     ON presentation_attempts (assignment_id) WHERE is_final_take`,

  // ---------------------------------------------------------------------------
  // presentation_recordings — the parts of an attempt's recording
  //
  // ONE ATTEMPT CAN HAVE MANY PARTS. Zoom splits a recording when a host stops and
  // restarts, so "a recording exists for this attempt" is the exact check that
  // permanently hides the second half of a session — the booking ingestion path
  // has that bug today (sessionRecordingService.ts:428-435). A row here is a PART,
  // and the unique key is the part's own identity, so arriving twice is a conflict
  // and arriving late is just another part.
  //
  // The dedupe key is (occurrence_uuid, provider_file_id) and it is a REAL UNIQUE
  // INDEX. The existing pipeline dedupes by reading metadata @> {zoom_uuid} and
  // then inserting, which is a read-then-write race: a webhook and the 30-minute
  // cron sweep both see "not present" and both ingest. A constraint cannot race.
  // ---------------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS presentation_recordings (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     attempt_id UUID NOT NULL,
     resource_id UUID,
     occurrence_uuid VARCHAR(120) NOT NULL,
     provider_file_id VARCHAR(160) NOT NULL,
     part_no INTEGER NOT NULL DEFAULT 1,
     parts_total INTEGER,
     recording_type VARCHAR(60),
     starts_at TIMESTAMPTZ,
     ends_at TIMESTAMPTZ,
     duration_seconds INTEGER,
     ingest_status VARCHAR(30) NOT NULL DEFAULT 'expected',
     ingest_provenance VARCHAR(30),
     has_audio BOOLEAN,
     has_shared_screen BOOLEAN,
     review_reason TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `ALTER TABLE presentation_recordings ADD COLUMN IF NOT EXISTS attempt_id UUID`,
  `ALTER TABLE presentation_recordings ADD COLUMN IF NOT EXISTS resource_id UUID`,
  `ALTER TABLE presentation_recordings ADD COLUMN IF NOT EXISTS occurrence_uuid VARCHAR(120)`,
  `ALTER TABLE presentation_recordings ADD COLUMN IF NOT EXISTS provider_file_id VARCHAR(160)`,
  `ALTER TABLE presentation_recordings ADD COLUMN IF NOT EXISTS part_no INTEGER DEFAULT 1`,
  `ALTER TABLE presentation_recordings ADD COLUMN IF NOT EXISTS parts_total INTEGER`,
  `ALTER TABLE presentation_recordings ADD COLUMN IF NOT EXISTS recording_type VARCHAR(60)`,
  `ALTER TABLE presentation_recordings ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ`,
  `ALTER TABLE presentation_recordings ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ`,
  `ALTER TABLE presentation_recordings ADD COLUMN IF NOT EXISTS duration_seconds INTEGER`,
  `ALTER TABLE presentation_recordings ADD COLUMN IF NOT EXISTS ingest_status VARCHAR(30) DEFAULT 'expected'`,
  `ALTER TABLE presentation_recordings ADD COLUMN IF NOT EXISTS ingest_provenance VARCHAR(30)`,
  `ALTER TABLE presentation_recordings ADD COLUMN IF NOT EXISTS has_audio BOOLEAN`,
  `ALTER TABLE presentation_recordings ADD COLUMN IF NOT EXISTS has_shared_screen BOOLEAN`,
  `ALTER TABLE presentation_recordings ADD COLUMN IF NOT EXISTS review_reason TEXT`,
  `ALTER TABLE presentation_recordings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`,
  `ALTER TABLE presentation_recordings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
  // The constraint that makes duplicate/late/out-of-order webhook delivery safe.
  `CREATE UNIQUE INDEX IF NOT EXISTS presentation_recordings_unique_part
     ON presentation_recordings (occurrence_uuid, provider_file_id)`,
  `CREATE INDEX IF NOT EXISTS presentation_recordings_attempt
     ON presentation_recordings (attempt_id, part_no)`,
  // The operations queue reads this: anything needing a human decision.
  `CREATE INDEX IF NOT EXISTS presentation_recordings_needs_review
     ON presentation_recordings (ingest_status) WHERE ingest_status IN ('missing', 'failed', 'review')`,

  // ---------------------------------------------------------------------------
  // presentation_feedback — coaching, peer notes and official grading, kept apart
  //
  // AI coaching, a peer's note and an instructor's score are three different things
  // with three different authorities, and merging them is how a practice suggestion
  // ends up looking like a grade. evaluator_role keeps them distinct.
  //
  // modality_analyzed records what was ACTUALLY available — transcript only, audio,
  // video, slides. A reviewer that saw only a transcript must not make claims about
  // delivery or confidence, and storing the modality is what lets the UI say "not
  // assessable" honestly instead of rendering an empty score as a zero.
  //
  // visibility defaults to 'private': a rehearsal score belongs to the student until
  // they decide otherwise.
  // ---------------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS presentation_feedback (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     attempt_id UUID NOT NULL,
     evaluator_role VARCHAR(30) NOT NULL,
     evaluator_id VARCHAR(160),
     rubric_version VARCHAR(40) NOT NULL DEFAULT 'v1',
     modality_analyzed JSONB NOT NULL DEFAULT '[]'::jsonb,
     score_json JSONB,
     findings_json JSONB NOT NULL DEFAULT '[]'::jsonb,
     improvements_json JSONB NOT NULL DEFAULT '[]'::jsonb,
     visibility VARCHAR(20) NOT NULL DEFAULT 'private',
     model_provenance JSONB,
     review_state VARCHAR(30) NOT NULL DEFAULT 'draft',
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `ALTER TABLE presentation_feedback ADD COLUMN IF NOT EXISTS attempt_id UUID`,
  `ALTER TABLE presentation_feedback ADD COLUMN IF NOT EXISTS evaluator_role VARCHAR(30)`,
  `ALTER TABLE presentation_feedback ADD COLUMN IF NOT EXISTS evaluator_id VARCHAR(160)`,
  `ALTER TABLE presentation_feedback ADD COLUMN IF NOT EXISTS rubric_version VARCHAR(40) DEFAULT 'v1'`,
  `ALTER TABLE presentation_feedback ADD COLUMN IF NOT EXISTS modality_analyzed JSONB DEFAULT '[]'::jsonb`,
  `ALTER TABLE presentation_feedback ADD COLUMN IF NOT EXISTS score_json JSONB`,
  `ALTER TABLE presentation_feedback ADD COLUMN IF NOT EXISTS findings_json JSONB DEFAULT '[]'::jsonb`,
  `ALTER TABLE presentation_feedback ADD COLUMN IF NOT EXISTS improvements_json JSONB DEFAULT '[]'::jsonb`,
  `ALTER TABLE presentation_feedback ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) DEFAULT 'private'`,
  `ALTER TABLE presentation_feedback ADD COLUMN IF NOT EXISTS model_provenance JSONB`,
  `ALTER TABLE presentation_feedback ADD COLUMN IF NOT EXISTS review_state VARCHAR(30) DEFAULT 'draft'`,
  `ALTER TABLE presentation_feedback ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`,
  `ALTER TABLE presentation_feedback ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
  // One verdict per evaluator per rubric version. Re-running the AI reviewer against
  // the same rubric updates its row instead of stacking duplicates; bumping the
  // rubric version is a genuinely new assessment and gets its own row.
  `CREATE UNIQUE INDEX IF NOT EXISTS presentation_feedback_unique_verdict
     ON presentation_feedback (attempt_id, evaluator_role, rubric_version)`,
  `CREATE INDEX IF NOT EXISTS presentation_feedback_attempt
     ON presentation_feedback (attempt_id)`,

  // ---------------------------------------------------------------------------
  // presentation_showcases — the approved, published take
  //
  // content_hash is the approval's binding. Approval applies to the CONTENT that was
  // reviewed, not to the attempt in perpetuity: swap the recording or the deck after
  // sign-off and the hash no longer matches, so the publication is no longer
  // approved and has to go back through review. Storing the hash is what makes that
  // enforceable rather than a policy nobody can check.
  //
  // Both approvals default NULL — author and staff must each act. Nothing is
  // published by omission.
  // ---------------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS presentation_showcases (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     attempt_id UUID NOT NULL,
     audience VARCHAR(30) NOT NULL DEFAULT 'private',
     draft_json JSONB NOT NULL DEFAULT '{}'::jsonb,
     content_hash VARCHAR(80),
     author_approved_at TIMESTAMPTZ,
     staff_approved_at TIMESTAMPTZ,
     staff_approved_by VARCHAR(160),
     published_at TIMESTAMPTZ,
     publication_ref VARCHAR(160),
     withdrawn_at TIMESTAMPTZ,
     withdrawn_reason TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `ALTER TABLE presentation_showcases ADD COLUMN IF NOT EXISTS attempt_id UUID`,
  `ALTER TABLE presentation_showcases ADD COLUMN IF NOT EXISTS audience VARCHAR(30) DEFAULT 'private'`,
  `ALTER TABLE presentation_showcases ADD COLUMN IF NOT EXISTS draft_json JSONB DEFAULT '{}'::jsonb`,
  `ALTER TABLE presentation_showcases ADD COLUMN IF NOT EXISTS content_hash VARCHAR(80)`,
  `ALTER TABLE presentation_showcases ADD COLUMN IF NOT EXISTS author_approved_at TIMESTAMPTZ`,
  `ALTER TABLE presentation_showcases ADD COLUMN IF NOT EXISTS staff_approved_at TIMESTAMPTZ`,
  `ALTER TABLE presentation_showcases ADD COLUMN IF NOT EXISTS staff_approved_by VARCHAR(160)`,
  `ALTER TABLE presentation_showcases ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ`,
  `ALTER TABLE presentation_showcases ADD COLUMN IF NOT EXISTS publication_ref VARCHAR(160)`,
  `ALTER TABLE presentation_showcases ADD COLUMN IF NOT EXISTS withdrawn_at TIMESTAMPTZ`,
  `ALTER TABLE presentation_showcases ADD COLUMN IF NOT EXISTS withdrawn_reason TEXT`,
  `ALTER TABLE presentation_showcases ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`,
  `ALTER TABLE presentation_showcases ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
  // One LIVE showcase per attempt — a publish retried after a timeout must not
  // produce a second post. Partial on withdrawn_at so a withdrawn showcase can be
  // legitimately replaced by a new one later.
  `CREATE UNIQUE INDEX IF NOT EXISTS presentation_showcases_one_live
     ON presentation_showcases (attempt_id) WHERE withdrawn_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS presentation_showcases_audience
     ON presentation_showcases (audience) WHERE published_at IS NOT NULL AND withdrawn_at IS NULL`,
  // Plain lookup by attempt. The partial unique index above only covers rows that
  // are still live, so without this a withdrawn showcase could only be found by a
  // sequential scan — and withdrawal history is exactly what an audit reads.
  // It is also the index the Sequelize model declares; model and DDL must agree.
  `CREATE INDEX IF NOT EXISTS presentation_showcases_attempt
     ON presentation_showcases (attempt_id)`,

  // ---------------------------------------------------------------------------
  // projects — external-project linkage (ADDITIVE, on an existing table)
  //
  // A student may showcase work built outside the platform. It must be linkable
  // without implying the platform verified it, so external_verified defaults FALSE
  // and evidence_provenance records where the claim came from. Publishing a showcase
  // never sets external_verified — only an explicit verification step may.
  // ---------------------------------------------------------------------------
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS external_url TEXT`,
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS external_owner VARCHAR(160)`,
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS evidence_provenance VARCHAR(60)`,
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS external_verified BOOLEAN DEFAULT FALSE`,
];

/**
 * Columns the assert post-condition requires, as `table.column`. Derived by hand
 * from the CREATE bodies above rather than parsed, so that a column dropped from a
 * CREATE without being dropped here fails loudly instead of silently shrinking the
 * contract the parity suite checks.
 */
export const PRESENTATION_STUDIO_REQUIRED_COLUMNS: string[] = [
  'presentation_assignments.id',
  'presentation_assignments.project_id',
  'presentation_assignments.story_id',
  'presentation_assignments.template_slug',
  'presentation_assignments.template_version',
  'presentation_assignments.prep_state',
  'presentation_attempts.id',
  'presentation_attempts.assignment_id',
  'presentation_attempts.attempt_no',
  'presentation_attempts.occurrence_uuid',
  'presentation_attempts.attempt_state',
  'presentation_attempts.recording_state',
  'presentation_attempts.is_final_take',
  'presentation_recordings.id',
  'presentation_recordings.attempt_id',
  'presentation_recordings.occurrence_uuid',
  'presentation_recordings.provider_file_id',
  'presentation_recordings.part_no',
  'presentation_recordings.ingest_status',
  'presentation_feedback.id',
  'presentation_feedback.attempt_id',
  'presentation_feedback.evaluator_role',
  'presentation_feedback.rubric_version',
  'presentation_feedback.modality_analyzed',
  'presentation_feedback.visibility',
  'presentation_showcases.id',
  'presentation_showcases.attempt_id',
  'presentation_showcases.audience',
  'presentation_showcases.content_hash',
  'presentation_showcases.withdrawn_at',
  'projects.external_url',
  'projects.external_verified',
];

/**
 * The uniqueness guarantees this module exists to provide. Named explicitly because
 * each one is load-bearing against a specific failure the Studio would otherwise
 * have: a duplicate assignment, a double-clicked attempt, a twice-ingested recording
 * part, a stacked AI verdict, and a retried publish posting twice.
 */
export const PRESENTATION_STUDIO_REQUIRED_INDEXES: string[] = [
  'presentation_assignments_unique_task',
  'presentation_attempts_unique_try',
  'presentation_attempts_one_final_take',
  'presentation_recordings_unique_part',
  'presentation_feedback_unique_verdict',
  'presentation_showcases_one_live',
];

/** Attempt lifecycle. Deliberately separate from recording state. */
export const PRESENTATION_ATTEMPT_STATES = [
  'draft', 'scheduled', 'live', 'recorded', 'reviewed', 'final_selected',
] as const;

/**
 * Recording lifecycle. 'expected' and 'processing' are NOT success: a webhook
 * receipt proves an event arrived, never that a playable file exists.
 */
export const PRESENTATION_RECORDING_STATES = [
  'expected', 'processing', 'ready', 'missing', 'failed', 'review', 'superseded',
] as const;

export async function ensurePresentationStudioSchema(): Promise<void> {
  for (const sql of PRESENTATION_STUDIO_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] presentation studio stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Presentation Studio schema ensured (5 tables + projects linkage)');
}

/**
 * Verify the post-condition. Every statement above is swallowed into a console.warn,
 * so `ensure` resolving proves only that it ran — never that anything applied. This
 * is the function that actually answers "is the schema there?".
 */
export async function assertPresentationStudioSchema(): Promise<{ ok: boolean; missing: string[] }> {
  const missing: string[] = [];
  try {
    const [tables] = await sequelize.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    ) as [{ table_name: string }[], unknown];
    const present = new Set(tables.map((t) => t.table_name));
    for (const table of PRESENTATION_STUDIO_TABLES) {
      if (!present.has(table)) missing.push(`table ${table}`);
    }

    const [columns] = await sequelize.query(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`,
    ) as [{ table_name: string; column_name: string }[], unknown];
    const presentColumns = new Set(columns.map((c) => `${c.table_name}.${c.column_name}`));
    for (const column of PRESENTATION_STUDIO_REQUIRED_COLUMNS) {
      if (!presentColumns.has(column)) missing.push(`column ${column}`);
    }

    const [indexes] = await sequelize.query(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`,
    ) as [{ indexname: string }[], unknown];
    const presentIndexes = new Set(indexes.map((i) => i.indexname));
    for (const index of PRESENTATION_STUDIO_REQUIRED_INDEXES) {
      if (!presentIndexes.has(index)) missing.push(`index ${index}`);
    }
  } catch (err: any) {
    console.warn('[DB] presentation studio assert failed:', err?.message);
    return { ok: false, missing: ['assert query failed'] };
  }

  if (missing.length > 0) {
    console.error('[DB] Presentation Studio schema INCOMPLETE:', missing.join(', '));
  }
  return { ok: missing.length === 0, missing };
}
