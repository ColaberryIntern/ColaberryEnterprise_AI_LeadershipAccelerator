import { sequelize } from '../config/database';

// Explicit migration: Live Sessions build-out — create the 5 live-session tables.
//
// Why explicit instead of `sequelize.sync({ alter: true })`: that path is
// unreliable on prod because the alter pass hits a pre-existing index conflict
// elsewhere in the 215-model graph and the fallback create-only sync also fails
// on the same conflict. So these 5 tables — which currently ride the unreliable
// sync — get an idempotent raw-SQL DDL hook instead, mirroring the house pattern
// (ensureOpsCommandCenterSchema / ensurePointsSchema / ensureCommunityMemberRoleSchema
// in server.ts). Every statement is CREATE ... IF NOT EXISTS / ADD COLUMN IF NOT
// EXISTS and each is wrapped in its own try/catch so a partial DB self-heals and
// re-running the boot is always a no-op.
//
// Sequelize ENUM columns are rendered as VARCHAR(n) + a guarded CHECK constraint
// (Postgres has no IF NOT EXISTS on ADD CONSTRAINT, so DROP IF EXISTS then ADD,
// exactly like ensureCommunityMemberRoleSchema). Columns must match the Sequelize
// models EXACTLY (see backend/src/models/LiveSession.ts, AttendanceRecord.ts,
// SessionChatMessage.ts, SessionChecklist.ts, SessionGate.ts). Note: SessionGate
// gate_type is DataTypes.STRING(50) (a plain VARCHAR), NOT a Sequelize ENUM, so
// it gets no CHECK constraint even though a GateType TS union exists.
//
// Part of the Live Sessions build-out (Session CC-20260721-s7h4).
export async function ensureLiveSessionSchema(): Promise<void> {
  const statements: string[] = [
    // ---- live_sessions (parent) ----
    `CREATE TABLE IF NOT EXISTS live_sessions (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       cohort_id UUID NOT NULL REFERENCES cohorts(id),
       session_number INTEGER NOT NULL,
       title VARCHAR(255) NOT NULL,
       description TEXT,
       session_date DATE NOT NULL,
       start_time VARCHAR(20) NOT NULL,
       end_time VARCHAR(20) NOT NULL,
       session_type VARCHAR(20) NOT NULL DEFAULT 'core',
       meeting_link VARCHAR(500),
       meeting_provider VARCHAR(50) DEFAULT 'google_meet',
       status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
       recording_url VARCHAR(500),
       materials_json JSONB,
       curriculum_json JSONB,
       build_phase_unlock BOOLEAN NOT NULL DEFAULT FALSE,
       required_prior_sessions JSONB DEFAULT '[]'::jsonb,
       presentation_phase_flag BOOLEAN NOT NULL DEFAULT FALSE,
       module_id UUID REFERENCES curriculum_modules(id),
       skill_area VARCHAR(50),
       minimum_section_completion_pct INTEGER,
       required_variable_keys JSONB,
       email_trigger_config JSONB,
       reminder_trigger_config JSONB,
       created_at TIMESTAMPTZ DEFAULT NOW()
     )`,
    `ALTER TABLE live_sessions DROP CONSTRAINT IF EXISTS ck_live_sessions_session_type`,
    `ALTER TABLE live_sessions ADD CONSTRAINT ck_live_sessions_session_type CHECK (session_type IN ('core', 'lab'))`,
    `ALTER TABLE live_sessions DROP CONSTRAINT IF EXISTS ck_live_sessions_status`,
    `ALTER TABLE live_sessions ADD CONSTRAINT ck_live_sessions_status CHECK (status IN ('scheduled', 'live', 'completed', 'cancelled'))`,
    `CREATE INDEX IF NOT EXISTS idx_live_sessions_cohort ON live_sessions (cohort_id)`,
    // Phase 4: AI recap ({ summary, takeaways[], generated_at, model }). Idempotent
    // column-add for tables that predate this column.
    `ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS recap_json JSONB`,
    // Class Kit run-of-show ({ day_kind, day_label, week, public_title, intensive,
    // run_of_show[], outline[], generated_at }). Powers the admin timetable view;
    // the live deck re-derives content at render, so this is a durable record.
    `ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS kit_json JSONB`,

    // ---- attendance_records ----
    `CREATE TABLE IF NOT EXISTS attendance_records (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       enrollment_id UUID NOT NULL REFERENCES enrollments(id),
       session_id UUID NOT NULL REFERENCES live_sessions(id),
       status VARCHAR(20) NOT NULL DEFAULT 'absent',
       join_time TIMESTAMPTZ,
       leave_time TIMESTAMPTZ,
       duration_minutes INTEGER,
       marked_by VARCHAR(20) NOT NULL DEFAULT 'admin',
       notes TEXT,
       created_at TIMESTAMPTZ DEFAULT NOW()
     )`,
    `ALTER TABLE attendance_records DROP CONSTRAINT IF EXISTS ck_attendance_records_status`,
    `ALTER TABLE attendance_records ADD CONSTRAINT ck_attendance_records_status CHECK (status IN ('present', 'absent', 'excused', 'late'))`,
    `ALTER TABLE attendance_records DROP CONSTRAINT IF EXISTS ck_attendance_records_marked_by`,
    `ALTER TABLE attendance_records ADD CONSTRAINT ck_attendance_records_marked_by CHECK (marked_by IN ('system', 'admin', 'self'))`,
    `CREATE INDEX IF NOT EXISTS idx_attendance_records_session ON attendance_records (session_id)`,
    `CREATE INDEX IF NOT EXISTS idx_attendance_records_enrollment ON attendance_records (enrollment_id)`,
    // One attendance row per (enrollment, session) — makes self-join capture
    // race-safe under a double-click, mirroring student_points_events_unique.
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_records_enrollment_session ON attendance_records (enrollment_id, session_id)`,

    // ---- session_chat_messages ----
    `CREATE TABLE IF NOT EXISTS session_chat_messages (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       session_id UUID NOT NULL REFERENCES live_sessions(id),
       enrollment_id UUID NOT NULL REFERENCES enrollments(id),
       sender_name VARCHAR(100) NOT NULL,
       content TEXT NOT NULL,
       created_at TIMESTAMPTZ DEFAULT NOW()
     )`,
    // Model declares indexes: [{ fields: ['session_id', 'created_at'] }]
    `CREATE INDEX IF NOT EXISTS idx_session_chat_messages_session_created ON session_chat_messages (session_id, created_at)`,

    // ---- session_checklists ----
    `CREATE TABLE IF NOT EXISTS session_checklists (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       session_id UUID NOT NULL REFERENCES live_sessions(id),
       checklist_item VARCHAR(500) NOT NULL,
       description TEXT,
       item_type VARCHAR(30) NOT NULL DEFAULT 'custom',
       is_collected BOOLEAN NOT NULL DEFAULT FALSE,
       sort_order INTEGER NOT NULL DEFAULT 0,
       created_at TIMESTAMPTZ DEFAULT NOW()
     )`,
    `ALTER TABLE session_checklists DROP CONSTRAINT IF EXISTS ck_session_checklists_item_type`,
    `ALTER TABLE session_checklists ADD CONSTRAINT ck_session_checklists_item_type CHECK (item_type IN ('tool_setup', 'account_creation', 'reading', 'prerequisite', 'custom'))`,
    `CREATE INDEX IF NOT EXISTS idx_session_checklists_session ON session_checklists (session_id)`,

    // ---- session_pulse (live class participation) ----
    // One row per (enrollment, session): the student's current live status. The
    // instructor's Class Kit deck reads aggregate counts + recent questions to
    // drive the pulse rail and presenter feedback. Upsert-on-conflict keeps it to
    // one row per student per session (race-safe under rapid taps).
    `CREATE TABLE IF NOT EXISTS session_pulse (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       session_id UUID NOT NULL REFERENCES live_sessions(id),
       enrollment_id UUID NOT NULL REFERENCES enrollments(id),
       state VARCHAR(20) NOT NULL DEFAULT 'here',
       updated_at TIMESTAMPTZ DEFAULT NOW()
     )`,
    `ALTER TABLE session_pulse DROP CONSTRAINT IF EXISTS ck_session_pulse_state`,
    `ALTER TABLE session_pulse ADD CONSTRAINT ck_session_pulse_state CHECK (state IN ('here', 'building', 'stuck', 'finished'))`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_session_pulse_enrollment_session ON session_pulse (enrollment_id, session_id)`,
    `CREATE INDEX IF NOT EXISTS idx_session_pulse_session ON session_pulse (session_id)`,

    // ---- session_broadcast (instructor → phones sync) ----
    // One row per session holding the instructor deck's CURRENT view state
    // (which slide/segment, and the active question/broadcast payload). Students'
    // phones poll this and switch to the matching view, so the companion app is
    // always slaved to what is on screen.
    `CREATE TABLE IF NOT EXISTS session_broadcast (
       session_id UUID PRIMARY KEY REFERENCES live_sessions(id),
       state JSONB NOT NULL DEFAULT '{}'::jsonb,
       updated_at TIMESTAMPTZ DEFAULT NOW()
     )`,

    // ---- session_poll_responses (phones → deck tallies) ----
    // One answer per (student, poll) — poll_key is stable per interaction slide,
    // so re-answering updates the choice (ON CONFLICT) instead of double-counting.
    `CREATE TABLE IF NOT EXISTS session_poll_responses (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       session_id UUID NOT NULL REFERENCES live_sessions(id),
       enrollment_id UUID NOT NULL REFERENCES enrollments(id),
       poll_key VARCHAR(200) NOT NULL,
       choice INTEGER NOT NULL,
       created_at TIMESTAMPTZ DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_session_poll_responses_key ON session_poll_responses (session_id, enrollment_id, poll_key)`,
    `CREATE INDEX IF NOT EXISTS idx_session_poll_responses_key ON session_poll_responses (session_id, poll_key)`,

    // ---- session_presence_events (named join/leave feed for the instructor deck's ticker) ----
    // display_name is denormalized at write time (mirrors session_chat_messages.sender_name
    // above) — the ticker shows a point-in-time projection, not a live profile join.
    `CREATE TABLE IF NOT EXISTS session_presence_events (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       session_id UUID NOT NULL REFERENCES live_sessions(id),
       enrollment_id UUID NOT NULL REFERENCES enrollments(id),
       event_type VARCHAR(30) NOT NULL,
       display_name VARCHAR(100) NOT NULL,
       created_at TIMESTAMPTZ DEFAULT NOW()
     )`,
    `ALTER TABLE session_presence_events DROP CONSTRAINT IF EXISTS ck_session_presence_events_type`,
    `ALTER TABLE session_presence_events ADD CONSTRAINT ck_session_presence_events_type CHECK (event_type IN ('classroom_enter', 'virtual_building_enter', 'virtual_building_leave'))`,
    `CREATE INDEX IF NOT EXISTS idx_session_presence_events_session_created ON session_presence_events (session_id, created_at)`,

    // ---- session_gates ----
    // gate_type is DataTypes.STRING(50) in the model (NOT an ENUM) → plain VARCHAR, no CHECK.
    `CREATE TABLE IF NOT EXISTS session_gates (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       session_id UUID NOT NULL REFERENCES live_sessions(id),
       module_id UUID REFERENCES curriculum_modules(id),
       lesson_id UUID REFERENCES curriculum_lessons(id),
       minimum_readiness_score DOUBLE PRECISION,
       gate_type VARCHAR(50) NOT NULL,
       artifact_definition_id UUID REFERENCES artifact_definitions(id),
       required_artifact_ids JSONB DEFAULT '[]'::jsonb,
       created_at TIMESTAMPTZ DEFAULT NOW()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_session_gates_session ON session_gates (session_id)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] live-session schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Live Sessions schema ensured');
}
